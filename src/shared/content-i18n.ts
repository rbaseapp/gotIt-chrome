import ar from '../locales/ar.json';
import de from '../locales/de.json';
import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import he from '../locales/he.json';
import ru from '../locales/ru.json';
import zh from '../locales/zh.json';
import { normalizeUiLocale, type UiLocale } from './ui-locale';

type Variables = Record<string, string | number>;
const catalogs: Record<UiLocale, unknown> = { en, he, zh, ar, ru, de, fr, es };

function browserLocale(): UiLocale {
  try {
    return normalizeUiLocale(chrome.i18n.getUILanguage()) ?? 'en';
  } catch {
    return 'en';
  }
}

export let contentLocale = browserLocale();
export let contentDirection = contentLocale === 'he' || contentLocale === 'ar' ? 'rtl' : 'ltr';
let catalog: unknown = catalogs[contentLocale];

export function setContentLocale(locale: UiLocale): void {
  contentLocale = locale;
  contentDirection = locale === 'he' || locale === 'ar' ? 'rtl' : 'ltr';
  catalog = catalogs[locale];
}

export function contentT(key: string, variables: Variables = {}): string {
  const value = key.split('.').reduce<unknown>((current, part) =>
    current && typeof current === 'object'
      ? (current as Record<string, unknown>)[part]
      : undefined, catalog);
  const template = typeof value === 'string' ? value : key;
  return template.replace(/\{\{(\w+)\}\}/gu, (_match, name: string) =>
    String(variables[name] ?? `{{${name}}}`));
}
