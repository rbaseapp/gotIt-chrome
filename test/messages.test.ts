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
    parseRequest({ type: 'INLINE_DETAILS', context, sourceLanguageCode: 'en', translationLanguageCode: 'he' }),
    { type: 'INLINE_DETAILS', context, sourceLanguageCode: 'en', translationLanguageCode: 'he' }
  );
  assert.equal(parseRequest({ type: 'INLINE_DETAILS', context, sourceLanguageCode: 3 }), null);
  assert.deepEqual(
    parseRequest({ type: 'INLINE_SAVE', inlineCaptureId: '123e4567-e89b-42d3-a456-426614174000' }),
    { type: 'INLINE_SAVE', inlineCaptureId: '123e4567-e89b-42d3-a456-426614174000' }
  );
  assert.equal(parseRequest({ type: 'INLINE_SAVE', inlineCaptureId: 'not-a-uuid' }), null);
});
