export type TranslationMethod = 'auto' | 'dictionary' | 'ai';
export type ItemType = 'word' | 'phrase' | 'expression' | 'phrasal_verb' | 'other';
export type CapturePhase =
  | 'IDLE'
  | 'EXTRACTING_CONTEXT'
  | 'LOADING_PREVIEW'
  | 'PREVIEW_READY'
  | 'SAVING'
  | 'SAVED'
  | 'AUTH_REQUIRED'
  | 'CONTEXT_FAILED'
  | 'PREVIEW_FAILED'
  | 'SAVE_FAILED'
  | 'OFFLINE';

export interface CaptureContext {
  selectedText: string;
  sentenceText: string | null;
  paragraphText: string | null;
  pageTitle: string | null;
  pageUrl: string | null;
  documentLanguageHint?: string;
  capturedAt: string;
}

export interface EnrichmentCandidate {
  text: string;
    variants: string[];
    partOfSpeech: string | null;
    explanation?: string | null;
    phoneticText: string | null;
  phoneticScheme: string | null;
  examples: string[];
  contextUsed: boolean;
  provenance: {
    providerName: string;
    providerType: string;
    providerModel: string | null;
    contextUsed: boolean;
  };
  selectionToken: string;
}

export interface ExistingSense {
  learningItemId: string;
  sourceText: string;
  userStatus: 'active' | 'paused' | 'archived';
  learningStatus: 'new' | 'learning' | 'reviewing' | 'mastered';
  primaryTranslation: string;
  variants: string[];
}

export interface CapturePreview {
  sourceText: string;
  sourceLanguageCode: string | null;
  sourceLanguageResolution: 'user' | 'profile' | 'document_hint' | 'provider' | 'unresolved';
  translationLanguageCode: string | null;
  translationLanguageResolution: 'user' | 'profile' | 'unresolved';
  translationMethod: TranslationMethod;
  enrichment: {
    status: 'succeeded' | 'not_configured' | 'unavailable' | 'needs_language_selection';
    candidates: EnrichmentCandidate[];
    warnings?: Array<{ code: string }>;
  };
  existingSenses: { items: ExistingSense[]; hasMore: boolean };
  requiresManualTranslation: boolean;
  requiresLanguageSelection: boolean;
}

export interface ProfileLanguage {
  languageCode: string;
  selfAssessedLevel: string | null;
  systemEstimatedLevel: string | null;
  effectiveLevel: string | null;
  systemConfidence: number | null;
  lastEvaluatedAt: string | null;
}

export interface GotItProfile {
  /** Null delegates source-language detection to the translation provider. */
  defaultSourceLanguage: string | null;
  defaultTranslationLanguage: string | null;
  timezone: string;
  dailyGoal: { type: 'items' | 'minutes' | 'attempts'; value: number };
  defaultNewItemsPerDay: number;
  translationMethodPreference: TranslationMethod | null;
  languages: ProfileLanguage[];
  interests: string[];
}

export interface CoreUser {
  id: string;
  email: string;
  emailVerified?: boolean;
}

export interface PublicSession {
  user: CoreUser;
  expiresAt: number;
}

export interface CoreBillingStatus {
  tier: 'free' | 'trial' | 'paid';
  access: boolean;
}

export interface ExtensionSettings {
  floatingAction: boolean;
  autoCloseAfterSave: boolean;
  theme: 'light' | 'dark';
  onboardingComplete: boolean;
  defaultSourceLanguage: string | null;
  defaultTranslationLanguage: string | null;
  languagePreferencesNeedSync: boolean;
}

export interface CaptureSaveInput {
  item: {
    sourceText: string;
    sourceLanguageCode: string;
    translationLanguageCode: string;
    itemType: ItemType;
    partOfSpeech: string | null;
    phoneticText: string | null;
    phoneticScheme: string | null;
  };
  translation: {
    text: string;
    variants: string[];
    selectionToken?: string;
  };
  context: {
    selectedText: string;
    sentenceText: string | null;
    paragraphText: string | null;
    pageTitle: string | null;
    pageUrl: string | null;
    sourceType: 'chrome_extension';
    capturedAt: string;
  };
  senseDecision:
    | { mode: 'auto' }
    | { mode: 'create_new_sense' }
    | { mode: 'merge'; learningItemId: string };
  clientEventId: string;
}

export interface CaptureResult {
  outcome: 'created' | 'created_new_sense' | 'merged';
  learningItemId: string;
  occurrenceId: string;
  sourceText: string;
  sourceLanguageCode: string;
  translationLanguageCode: string;
  primaryTranslation: string;
  userStatus: 'active' | 'paused' | 'archived';
  learningStatus: 'new' | 'learning' | 'reviewing' | 'mastered';
  capturedAt: string;
}

export interface ClientError {
  code: string;
  message: string;
  status?: number;
  requestId?: string;
  details?: unknown;
}

export type ResponseEnvelope<T> = { ok: true; data: T } | { ok: false; error: ClientError };

export interface BootstrapData {
  session: PublicSession | null;
  billing: CoreBillingStatus | null;
  profile: GotItProfile | null;
  settings: ExtensionSettings;
  pendingCapture: CaptureContext | null;
}

export interface InlinePreviewResult {
  inlineCaptureId: string;
  preview: CapturePreview;
}
