import en from '../locales/en.json';
import he from '../locales/he.json';

type Variables = Record<string, string | number>;

function browserLocale(): 'en' | 'he' {
  try {
    return Intl.getCanonicalLocales(chrome.i18n.getUILanguage())[0]?.split('-')[0] === 'he'
      ? 'he'
      : 'en';
  } catch {
    return 'en';
  }
}

export let contentLocale = browserLocale();
export let contentDirection = contentLocale === 'he' ? 'rtl' : 'ltr';
let catalog: unknown = contentLocale === 'he' ? he : en;

export function setContentLocale(locale: 'en' | 'he'): void {
  contentLocale = locale;
  contentDirection = locale === 'he' ? 'rtl' : 'ltr';
  catalog = locale === 'he' ? he : en;
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
