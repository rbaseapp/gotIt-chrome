import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactDir = path.join(root, 'artifacts');
const packageMetadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const target = path.join(artifactDir, `gotit-chrome-v${packageMetadata.version}.zip`);
await mkdir(artifactDir, { recursive: true });
await rm(target, { force: true });

if (process.platform === 'win32') {
  execFileSync('powershell.exe', [
    '-NoProfile', '-Command',
    `Compress-Archive -Path '${path.join(root, 'dist', '*').replaceAll("'", "''")}' -DestinationPath '${target.replaceAll("'", "''")}' -CompressionLevel Optimal`
  ], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-qr', target, '.'], { cwd: path.join(root, 'dist'), stdio: 'inherit' });
}
console.log(`Created ${target}`);
