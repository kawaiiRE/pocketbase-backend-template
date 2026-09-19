import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
const backupName = `manual_${timestamp}.zip`;
const destinationFile = path.join(destination, backupName);

await mkdir(destination, { recursive: true, mode: 0o700 });

const client = new PocketBase(endpoint.toString());
client.autoCancellation(false);

try {
  await client.collection('_superusers').authWithPassword(email, password);
  await client.backups.create(backupName);

  const fileToken = await client.files.getToken();
  const downloadUrl = client.backups.getDownloadUrl(fileToken, backupName);
  const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(300000) });
  if (!response.ok) {
    throw new Error(`Backup download failed with status ${response.status}.`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error('PocketBase returned an empty backup.');
  }

  const checksum = createHash('sha256').update(bytes).digest('hex');
  await writeFile(destinationFile, bytes, { flag: 'wx', mode: 0o600 });
  await writeFile(`${destinationFile}.sha256`, `${checksum}  ${backupName}\n`, {
    flag: 'wx',
    mode: 0o600,
  });

  console.log(`Backup downloaded to ${destinationFile}`);
  console.log(`SHA-256 ${checksum}`);
} finally {
  client.authStore.clear();
}
