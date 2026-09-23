import type { ExtensionSettings } from '../shared/types';

const SETTINGS_KEY = 'gotit.settings.v1';
const CONTENT_SCRIPT_ID = 'gotit-floating-action';

export const defaultSettings: ExtensionSettings = {
  floatingAction: true,
  autoCloseAfterSave: false,
  theme: 'light',
  onboardingComplete: false,
  defaultSourceLanguage: null,
  defaultTranslationLanguage: null,
  languagePreferencesNeedSync: false
};

function optionalLanguage(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return Intl.getCanonicalLocales(value.trim())[0] ?? null;
  } catch {
    return null;
  }
}

export function resolveSettings(value: unknown): ExtensionSettings {
  const stored = typeof value === 'object' && value !== null
    ? value as Partial<ExtensionSettings>
    : undefined;
  return {
    floatingAction: typeof stored?.floatingAction === 'boolean'
      ? stored.floatingAction
      : defaultSettings.floatingAction,
    autoCloseAfterSave: typeof stored?.autoCloseAfterSave === 'boolean'
      ? stored.autoCloseAfterSave
      : defaultSettings.autoCloseAfterSave,
    theme: stored?.theme === 'dark' ? 'dark' : 'light',
    onboardingComplete: typeof stored?.onboardingComplete === 'boolean'
      ? stored.onboardingComplete
      : defaultSettings.onboardingComplete,
    defaultSourceLanguage: optionalLanguage(stored?.defaultSourceLanguage),
    defaultTranslationLanguage: optionalLanguage(stored?.defaultTranslationLanguage),
    languagePreferencesNeedSync: typeof stored?.languagePreferencesNeedSync === 'boolean'
      ? stored.languagePreferencesNeedSync
      : defaultSettings.languagePreferencesNeedSync
  };
}

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return resolveSettings(stored[SETTINGS_KEY]);
}

export async function updateSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const current = await getSettings();
  const next: ExtensionSettings = {
    floatingAction: typeof patch.floatingAction === 'boolean' ? patch.floatingAction : current.floatingAction,
    autoCloseAfterSave: typeof patch.autoCloseAfterSave === 'boolean' ? patch.autoCloseAfterSave : current.autoCloseAfterSave,
    theme: patch.theme === 'light' || patch.theme === 'dark' ? patch.theme : current.theme,
    onboardingComplete: typeof patch.onboardingComplete === 'boolean' ? patch.onboardingComplete : current.onboardingComplete,
    defaultSourceLanguage: patch.defaultSourceLanguage === undefined
      ? current.defaultSourceLanguage
      : optionalLanguage(patch.defaultSourceLanguage),
    defaultTranslationLanguage: patch.defaultTranslationLanguage === undefined
      ? current.defaultTranslationLanguage
      : optionalLanguage(patch.defaultTranslationLanguage),
    languagePreferencesNeedSync: typeof patch.languagePreferencesNeedSync === 'boolean'
      ? patch.languagePreferencesNeedSync
      : current.languagePreferencesNeedSync
  };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  await syncFloatingContentScript(next);
  return next;
}

export async function syncFloatingContentScript(provided?: ExtensionSettings): Promise<void> {
  const settings = provided ?? await getSettings();
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  const hasPermission = await chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] });
  if (settings.floatingAction && hasPermission && registered.length === 0) {
    await chrome.scripting.registerContentScripts([{
      id: CONTENT_SCRIPT_ID,
      js: ['content.js'],
      matches: ['http://*/*', 'https://*/*'],
      runAt: 'document_idle',
      persistAcrossSessions: true
    }]);
  } else if ((!settings.floatingAction || !hasPermission) && registered.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  }
}
