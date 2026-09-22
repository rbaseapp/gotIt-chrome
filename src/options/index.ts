import { sendRequest, type ExtensionRequest, type ResponseMap } from '../shared/messages';
import type { ClientError, TranslationMethod } from '../shared/types';
import { populateLanguageSelect } from '../shared/languages';

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing element: ${id}`);
  return result as T;
}

const profileForm = element<HTMLFormElement>('profile-form');
const sourceLanguage = element<HTMLSelectElement>('source-language');
const targetLanguage = element<HTMLSelectElement>('target-language');
const method = element<HTMLSelectElement>('translation-method');
const floating = element<HTMLInputElement>('floating-action');
const status = element<HTMLElement>('status');
let statusTimer: number | null = null;

async function request<K extends keyof ResponseMap>(
  value: Extract<ExtensionRequest, { type: K }>
): Promise<ResponseMap[K]> {
  const response = await sendRequest(value);
  if (!response.ok) throw response.error;
  return response.data;
}

function message(error: unknown): string {
  const code = typeof error === 'object' && error !== null ? (error as ClientError).code : '';
  if (code === 'OFFLINE') return 'אין חיבור לרשת.';
  if (code === 'AUTHENTICATION_REQUIRED' || code === 'UNAUTHORIZED') return 'יש להתחבר מחדש דרך חלונית התוסף.';
  if (code === 'VALIDATION_ERROR') return 'השפה שהוזנה אינה תקינה.';
  return 'לא הצלחנו לשמור את ההגדרה.';
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

async function initialize(): Promise<void> {
  try {
    const data = await request({ type: 'GET_BOOTSTRAP' });
    floating.checked = data.settings.floatingAction;
    if (!data.session) {
      element<HTMLElement>('signed-out-notice').hidden = false;
      profileForm.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input,select,button').forEach((control) => { control.disabled = true; });
      return;
    }
    sourceLanguage.value = data.profile?.defaultSourceLanguage ?? '';
    targetLanguage.value = data.profile?.defaultTranslationLanguage
      ?? validLanguage(chrome.i18n.getUILanguage())?.split('-')[0]
      ?? 'en';
    method.value = data.profile?.translationMethodPreference ?? 'auto';
  } catch (error) {
    notify(message(error), true);
  }
}

profileForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const source = sourceLanguage.value ? validLanguage(sourceLanguage.value) : null;
  const language = validLanguage(targetLanguage.value);
  if (!language) { notify('יש להזין קוד שפה תקין, למשל he או en.', true); return; }
  const button = element<HTMLButtonElement>('save-profile');
  button.disabled = true;
  void request({
    type: 'PATCH_PROFILE',
    patch: {
      defaultSourceLanguage: source,
      defaultTranslationLanguage: language,
      translationMethodPreference: method.value as TranslationMethod
    }
  }).then(() => notify('העדפות התרגום נשמרו.'))
    .catch((error: unknown) => notify(message(error), true))
    .finally(() => { button.disabled = false; });
});

populateLanguageSelect(sourceLanguage, true);
populateLanguageSelect(targetLanguage);

floating.addEventListener('change', () => {
  const desired = floating.checked;
  floating.disabled = true;
  void (async () => {
    await request({ type: 'UPDATE_SETTINGS', settings: { floatingAction: desired } });
    notify(desired ? 'הכפתור הצף והתרגום בלחיצה כפולה הופעלו.' : 'הכפתור הצף והתרגום בלחיצה כפולה כובו.');
  })().catch((error: unknown) => { floating.checked = !desired; notify(message(error), true); })
    .finally(() => { floating.disabled = false; });
});

void initialize();
