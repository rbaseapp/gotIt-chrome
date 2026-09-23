export const UI_LOCALE_STORAGE_KEY = 'gotit.uiLocale.v1';
export type UiLocale = 'en' | 'he';
export type UiLocalePreference = UiLocale | 'auto';

export function normalizeUiLocale(value: string | null | undefined): UiLocale | null {
  if (!value) return null;
  try {
    const language = Intl.getCanonicalLocales(value)[0]?.split('-')[0];
    return language === 'en' || language === 'he' ? language : null;
  } catch {
    return null;
  }
}

export function browserUiLocale(): UiLocale {
  return normalizeUiLocale(chrome.i18n.getUILanguage()) ?? 'en';
}

export async function getUiLocalePreference(): Promise<UiLocalePreference> {
  const stored = await chrome.storage.sync.get(UI_LOCALE_STORAGE_KEY);
  const value = stored[UI_LOCALE_STORAGE_KEY];
  return normalizeUiLocale(typeof value === 'string' ? value : null) ?? 'auto';
}

export async function getResolvedUiLocale(): Promise<UiLocale> {
  const preference = await getUiLocalePreference();
  return preference === 'auto' ? browserUiLocale() : preference;
}

export async function setUiLocalePreference(preference: UiLocalePreference): Promise<void> {
  if (preference === 'auto') await chrome.storage.sync.remove(UI_LOCALE_STORAGE_KEY);
  else await chrome.storage.sync.set({ [UI_LOCALE_STORAGE_KEY]: preference });
}
