import assert from 'node:assert/strict';
import test from 'node:test';
import { assertWebStoreManifest } from '../scripts/webstore-manifest.mjs';

test('accepts a Web Store manifest without the local identity key', () => {
  assert.doesNotThrow(() => assertWebStoreManifest({ manifest_version: 3, version: '1.4.4' }, '1.4.4'));
});

test('rejects a Web Store manifest containing the local identity key', () => {
  assert.throws(
    () => assertWebStoreManifest({ manifest_version: 3, version: '1.4.4', key: 'local-public-key' }, '1.4.4'),
    /must not contain manifest\.key/u
  );
});

test('rejects an archive built for a different version', () => {
  assert.throws(
    () => assertWebStoreManifest({ manifest_version: 3, version: '1.4.3' }, '1.4.4'),
    /version must be 1\.4\.4/u
  );
});
