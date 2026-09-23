import i18next from 'i18next';
import en from '../locales/en.json';
import he from '../locales/he.json';
import {
  getResolvedUiLocale,
  getUiLocalePreference,
  setUiLocalePreference as persistUiLocalePreference,
  type UiLocale,
  type UiLocalePreference
} from './ui-locale';

export { getUiLocalePreference, type UiLocalePreference } from './ui-locale';

export async function initializeI18n(): Promise<UiLocale> {
  const locale = await getResolvedUiLocale();
  if (!i18next.isInitialized) {
    await i18next.init({
      resources: {
        en: { translation: en },
        he: { translation: he }
      },
      lng: locale,
      fallbackLng: 'en',
      supportedLngs: ['en', 'he'],
      interpolation: { escapeValue: false }
    });
  } else {
    await i18next.changeLanguage(locale);
  }
  applyDocumentLocale(locale);
  translateDocument();
  return locale;
}

export async function setUiLocalePreference(preference: UiLocalePreference): Promise<void> {
  await persistUiLocalePreference(preference);
  await initializeI18n();
}

export function applyDocumentLocale(locale: UiLocale): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr';
}

export function translateDocument(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    if (key) element.textContent = i18next.t(key);
  });
  for (const [attribute, selector] of [
    ['aria-label', 'data-i18n-aria-label'],
    ['title', 'data-i18n-title'],
    ['placeholder', 'data-i18n-placeholder']
  ] as const) {
    root.querySelectorAll<HTMLElement>(`[${selector}]`).forEach((element) => {
      const key = element.getAttribute(selector);
      if (key) element.setAttribute(attribute, i18next.t(key));
    });
  }
}

export const t = i18next.t.bind(i18next);
