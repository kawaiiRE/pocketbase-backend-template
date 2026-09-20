import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const version = '0.40.4';
const platform =
  process.platform === 'win32' ? 'windows' : process.platform === 'linux' ? 'linux' : null;

if (!platform || process.arch !== 'x64') {
  throw new Error(
    'This verified installer supports Windows/Linux x64. Install the matching official binary manually on other platforms.',
  );
}

const checksums = {
  windows: '81c30964508fa7df15fe4571a6ee39e059859c566dad03ebf181aebe07366c3e',
  linux: '9042ec818570e79c3628dadcd0a756c1496d9e1173918ec409d133c02f82e5fa',
};
const filename = `pocketbase_${version}_${platform}_amd64.zip`;
const downloadDirectory = path.resolve('.runtime', 'downloads');
const binaryDirectory = path.resolve('bin');
const archive = path.join(downloadDirectory, filename);

await mkdir(downloadDirectory, { recursive: true });
await mkdir(binaryDirectory, { recursive: true });

let bytes;
try {
  bytes = await readFile(archive);
} catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
    throw error;
  }
}

if (!bytes) {
  const response = await fetch(
    `https://github.com/pocketbase/pocketbase/releases/download/v${version}/${filename}`,
    { signal: AbortSignal.timeout(300000) },
  );
  if (!response.ok) {
    throw new Error(`PocketBase download failed with status ${response.status}.`);
  }
  bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(archive, bytes, { mode: 0o600 });
}

const actualChecksum = createHash('sha256').update(bytes).digest('hex');
if (actualChecksum !== checksums[platform]) {
  throw new Error('PocketBase checksum mismatch. The archive was not extracted.');
}

/** @param {string} value */
const quotePowerShell = (value) => `'${value.replaceAll("'", "''")}'`;
const extraction =
  platform === 'windows'
    ? spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Expand-Archive -LiteralPath ${quotePowerShell(archive)} -DestinationPath ${quotePowerShell(binaryDirectory)} -Force`,
        ],
        { stdio: 'inherit', windowsHide: true },
      )
    : spawnSync('unzip', ['-o', archive, '-d', binaryDirectory], { stdio: 'inherit' });

if (extraction.status !== 0) {
  throw new Error('PocketBase archive extraction failed.');
}

console.log(`PocketBase ${version} verified and installed.`);
await import('./generate-types.mjs');
