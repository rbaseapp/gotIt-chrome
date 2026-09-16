import { sendRequest, type ExtensionRequest, type ResponseMap } from '../shared/messages';
import { inferItemType as inferDetectedItemType } from '../shared/item-type';
import { nextPhase } from '../shared/state';
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
const sourceLanguage = element<HTMLInputElement>('source-language');
const targetLanguage = element<HTMLInputElement>('target-language');
const translationText = element<HTMLTextAreaElement>('translation-text');
const translationCard = element<HTMLElement>('translation-card');
const translationDisplay = element<HTMLElement>('translation-display');
const translationEditor = element<HTMLElement>('translation-editor');
const editTranslation = element<HTMLButtonElement>('edit-translation');
const aiTranslation = element<HTMLButtonElement>('ai-translation');
const itemType = element<HTMLSelectElement>('item-type');
const itemTypeDisplay = element<HTMLElement>('item-type-display');
const partOfSpeech = element<HTMLInputElement>('part-of-speech');
const partOfSpeechDisplay = element<HTMLElement>('part-of-speech-display');
const partOfSpeechSeparator = element<HTMLElement>('part-of-speech-separator');
const lexicalSummary = element<HTMLElement>('lexical-summary');
const lexicalEditor = element<HTMLElement>('lexical-editor');
const editLexical = element<HTMLButtonElement>('edit-lexical');
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
const previewButton = element<HTMLButtonElement>('preview-button');

let phase: CapturePhase = 'IDLE';
let session: PublicSession | null = null;
let profile: GotItProfile | null = null;
let settings: ExtensionSettings = { floatingAction: false, autoCloseAfterSave: false };
let context: CaptureContext | null = null;
let preview: CapturePreview | null = null;
let selectedCandidate: EnrichmentCandidate | null = null;
let saveEventId: string | null = null;
let previewFingerprint = '';
let authMode: 'login' | 'register' = 'login';
let statusTimer: number | null = null;
let sourceEditing = true;
let translationEditing = false;
let lexicalEditing = false;
let itemTypeManuallyEdited = false;
let standardMethod: 'auto' | 'dictionary' = 'auto';

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
    AUTHENTICATION_REQUIRED: 'צריך להתחבר מחדש ל־GotIt.',
    UNAUTHORIZED: 'ההתחברות פגה. יש להתחבר מחדש.',
    INVALID_CREDENTIALS: 'האימייל או הסיסמה אינם נכונים.',
    USER_ALREADY_EXISTS: 'כבר קיים חשבון עם האימייל הזה.',
    GOOGLE_SIGN_IN_CANCELLED: 'ההתחברות עם Google בוטלה.',
    GOOGLE_AUTH_NOT_CONFIGURED: 'ה־Google OAuth החדש עדיין לא רשום ב־Core עבור אפליקציית GotIt.',
    GOOGLE_TOKEN_INVALID: 'Core דחה את Google token. יש לוודא שה־Client ID החדש רשום ב־Core.',
    GOOGLE_SIGN_IN_FAILED: 'לא הצלחנו להתחבר עם Google.',
    OFFLINE: 'אין כרגע חיבור לרשת.',
    NETWORK_ERROR: 'לא הצלחנו להגיע ל־GotIt. נסה שוב.',
    VALIDATION_ERROR: 'חלק מהפרטים חסרים או אינם תקינים.',
    SENSE_SELECTION_REQUIRED: 'צריך לבחור משמעות קיימת או ליצור משמעות חדשה.',
    MERGE_ITEM_CHANGED: 'הפריט השתנה. טען את התצוגה המקדימה מחדש.',
    ENRICHMENT_SELECTION_EXPIRED: 'הצעת התרגום פגה. טען תרגום מחדש.',
    ENRICHMENT_SELECTION_INVALID: 'הצעת התרגום השתנתה. טען תרגום מחדש או שמור כתרגום ידני.',
    CAPTURE_TEMPORARILY_UNAVAILABLE: 'השמירה אינה זמינה כרגע. אפשר לנסות שוב בבטחה.',
    INVALID_MESSAGE: 'הבקשה מהתוסף אינה תקינה.'
  };
  const base = code === 'GOOGLE_IDENTITY_FAILED' && isClientError(error)
    ? `Chrome לא הצליח לפתוח התחברות Google: ${error.message}`
    : messages[code] ?? 'משהו לא הסתדר. נסה שוב.';
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
  if (busy) button.dataset.label = button.textContent ?? '';
  button.disabled = busy;
  button.textContent = busy ? (label ?? 'טוען…') : (button.dataset.label ?? button.textContent);
}

function showView(view: 'auth' | 'capture'): void {
  loadingView.hidden = true;
  authView.hidden = view !== 'auth';
  captureView.hidden = view !== 'capture';
}

function canonicalLanguage(value: string): string | null {
  try { return Intl.getCanonicalLocales(value.trim())[0] ?? null; } catch { return null; }
}

function profileTargetLanguage(): string {
  return profile?.defaultTranslationLanguage
    ?? canonicalLanguage(chrome.i18n.getUILanguage())?.split('-')[0]
    ?? 'en';
}

function currentMethod(): TranslationMethod {
  const checked = document.querySelector<HTMLInputElement>('input[name="method"]:checked');
  return checked?.value === 'dictionary' || checked?.value === 'ai' ? checked.value : 'auto';
}

function setMethod(method: TranslationMethod): void {
  if (method !== 'ai') standardMethod = method;
  const input = document.querySelector<HTMLInputElement>(`input[name="method"][value="${method}"]`);
  if (input) input.checked = true;
  const aiActive = method === 'ai';
  aiTranslation.setAttribute('aria-pressed', String(aiActive));
  aiTranslation.textContent = aiActive ? '✦ AI פעיל' : '✦ תרגום AI';
}

function setSourceEditing(editing: boolean): void {
  sourceEditing = editing;
  sourceEditor.hidden = !editing;
  sourceDisplay.hidden = editing;
  editSource.textContent = editing ? 'סיום עריכה' : 'ערוך מילה';
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
  if (next.documentLanguageHint && !sourceLanguage.value) {
    sourceLanguage.value = canonicalLanguage(next.documentLanguageHint) ?? '';
  }
  inferItemType();
  resetSaveIntent();
}

const itemTypeLabels: Record<string, string> = {
  word: 'מילה',
  phrase: 'ביטוי',
  expression: 'ניב / Expression',
  phrasal_verb: 'Phrasal verb',
  other: 'אחר'
};

function updateDetectedDisplays(): void {
  itemTypeDisplay.textContent = itemTypeLabels[itemType.value] ?? itemType.value;
  const detectedPart = partOfSpeech.value.trim();
  partOfSpeechDisplay.textContent = detectedPart;
  partOfSpeechDisplay.hidden = !detectedPart;
  partOfSpeechSeparator.hidden = !detectedPart;
}

function inferItemType(force = false): void {
  if (force || !itemTypeManuallyEdited) {
    itemType.value = inferDetectedItemType(sourceText.value, partOfSpeech.value);
  }
  updateDetectedDisplays();
}

function setTranslationEditing(editing: boolean): void {
  translationEditing = editing;
  translationEditor.hidden = !editing;
  translationDisplay.hidden = editing;
  editTranslation.textContent = editing ? 'סיום עריכה' : 'ערוך תרגום';
  if (!editing) {
    translationDisplay.textContent = translationText.value.trim();
    selectStrongSenseIfPossible();
  }
  else translationText.focus();
}

function setTranslationValue(value: string, editing = false): void {
  translationText.value = value;
  translationDisplay.textContent = value;
  translationCard.hidden = false;
  setTranslationEditing(editing);
}

function setLexicalEditing(editing: boolean): void {
  lexicalEditing = editing;
  lexicalEditor.hidden = !editing;
  lexicalSummary.hidden = editing;
  editLexical.textContent = editing ? 'סיום עריכה' : 'עריכת פרטים';
  if (!editing) {
    inferItemType();
    updateDetectedDisplays();
  }
}

function resetSaveIntent(): void {
  saveEventId = null;
}

function resetCapture(keepContext = false): void {
  phase = nextPhase(phase, 'RESET');
  preview = null;
  selectedCandidate = null;
  previewFingerprint = '';
  saveEventId = null;
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
  lexicalEditing = false;
  itemTypeManuallyEdited = false;
  lexicalEditor.hidden = true;
  lexicalSummary.hidden = false;
  editLexical.textContent = 'עריכת פרטים';
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
  const parts = [candidate.partOfSpeech, candidate.variants.length ? candidate.variants.join(' · ') : null].filter(Boolean);
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
  setLexicalEditing(false);
  itemTypeManuallyEdited = false;
  inferItemType(true);
  explanationText.textContent = candidate.explanation?.trim() ?? '';
  candidateExplanation.hidden = !explanationText.textContent;
  phoneticText.textContent = [candidate.phoneticText, candidate.phoneticScheme].filter(Boolean).join(' · ');
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
  preview = result;
  setSourceValue(result.sourceText);
  sourceLanguage.value = result.sourceLanguageCode ?? '';
  targetLanguage.value = result.translationLanguageCode ?? '';
  setMethod(result.translationMethod);
  previewFingerprint = lexicalFingerprint();
  candidatesElement.replaceChildren();
  result.enrichment.candidates.forEach((candidate, index) => candidatesElement.append(makeCandidateOption(candidate, index)));
  candidateFieldset.hidden = result.enrichment.candidates.length <= 1;
  if (result.enrichment.candidates[0]) {
    const firstRadio = candidatesElement.querySelector<HTMLInputElement>('input[type="radio"]');
    if (firstRadio) firstRadio.checked = true;
    selectCandidate(result.enrichment.candidates[0]);
  } else {
    selectedCandidate = null;
    setTranslationValue('', true);
    partOfSpeech.value = '';
    updateDetectedDisplays();
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
  if (result.requiresLanguageSelection) warnings.push('יש לבחור שפת מקור ושפת תרגום.');
  if (result.enrichment.status === 'not_configured') {
    warnings.push(result.translationMethod === 'ai'
      ? 'תרגום AI אינו מוגדר במלואו בשרת. יש להשלים ב־Render מפתח Anthropic, שם מודל וסוד חתימה, ולאחר מכן לבצע Deploy חדש.'
      : 'ספק התרגום האוטומטי עדיין לא הוגדר בשרת. אפשר להזין תרגום ידנית או להגדיר Google Cloud Translation / Claude ב־Render.');
  } else if (result.enrichment.status === 'unavailable') {
    warnings.push(result.translationMethod === 'ai'
      ? 'השרת ניסה להפעיל AI אך הבקשה נכשלה. יש לבדוק ב־Render שהמפתח פעיל, שהמודל קיים בחשבון ושבוצע Deploy לאחר שינוי משתני הסביבה.'
      : 'שירות התרגום אינו זמין כרגע. אפשר לנסות שוב או להזין תרגום ידנית.');
  } else if (result.requiresManualTranslation) {
    warnings.push('שירות התרגום לא החזיר הצעה. אפשר להזין תרגום ידנית.');
  }
  if (result.existingSenses.hasMore) warnings.push('קיימות משמעויות נוספות בספרייה; מומלץ לפתוח את אפליקציית GotIt.');
  previewWarning.textContent = warnings.join(' ');
  previewWarning.hidden = warnings.length === 0;
  previewForm.hidden = false;
  phase = nextPhase(phase, 'PREVIEWED');
}

async function loadPreview(triggerButton = previewButton): Promise<void> {
  const text = sourceText.value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (!text) { showStatus('יש להזין מילה או ביטוי.', true); sourceText.focus(); return; }
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
  setBusy(triggerButton, true, triggerButton === aiTranslation ? 'AI מתרגם…' : 'מתרגם…');
  try {
    const input: Extract<ExtensionRequest, { type: 'PREVIEW_CAPTURE' }>['input'] = {
      selectedText: currentContext.selectedText,
      sourceText: text,
      translationMethod: currentMethod(),
      context: {
        sentenceText: currentContext.sentenceText,
        paragraphText: null,
        pageTitle: currentContext.pageTitle,
        pageUrl: currentContext.pageUrl
      }
    };
    if (sourceCode) input.sourceLanguageCode = sourceCode;
    else if (currentContext.documentLanguageHint && canonicalLanguage(currentContext.documentLanguageHint)) {
      input.documentLanguageHint = canonicalLanguage(currentContext.documentLanguageHint)!;
    }
    if (targetCode) input.translationLanguageCode = targetCode;
    renderPreview(await request({ type: 'PREVIEW_CAPTURE', input }));
  } catch (error) {
    phase = nextPhase(phase, isClientError(error) && error.code === 'OFFLINE' ? 'OFFLINE' : 'PREVIEW_ERROR');
    showStatus(userMessage(error), true);
  } finally {
    setBusy(triggerButton, false);
  }
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

async function save(): Promise<void> {
  if (!preview || !context) return;
  const sourceCode = canonicalLanguage(sourceLanguage.value);
  const targetCode = canonicalLanguage(targetLanguage.value);
  if (!sourceCode || !targetCode || !translationText.value.trim()) {
    showStatus('יש למלא שפות ותרגום תקינים.', true);
    return;
  }
  if (lexicalFingerprint() !== previewFingerprint) {
    showStatus('המילה או השפות השתנו. יש להציג תרגום מחדש לפני השמירה.', true);
    return;
  }
  const decision = senseDecision();
  if (!decision) { showStatus('יש לבחור משמעות קיימת או משמעות חדשה.', true); return; }
  const providerCandidate = selectedCandidate && candidateProofIsCurrent(selectedCandidate) ? selectedCandidate : null;
  const eventId = saveEventId ?? crypto.randomUUID();
  saveEventId = eventId;
  const translation: { text: string; variants: string[]; selectionToken?: string } = {
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
  setBusy(saveButton, true, 'שומר…');
  try {
    const result = await request({ type: 'SAVE_CAPTURE', input, eventId });
    phase = nextPhase(phase, 'SAVED');
    captureEditor.hidden = true;
    previewForm.hidden = true;
    successView.hidden = false;
    element<HTMLElement>('success-title').textContent = result.outcome === 'merged' ? 'ההקשר נוסף למילה' : 'נשמר ב־GotIt';
    const labels = { new: 'חדש', learning: 'בלמידה', reviewing: 'בחזרה', mastered: 'נלמד' };
    element<HTMLElement>('success-details').textContent = `“${result.sourceText}” · ${labels[result.learningStatus]}`;
    if (settings.autoCloseAfterSave) window.setTimeout(() => window.close(), 900);
  } catch (error) {
    phase = nextPhase(phase, isClientError(error) && error.code === 'OFFLINE' ? 'OFFLINE' : 'SAVE_ERROR');
    showStatus(userMessage(error), true);
  } finally {
    setBusy(saveButton, false);
  }
}

function renderAuthMode(): void {
  const login = authMode === 'login';
  element<HTMLButtonElement>('login-tab').classList.toggle('active', login);
  element<HTMLButtonElement>('login-tab').setAttribute('aria-selected', String(login));
  element<HTMLButtonElement>('register-tab').classList.toggle('active', !login);
  element<HTMLButtonElement>('register-tab').setAttribute('aria-selected', String(!login));
  element<HTMLButtonElement>('email-submit').textContent = login ? 'כניסה' : 'יצירת חשבון';
  element<HTMLInputElement>('password').autocomplete = login ? 'current-password' : 'new-password';
}

async function authenticated(nextSession: PublicSession): Promise<void> {
  session = nextSession;
  element<HTMLElement>('account-email').textContent = nextSession.user.email;
  showView('capture');
  try {
    const fresh = await request({ type: 'GET_BOOTSTRAP' });
    profile = fresh.profile;
    settings = fresh.settings;
    targetLanguage.value = profileTargetLanguage();
    setMethod(profile?.translationMethodPreference ?? 'auto');
    if (fresh.pendingCapture) { setContext(fresh.pendingCapture); await loadPreview(); }
  } catch {
    // Authentication succeeded; capture actions will surface a precise API error if needed.
  }
}

async function initialize(): Promise<void> {
  try {
    const data: BootstrapData = await request({ type: 'GET_BOOTSTRAP' });
    settings = data.settings;
    profile = data.profile;
    session = data.session;
    if (!session) { showView('auth'); return; }
    element<HTMLElement>('account-email').textContent = session.user.email;
    targetLanguage.value = profileTargetLanguage();
    setMethod(profile?.translationMethodPreference ?? 'auto');
    showView('capture');
    if (data.pendingCapture) { setContext(data.pendingCapture); await loadPreview(); }
  } catch (error) {
    showView('auth');
    showStatus(userMessage(error), true);
  }
}

element<HTMLButtonElement>('settings-button').addEventListener('click', () => void chrome.runtime.openOptionsPage());
element<HTMLButtonElement>('login-tab').addEventListener('click', () => { authMode = 'login'; renderAuthMode(); });
element<HTMLButtonElement>('register-tab').addEventListener('click', () => { authMode = 'register'; renderAuthMode(); });
element<HTMLFormElement>('auth-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const button = element<HTMLButtonElement>('email-submit');
  const email = element<HTMLInputElement>('email').value.trim();
  const password = element<HTMLInputElement>('password').value;
  if (!email || password.length < 12) { showStatus('יש להזין אימייל וסיסמה בת 12 תווים לפחות.', true); return; }
  setBusy(button, true, authMode === 'login' ? 'נכנס…' : 'יוצר חשבון…');
  void request({ type: 'AUTH_EMAIL', mode: authMode, email, password })
    .then(authenticated)
    .catch((error: unknown) => showStatus(userMessage(error), true))
    .finally(() => setBusy(button, false));
});
element<HTMLButtonElement>('google-button').addEventListener('click', () => {
  const button = element<HTMLButtonElement>('google-button');
  setBusy(button, true, 'מתחבר…');
  void request({ type: 'AUTH_GOOGLE' })
    .then(authenticated)
    .catch((error: unknown) => showStatus(userMessage(error), true))
    .finally(() => setBusy(button, false));
});
element<HTMLButtonElement>('logout-button').addEventListener('click', () => {
  void request({ type: 'LOGOUT' }).finally(() => { session = null; resetCapture(); showView('auth'); });
});
element<HTMLButtonElement>('read-selection').addEventListener('click', () => {
  const button = element<HTMLButtonElement>('read-selection');
  phase = nextPhase(phase, 'EXTRACT');
  setBusy(button, true, 'קורא…');
  void request({ type: 'GET_ACTIVE_CONTEXT', selectedText: sourceText.value })
    .then((result) => {
      if (!result.selectedText) throw new Error('NO_SELECTION');
      setContext(result);
      phase = nextPhase(phase, 'EXTRACTED');
    })
    .catch(() => { phase = nextPhase(phase, 'CONTEXT_ERROR'); showStatus('לא נמצא סימון בעמוד. אפשר להקליד ידנית.', true); })
    .finally(() => setBusy(button, false));
});
previewButton.addEventListener('click', () => void loadPreview());
previewForm.addEventListener('submit', (event) => { event.preventDefault(); void save(); });
element<HTMLButtonElement>('cancel-button').addEventListener('click', () => resetCapture());
element<HTMLButtonElement>('save-another').addEventListener('click', () => resetCapture());
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
  setMethod(currentMethod() === 'ai' ? standardMethod : 'ai');
  resetSaveIntent();
  void loadPreview(aiTranslation);
});
editLexical.addEventListener('click', () => {
  setLexicalEditing(!lexicalEditing);
  resetSaveIntent();
});
partOfSpeech.addEventListener('input', () => {
  if (!itemTypeManuallyEdited) inferItemType(true);
  resetSaveIntent();
});
itemType.addEventListener('change', () => {
  itemTypeManuallyEdited = true;
  updateDetectedDisplays();
  resetSaveIntent();
});
const newSenseInput = document.querySelector<HTMLInputElement>('input[name="sense"][value="new"]');
newSenseInput?.addEventListener('change', resetSaveIntent);

renderAuthMode();
void initialize();
