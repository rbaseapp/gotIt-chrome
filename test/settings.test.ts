import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSettings, resolveSettings } from '../src/background/settings';

test('floating capture is enabled by default without hiding the saved word automatically', () => {
  assert.deepEqual(defaultSettings, { floatingAction: true, autoCloseAfterSave: false });
  assert.deepEqual(resolveSettings(undefined), defaultSettings);
  assert.deepEqual(resolveSettings({}), defaultSettings);
  assert.deepEqual(resolveSettings({ floatingAction: false, autoCloseAfterSave: false }), {
    floatingAction: false,
    autoCloseAfterSave: false
  });
});
