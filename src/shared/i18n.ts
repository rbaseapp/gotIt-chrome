import i18next from 'i18next';
import ar from '../locales/ar.json';
import de from '../locales/de.json';
import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import he from '../locales/he.json';
import ru from '../locales/ru.json';
import zh from '../locales/zh.json';
import {
  getResolvedUiLocale,
  getUiLocalePreference,
  setUiLocalePreference as persistUiLocalePreference,
  SUPPORTED_UI_LOCALES,
  type UiLocale,
  type UiLocalePreference
} from './ui-locale';

export { getUiLocalePreference, type UiLocalePreference } from './ui-locale';

export async function initializeI18n(): Promise<UiLocale> {
  const locale = await getResolvedUiLocale();
  if (!i18next.isInitialized) {
    await i18next.init({
      resources: {
        ar: { translation: ar },
        de: { translation: de },
        en: { translation: en },
        es: { translation: es },
        fr: { translation: fr },
        he: { translation: he },
        ru: { translation: ru },
        zh: { translation: zh }
      },
      lng: locale,
      fallbackLng: 'en',
      supportedLngs: [...SUPPORTED_UI_LOCALES],
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
  document.documentElement.dir = locale === 'he' || locale === 'ar' ? 'rtl' : 'ltr';
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
