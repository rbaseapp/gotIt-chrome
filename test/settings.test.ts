import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSettings, resolveSettings } from '../src/background/settings';

test('floating capture is enabled by default without hiding the saved word automatically', () => {
  assert.deepEqual(defaultSettings, {
    floatingAction: true,
    autoCloseAfterSave: false,
    theme: 'light',
    onboardingComplete: false,
    defaultSourceLanguage: null,
    defaultTranslationLanguage: null,
    languagePreferencesNeedSync: false
  });
  assert.deepEqual(resolveSettings(undefined), defaultSettings);
  assert.deepEqual(resolveSettings({}), defaultSettings);
  assert.deepEqual(resolveSettings({ floatingAction: false, autoCloseAfterSave: false }), {
    floatingAction: false,
    autoCloseAfterSave: false,
    theme: 'light',
    onboardingComplete: false,
    defaultSourceLanguage: null,
    defaultTranslationLanguage: null,
    languagePreferencesNeedSync: false
  });
});

test('resolves first-run language preferences while rejecting invalid language tags', () => {
  assert.deepEqual(resolveSettings({
    onboardingComplete: true,
    defaultSourceLanguage: 'en',
    defaultTranslationLanguage: 'he',
    languagePreferencesNeedSync: true
  }), {
    floatingAction: true,
    autoCloseAfterSave: false,
    theme: 'light',
    onboardingComplete: true,
    defaultSourceLanguage: 'en',
    defaultTranslationLanguage: 'he',
    languagePreferencesNeedSync: true
  });
  assert.equal(resolveSettings({ defaultSourceLanguage: 'not_a_language' }).defaultSourceLanguage, null);
});

test('persists only supported extension themes', () => {
  assert.equal(resolveSettings({ theme: 'dark' }).theme, 'dark');
  assert.equal(resolveSettings({ theme: 'sepia' as never }).theme, 'light');
});
