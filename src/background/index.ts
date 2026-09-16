import { fallbackContext } from '../shared/context';
import { inferItemType } from '../shared/item-type';
import { isCaptureContext, parseRequest } from '../shared/messages';
import type {
  CaptureContext,
  CapturePreview,
  CaptureSaveInput,
  ClientError,
  InlineLexicalDetails,
  ResponseEnvelope
} from '../shared/types';
import { getProfile, patchProfile, previewCapture, saveCapture } from './api';
import {
  getPublicSession,
  RequestError,
  signInWithEmail,
  signInWithGoogle,
  signOut
} from './auth';
import { getSettings, syncFloatingContentScript, updateSettings } from './settings';

const PENDING_KEY = 'gotit.pending-capture.v1';
const INLINE_PREFIX = 'gotit.inline-capture.v1.';
const CONTEXT_MENU_ID = 'gotit-save-selection';

interface InlineCaptureRecord {
  context: CaptureContext;
  preview: CapturePreview;
  createdAt: number;
}

function asClientError(error: unknown): ClientError {
  if (error instanceof RequestError) return error.serializable();
  return { code: 'INTERNAL_ERROR', message: 'An unexpected extension error occurred' };
}

async function setPending(context: CaptureContext): Promise<void> {
  await chrome.storage.session.set({ [PENDING_KEY]: context });
  await chrome.action.setBadgeBackgroundColor({ color: '#5B4CE3' });
  await chrome.action.setBadgeText({ text: '1' });
}

async function getPending(): Promise<CaptureContext | null> {
  const stored = await chrome.storage.session.get(PENDING_KEY);
  const value: unknown = stored[PENDING_KEY];
  return isCaptureContext(value) ? value : null;
}

async function consumePending(): Promise<CaptureContext | null> {
  const pending = await getPending();
  await chrome.storage.session.remove(PENDING_KEY);
  await chrome.action.setBadgeText({ text: '' });
  return pending;
}

async function openCapturePopup(): Promise<void> {
  try {
    await chrome.action.openPopup();
  } catch {
    // Chrome restricts opening a popup on some pages; the badge keeps the capture discoverable.
  }
}

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function uiLanguage(): string | undefined {
  try {
    return Intl.getCanonicalLocales(chrome.i18n.getUILanguage())[0]?.split('-')[0];
  } catch {
    return undefined;
  }
}

function normalized(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
}

async function storeInline(context: CaptureContext, preview: CapturePreview): Promise<string> {
  const id = crypto.randomUUID();
  await chrome.storage.session.set({
    [`${INLINE_PREFIX}${id}`]: { context, preview, createdAt: Date.now() } satisfies InlineCaptureRecord
  });
  return id;
}

async function loadInline(id: string): Promise<InlineCaptureRecord> {
  const key = `${INLINE_PREFIX}${id}`;
  const stored = await chrome.storage.session.get(key);
  const record = stored[key] as InlineCaptureRecord | undefined;
  if (!record || !isCaptureContext(record.context) || Date.now() - record.createdAt > 10 * 60_000) {
    await chrome.storage.session.remove(key);
    throw new RequestError('INLINE_CAPTURE_EXPIRED', 'Translation preview expired', 400);
  }
  return record;
}

function quickSenseDecision(preview: CapturePreview, translation: string): CaptureSaveInput['senseDecision'] {
  if (preview.existingSenses.items.length === 0) return { mode: 'auto' };
  const accepted = preview.existingSenses.items.filter((sense) =>
    [sense.primaryTranslation, ...sense.variants].some((form) => normalized(form) === normalized(translation))
  );
  if (accepted.length === 1) return { mode: 'merge', learningItemId: accepted[0]!.learningItemId };
  throw new RequestError('REVIEW_REQUIRED', 'Choose an existing meaning or create a new sense', 409);
}

async function quickSave(id: string) {
  const record = await loadInline(id);
  const { preview, context } = record;
  const candidate = preview.enrichment.candidates[0];
  if (!candidate || !preview.sourceLanguageCode || !preview.translationLanguageCode) {
    throw new RequestError('REVIEW_REQUIRED', 'Translation or language selection requires review', 409);
  }
  const eventId = crypto.randomUUID();
  const input: CaptureSaveInput = {
    item: {
      sourceText: preview.sourceText,
      sourceLanguageCode: preview.sourceLanguageCode,
      translationLanguageCode: preview.translationLanguageCode,
      itemType: inferItemType(preview.sourceText, candidate.partOfSpeech),
      partOfSpeech: candidate.partOfSpeech,
      phoneticText: candidate.phoneticText,
      phoneticScheme: candidate.phoneticScheme
    },
    translation: {
      text: candidate.text,
      variants: candidate.variants,
      selectionToken: candidate.selectionToken
    },
    context: {
      selectedText: context.selectedText,
      sentenceText: context.sentenceText,
      paragraphText: null,
      pageTitle: context.pageTitle,
      pageUrl: context.pageUrl,
      sourceType: 'chrome_extension',
      capturedAt: context.capturedAt
    },
    senseDecision: quickSenseDecision(preview, candidate.text),
    clientEventId: eventId
  };
  const result = await saveCapture(input, eventId);
  await chrome.storage.session.remove(`${INLINE_PREFIX}${id}`);
  return result;
}

async function extractContext(tab: chrome.tabs.Tab | undefined, fallbackSelection = ''): Promise<CaptureContext> {
  if (!tab?.id) return fallbackContext(fallbackSelection, tab);
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const result: unknown = await chrome.tabs.sendMessage(tab.id, { type: 'GOTIT_EXTRACT_CONTEXT' });
    if (isCaptureContext(result)) return result;
  } catch {
    // Restricted pages and browser-owned URLs deliberately fall back to selection/title metadata.
  }
  return fallbackContext(fallbackSelection, tab);
}

async function bootstrap() {
  const [session, settings] = await Promise.all([
    getPublicSession(),
    getSettings()
  ]);
  const pendingCapture = session ? await consumePending() : await getPending();
  let profile = null;
  if (session) profile = await getProfile().catch(() => null);
  return { session, profile, settings, pendingCapture };
}

async function dispatch(raw: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const request = parseRequest(raw);
  if (!request) throw new RequestError('INVALID_MESSAGE', 'Invalid extension message', 400);
  const extensionPage = sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(''));
  const contentPage = sender.id === chrome.runtime.id && sender.tab !== undefined;
  if (request.type === 'CONTENT_CAPTURE') {
    if (!contentPage) throw new RequestError('INVALID_MESSAGE_SOURCE', 'Invalid message source', 400);
    await setPending(request.context);
    await openCapturePopup();
    return null;
  }
  if (request.type === 'INLINE_PREVIEW') {
    if (!contentPage) throw new RequestError('INVALID_MESSAGE_SOURCE', 'Invalid message source', 400);
    const captured = request.context;
    const input: Parameters<typeof previewCapture>[0] = {
      selectedText: captured.selectedText,
      sourceText: captured.selectedText,
      context: {
        sentenceText: captured.sentenceText,
        paragraphText: null,
        pageTitle: captured.pageTitle,
        pageUrl: captured.pageUrl
      }
    };
    if (request.translationMethod) input.translationMethod = request.translationMethod;
    if (captured.documentLanguageHint) input.documentLanguageHint = captured.documentLanguageHint;
    let preview = await previewCapture(input);
    const targetLanguage = uiLanguage();
    if (preview.requiresLanguageSelection && !preview.translationLanguageCode && targetLanguage) {
      input.translationLanguageCode = targetLanguage;
      preview = await previewCapture(input);
    }
    return { preview, inlineCaptureId: await storeInline(captured, preview) };
  }
  if (request.type === 'INLINE_DETAILS') {
    if (!contentPage) throw new RequestError('INVALID_MESSAGE_SOURCE', 'Invalid message source', 400);
    const captured = request.context;
    const input: Parameters<typeof previewCapture>[0] = {
      selectedText: captured.selectedText,
      sourceText: captured.selectedText,
      translationMethod: 'ai',
      context: {
        sentenceText: captured.sentenceText,
        paragraphText: null,
        pageTitle: captured.pageTitle,
        pageUrl: captured.pageUrl
      }
    };
    if (request.sourceLanguageCode) input.sourceLanguageCode = request.sourceLanguageCode;
    else if (captured.documentLanguageHint) input.documentLanguageHint = captured.documentLanguageHint;
    const targetLanguage = request.translationLanguageCode ?? uiLanguage();
    if (targetLanguage) input.translationLanguageCode = targetLanguage;
    const candidate = (await previewCapture(input)).enrichment.candidates[0];
    if (!candidate) return null;
    return {
      partOfSpeech: candidate.partOfSpeech,
      explanation: candidate.explanation?.trim() || null,
      variants: candidate.variants
    } satisfies InlineLexicalDetails;
  }
  if (request.type === 'INLINE_SAVE') {
    if (!contentPage) throw new RequestError('INVALID_MESSAGE_SOURCE', 'Invalid message source', 400);
    return quickSave(request.inlineCaptureId);
  }
  if (request.type === 'GET_CONTENT_CONFIG') {
    if (!contentPage) throw new RequestError('INVALID_MESSAGE_SOURCE', 'Invalid message source', 400);
    return { floatingAction: (await getSettings()).floatingAction };
  }
  if (!extensionPage) throw new RequestError('INVALID_MESSAGE_SOURCE', 'Invalid message source', 400);
  switch (request.type) {
    case 'GET_BOOTSTRAP': return bootstrap();
    case 'AUTH_EMAIL': return signInWithEmail(request.mode, request.email, request.password);
    case 'AUTH_GOOGLE': return signInWithGoogle();
    case 'LOGOUT': await signOut(); return null;
    case 'GET_ACTIVE_CONTEXT': return extractContext(await activeTab(), request.selectedText ?? '');
    case 'PREVIEW_CAPTURE': return previewCapture(request.input);
    case 'SAVE_CAPTURE': return saveCapture(request.input, request.eventId);
    case 'PATCH_PROFILE': return patchProfile(request.patch);
    case 'GET_SETTINGS': return getSettings();
    case 'UPDATE_SETTINGS': return updateSettings(request.settings);
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  void dispatch(message, sender)
    .then((data) => sendResponse({ ok: true, data } satisfies ResponseEnvelope<unknown>))
    .catch((error: unknown) => sendResponse({ ok: false, error: asClientError(error) } satisfies ResponseEnvelope<never>));
  return true;
});

void chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
void chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Save “%s” to GotIt',
      contexts: ['selection'],
      documentUrlPatterns: ['http://*/*', 'https://*/*']
    });
  });
  void syncFloatingContentScript();
});

chrome.runtime.onStartup.addListener(() => { void syncFloatingContentScript(); });
chrome.permissions.onRemoved.addListener(() => { void syncFloatingContentScript(); });

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  void extractContext(tab, info.selectionText ?? '')
    .then(setPending)
    .then(openCapturePopup)
    .catch(() => undefined);
});
