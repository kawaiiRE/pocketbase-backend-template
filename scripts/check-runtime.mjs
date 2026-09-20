import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

const binary = path.resolve('bin', `pocketbase${process.platform === 'win32' ? '.exe' : ''}`);
const runtimeRoot = path.resolve('.runtime', 'runtime-tests');
const runtimeDirectory = path.join(
  runtimeRoot,
  `${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`,
);

if (path.dirname(runtimeDirectory) !== runtimeRoot) {
  throw new Error('Refusing to use a runtime directory outside the isolated test root.');
}

/** @returns {Promise<number>} */
function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate an isolated loopback port.'));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

/** @param {number} milliseconds */
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null;
}

await mkdir(runtimeDirectory, { recursive: true, mode: 0o700 });
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const recoveryEmail = `runtime-${randomBytes(8).toString('hex')}@example.invalid`;
const recoveryPassword = randomBytes(24).toString('base64url');
const encryptionKey = randomBytes(24).toString('base64url');
/** @type {string[]} */
const output = [];

const child = spawn(
  binary,
  [
    'serve',
    `--http=127.0.0.1:${port}`,
    `--dir=${runtimeDirectory}`,
    `--hooksDir=${path.resolve('pb_hooks')}`,
    `--migrationsDir=${path.resolve('pb_migrations')}`,
    '--automigrate=false',
    '--encryptionEnv=PB_ENCRYPTION_KEY',
  ],
  {
    env: {
      ...process.env,
      PB_ENCRYPTION_KEY: encryptionKey,
      PB_SUPERUSER_EMAIL: recoveryEmail,
      PB_SUPERUSER_PASSWORD: recoveryPassword,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
);

let exitCode = null;
/** @type {Promise<void>} */
const exited = new Promise((resolve) => {
  child.once('exit', (code) => {
    exitCode = code;
    resolve();
  });
});
for (const stream of [child.stdout, child.stderr]) {
  stream?.on('data', (chunk) => {
    output.push(String(chunk));
    if (output.length > 100) output.shift();
  });
}

try {
  /** @type {unknown} */
  let health;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (exitCode !== null) {
      throw new Error(`PocketBase exited before becoming healthy (code ${exitCode}).`);
    }
    try {
      const response = await fetch(`${origin}/api/v1/health`, {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) {
        health = await response.json();
        break;
      }
    } catch {
      // Startup races are expected until the isolated process begins listening.
    }
    await delay(100);
  }

  if (
    !isObject(health) ||
    health.status !== 'ok' ||
    health.apiVersion !== 1 ||
    health.service !== 'pocketbase-backend-template' ||
    typeof health.time !== 'string' ||
    Number.isNaN(Date.parse(health.time))
  ) {
    throw new Error('The live health route did not return the versioned contract.');
  }

  const authentication = await fetch(`${origin}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: recoveryEmail, password: recoveryPassword }),
    signal: AbortSignal.timeout(2_000),
  });
  if (!authentication.ok) {
    throw new Error(`Recovery account authentication failed (${authentication.status}).`);
  }
  const session = await authentication.json();
  if (!isObject(session) || typeof session.token !== 'string' || session.token.length === 0) {
    throw new Error('Recovery account authentication returned no token.');
  }

  const collectionsResponse = await fetch(`${origin}/api/collections?perPage=200`, {
    headers: { Authorization: session.token },
    signal: AbortSignal.timeout(2_000),
  });
  if (!collectionsResponse.ok) {
    throw new Error(`Collection verification failed (${collectionsResponse.status}).`);
  }
  const collections = await collectionsResponse.json();
  if (!isObject(collections) || !Array.isArray(collections.items)) {
    throw new Error('Collection verification returned an invalid response.');
  }
  const collectionNames = new Set(collections.items.filter(isObject).map((item) => item.name));
  if (!collectionNames.has('users') || !collectionNames.has('notes')) {
    throw new Error('The users and notes migrations were not both applied.');
  }

  const userPassword = randomBytes(24).toString('base64url');
  const userIds = [];
  const userEmails = [];
  for (const label of ['owner', 'other']) {
    const email = `${label}-${randomBytes(8).toString('hex')}@example.invalid`;
    const userResponse = await fetch(`${origin}/api/collections/users/records`, {
      method: 'POST',
      headers: {
        Authorization: session.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password: userPassword,
        passwordConfirm: userPassword,
        name: `Runtime ${label}`,
        verified: true,
      }),
      signal: AbortSignal.timeout(2_000),
    });
    const user = await userResponse.json();
    if (!userResponse.ok || !isObject(user) || typeof user.id !== 'string') {
      throw new Error(`Could not create the ${label} test user (${userResponse.status}).`);
    }
    userIds.push(user.id);
    userEmails.push(email);
  }

  const userAuthentication = await fetch(`${origin}/api/collections/users/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: userEmails[0], password: userPassword }),
    signal: AbortSignal.timeout(2_000),
  });
  const userSession = await userAuthentication.json();
  if (!userAuthentication.ok || !isObject(userSession) || typeof userSession.token !== 'string') {
    throw new Error(`User authentication failed (${userAuthentication.status}).`);
  }

  const noteResponse = await fetch(`${origin}/api/collections/notes/records`, {
    method: 'POST',
    headers: {
      Authorization: userSession.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ owner: userIds[0], title: 'Ownership rule check' }),
    signal: AbortSignal.timeout(2_000),
  });
  const note = await noteResponse.json();
  if (!noteResponse.ok || !isObject(note) || typeof note.id !== 'string') {
    throw new Error(`Owner-scoped note creation failed (${noteResponse.status}).`);
  }

  const reassignment = await fetch(`${origin}/api/collections/notes/records/${note.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: userSession.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ owner: userIds[1] }),
    signal: AbortSignal.timeout(2_000),
  });
  if (reassignment.ok) {
    throw new Error('The notes update rule allowed an owner reassignment.');
  }

  const persistedNoteResponse = await fetch(`${origin}/api/collections/notes/records/${note.id}`, {
    headers: { Authorization: session.token },
    signal: AbortSignal.timeout(2_000),
  });
  const persistedNote = await persistedNoteResponse.json();
  if (!persistedNoteResponse.ok || !isObject(persistedNote) || persistedNote.owner !== userIds[0]) {
    throw new Error('The rejected owner reassignment changed the persisted note.');
  }

  console.log('PocketBase runtime smoke test passed.');
} catch (error) {
  if (output.length > 0) {
    console.error(output.join('').slice(-8_000));
  }
  throw error;
} finally {
  if (exitCode === null) {
    child.kill();
    await Promise.race([exited, delay(3_000)]);
    if (exitCode === null) {
      child.kill('SIGKILL');
      await exited;
    }
  }
  await rm(runtimeDirectory, { recursive: true, force: true });
}
