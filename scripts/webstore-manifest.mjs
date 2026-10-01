export function assertWebStoreManifest(manifest, version) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Web Store archive manifest is invalid');
  }
  if (manifest.manifest_version !== 3) {
    throw new Error('Web Store archive must use Manifest V3');
  }
  if (Object.hasOwn(manifest, 'key')) {
    throw new Error('Web Store archive must not contain manifest.key');
  }
  if (manifest.version !== version) {
    throw new Error(`Web Store archive version must be ${version}`);
  }
}
