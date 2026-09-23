import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));

function leafKeys(value, prefix = '') {
  if (!value || typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key));
}

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.default_locale, 'en');
assert.match(manifest.name, /^__MSG_/u);
const [uiEn, uiHe, chromeEn, chromeHe] = await Promise.all([
  readFile(path.join(root, 'src/locales/en.json'), 'utf8').then(JSON.parse),
  readFile(path.join(root, 'src/locales/he.json'), 'utf8').then(JSON.parse),
  readFile(path.join(dist, '_locales/en/messages.json'), 'utf8').then(JSON.parse),
  readFile(path.join(dist, '_locales/he/messages.json'), 'utf8').then(JSON.parse)
]);
assert.deepEqual(leafKeys(uiEn).sort(), leafKeys(uiHe).sort());
assert.deepEqual(Object.keys(chromeEn).sort(), Object.keys(chromeHe).sort());
assert.deepEqual(manifest.permissions.sort(), ['activeTab', 'contextMenus', 'identity', 'scripting', 'storage'].sort());
assert.equal(manifest.host_permissions.includes('<all_urls>'), false);
assert.equal(manifest.optional_host_permissions, undefined);
assert.ok(manifest.host_permissions.includes('http://*/*'));
assert.ok(manifest.host_permissions.includes('https://*/*'));
assert.ok(manifest.host_permissions.every((entry) => /^https?:\/\/(?:\*|[^*]+)\/\*$/u.test(entry)));
assert.equal(manifest.content_scripts, undefined);
assert.equal(manifest.externally_connectable, undefined);
assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self'; object-src 'self'");

const files = await readdir(dist, { recursive: true });
const sourceFiles = files.filter((entry) => /\.(?:js|html|json)$/u.test(entry));
const combined = (await Promise.all(sourceFiles.map((entry) => readFile(path.join(dist, entry), 'utf8')))).join('\n');
for (const forbidden of [
  'api.anthropic.com',
  'translation.googleapis.com',
  'translate.googleapis.com',
  'ANTHROPIC_API_KEY',
  'GOOGLE_TRANSLATE_API_KEY',
  'sk-ant-'
]) assert.equal(combined.includes(forbidden), false, `Forbidden client-side provider reference: ${forbidden}`);
assert.equal((await readFile(path.join(dist, 'content.js'), 'utf8')).includes('chrome.storage'), false);
for (const html of ['popup.html', 'options.html']) {
  const value = await readFile(path.join(dist, html), 'utf8');
  assert.equal(/<script(?![^>]*\bsrc=)[^>]*>/iu.test(value), false, `${html} contains inline script`);
}
for (const icon of ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png']) {
  assert.ok((await stat(path.join(dist, 'icons', icon))).size > 100, `${icon} is missing or empty`);
}
console.log('Verified MV3 package security, permissions, CSP, assets and secret-free provider boundary.');
