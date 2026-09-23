import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeUiLocale, SUPPORTED_UI_LOCALES } from '../src/shared/ui-locale';

const localeCodes = ['en', 'he', 'zh', 'ar', 'ru', 'de', 'fr', 'es'] as const;

function strings(value: unknown, path: Array<string | number> = [], result = new Map<string, string>()) {
  if (typeof value === 'string') result.set(JSON.stringify(path), value);
  else if (Array.isArray(value)) value.forEach((item, index) => strings(item, [...path, index], result));
  else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => strings(item, [...path, key], result));
  }
  return result;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{[^{}]+\}\}/gu)].map((match) => match[0]).sort();
}

test('normalizes every supported extension UI locale', () => {
  assert.deepEqual(SUPPORTED_UI_LOCALES, localeCodes);
  assert.equal(normalizeUiLocale('zh-CN'), 'zh');
  assert.equal(normalizeUiLocale('ar-IL'), 'ar');
  assert.equal(normalizeUiLocale('ru-RU'), 'ru');
  assert.equal(normalizeUiLocale('de-DE'), 'de');
  assert.equal(normalizeUiLocale('fr-FR'), 'fr');
  assert.equal(normalizeUiLocale('es-MX'), 'es');
  assert.equal(normalizeUiLocale('ja-JP'), null);
});

test('all extension catalogs contain the English keys and placeholders', async () => {
  const catalogs = await Promise.all(localeCodes.map(async (locale) =>
    JSON.parse(await readFile(new URL(`../src/locales/${locale}.json`, import.meta.url), 'utf8')) as unknown));
  const source = strings(catalogs[0]);
  for (const catalog of catalogs.slice(1)) {
    const translated = strings(catalog);
    for (const [path, value] of source) {
      assert.equal(translated.has(path), true, `Missing translation for ${path}`);
      assert.deepEqual(placeholders(translated.get(path) ?? ''), placeholders(value), path);
    }
  }
});
