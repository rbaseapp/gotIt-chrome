import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { EXTENSION_PUBLIC_KEY } from './extension-identity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const packageMetadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const mode = process.env.BUILD_MODE === 'development' ? 'development' : 'production';
const coreApiBase = process.env.CORE_API_BASE ||
  (mode === 'development' ? 'http://localhost:8080/api/v1' : 'https://rbase-core-api.onrender.com/api/v1');
const gotitApiBase = process.env.GOTIT_API_BASE ||
  (mode === 'development' ? 'http://localhost:3001/api/v1' : 'https://gotit-backend.onrender.com/api/v1');
const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID ||
  '336996428812-8vm54slmvpi95p9bf0c3a4bq3bemsmm0.apps.googleusercontent.com';

if (!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/u.test(googleClientId)) {
  throw new Error('GOOGLE_OAUTH_CLIENT_ID must be a valid public Google OAuth client ID');
}

function originPattern(value) {
  const url = new URL(value);
  return `${url.origin}/*`;
}

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'icons'), { recursive: true });
await mkdir(path.join(dist, 'assets'), { recursive: true });

await build({
  entryPoints: {
    background: path.join(root, 'src/background/index.ts'),
    content: path.join(root, 'src/content/index.ts'),
    popup: path.join(root, 'src/popup/index.ts'),
    options: path.join(root, 'src/options/index.ts')
  },
  bundle: true,
  outdir: dist,
  format: 'esm',
  platform: 'browser',
  target: 'chrome127',
  sourcemap: mode === 'development',
  minify: mode === 'production',
  legalComments: 'none',
  define: {
    __CORE_API_BASE__: JSON.stringify(coreApiBase.replace(/\/$/u, '')),
    __GOTIT_API_BASE__: JSON.stringify(gotitApiBase.replace(/\/$/u, '')),
    __BUILD_MODE__: JSON.stringify(mode)
  }
});

await Promise.all([
  cp(path.join(root, 'src/popup/index.html'), path.join(dist, 'popup.html')),
  cp(path.join(root, 'src/popup/styles.css'), path.join(dist, 'popup.css')),
  cp(path.join(root, 'src/options/index.html'), path.join(dist, 'options.html')),
  cp(path.join(root, 'src/options/styles.css'), path.join(dist, 'options.css')),
  cp(path.join(root, 'src/assets/gotit-icon.svg'), path.join(dist, 'assets/gotit-icon.svg')),
  cp(path.join(root, 'src/assets/gotit-logo.svg'), path.join(dist, 'assets/gotit-logo.svg')),
  cp(path.join(root, 'src/_locales'), path.join(dist, '_locales'), { recursive: true })
]);

const manifest = {
  manifest_version: 3,
  key: EXTENSION_PUBLIC_KEY,
  default_locale: 'en',
  name: mode === 'development' ? '__MSG_extensionNameDev__' : '__MSG_extensionName__',
  short_name: 'GotIt',
  version: packageMetadata.version,
  description: '__MSG_extensionDescription__',
  minimum_chrome_version: '127',
  icons: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
  action: {
    default_popup: 'popup.html',
    default_title: '__MSG_actionTitle__',
    default_icon: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png' }
  },
  options_page: 'options.html',
  background: { service_worker: 'background.js', type: 'module' },
  permissions: ['storage', 'contextMenus', 'activeTab', 'scripting', 'identity'],
  host_permissions: [
    'http://*/*',
    'https://*/*',
    ...new Set([originPattern(coreApiBase), originPattern(gotitApiBase)])
  ],
  oauth2: {
    client_id: googleClientId,
    scopes: ['openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile']
  },
  web_accessible_resources: [{
    resources: ['assets/gotit-icon.svg', 'assets/gotit-logo.svg'],
    matches: ['http://*/*', 'https://*/*']
  }],
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" }
};
await writeFile(path.join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const logo = await readFile(path.join(root, 'src/assets/gotit-icon.svg'));
await Promise.all([16, 32, 48, 128].map((size) =>
  sharp(logo).resize(size, size).png().toFile(path.join(dist, 'icons', `icon${size}.png`))
));

console.log(`Built GotIt extension (${mode}) in ${dist}`);
console.log(`Core: ${coreApiBase}`);
console.log(`GotIt: ${gotitApiBase}`);
