import { sendRequest, type ExtensionRequest, type ResponseMap } from '../shared/messages';
import type { ClientError, TranslationMethod } from '../shared/types';
import { populateLanguageSelect } from '../shared/languages';
import {
  getUiLocalePreference,
  initializeI18n,
  setUiLocalePreference,
  t,
  type UiLocalePreference
} from '../shared/i18n';

await initializeI18n();

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing element: ${id}`);
  return result as T;
}

const profileForm = element<HTMLFormElement>('profile-form');
const sourceLanguage = element<HTMLSelectElement>('source-language');
const targetLanguage = element<HTMLSelectElement>('target-language');
const method = element<HTMLSelectElement>('translation-method');
const aiMethod = method.querySelector<HTMLOptionElement>('option[value="ai"]')!;
const aiPaidNote = element<HTMLElement>('ai-paid-note');
const floating = element<HTMLInputElement>('floating-action');
const darkMode = element<HTMLInputElement>('dark-mode');
const themeMode = element<HTMLElement>('theme-mode');
const uiLanguage = element<HTMLSelectElement>('ui-language');
const status = element<HTMLElement>('status');
let statusTimer: number | null = null;
let signedIn = false;

async function request<K extends keyof ResponseMap>(
  value: Extract<ExtensionRequest, { type: K }>
): Promise<ResponseMap[K]> {
  const response = await sendRequest(value);
  if (!response.ok) throw response.error;
  return response.data;
}

function message(error: unknown): string {
  const code = typeof error === 'object' && error !== null ? (error as ClientError).code : '';
  if (code === 'OFFLINE') return t('errors.offline');
  if (code === 'AUTHENTICATION_REQUIRED' || code === 'UNAUTHORIZED') return t('errors.auth');
  if (code === 'VALIDATION_ERROR') return t('errors.validation');
  return t('errors.save');
}

function notify(text: string, error = false): void {
  if (statusTimer !== null) window.clearTimeout(statusTimer);
  status.textContent = text;
  status.classList.toggle('error', error);
  status.classList.add('visible');
  statusTimer = window.setTimeout(() => status.classList.remove('visible'), 3500);
}

function validLanguage(value: string): string | null {
  try { return Intl.getCanonicalLocales(value.trim())[0] ?? null; } catch { return null; }
}

function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = theme;
  darkMode.checked = theme === 'dark';
  themeMode.textContent = t(theme === 'dark' ? 'options.darkMode' : 'options.brightMode');
}

async function initialize(): Promise<void> {
  try {
    uiLanguage.value = await getUiLocalePreference();
    const data = await request({ type: 'GET_BOOTSTRAP' });
    signedIn = Boolean(data.session);
    floating.checked = data.settings.floatingAction;
    applyTheme(data.settings.theme);
    sourceLanguage.value = data.profile?.defaultSourceLanguage
      ?? data.settings.defaultSourceLanguage
      ?? 'en';
    targetLanguage.value = data.profile?.defaultTranslationLanguage
      ?? data.settings.defaultTranslationLanguage
      ?? validLanguage(chrome.i18n.getUILanguage())?.split('-')[0]
      ?? 'en';
    method.value = data.profile?.translationMethodPreference ?? 'auto';
    const paid = data.billing?.tier === 'paid' && data.billing.access;
    aiMethod.disabled = !paid;
    aiPaidNote.hidden = paid;
    if (!paid && method.value === 'ai') method.value = 'dictionary';
    if (!data.session) {
      element<HTMLElement>('signed-out-notice').hidden = false;
      method.disabled = true;
      return;
    }
  } catch (error) {
    notify(message(error), true);
  }
}

profileForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const source = validLanguage(sourceLanguage.value);
  const language = validLanguage(targetLanguage.value);
  if (!source || !language || source === language) { notify(t('options.invalidLanguage'), true); return; }
  const button = element<HTMLButtonElement>('save-profile');
  button.disabled = true;
  void (async () => {
    await request({
      type: 'UPDATE_SETTINGS',
      settings: {
        onboardingComplete: true,
        defaultSourceLanguage: source,
        defaultTranslationLanguage: language,
        languagePreferencesNeedSync: true
      }
    });
    if (signedIn) {
      await request({
        type: 'PATCH_PROFILE',
        patch: {
          defaultSourceLanguage: source,
          defaultTranslationLanguage: language,
          translationMethodPreference: method.value as TranslationMethod
        }
      });
      await request({ type: 'UPDATE_SETTINGS', settings: { languagePreferencesNeedSync: false } });
    }
    document.body.classList.remove('onboarding');
    element<HTMLElement>('onboarding-notice').hidden = true;
  })().then(() => notify(signedIn ? t('options.saved') : t('options.savedLocally')))
    .catch((error: unknown) => notify(message(error), true))
    .finally(() => { button.disabled = false; });
});

populateLanguageSelect(sourceLanguage);
populateLanguageSelect(targetLanguage);

if (new URLSearchParams(window.location.search).get('onboarding') === '1') {
  document.body.classList.add('onboarding');
  element<HTMLElement>('onboarding-notice').hidden = false;
}

floating.addEventListener('change', () => {
  const desired = floating.checked;
  floating.disabled = true;
  void (async () => {
    await request({ type: 'UPDATE_SETTINGS', settings: { floatingAction: desired } });
    notify(desired ? t('options.enabled') : t('options.disabled'));
  })().catch((error: unknown) => { floating.checked = !desired; notify(message(error), true); })
    .finally(() => { floating.disabled = false; });
});

darkMode.addEventListener('change', () => {
  const theme = darkMode.checked ? 'dark' : 'light';
  applyTheme(theme);
  darkMode.disabled = true;
  void request({ type: 'UPDATE_SETTINGS', settings: { theme } })
    .then(() => notify(t(theme === 'dark' ? 'options.darkModeEnabled' : 'options.brightModeEnabled')))
    .catch((error: unknown) => {
      applyTheme(theme === 'dark' ? 'light' : 'dark');
      notify(message(error), true);
    })
    .finally(() => { darkMode.disabled = false; });
});

uiLanguage.addEventListener('change', () => {
  uiLanguage.disabled = true;
  void setUiLocalePreference(uiLanguage.value as UiLocalePreference)
    .then(() => window.location.reload())
    .catch((error: unknown) => notify(message(error), true))
    .finally(() => { uiLanguage.disabled = false; });
});

void initialize();
