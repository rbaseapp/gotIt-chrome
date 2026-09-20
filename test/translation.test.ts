import assert from 'node:assert/strict';
import test from 'node:test';
import {
  effectiveTranslationMethod,
  INLINE_TRANSLATION_TIMEOUT_MS
} from '../src/shared/translation';

test('Google is the default and AI requires an explicit preference', () => {
  assert.equal(effectiveTranslationMethod(undefined), 'dictionary');
  assert.equal(effectiveTranslationMethod(null), 'dictionary');
  assert.equal(effectiveTranslationMethod('auto'), 'dictionary');
  assert.equal(effectiveTranslationMethod('dictionary'), 'dictionary');
  assert.equal(effectiveTranslationMethod('ai'), 'ai');
});

test('inline translation waits through both background network attempts', () => {
  assert.ok(INLINE_TRANSLATION_TIMEOUT_MS > 60_000);
});
