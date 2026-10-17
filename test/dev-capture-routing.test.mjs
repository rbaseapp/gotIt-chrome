import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { buildSettings } from '../scripts/build-settings.mjs';

test('Arabic capture uses the DEV login token for both preview and save', async () => {
  const settings = buildSettings({ BUILD_TARGET: 'dev' });
  const result = await build({
    stdin: {
      contents: "export { signInWithEmail } from './src/background/auth'; export { previewCapture, saveCapture } from './src/background/api';",
      resolveDir: fileURLToPath(new URL('..', import.meta.url))
    },
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'captureClient',
    platform: 'browser',
    define: {
      __CORE_API_BASE__: JSON.stringify(settings.coreApiBase),
      __GOTIT_API_BASE__: JSON.stringify(settings.gotitApiBase)
    }
  });
  const stored = {};
  const storage = {
    get: async (key) => ({ [key]: stored[key] }),
    set: async (value) => Object.assign(stored, value)
  };
  const requests = [];
  const capture = { learningItemId: 'arabic-dev-item', outcome: 'created' };
  const context = {
    chrome: { storage: { local: storage, session: storage } },
    crypto: webcrypto, AbortController, setTimeout, clearTimeout,
    fetch: async (url, init) => {
      requests.push({ url, init });
      const payload = url.endsWith('/auth/login')
        ? { user: { id: 'dev-user', email: 'learner@example.com' }, accessToken: 'dev-access', refreshToken: 'dev-refresh', expiresIn: 900 }
        : url.endsWith('/preview')
          ? { preview: { sourceLanguageCode: 'ar', translationLanguageCode: 'he' } }
          : { capture };
      return new Response(JSON.stringify(payload));
    }
  };
  runInNewContext(result.outputFiles[0].text, context);
  await context.captureClient.signInWithEmail('login', 'learner@example.com', 'test-password');
  await context.captureClient.previewCapture({ selectedText: 'باب' });
  const body = { item: { sourceText: 'باب', sourceLanguageCode: 'ar', translationLanguageCode: 'he' } };
  assert.deepEqual(await context.captureClient.saveCapture(body, 'capture-event'), capture);
  assert.deepEqual(requests.map(({ url }) => url), [
    'https://rbase-dev-core-platforms.onrender.com/api/v1/auth/login',
    'https://gotit-dev-backend.onrender.com/api/v1/captures/preview',
    'https://gotit-dev-backend.onrender.com/api/v1/captures'
  ]);
  for (const { init } of requests.slice(1)) assert.equal(init.headers.Authorization, 'Bearer dev-access');
  assert.equal(requests[2].init.headers['Idempotency-Key'], 'capture-event');
  assert.deepEqual(JSON.parse(requests[2].init.body), body);
});
