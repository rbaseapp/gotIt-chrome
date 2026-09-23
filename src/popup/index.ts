import { sendRequest, type ExtensionRequest, type ResponseMap } from '../shared/messages';
import { inferItemType as inferDetectedItemType } from '../shared/item-type';
import { nextPhase } from '../shared/state';
import { effectiveTranslationMethod } from '../shared/translation';
import { populateLanguageSelect } from '../shared/languages';
import type {
  BootstrapData,
  CaptureContext,
  CapturePhase,
  CapturePreview,
  ClientError,
  EnrichmentCandidate,
  ExtensionSettings,
  GotItProfile,
  PublicSession,
  TranslationMethod
} from '../shared/types';
import { initializeI18n, t } from '../shared/i18n';

await initializeI18n();

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element: ${id}`);
  return found as T;
}

const loadingView = element<HTMLElement>('loading-view');
const authView = element<HTMLElement>('auth-view');
const captureView = element<HTMLElement>('capture-view');
const captureEditor = element<HTMLElement>('capture-editor');
const previewForm = element<HTMLFormElement>('preview-form');
const successView = element<HTMLElement>('success-view');
const statusElement = element<HTMLElement>('status');
const sourceText = element<HTMLTextAreaElement>('source-text');
const sourceDisplay = element<HTMLElement>('source-display');
const sourceEditor = element<HTMLElement>('source-editor');
const editSource = element<HTMLButtonElement>('edit-source');
const sentenceText = element<HTMLTextAreaElement>('sentence-text');
const contextCard = element<HTMLElement>('context-card');
const pageMeta = element<HTMLElement>('page-meta');
const sourceLanguage = element<HTMLSelectElement>('source-language');
const targetLanguage = element<HTMLSelectElement>('target-language');
const translationText = element<HTMLTextAreaElement>('translation-text');
const translationCard = element<HTMLElement>('translation-card');
const translationDisplay = element<HTMLElement>('translation-display');
const translationEditor = element<HTMLElement>('translation-editor');
const editTranslation = element<HTMLButtonElement>('edit-translation');
const aiTranslation = element<HTMLButtonElement>('ai-translation');
const itemType = element<HTMLSelectElement>('item-type');
const partOfSpeech = element<HTMLInputElement>('part-of-speech');
const lexicalEditor = element<HTMLElement>('lexical-editor');
const candidateExplanation = element<HTMLElement>('candidate-explanation');
const explanationText = element<HTMLElement>('explanation-text');
const phoneticRow = element<HTMLElement>('phonetic-row');
const phoneticText = element<HTMLElement>('phonetic-text');
const candidateFieldset = element<HTMLFieldSetElement>('candidate-fieldset');
const candidatesElement = element<HTMLElement>('candidates');
const senseFieldset = element<HTMLFieldSetElement>('sense-fieldset');
const sensesElement = element<HTMLElement>('senses');
const previewWarning = element<HTMLElement>('preview-warning');
const saveButton = element<HTMLButtonElement>('save-button');
const removeSavedButton = element<HTMLButtonElement>('remove-saved');
const previewButton = element<HTMLButtonElement>('preview-button');

let phase: CapturePhase = 'IDLE';
let session: PublicSession | null = null;
let profile: GotItProfile | null = null;
let extensionSettings: ExtensionSettings | null = null;
let context: CaptureContext | null = null;
let preview: CapturePreview | null = null;
let selectedCandidate: EnrichmentCandidate | null = null;
let saveEventId: string | null = null;
let savedLearningItemId: string | null = null;
let previewFingerprint = '';
let authMode: 'login' | 'register' = 'login';
let statusTimer: number | null = null;
let sourceEditing = true;
let translationEditing = false;
let itemTypeManuallyEdited = false;
let standardMethod: 'auto' | 'dictionary' = 'dictionary';
let aiTranslationAvailable = false;

async function request<K extends keyof ResponseMap>(
  value: Extract<ExtensionRequest, { type: K }>
): Promise<ResponseMap[K]> {
  const response = await sendRequest(value);
  if (!response.ok) throw response.error;
  return response.data;
}

function isClientError(value: unknown): value is ClientError {
  return typeof value === 'object' && value !== null && typeof (value as ClientError).code === 'string';
}

function userMessage(error: unknown): string {
  const code = isClientError(error) ? error.code : 'INTERNAL_ERROR';
  const messages: Record<string, string> = {
    AUTHENTICATION_REQUIRED: t('errors.AUTHENTICATION_REQUIRED'),
    UNAUTHORIZED: t('errors.UNAUTHORIZED'),
    INVALID_CREDENTIALS: t('errors.INVALID_CREDENTIALS'),
    USER_ALREADY_EXISTS: t('errors.USER_ALREADY_EXISTS'),
    GOOGLE_SIGN_IN_CANCELLED: t('errors.GOOGLE_SIGN_IN_CANCELLED'),
    GOOGLE_AUTH_NOT_CONFIGURED: t('errors.GOOGLE_AUTH_NOT_CONFIGURED'),
    GOOGLE_TOKEN_INVALID: t('errors.GOOGLE_TOKEN_INVALID'),
    GOOGLE_SIGN_IN_FAILED: t('errors.GOOGLE_SIGN_IN_FAILED'),
    OFFLINE: t('errors.OFFLINE'),
    NETWORK_ERROR: t('errors.NETWORK_ERROR'),
    VALIDATION_ERROR: t('errors.VALIDATION_ERROR'),
    SENSE_SELECTION_REQUIRED: t('errors.SENSE_SELECTION_REQUIRED'),
    MERGE_ITEM_CHANGED: t('errors.MERGE_ITEM_CHANGED'),
    ENRICHMENT_SELECTION_EXPIRED: t('errors.ENRICHMENT_SELECTION_EXPIRED'),
    ENRICHMENT_SELECTION_INVALID: t('errors.ENRICHMENT_SELECTION_INVALID'),
    CAPTURE_TEMPORARILY_UNAVAILABLE: t('errors.CAPTURE_TEMPORARILY_UNAVAILABLE'),
    INVALID_MESSAGE: t('errors.INVALID_MESSAGE')
  };
  const base =
    code === 'GOOGLE_IDENTITY_FAILED' && isClientError(error)
      ? t('errors.GOOGLE_IDENTITY_FAILED', { message: error.message })
      : (messages[code] ?? t('errors.unknown'));
  return isClientError(error) && error.requestId ? `${base} (${error.requestId})` : base;
}

function showStatus(message: string, error = false): void {
  if (statusTimer !== null) window.clearTimeout(statusTimer);
  statusElement.textContent = message;
  statusElement.classList.toggle('error', error);
  statusElement.classList.add('visible');
  statusTimer = window.setTimeout(() => statusElement.classList.remove('visible'), 4500);
}

function setBusy(button: HTMLButtonElement, busy: boolean, label?: string): void {
  if (button.classList.contains('capture-action')) {
    const text = button.querySelector<HTMLElement>('span');
    if (text) {
      if (busy && !button.disabled) button.dataset.label = text.textContent ?? '';
      text.textContent = busy ? (label ?? t('common.loading')) : (button.dataset.label ?? text.textContent);
    }
    button.disabled = busy;
    return;
  }
  if (button.classList.contains('icon-action')) {
    if (busy) {
      button.dataset.label = button.getAttribute('aria-label') ?? '';
      button.dataset.busyLabel = label ?? t('common.loading');
      button.setAttribute('aria-label', button.dataset.busyLabel);
      button.setAttribute('title', button.dataset.busyLabel);
    } else if (button.getAttribute('aria-label') === button.dataset.busyLabel) {
      const restoredLabel = button.dataset.label ?? '';
      button.setAttribute('aria-label', restoredLabel);
      button.setAttribute('title', restoredLabel);
    }
    button.disabled = busy || (button === aiTranslation && !aiTranslationAvailable);
    button.classList.toggle('is-busy', busy);
    return;
  }
  if (busy && !button.disabled) button.dataset.label = button.textContent ?? '';
  button.disabled = busy;
  button.textContent = busy ? (label ?? t('common.loading')) : (button.dataset.label ?? button.textContent);
}

function showView(view: 'auth' | 'capture'): void {
  loadingView.hidden = true;
  authView.hidden = view !== 'auth';
  captureView.hidden = view !== 'capture';
}

function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = theme;
}

function canonicalLanguage(value: string): string | null {
  try {
    return Intl.getCanonicalLocales(value.trim())[0] ?? null;
  } catch {
    return null;
  }
}

function isHebrewLanguage(value: string | null | undefined): boolean {
  return value?.split('-')[0]?.toLowerCase() === 'he';
}

function profileTargetLanguage(): string {
  return profile?.defaultTranslationLanguage
    ?? extensionSettings?.defaultTranslationLanguage
    ?? canonicalLanguage(chrome.i18n.getUILanguage())?.split('-')[0]
    ?? 'en';
}

function profileSourceLanguage(): string {
  return profile?.defaultSourceLanguage ?? extensionSettings?.defaultSourceLanguage ?? '';
}

function currentMethod(): TranslationMethod {
  const checked = document.querySelector<HTMLInputElement>('input[name="method"]:checked');
  return checked?.value === 'dictionary' || checked?.value === 'ai' ? checked.value : 'auto';
}

function setMethod(method: TranslationMethod): void {
  if (method === 'ai' && !aiTranslationAvailable) method = 'dictionary';
  if (method !== 'ai') standardMethod = method;
  const input = document.querySelector<HTMLInputElement>(`input[name="method"][value="${method}"]`);
  if (input) input.checked = true;
  const aiActive = method === 'ai';
  aiTranslation.setAttribute('aria-pressed', String(aiActive));
  const label = !aiTranslationAvailable
    ? t('popup.aiPaidOnly')
    : aiActive
      ? t('popup.aiActive')
      : t('popup.translateAi');
  aiTranslation.setAttribute('aria-label', label);
  aiTranslation.setAttribute('title', label);
}

function applyAiTranslationAccess(available: boolean): void {
  aiTranslationAvailable = available;
  aiTranslation.classList.toggle('paid-locked', !available);
  aiTranslation.disabled = !available;
  const label = available ? t('popup.translateAi') : t('popup.aiPaidOnlyButton');
  const title = available ? label : t('popup.aiPaidOnly');
  const text = aiTranslation.querySelector<HTMLElement>('span');
  if (text) text.textContent = label;
  aiTranslation.setAttribute('aria-label', title);
  aiTranslation.setAttribute('title', title);
  if (!available && currentMethod() === 'ai') setMethod('dictionary');
}

function setSourceEditing(editing: boolean): void {
  sourceEditing = editing;
  sourceEditor.hidden = !editing;
  sourceDisplay.hidden = editing;
  lexicalEditor.hidden = !editing || !preview;
  editSource.textContent = editing ? t('popup.finishEditing') : t('popup.editSource');
  if (!editing) {
    sourceDisplay.textContent = sourceText.value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
    inferItemType();
  } else {
    sourceText.focus();
  }
}

function setSourceValue(value: string, editing = false): void {
  sourceText.value = value;
  sourceDisplay.textContent = value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  setSourceEditing(editing);
}

function setContext(next: CaptureContext): void {
  context = next;
  setSourceValue(next.selectedText);
  sentenceText.value = next.sentenceText ?? '';
  const meta = [next.pageTitle, next.pageUrl ? new URL(next.pageUrl).hostname : null].filter(Boolean).join(' · ');
  pageMeta.textContent = meta;
  contextCard.hidden = !(next.sentenceText || meta);
  inferItemType();
  resetSaveIntent();
}

function inferItemType(force = false): void {
  if (force || !itemTypeManuallyEdited) {
    itemType.value = inferDetectedItemType(sourceText.value, partOfSpeech.value);
  }
}

function setTranslationEditing(editing: boolean): void {
  translationEditing = editing;
  translationEditor.hidden = !editing;
  translationDisplay.hidden = editing;
  editTranslation.setAttribute('aria-pressed', String(editing));
  editTranslation.setAttribute('aria-label', editing ? t('popup.finishTranslationEdit') : t('popup.editTranslation'));
  editTranslation.setAttribute('title', editing ? t('popup.finishTranslationEdit') : t('popup.editTranslation'));
  const label = editTranslation.querySelector<HTMLElement>('.action-label');
  if (label) label.textContent = editing ? t('popup.done') : t('popup.edit');
  if (!editing) {
    translationDisplay.textContent = translationText.value.trim();
    selectStrongSenseIfPossible();
  } else translationText.focus();
}

function setTranslationValue(value: string, editing = false): void {
  translationText.value = value;
  translationDisplay.textContent = value;
  translationCard.hidden = false;
  setTranslationEditing(editing);
}

function resetSaveIntent(): void {
  saveEventId = null;
  successView.hidden = true;
}

function resetCapture(keepContext = false): void {
  phase = nextPhase(phase, 'RESET');
  preview = null;
  selectedCandidate = null;
  previewFingerprint = '';
  saveEventId = null;
  savedLearningItemId = null;
  previewForm.hidden = true;
  successView.hidden = true;
  captureEditor.hidden = false;
  previewWarning.hidden = true;
  candidateFieldset.hidden = true;
  senseFieldset.hidden = true;
  translationText.value = '';
  translationDisplay.textContent = '';
  translationCard.hidden = true;
  setSourceValue('', true);
  translationEditing = false;
  itemTypeManuallyEdited = false;
  lexicalEditor.hidden = true;
  partOfSpeech.value = '';
  candidateExplanation.hidden = true;
  explanationText.textContent = '';
  phoneticRow.hidden = true;
  if (!keepContext) {
    context = null;
    sourceText.value = '';
    sentenceText.value = '';
    pageMeta.textContent = '';
    contextCard.hidden = true;
  }
  sourceText.focus();
}

function lexicalFingerprint(): string {
  return JSON.stringify([
    sourceText.value.normalize('NFKC').trim(),
    canonicalLanguage(sourceLanguage.value),
    canonicalLanguage(targetLanguage.value)
  ]);
}

function makeCandidateOption(candidate: EnrichmentCandidate, index: number): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'candidate-option';
  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = 'candidate';
  radio.value = String(index);
  const wrapper = document.createElement('span');
  const strong = document.createElement('strong');
  strong.dir = 'auto';
  strong.textContent = candidate.text;
  const detail = document.createElement('small');
  const parts = [candidate.partOfSpeech, candidate.variants.length ? candidate.variants.join(' · ') : null].filter(
    Boolean
  );
  detail.dir = 'auto';
  detail.textContent = parts.join(' — ');
  wrapper.append(strong);
  if (detail.textContent) wrapper.append(detail);
  label.append(radio, wrapper);
  radio.addEventListener('change', () => selectCandidate(candidate));
  return label;
}

function selectCandidate(candidate: EnrichmentCandidate): void {
  selectedCandidate = candidate;
  setTranslationValue(candidate.text);
  partOfSpeech.value = candidate.partOfSpeech ?? '';
  itemTypeManuallyEdited = false;
  inferItemType(true);
  explanationText.textContent = candidate.explanation?.trim() ?? '';
  candidateExplanation.hidden = !explanationText.textContent;
  if (isHebrewLanguage(preview?.sourceLanguageCode) && candidate.phoneticText) {
    sourceDisplay.textContent = candidate.phoneticText;
  }
  phoneticText.textContent = candidate.phoneticText ?? '';
  phoneticRow.hidden = !candidate.phoneticText;
  resetSaveIntent();
  selectStrongSenseIfPossible();
}

function normalized(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
}

function selectStrongSenseIfPossible(): void {
  if (!preview || preview.existingSenses.items.length !== 1) return;
  const sense = preview.existingSenses.items[0];
  if (!sense) return;
  const forms = [sense.primaryTranslation, ...sense.variants].map(normalized);
  if (forms.includes(normalized(translationText.value))) {
    const input = document.querySelector<HTMLInputElement>(`input[name="sense"][value="${sense.learningItemId}"]`);
    if (input) input.checked = true;
  }
}

function renderPreview(result: CapturePreview): void {
  savedLearningItemId = null;
  successView.hidden = true;
  preview = result;
  setSourceValue(result.sourceText);
  sourceLanguage.value = result.sourceLanguageCode ?? '';
  targetLanguage.value = result.translationLanguageCode ?? '';
  setMethod(result.translationMethod);
  previewFingerprint = lexicalFingerprint();
  candidatesElement.replaceChildren();
  result.enrichment.candidates.forEach((candidate, index) =>
    candidatesElement.append(makeCandidateOption(candidate, index))
  );
  candidateFieldset.hidden = result.enrichment.candidates.length <= 1;
  if (result.enrichment.candidates[0]) {
    const firstRadio = candidatesElement.querySelector<HTMLInputElement>('input[type="radio"]');
    if (firstRadio) firstRadio.checked = true;
    selectCandidate(result.enrichment.candidates[0]);
  } else {
    selectedCandidate = null;
    setTranslationValue('', true);
    partOfSpeech.value = '';
    candidateExplanation.hidden = true;
    explanationText.textContent = '';
    phoneticRow.hidden = true;
  }
  sensesElement.replaceChildren();
  for (const sense of result.existingSenses.items) {
    const label = document.createElement('label');
    label.className = 'sense-option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'sense';
    radio.value = sense.learningItemId;
    radio.addEventListener('change', resetSaveIntent);
    const wrapper = document.createElement('span');
    const strong = document.createElement('strong');
    strong.dir = 'auto';
    strong.textContent = sense.primaryTranslation;
    const small = document.createElement('small');
    small.textContent = `${sense.learningStatus} · ${sense.variants.join(' · ')}`.replace(/ · $/u, '');
    wrapper.append(strong, small);
    label.append(radio, wrapper);
    sensesElement.append(label);
  }
  senseFieldset.hidden = result.existingSenses.items.length === 0;
  const newSense = document.querySelector<HTMLInputElement>('input[name="sense"][value="new"]');
  if (newSense) newSense.checked = false;
  selectStrongSenseIfPossible();
  const warnings: string[] = [];
  if (result.requiresLanguageSelection) warnings.push(t('popup.chooseLanguages'));
  if (result.enrichment.status === 'not_configured') {
    warnings.push(
      result.translationMethod === 'ai'
        ? t('popup.aiNotConfigured')
        : t('popup.translationNotConfigured')
    );
  } else if (result.enrichment.status === 'unavailable' && result.translationMethod === 'ai') {
    warnings.push(aiFailureMessage(result));
  } else if (result.enrichment.status === 'unavailable') {
    warnings.push(googleFailureMessage(result));
  } else if (result.requiresManualTranslation) {
    warnings.push(t('popup.noSuggestion'));
  }
  if (result.existingSenses.hasMore) warnings.push(t('popup.moreMeanings'));
  previewWarning.textContent = warnings.join(' ');
  previewWarning.hidden = warnings.length === 0;
  previewForm.hidden = false;
  phase = nextPhase(phase, 'PREVIEWED');
}

async function loadPreview(triggerButton = previewButton): Promise<void> {
  const text = sourceText.value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (!text) {
    showStatus(t('popup.enterSource'), true);
    sourceText.focus();
    return;
  }
  const sourceCode = canonicalLanguage(sourceLanguage.value);
  const targetCode = canonicalLanguage(targetLanguage.value) ?? profileTargetLanguage();
  const currentContext = context ?? {
    selectedText: text,
    sentenceText: null,
    paragraphText: null,
    pageTitle: null,
    pageUrl: null,
    capturedAt: new Date().toISOString()
  };
  if (!context) setContext(currentContext);
  currentContext.sentenceText = sentenceText.value.trim() || null;
  phase = nextPhase(phase, 'PREVIEW');
  const requestedMethod = currentMethod();
  setBusy(triggerButton, true, triggerButton === aiTranslation ? t('popup.aiTranslating') : t('popup.translating'));
  try {
    const input: Extract<ExtensionRequest, { type: 'PREVIEW_CAPTURE' }>['input'] = {
      selectedText: currentContext.selectedText,
      sourceText: text,
      translationMethod: requestedMethod,
      context: {
        sentenceText: currentContext.sentenceText,
        paragraphText: null,
        pageTitle: currentContext.pageTitle,
        pageUrl: currentContext.pageUrl
      }
    };
    if (sourceCode) input.sourceLanguageCode = sourceCode;
    if (targetCode) input.translationLanguageCode = targetCode;
    renderPreview(await request({ type: 'PREVIEW_CAPTURE', input }));
  } catch (error) {
    phase = nextPhase(phase, isClientError(error) && error.code === 'OFFLINE' ? 'OFFLINE' : 'PREVIEW_ERROR');
    showStatus(userMessage(error), true);
  } finally {
    setBusy(triggerButton, false);
  }
}

function aiFailureMessage(result: CapturePreview): string {
  const codes = new Set(result.enrichment.warnings?.map((warning) => warning.code) ?? []);
  if (codes.has('ENRICHMENT_AUTHENTICATION'))
    return t('provider.anthropicAuth');
  if (codes.has('ENRICHMENT_BILLING')) return t('provider.anthropicBilling');
  if (codes.has('ENRICHMENT_PERMISSION')) return t('provider.anthropicPermission');
  if (codes.has('ENRICHMENT_WORKSPACE'))
    return t('provider.anthropicWorkspace');
  if (codes.has('ENRICHMENT_MODEL_ACCESS'))
    return t('provider.anthropicModel');
  if (codes.has('ENRICHMENT_RATE_LIMIT')) return t('provider.anthropicRate');
  if (codes.has('ENRICHMENT_INVALID_REQUEST')) return t('provider.anthropicRequest');
  if (codes.has('ENRICHMENT_TIMEOUT')) return t('provider.anthropicTimeout');
  if (codes.has('ENRICHMENT_INVALID_RESPONSE')) return t('provider.anthropicResponse');
  if (codes.has('ENRICHMENT_UPSTREAM')) return t('provider.anthropicUpstream');
  return t('provider.anthropicUnknown');
}

function googleFailureMessage(result: CapturePreview): string {
  const codes = new Set(result.enrichment.warnings?.map((warning) => warning.code) ?? []);
  if (codes.has('ENRICHMENT_AUTHENTICATION')) return t('provider.googleAuth');
  if (codes.has('ENRICHMENT_BILLING')) return t('provider.googleBilling');
  if (codes.has('ENRICHMENT_PERMISSION')) return t('provider.googlePermission');
  if (codes.has('ENRICHMENT_RATE_LIMIT')) return t('provider.googleRate');
  if (codes.has('ENRICHMENT_INVALID_REQUEST')) return t('provider.googleRequest');
  if (codes.has('ENRICHMENT_TIMEOUT')) return t('provider.googleTimeout');
  if (codes.has('ENRICHMENT_INVALID_RESPONSE')) return t('provider.googleResponse');
  return t('provider.googleUnknown');
}

function candidateProofIsCurrent(candidate: EnrichmentCandidate): boolean {
  return Boolean(
    preview &&
    lexicalFingerprint() === previewFingerprint &&
    normalized(translationText.value) === normalized(candidate.text) &&
    normalized(partOfSpeech.value) === normalized(candidate.partOfSpeech ?? '') &&
    (sentenceText.value.trim() || null) === (context?.sentenceText ?? null)
  );
}

function senseDecision() {
  if (!preview || preview.existingSenses.items.length === 0) return { mode: 'auto' as const };
  const selected = document.querySelector<HTMLInputElement>('input[name="sense"]:checked');
  if (!selected) return null;
  return selected.value === 'new'
    ? { mode: 'create_new_sense' as const }
    : { mode: 'merge' as const, learningItemId: selected.value };
}

function showSavedState(title: string, details: string): void {
  setSourceEditing(false);
  setTranslationEditing(false);
  successView.hidden = false;
  element<HTMLElement>('success-title').textContent = title;
  element<HTMLElement>('success-details').textContent = details;
}

async function save(): Promise<void> {
  if (!preview || !context) return;
  const sourceCode = canonicalLanguage(sourceLanguage.value);
  const targetCode = canonicalLanguage(targetLanguage.value);
  if (!sourceCode || !targetCode || !translationText.value.trim()) {
    showStatus(t('popup.validSaveFields'), true);
    return;
  }
  if (lexicalFingerprint() !== previewFingerprint) {
    showStatus(t('popup.previewChanged'), true);
    return;
  }
  const providerCandidate = selectedCandidate && candidateProofIsCurrent(selectedCandidate) ? selectedCandidate : null;
  if (savedLearningItemId) {
    phase = nextPhase(phase, 'SAVE');
    setBusy(saveButton, true, t('popup.saving'));
    try {
      await request({
        type: 'UPDATE_SAVED_ITEM',
        learningItemId: savedLearningItemId,
        patch: {
          sourceText: sourceText.value.trim(),
          sourceLanguageCode: sourceCode,
          translationLanguageCode: targetCode,
          itemType: itemType.value as 'word' | 'phrase' | 'expression' | 'phrasal_verb' | 'other',
          partOfSpeech: partOfSpeech.value.trim() || null,
          translation: {
            text: translationText.value.trim(),
            variants: providerCandidate?.variants ?? []
          }
        }
      });
      phase = nextPhase(phase, 'SAVED');
      showSavedState(t('popup.changesSavedTitle'), t('popup.changesSavedDetails', { source: sourceText.value.trim() }));
      showStatus(t('popup.changesSaved'));
    } catch (error) {
      phase = nextPhase(phase, isClientError(error) && error.code === 'OFFLINE' ? 'OFFLINE' : 'SAVE_ERROR');
      showStatus(userMessage(error), true);
    } finally {
      setBusy(saveButton, false);
    }
    return;
  }
  const decision = senseDecision();
  if (!decision) {
    showStatus(t('popup.selectMeaning'), true);
    return;
  }
  const eventId = saveEventId ?? crypto.randomUUID();
  saveEventId = eventId;
  const translation: {
    text: string;
    variants: string[];
    selectionToken?: string;
  } = {
    text: translationText.value.trim(),
    variants: providerCandidate?.variants ?? []
  };
  if (providerCandidate) translation.selectionToken = providerCandidate.selectionToken;
  const input = {
    item: {
      sourceText: sourceText.value.trim(),
      sourceLanguageCode: sourceCode,
      translationLanguageCode: targetCode,
      itemType: itemType.value as 'word' | 'phrase' | 'expression' | 'phrasal_verb' | 'other',
      partOfSpeech: partOfSpeech.value.trim() || null,
      phoneticText: providerCandidate?.phoneticText ?? null,
      phoneticScheme: providerCandidate?.phoneticScheme ?? null
    },
    translation,
    context: {
      selectedText: context.selectedText,
      sentenceText: sentenceText.value.trim() || null,
      paragraphText: null,
      pageTitle: context.pageTitle,
      pageUrl: context.pageUrl,
      sourceType: 'chrome_extension' as const,
      capturedAt: context.capturedAt
    },
    senseDecision: decision,
    clientEventId: eventId
  };
  phase = nextPhase(phase, 'SAVE');
  setBusy(saveButton, true, t('popup.saving'));
  try {
    const result = await request({ type: 'SAVE_CAPTURE', input, eventId });
    phase = nextPhase(phase, 'SAVED');
    savedLearningItemId = result.learningItemId;
    const labels = {
      new: t('popup.statusNew'),
      learning: t('popup.statusLearning'),
      reviewing: t('popup.statusReviewing'),
      mastered: t('popup.statusMastered')
    };
    showSavedState(
      result.outcome === 'merged' ? t('popup.contextAdded') : t('popup.savedTitle'),
      t('popup.savedDetails', { source: result.sourceText, status: labels[result.learningStatus] })
    );
    showStatus(t('popup.wordSaved'));
  } catch (error) {
    phase = nextPhase(phase, isClientError(error) && error.code === 'OFFLINE' ? 'OFFLINE' : 'SAVE_ERROR');
    showStatus(userMessage(error), true);
  } finally {
    setBusy(saveButton, false);
  }
}

async function removeSaved(): Promise<void> {
  const learningItemId = savedLearningItemId;
  if (!learningItemId) return;
  setBusy(removeSavedButton, true, t('popup.removing'));
  try {
    await request({ type: 'REMOVE_SAVED_ITEM', learningItemId });
    savedLearningItemId = null;
    saveEventId = null;
    phase = nextPhase(phase, 'RESET');
    successView.hidden = true;
    const removedSense = document.querySelector<HTMLInputElement>(
      `input[name="sense"][value="${learningItemId}"]`
    )?.closest('label');
    removedSense?.remove();
    const newSense = document.querySelector<HTMLInputElement>('input[name="sense"][value="new"]');
    if (newSense && !sensesElement.querySelector('input[name="sense"]')) newSense.checked = true;
    showStatus(t('popup.wordRemoved'));
  } catch (error) {
    showStatus(userMessage(error), true);
  } finally {
    setBusy(removeSavedButton, false);
  }
}

function renderAuthMode(): void {
  const login = authMode === 'login';
  element<HTMLButtonElement>('login-tab').classList.toggle('active', login);
  element<HTMLButtonElement>('login-tab').setAttribute('aria-selected', String(login));
  element<HTMLButtonElement>('register-tab').classList.toggle('active', !login);
  element<HTMLButtonElement>('register-tab').setAttribute('aria-selected', String(!login));
  element<HTMLButtonElement>('email-submit').textContent = login ? t('popup.login') : t('popup.createAccount');
  element<HTMLInputElement>('password').autocomplete = login ? 'current-password' : 'new-password';
}

async function authenticated(nextSession: PublicSession): Promise<void> {
  session = nextSession;
  element<HTMLElement>('account-email').textContent = nextSession.user.email;
  applyAiTranslationAccess(false);
  showView('capture');
  try {
    const fresh = await request({ type: 'GET_BOOTSTRAP' });
    profile = fresh.profile;
    applyAiTranslationAccess(fresh.billing?.tier === 'paid' && fresh.billing.access);
    extensionSettings = fresh.settings;
    applyTheme(fresh.settings.theme);
    sourceLanguage.value = profileSourceLanguage();
    targetLanguage.value = profileTargetLanguage();
    setMethod(effectiveTranslationMethod(profile?.translationMethodPreference));
    if (fresh.pendingCapture) {
      setContext(fresh.pendingCapture);
      await loadPreview();
    }
  } catch {
    // Authentication succeeded; capture actions will surface a precise API error if needed.
  }
}

async function initialize(): Promise<void> {
  try {
    const data: BootstrapData = await request({ type: 'GET_BOOTSTRAP' });
    profile = data.profile;
    applyAiTranslationAccess(data.billing?.tier === 'paid' && data.billing.access);
    extensionSettings = data.settings;
    applyTheme(data.settings.theme);
    session = data.session;
    if (!session) {
      showView('auth');
      return;
    }
    element<HTMLElement>('account-email').textContent = session.user.email;
    sourceLanguage.value = profileSourceLanguage();
    targetLanguage.value = profileTargetLanguage();
    setMethod(effectiveTranslationMethod(profile?.translationMethodPreference));
    showView('capture');
    if (data.pendingCapture) {
      setContext(data.pendingCapture);
      await loadPreview();
    }
  } catch (error) {
    showView('auth');
    showStatus(userMessage(error), true);
  }
}

element<HTMLButtonElement>('settings-button').addEventListener('click', () => void chrome.runtime.openOptionsPage());
element<HTMLButtonElement>('login-tab').addEventListener('click', () => {
  authMode = 'login';
  renderAuthMode();
});
element<HTMLButtonElement>('register-tab').addEventListener('click', () => {
  authMode = 'register';
  renderAuthMode();
});
element<HTMLFormElement>('auth-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const button = element<HTMLButtonElement>('email-submit');
  const email = element<HTMLInputElement>('email').value.trim();
  const password = element<HTMLInputElement>('password').value;
  if (!email || password.length < 12) {
    showStatus(t('popup.loginValidation'), true);
    return;
  }
  setBusy(button, true, authMode === 'login' ? t('popup.signingIn') : t('popup.creatingAccount'));
  void request({ type: 'AUTH_EMAIL', mode: authMode, email, password })
    .then(authenticated)
    .catch((error: unknown) => showStatus(userMessage(error), true))
    .finally(() => setBusy(button, false));
});
element<HTMLButtonElement>('google-button').addEventListener('click', () => {
  const button = element<HTMLButtonElement>('google-button');
  setBusy(button, true, t('popup.connecting'));
  void request({ type: 'AUTH_GOOGLE' })
    .then(authenticated)
    .catch((error: unknown) => showStatus(userMessage(error), true))
    .finally(() => setBusy(button, false));
});
element<HTMLButtonElement>('logout-button').addEventListener('click', () => {
  void request({ type: 'LOGOUT' }).finally(() => {
    session = null;
    resetCapture();
    showView('auth');
  });
});
element<HTMLButtonElement>('read-selection').addEventListener('click', () => {
  const button = element<HTMLButtonElement>('read-selection');
  phase = nextPhase(phase, 'EXTRACT');
  setBusy(button, true, t('popup.reading'));
  void request({ type: 'GET_ACTIVE_CONTEXT', selectedText: sourceText.value })
    .then(async (result) => {
      if (!result.selectedText) throw new Error('NO_SELECTION');
      setContext(result);
      phase = nextPhase(phase, 'EXTRACTED');
      await loadPreview(button);
    })
    .catch(() => {
      phase = nextPhase(phase, 'CONTEXT_ERROR');
      showStatus(t('popup.noSelection'), true);
    })
    .finally(() => setBusy(button, false));
});
previewButton.addEventListener('click', () => {
  setMethod('dictionary');
  resetSaveIntent();
  void loadPreview(previewButton);
});
previewForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void save();
});
element<HTMLButtonElement>('save-another').addEventListener('click', () => resetCapture());
removeSavedButton.addEventListener('click', () => void removeSaved());
element<HTMLButtonElement>('speak-button').addEventListener('click', () => {
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(sourceText.value.trim());
  utterance.lang = canonicalLanguage(sourceLanguage.value) ?? '';
  speechSynthesis.speak(utterance);
});
sourceText.addEventListener('input', () => {
  sourceDisplay.textContent = sourceText.value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  inferItemType();
  resetSaveIntent();
});
sentenceText.addEventListener('input', resetSaveIntent);
translationText.addEventListener('input', () => {
  translationDisplay.textContent = translationText.value.trim();
  resetSaveIntent();
  selectStrongSenseIfPossible();
});
sourceLanguage.addEventListener('input', resetSaveIntent);
targetLanguage.addEventListener('input', resetSaveIntent);
editSource.addEventListener('click', () => {
  setSourceEditing(!sourceEditing);
  resetSaveIntent();
});
editTranslation.addEventListener('click', () => {
  setTranslationEditing(!translationEditing);
  resetSaveIntent();
});
aiTranslation.addEventListener('click', () => {
  if (!aiTranslationAvailable) return;
  setMethod(currentMethod() === 'ai' ? standardMethod : 'ai');
  resetSaveIntent();
  void loadPreview(aiTranslation);
});
partOfSpeech.addEventListener('input', () => {
  if (!itemTypeManuallyEdited) inferItemType(true);
  resetSaveIntent();
});
itemType.addEventListener('change', () => {
  itemTypeManuallyEdited = true;
  resetSaveIntent();
});
const newSenseInput = document.querySelector<HTMLInputElement>('input[name="sense"][value="new"]');
newSenseInput?.addEventListener('change', resetSaveIntent);

populateLanguageSelect(sourceLanguage, true);
populateLanguageSelect(targetLanguage);
renderAuthMode();
void initialize();
