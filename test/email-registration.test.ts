import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { signInWithEmail, RequestError } from '../src/background/auth';

test('legacy registration messages cannot treat a pending email challenge as a session', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not send credentials'); });
  await assert.rejects(signInWithEmail('register', 'owner@example.com', 'long-password-123'),
    (error: unknown) => error instanceof RequestError && error.code === 'EMAIL_VERIFICATION_REQUIRED');
  assert.equal(fetch.mock.callCount(), 0);
});

test('popup exposes website verification and recovery without passing email or passwords in URLs', () => {
  const html = readFileSync(new URL('../src/popup/index.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../src/popup/index.ts', import.meta.url), 'utf8');
  assert.match(html, /href="https:\/\/gotit\.rbaseapp\.com\/\?auth=reset"/);
  assert.match(script, /chrome\.tabs\.create\(\{ url: 'https:\/\/gotit\.rbaseapp\.com\/\?auth=register' \}\)/);
});
