import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import PocketBase from 'pocketbase';

/** @param {string} name */
function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

const endpoint = new URL(requiredEnvironment('POCKETBASE_BACKUP_URL'));
if (endpoint.username || endpoint.password) {
  throw new Error('Put backup credentials in dedicated environment variables, not the URL.');
}
const isLoopback = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(endpoint.hostname);
if (endpoint.protocol !== 'https:' && !isLoopback) {
  throw new Error('Backup connections must use HTTPS or a loopback SSH tunnel.');
}

const email = requiredEnvironment('POCKETBASE_SUPERUSER_EMAIL');
const password = requiredEnvironment('POCKETBASE_SUPERUSER_PASSWORD');
const destination = path.resolve(
  process.env.POCKETBASE_BACKUP_DIRECTORY?.trim() || path.join('.runtime', 'downloaded-backups'),
);
const timestamp = new Date()
  .toISOString()
  .replaceAll(/[-:.TZ]/g, '')
  .slice(0, 14);
const backupName = `manual_${timestamp}_${randomBytes(4).toString('hex')}.zip`;
const destinationFile = path.join(destination, backupName);
const checksumFile = `${destinationFile}.sha256`;

await mkdir(destination, { recursive: true, mode: 0o700 });

const client = new PocketBase(endpoint.toString());
client.autoCancellation(false);
let archiveCreated = false;
let checksumCreated = false;

try {
  await client.collection('_superusers').authWithPassword(email, password);
  await client.backups.create(backupName);

  const fileToken = await client.files.getToken();
  const downloadUrl = client.backups.getDownloadUrl(fileToken, backupName);
  const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(300000) });
  if (!response.ok) {
    throw new Error(`Backup download failed with status ${response.status}.`);
  }

  if (!response.body) {
    throw new Error('PocketBase returned a response without a backup body.');
  }

  const hash = createHash('sha256');
  let size = 0;
  let signature = Buffer.alloc(0);
  const inspector = new Transform({
    transform(chunk, _encoding, callback) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      hash.update(bytes);
      if (signature.length < 4) {
        signature = Buffer.concat([signature, bytes.subarray(0, 4 - signature.length)]);
      }
      callback(null, bytes);
    },
  });

  const archiveStream = createWriteStream(destinationFile, { flags: 'wx', mode: 0o600 });
  archiveStream.once('open', () => {
    archiveCreated = true;
  });
  await pipeline(Readable.fromWeb(response.body), inspector, archiveStream);
  if (size === 0 || signature.length < 2 || signature[0] !== 0x50 || signature[1] !== 0x4b) {
    throw new Error('PocketBase returned an empty or invalid ZIP archive.');
  }

  const checksum = hash.digest('hex');
  const checksumHandle = await open(checksumFile, 'wx', 0o600);
  checksumCreated = true;
  try {
    await checksumHandle.writeFile(`${checksum}  ${backupName}\n`);
  } finally {
    await checksumHandle.close();
  }

  console.log(`Backup downloaded to ${destinationFile}`);
  console.log(`SHA-256 ${checksum}`);
} catch (error) {
  await Promise.all([
    archiveCreated ? rm(destinationFile, { force: true }) : Promise.resolve(),
    checksumCreated ? rm(checksumFile, { force: true }) : Promise.resolve(),
  ]);
  throw error;
} finally {
  client.authStore.clear();
}
