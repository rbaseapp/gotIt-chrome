import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));

assert.equal(manifest.manifest_version, 3);
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
