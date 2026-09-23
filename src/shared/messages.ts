import type {
  BootstrapData,
  CaptureContext,
  CapturePreview,
  CaptureResult,
  CaptureSaveInput,
  ExtensionSettings,
  GotItProfile,
  InlinePreviewResult,
  PublicSession,
  ResponseEnvelope,
  TranslationMethod
} from './types';

export type ExtensionRequest =
  | { type: 'GET_BOOTSTRAP' }
  | { type: 'AUTH_EMAIL'; mode: 'login' | 'register'; email: string; password: string }
  | { type: 'AUTH_GOOGLE' }
  | { type: 'LOGOUT' }
  | { type: 'GET_ACTIVE_CONTEXT'; selectedText?: string }
  | { type: 'GET_CONTENT_CONFIG' }
  | { type: 'CONTENT_CAPTURE'; context: CaptureContext }
  | { type: 'INLINE_PREVIEW'; context: CaptureContext; translationMethod?: TranslationMethod }
  | { type: 'INLINE_SAVE'; inlineCaptureId: string; candidateIndex: number }
  | { type: 'PREVIEW_CAPTURE'; input: PreviewRequest }
  | { type: 'SAVE_CAPTURE'; input: CaptureSaveInput; eventId: string }
  | { type: 'UPDATE_SAVED_ITEM'; learningItemId: string; patch: SavedItemPatch }
  | { type: 'REMOVE_SAVED_ITEM'; learningItemId: string }
  | { type: 'PATCH_PROFILE'; patch: ProfilePatch }
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<ExtensionSettings> };

export interface PreviewRequest {
  selectedText: string;
  sourceText?: string;
  sourceLanguageCode?: string;
  translationLanguageCode?: string;
  documentLanguageHint?: string;
  translationMethod?: TranslationMethod;
  context?: {
    sentenceText: string | null;
    paragraphText: string | null;
    pageTitle: string | null;
    pageUrl: string | null;
  };
}

export interface ProfilePatch {
  defaultSourceLanguage?: string | null;
  defaultTranslationLanguage?: string | null;
  translationMethodPreference?: TranslationMethod | null;
}

export interface SavedItemPatch {
  sourceText: string;
  sourceLanguageCode: string;
  translationLanguageCode: string;
  itemType: 'word' | 'phrase' | 'expression' | 'phrasal_verb' | 'other';
  partOfSpeech: string | null;
  translation: { text: string; variants: string[] };
}

export interface ResponseMap {
  GET_BOOTSTRAP: BootstrapData;
  AUTH_EMAIL: PublicSession;
  AUTH_GOOGLE: PublicSession;
  LOGOUT: null;
  GET_ACTIVE_CONTEXT: CaptureContext;
  GET_CONTENT_CONFIG: { floatingAction: boolean; translationMethod: 'dictionary' | 'ai'; aiTranslationAvailable: boolean; uiLocale: 'en' | 'he'; theme: 'light' | 'dark' };
  CONTENT_CAPTURE: null;
  INLINE_PREVIEW: InlinePreviewResult;
  INLINE_SAVE: CaptureResult;
  PREVIEW_CAPTURE: CapturePreview;
  SAVE_CAPTURE: CaptureResult;
  UPDATE_SAVED_ITEM: null;
  REMOVE_SAVED_ITEM: null;
  PATCH_PROFILE: GotItProfile;
  GET_SETTINGS: ExtensionSettings;
  UPDATE_SETTINGS: ExtensionSettings;
}

export function sendRequest<K extends keyof ResponseMap>(
  request: Extract<ExtensionRequest, { type: K }>
): Promise<ResponseEnvelope<ResponseMap[K]>> {
  return chrome.runtime.sendMessage(request) as Promise<ResponseEnvelope<ResponseMap[K]>>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const set = new Set(allowed);
  return Object.keys(value).every((key) => set.has(key));
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function isPreviewRequest(value: unknown): value is PreviewRequest {
  if (!isRecord(value) || typeof value.selectedText !== 'string') return false;
  if (!hasOnlyKeys(value, ['selectedText', 'sourceText', 'sourceLanguageCode', 'translationLanguageCode', 'documentLanguageHint', 'translationMethod', 'context'])) return false;
  if (
    !optionalString(value.sourceText) ||
    !optionalString(value.sourceLanguageCode) ||
    !optionalString(value.translationLanguageCode) ||
    !optionalString(value.documentLanguageHint) ||
    (value.translationMethod !== undefined && !['auto', 'dictionary', 'ai'].includes(String(value.translationMethod)))
  ) return false;
  if (value.context !== undefined) {
    if (!isRecord(value.context)) return false;
    if (!hasOnlyKeys(value.context, ['sentenceText', 'paragraphText', 'pageTitle', 'pageUrl'])) return false;
    if (
      !nullableString(value.context.sentenceText) ||
      !nullableString(value.context.paragraphText) ||
      !nullableString(value.context.pageTitle) ||
      !nullableString(value.context.pageUrl)
    ) return false;
  }
  return true;
}

function isSaveInput(value: unknown): value is CaptureSaveInput {
  if (!isRecord(value) || !isRecord(value.item) || !isRecord(value.translation) || !isRecord(value.context) || !isRecord(value.senseDecision)) return false;
  const item = value.item;
  const translation = value.translation;
  const context = value.context;
  const decision = value.senseDecision;
  if (!hasOnlyKeys(value, ['item', 'translation', 'context', 'senseDecision', 'clientEventId'])) return false;
  if (!hasOnlyKeys(item, ['sourceText', 'sourceLanguageCode', 'translationLanguageCode', 'itemType', 'partOfSpeech', 'phoneticText', 'phoneticScheme'])) return false;
  if (!hasOnlyKeys(translation, ['text', 'variants', 'selectionToken'])) return false;
  if (!hasOnlyKeys(context, ['selectedText', 'sentenceText', 'paragraphText', 'pageTitle', 'pageUrl', 'sourceType', 'capturedAt'])) return false;
  if (!hasOnlyKeys(decision, decision.mode === 'merge' ? ['mode', 'learningItemId'] : ['mode'])) return false;
  return (
    typeof item.sourceText === 'string' &&
    typeof item.sourceLanguageCode === 'string' &&
    typeof item.translationLanguageCode === 'string' &&
    ['word', 'phrase', 'expression', 'phrasal_verb', 'other'].includes(String(item.itemType)) &&
    nullableString(item.partOfSpeech) && nullableString(item.phoneticText) && nullableString(item.phoneticScheme) &&
    typeof translation.text === 'string' && Array.isArray(translation.variants) && translation.variants.every((entry) => typeof entry === 'string') &&
    optionalString(translation.selectionToken) &&
    typeof context.selectedText === 'string' && nullableString(context.sentenceText) && nullableString(context.paragraphText) &&
    nullableString(context.pageTitle) && nullableString(context.pageUrl) && context.sourceType === 'chrome_extension' &&
    typeof context.capturedAt === 'string' &&
    typeof value.clientEventId === 'string' &&
    (decision.mode === 'auto' || decision.mode === 'create_new_sense' || (decision.mode === 'merge' && typeof decision.learningItemId === 'string'))
  );
}

function isProfilePatch(value: unknown): value is ProfilePatch {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, ['defaultSourceLanguage', 'defaultTranslationLanguage', 'translationMethodPreference'])) return false;
  return (
    (value.defaultSourceLanguage === undefined || nullableString(value.defaultSourceLanguage)) &&
    (value.defaultTranslationLanguage === undefined || nullableString(value.defaultTranslationLanguage)) &&
    (value.translationMethodPreference === undefined || value.translationMethodPreference === null || ['auto', 'dictionary', 'ai'].includes(String(value.translationMethodPreference)))
  );
}

function isSavedItemPatch(value: unknown): value is SavedItemPatch {
  if (!isRecord(value) || !isRecord(value.translation)) return false;
  if (!hasOnlyKeys(value, ['sourceText', 'sourceLanguageCode', 'translationLanguageCode', 'itemType', 'partOfSpeech', 'translation'])) return false;
  if (!hasOnlyKeys(value.translation, ['text', 'variants'])) return false;
  return (
    typeof value.sourceText === 'string' &&
    typeof value.sourceLanguageCode === 'string' &&
    typeof value.translationLanguageCode === 'string' &&
    ['word', 'phrase', 'expression', 'phrasal_verb', 'other'].includes(String(value.itemType)) &&
    nullableString(value.partOfSpeech) &&
    typeof value.translation.text === 'string' &&
    Array.isArray(value.translation.variants) &&
    value.translation.variants.every((entry) => typeof entry === 'string')
  );
}

function isSettingsPatch(value: unknown): value is Partial<ExtensionSettings> {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, [
    'floatingAction',
    'autoCloseAfterSave',
    'theme',
    'onboardingComplete',
    'defaultSourceLanguage',
    'defaultTranslationLanguage',
    'languagePreferencesNeedSync'
  ])) return false;
  return (
    (value.floatingAction === undefined || typeof value.floatingAction === 'boolean') &&
    (value.autoCloseAfterSave === undefined || typeof value.autoCloseAfterSave === 'boolean') &&
    (value.theme === undefined || value.theme === 'light' || value.theme === 'dark') &&
    (value.onboardingComplete === undefined || typeof value.onboardingComplete === 'boolean') &&
    (value.defaultSourceLanguage === undefined || nullableString(value.defaultSourceLanguage)) &&
    (value.defaultTranslationLanguage === undefined || nullableString(value.defaultTranslationLanguage)) &&
    (value.languagePreferencesNeedSync === undefined || typeof value.languagePreferencesNeedSync === 'boolean')
  );
}

export function parseRequest(value: unknown): ExtensionRequest | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  switch (value.type) {
    case 'GET_BOOTSTRAP':
    case 'AUTH_GOOGLE':
    case 'LOGOUT':
    case 'GET_SETTINGS':
      return hasOnlyKeys(value, ['type']) ? { type: value.type } : null;
    case 'GET_CONTENT_CONFIG':
      return hasOnlyKeys(value, ['type']) ? { type: value.type } : null;
    case 'AUTH_EMAIL':
      if (
        hasOnlyKeys(value, ['type', 'mode', 'email', 'password']) &&
        (value.mode === 'login' || value.mode === 'register') &&
        typeof value.email === 'string' &&
        typeof value.password === 'string'
      ) return { type: value.type, mode: value.mode, email: value.email, password: value.password };
      return null;
    case 'GET_ACTIVE_CONTEXT':
      if (!hasOnlyKeys(value, ['type', 'selectedText'])) return null;
      return typeof value.selectedText === 'string'
        ? { type: value.type, selectedText: value.selectedText }
        : { type: value.type };
    case 'CONTENT_CAPTURE':
      return hasOnlyKeys(value, ['type', 'context']) && isCaptureContext(value.context) ? { type: value.type, context: value.context } : null;
    case 'INLINE_PREVIEW':
      if (
        !hasOnlyKeys(value, ['type', 'context', 'translationMethod']) ||
        !isCaptureContext(value.context) ||
        (value.translationMethod !== undefined && !['auto', 'dictionary', 'ai'].includes(String(value.translationMethod)))
      ) return null;
      return value.translationMethod === undefined
        ? { type: value.type, context: value.context }
        : { type: value.type, context: value.context, translationMethod: value.translationMethod as TranslationMethod };
    case 'INLINE_SAVE':
      return hasOnlyKeys(value, ['type', 'inlineCaptureId', 'candidateIndex']) &&
        typeof value.inlineCaptureId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value.inlineCaptureId) &&
        Number.isInteger(value.candidateIndex) &&
        Number(value.candidateIndex) >= 0 &&
        Number(value.candidateIndex) < 5
        ? { type: value.type, inlineCaptureId: value.inlineCaptureId, candidateIndex: Number(value.candidateIndex) }
        : null;
    case 'PREVIEW_CAPTURE':
      return hasOnlyKeys(value, ['type', 'input']) && isPreviewRequest(value.input)
        ? { type: value.type, input: value.input }
        : null;
    case 'SAVE_CAPTURE':
      return hasOnlyKeys(value, ['type', 'input', 'eventId']) && isSaveInput(value.input) && typeof value.eventId === 'string'
        ? { type: value.type, input: value.input, eventId: value.eventId }
        : null;
    case 'UPDATE_SAVED_ITEM':
      return hasOnlyKeys(value, ['type', 'learningItemId', 'patch']) &&
        typeof value.learningItemId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value.learningItemId) &&
        isSavedItemPatch(value.patch)
        ? { type: value.type, learningItemId: value.learningItemId, patch: value.patch }
        : null;
    case 'REMOVE_SAVED_ITEM':
      return hasOnlyKeys(value, ['type', 'learningItemId']) &&
        typeof value.learningItemId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value.learningItemId)
        ? { type: value.type, learningItemId: value.learningItemId }
        : null;
    case 'PATCH_PROFILE':
      return hasOnlyKeys(value, ['type', 'patch']) && isProfilePatch(value.patch) ? { type: value.type, patch: value.patch } : null;
    case 'UPDATE_SETTINGS':
      return hasOnlyKeys(value, ['type', 'settings']) && isSettingsPatch(value.settings)
        ? { type: value.type, settings: value.settings }
        : null;
    default:
      return null;
  }
}

export function isCaptureContext(value: unknown): value is CaptureContext {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, ['selectedText', 'sentenceText', 'paragraphText', 'pageTitle', 'pageUrl', 'documentLanguageHint', 'capturedAt'])) return false;
  return (
    typeof value.selectedText === 'string' &&
    (typeof value.sentenceText === 'string' || value.sentenceText === null) &&
    (typeof value.paragraphText === 'string' || value.paragraphText === null) &&
    (typeof value.pageTitle === 'string' || value.pageTitle === null) &&
    (typeof value.pageUrl === 'string' || value.pageUrl === null) &&
    typeof value.capturedAt === 'string' &&
    (value.documentLanguageHint === undefined || typeof value.documentLanguageHint === 'string')
  );
}
