import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSettings, resolveSettings } from '../src/background/settings';

test('selection action and double-click translation are independently enabled by default', () => {
  assert.deepEqual(defaultSettings, {
    selectionAction: true,
    doubleClickTranslation: true,
    autoCloseOnOutsideClick: false,
    popupSize: 'medium',
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
    selectionAction: false,
    doubleClickTranslation: false,
    autoCloseOnOutsideClick: false,
    popupSize: 'medium',
    autoCloseAfterSave: false,
    theme: 'light',
    onboardingComplete: false,
    defaultSourceLanguage: null,
    defaultTranslationLanguage: null,
    languagePreferencesNeedSync: false
  });
});

test('migrates the legacy combined behavior setting and preserves independent choices', () => {
  assert.deepEqual(
    resolveSettings({ floatingAction: false, selectionAction: true }),
    {
      ...defaultSettings,
      selectionAction: true,
      doubleClickTranslation: false
    }
  );
  assert.deepEqual(
    resolveSettings({ selectionAction: false, doubleClickTranslation: true }),
    {
      ...defaultSettings,
      selectionAction: false,
      doubleClickTranslation: true
    }
  );
});

test('resolves first-run language preferences while rejecting invalid language tags', () => {
  assert.deepEqual(resolveSettings({
    onboardingComplete: true,
    defaultSourceLanguage: 'en',
    defaultTranslationLanguage: 'he',
    languagePreferencesNeedSync: true
  }), {
    selectionAction: true,
    doubleClickTranslation: true,
    autoCloseOnOutsideClick: false,
    popupSize: 'medium',
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

test('resolves automatic close and one of the three popup sizes', () => {
  assert.equal(resolveSettings({ autoCloseOnOutsideClick: true }).autoCloseOnOutsideClick, true);
  assert.equal(resolveSettings({ popupSize: 'small' }).popupSize, 'small');
  assert.equal(resolveSettings({ popupSize: 'medium' }).popupSize, 'medium');
  assert.equal(resolveSettings({ popupSize: 'large' }).popupSize, 'large');
  assert.equal(resolveSettings({ popupSize: 'huge' as never }).popupSize, 'medium');
});
