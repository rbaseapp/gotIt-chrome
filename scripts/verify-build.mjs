import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTENSION_ID, EXTENSION_PUBLIC_KEY } from './extension-identity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));

function leafKeys(value, prefix = '') {
  if (!value || typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key));
}

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.key, EXTENSION_PUBLIC_KEY);
assert.equal(manifest.default_locale, 'en');
assert.match(manifest.name, /^__MSG_/u);
const localePairs = [
  ['en', 'en'],
  ['he', 'he'],
  ['zh', 'zh_CN'],
  ['ar', 'ar'],
  ['ru', 'ru'],
  ['de', 'de'],
  ['fr', 'fr'],
  ['es', 'es']
];
const uiCatalogs = await Promise.all(localePairs.map(([ui]) =>
  readFile(path.join(root, `src/locales/${ui}.json`), 'utf8').then(JSON.parse)));
const chromeCatalogs = await Promise.all(localePairs.map(([, chrome]) =>
  readFile(path.join(dist, `_locales/${chrome}/messages.json`), 'utf8').then(JSON.parse)));
for (const catalog of uiCatalogs.slice(1)) {
  assert.deepEqual(leafKeys(uiCatalogs[0]).sort(), leafKeys(catalog).sort());
}
for (const catalog of chromeCatalogs.slice(1)) {
  assert.deepEqual(Object.keys(chromeCatalogs[0]).sort(), Object.keys(catalog).sort());
}
const publicKeyDer = Buffer.from(manifest.key, 'base64');
const derivedExtensionId = [...createHash('sha256').update(publicKeyDer).digest().subarray(0, 16)]
  .map((byte) => `${String.fromCharCode(97 + (byte >> 4))}${String.fromCharCode(97 + (byte & 0x0f))}`)
  .join('');
assert.equal(derivedExtensionId, EXTENSION_ID);
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
for (const asset of ['gotit-icon.svg', 'gotit-logo.svg']) {
  assert.ok((await stat(path.join(dist, 'assets', asset))).size > 100, `${asset} is missing or empty`);
}
assert.deepEqual(manifest.web_accessible_resources, [{
  resources: ['assets/gotit-icon.svg', 'assets/gotit-logo.svg'],
  matches: ['http://*/*', 'https://*/*']
}]);
console.log(`Verified MV3 package identity (${EXTENSION_ID}), security, permissions, CSP, assets and secret-free provider boundary.`);
