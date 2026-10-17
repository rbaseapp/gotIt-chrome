import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSettings } from '../scripts/build-settings.mjs';

test('hosted DEV binds authentication, capture and website to the same environment', () => {
  const settings = buildSettings({ BUILD_TARGET: 'dev' });
  assert.equal(settings.coreApiBase, 'https://rbase-dev-core-platforms.onrender.com/api/v1');
  assert.equal(settings.gotitApiBase, 'https://gotit-dev-backend.onrender.com/api/v1');
  assert.equal(settings.webAppBase, 'https://gotit-dev.rbaseapp.com');
  assert.equal(settings.mode, 'development');
});

test('hosted DEV rejects stale production overrides and cannot become a Store package', () => {
  for (const override of [
    { CORE_API_BASE: 'https://rbase-core-api.onrender.com/api/v1' },
    { GOTIT_API_BASE: 'https://gotit-backend.onrender.com/api/v1' },
    { WEB_APP_BASE: 'https://gotit.rbaseapp.com' },
    { WEBSTORE_PACKAGE: '1' }
  ]) assert.throws(() => buildSettings({ BUILD_TARGET: 'dev', ...override }));
});

test('local development keeps local APIs and website together', () => {
  const settings = buildSettings({ BUILD_MODE: 'development' });
  assert.equal(settings.coreApiBase, 'http://localhost:8080/api/v1');
  assert.equal(settings.gotitApiBase, 'http://localhost:3001/api/v1');
  assert.equal(settings.webAppBase, 'http://localhost:5173');
});

test('public build URLs reject credentials and executable protocols', () => {
  for (const value of ['javascript:alert(1)', 'https://user:secret@example.com', 'https://example.com?token=secret']) {
    assert.throws(() => buildSettings({ WEB_APP_BASE: value }));
  }
  assert.throws(() => buildSettings({ BUILD_TARGET: 'unknown' }));
});
