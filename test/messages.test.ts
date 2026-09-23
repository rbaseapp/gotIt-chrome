import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRequest } from '../src/shared/messages';

test('accepts bounded extension messages and rejects malformed privileged calls', () => {
  assert.deepEqual(parseRequest({ type: 'GET_BOOTSTRAP' }), { type: 'GET_BOOTSTRAP' });
  assert.equal(parseRequest({ type: 'AUTH_EMAIL', mode: 'login', email: 3, password: 'x' }), null);
  assert.equal(parseRequest({ type: 'SAVE_CAPTURE', eventId: 'fake', input: {} }), null);
  assert.equal(parseRequest({ type: 'GET_BOOTSTRAP', injected: true }), null);
  assert.equal(parseRequest({ type: 'UNKNOWN' }), null);
});

test('validates capture context shape crossing the content-script boundary', () => {
  const context = {
    selectedText: 'word', sentenceText: 'A word.', paragraphText: null,
    pageTitle: 'Page', pageUrl: 'https://example.test/', capturedAt: new Date().toISOString()
  };
  assert.deepEqual(parseRequest({ type: 'CONTENT_CAPTURE', context }), { type: 'CONTENT_CAPTURE', context });
  assert.equal(parseRequest({ type: 'CONTENT_CAPTURE', context: { ...context, pageUrl: 5 } }), null);
  assert.deepEqual(parseRequest({ type: 'INLINE_PREVIEW', context }), { type: 'INLINE_PREVIEW', context });
  assert.deepEqual(
    parseRequest({ type: 'INLINE_PREVIEW', context, translationMethod: 'ai' }),
    { type: 'INLINE_PREVIEW', context, translationMethod: 'ai' }
  );
  assert.equal(parseRequest({ type: 'INLINE_PREVIEW', context, translationMethod: 'unsafe' }), null);
  assert.deepEqual(
    parseRequest({ type: 'INLINE_SAVE', inlineCaptureId: '123e4567-e89b-42d3-a456-426614174000', candidateIndex: 2 }),
    { type: 'INLINE_SAVE', inlineCaptureId: '123e4567-e89b-42d3-a456-426614174000', candidateIndex: 2 }
  );
  assert.equal(parseRequest({ type: 'INLINE_SAVE', inlineCaptureId: 'not-a-uuid', candidateIndex: 0 }), null);
  assert.equal(parseRequest({ type: 'INLINE_SAVE', inlineCaptureId: '123e4567-e89b-42d3-a456-426614174000', candidateIndex: 5 }), null);
});

test('keeps an explicit Google method on inline translation requests', () => {
  const context = {
    selectedText: 'hello',
    sentenceText: 'hello world',
    paragraphText: null,
    pageTitle: 'Example',
    pageUrl: 'https://example.com/',
    capturedAt: '2026-09-18T10:00:00.000Z'
  };

  assert.deepEqual(parseRequest({
    type: 'INLINE_PREVIEW',
    context,
    translationMethod: 'dictionary'
  }), {
    type: 'INLINE_PREVIEW',
    context,
    translationMethod: 'dictionary'
  });
});

test('accepts an automatic or explicit source-language profile preference', () => {
  assert.deepEqual(
    parseRequest({
      type: 'PATCH_PROFILE',
      patch: { defaultSourceLanguage: null, defaultTranslationLanguage: 'he' }
    }),
    {
      type: 'PATCH_PROFILE',
      patch: { defaultSourceLanguage: null, defaultTranslationLanguage: 'he' }
    }
  );
  assert.deepEqual(
    parseRequest({ type: 'PATCH_PROFILE', patch: { defaultSourceLanguage: 'en' } }),
    { type: 'PATCH_PROFILE', patch: { defaultSourceLanguage: 'en' } }
  );
});

test('accepts bounded first-run language settings', () => {
  const request = {
    type: 'UPDATE_SETTINGS',
    settings: {
      onboardingComplete: true,
      defaultSourceLanguage: 'en',
      defaultTranslationLanguage: 'he',
      languagePreferencesNeedSync: true
    }
  } as const;
  assert.deepEqual(parseRequest(request), request);
  assert.equal(parseRequest({
    type: 'UPDATE_SETTINGS',
    settings: { defaultSourceLanguage: 7 }
  }), null);
});

test('accepts only bright and dark theme settings', () => {
  assert.deepEqual(
    parseRequest({ type: 'UPDATE_SETTINGS', settings: { theme: 'dark' } }),
    { type: 'UPDATE_SETTINGS', settings: { theme: 'dark' } }
  );
  assert.equal(parseRequest({ type: 'UPDATE_SETTINGS', settings: { theme: 'sepia' } }), null);
});

test('accepts only a strictly shaped saved-item update', () => {
  const request = {
    type: 'UPDATE_SAVED_ITEM',
    learningItemId: '123e4567-e89b-42d3-a456-426614174000',
    patch: {
      sourceText: 'hello',
      sourceLanguageCode: 'en',
      translationLanguageCode: 'he',
      itemType: 'word',
      partOfSpeech: 'noun',
      translation: { text: 'שלום', variants: [] }
    }
  } as const;

  assert.deepEqual(parseRequest(request), request);
  assert.equal(parseRequest({ ...request, learningItemId: 'not-a-uuid' }), null);
  assert.equal(parseRequest({ ...request, patch: { ...request.patch, injected: true } }), null);
});

test('accepts only a strictly shaped saved-item removal', () => {
  const request = {
    type: 'REMOVE_SAVED_ITEM',
    learningItemId: '123e4567-e89b-42d3-a456-426614174000'
  } as const;

  assert.deepEqual(parseRequest(request), request);
  assert.equal(parseRequest({ ...request, learningItemId: 'not-a-uuid' }), null);
  assert.equal(parseRequest({ ...request, injected: true }), null);
});
