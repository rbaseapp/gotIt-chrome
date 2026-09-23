import assert from 'node:assert/strict';
import test from 'node:test';
import { LANGUAGE_OPTIONS, languageOptionLabel } from '../src/shared/languages';

test('language labels show an English name and the native name without exposing codes', () => {
  assert.equal(languageOptionLabel('Hebrew', 'עברית'), 'Hebrew — עברית');
  assert.equal(languageOptionLabel('English', 'English'), 'English');

  for (const [code, englishName, nativeName] of LANGUAGE_OPTIONS) {
    const label = languageOptionLabel(englishName, nativeName);
    assert.ok(label.startsWith(englishName));
    assert.ok(label.includes(nativeName));
    assert.notEqual(label, code);
  }
});
