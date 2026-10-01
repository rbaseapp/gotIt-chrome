import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertWebStoreManifest } from './webstore-manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactDir = path.join(root, 'artifacts');
const packageMetadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const target = path.join(artifactDir, `gotit-chrome-WEBSTORE-v${packageMetadata.version}.zip`);
const staging = path.join(artifactDir, `.webstore-build-v${packageMetadata.version}`);
const packageEnv = {
  ...process.env,
  BUILD_MODE: 'production',
  BUILD_OUTPUT_DIR: staging,
  WEBSTORE_PACKAGE: '1'
};

await mkdir(artifactDir, { recursive: true });
await rm(target, { force: true });
await rm(staging, { recursive: true, force: true });

try {
  // Build into isolated staging so packaging can never change the identity of
  // the unpacked extension currently loaded from dist/.
  execFileSync(process.execPath, [path.join(root, 'scripts/build.mjs')], {
    cwd: root,
    env: packageEnv,
    stdio: 'inherit'
  });
  execFileSync(process.execPath, [path.join(root, 'scripts/verify-build.mjs')], {
    cwd: root,
    env: packageEnv,
    stdio: 'inherit'
  });

  if (process.platform === 'win32') {
    execFileSync('powershell.exe', [
      '-NoProfile', '-Command',
      `Compress-Archive -Path '${path.join(staging, '*').replaceAll("'", "''")}' -DestinationPath '${target.replaceAll("'", "''")}' -CompressionLevel Optimal`
    ], { stdio: 'inherit' });
  } else {
    execFileSync('zip', ['-qr', target, '.'], { cwd: staging, stdio: 'inherit' });
  }
  const archivedManifest = execFileSync(
    process.platform === 'win32' ? 'tar.exe' : 'unzip',
    process.platform === 'win32'
      ? ['-xOf', target, 'manifest.json']
      : ['-p', target, 'manifest.json'],
    { encoding: 'utf8' }
  );
  assertWebStoreManifest(JSON.parse(archivedManifest), packageMetadata.version);
  console.log('Verified the archived Web Store manifest has no key and the expected version.');
} catch (error) {
  await rm(target, { force: true });
  throw error;
} finally {
  await rm(staging, { recursive: true, force: true });
}
console.log(`Created ${target}`);
