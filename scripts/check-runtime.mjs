import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const binary = path.resolve('bin', `pocketbase${process.platform === 'win32' ? '.exe' : ''}`);
const runtimeRoot = path.resolve('.runtime', 'runtime-tests');
const runtimeDirectory = path.join(
  runtimeRoot,
  `${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`,
);

if (path.dirname(runtimeDirectory) !== runtimeRoot) {
  throw new Error('Refusing to use a runtime directory outside the isolated test root.');
}

const recoveryEmail = `runtime-${randomBytes(8).toString('hex')}@example.invalid`;
const recoveryPassword = randomBytes(24).toString('base64url');
const encryptionKey = randomBytes(24).toString('base64url');

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
 * @returns {value is Record<string, any>}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null;
}

/**
 * @param {unknown} condition
 * @param {string} message
 * @returns {asserts condition}
 */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Inherited PB_* variables would make the smoke test depend on the developer's shell.
 *
 * @param {Record<string, string>} overrides
 */
function isolatedEnvironment(overrides) {
  /** @type {Record<string, string>} */
  const environment = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('PB_') && value !== undefined) environment[key] = value;
  }
  return {
    ...environment,
    PB_ENCRYPTION_KEY: encryptionKey,
    PB_SUPERUSER_EMAIL: recoveryEmail,
    PB_SUPERUSER_PASSWORD: recoveryPassword,
    ...overrides,
  };
}

/**
 * Starts PocketBase against the shared disposable data directory. Each phase restarts the
 * process to exercise a different environment configuration.
 *
 * @param {Record<string, string>} overrides
 */
async function startPocketBase(overrides) {
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
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
    { env: isolatedEnvironment(overrides), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );

  /** @type {number | null} */
  let exitCode = null;
  /** @type {Promise<void>} */
  const exited = new Promise((resolve) => {
    child.once('exit', (code) => {
      exitCode = code ?? -1;
      resolve();
    });
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on('data', (chunk) => {
      output.push(String(chunk));
      if (output.length > 100) output.shift();
    });
  }

  const stop = async () => {
    if (exitCode !== null) return;
    child.kill();
    await Promise.race([exited, delay(3_000)]);
    if (exitCode === null) {
      child.kill('SIGKILL');
      await exited;
    }
  };

  /** @type {unknown} */
  let health;
  for (let attempt = 0; attempt < 150 && health === undefined; attempt += 1) {
    if (exitCode !== null) {
      console.error(output.join('').slice(-8_000));
      throw new Error(`PocketBase exited before becoming healthy (code ${exitCode}).`);
    }
    try {
      const response = await fetch(`${origin}/api/v1/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) health = await response.json();
    } catch {
      // Startup races are expected until the isolated process begins listening.
    }
    if (health === undefined) await delay(100);
  }

  return { origin, health, output, stop };
}

/**
 * @param {string} origin
 * @returns {(method: string, route: string, options?: { token?: string, body?: unknown, ip?: string }) => Promise<{ status: number, body: any }>}
 */
function client(origin) {
  return async (method, route, options = {}) => {
    /** @type {Record<string, string>} */
    const headers = {};
    if (options.token) headers.Authorization = options.token;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.ip) headers['X-Forwarded-For'] = options.ip;
    const response = await fetch(`${origin}${route}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(5_000),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
}

/** @param {ReturnType<typeof client>} request */
async function superuserToken(request) {
  const session = await request('POST', '/api/collections/_superusers/auth-with-password', {
    body: { identity: recoveryEmail, password: recoveryPassword },
  });
  assert(session.status === 200, `Recovery account authentication failed (${session.status}).`);
  assert(typeof session.body?.token === 'string', 'Recovery authentication returned no token.');
  return /** @type {string} */ (session.body.token);
}

/**
 * Phase 1: default environment. Registration is closed and the rate limiter is active.
 *
 * @param {ReturnType<typeof client>} request
 * @param {unknown} health
 */
async function checkDefaults(request, health) {
  assert(
    isObject(health) &&
      health.status === 'ok' &&
      health.apiVersion === 1 &&
      health.service === 'pocketbase-backend-template' &&
      typeof health.time === 'string' &&
      !Number.isNaN(Date.parse(health.time)),
    'The live health route did not return the versioned contract.',
  );

  const config = await request('GET', '/api/v1/config');
  assert(
    config.status === 200 &&
      isDeepStrictEqual(config.body, {
        apiVersion: 1,
        features: {
          registration: false,
          emailVerification: false,
          guest: false,
          guestTtlHours: 24,
        },
      }),
    'The config route did not report closed registration and guests by default.',
  );

  const guestDisabled = await request('POST', '/api/v1/auth/guest');
  assert(
    guestDisabled.status === 403 && guestDisabled.body?.code === 'GUEST_DISABLED',
    `Disabled guest access returned ${guestDisabled.status}.`,
  );

  const disabled = await request('POST', '/api/v1/auth/register', {
    body: { name: 'Closed', email: 'closed@example.invalid', password: 'password-123' },
  });
  assert(
    disabled.status === 403 && disabled.body?.code === 'REGISTRATION_DISABLED',
    `Disabled registration returned ${disabled.status}.`,
  );

  const token = await superuserToken(request);
  const collections = await request('GET', '/api/collections?perPage=200', { token });
  assert(collections.status === 200, `Collection listing failed (${collections.status}).`);
  const byName = new Map(
    collections.body.items.filter(isObject).map((/** @type {any} */ item) => [item.name, item]),
  );
  const users = byName.get('users');
  const notes = byName.get('notes');
  assert(users && notes, 'The users and notes migrations were not both applied.');
  assert(users.createRule === null, 'The users createRule must stay null.');
  assert(
    users.deleteRule === '@request.auth.collectionName = "users" && id = @request.auth.id',
    'Users cannot delete only their own account.',
  );
  assert(
    users.fields.some(
      (/** @type {any} */ field) =>
        field.name === 'locale' && isDeepStrictEqual(field.values, ['en', 'ar']),
    ),
    'The users locale field is missing.',
  );
  const avatar = users.fields.find((/** @type {any} */ field) => field.name === 'avatar');
  assert(
    users.fields.some(
      (/** @type {any} */ field) => field.name === 'guest' && field.type === 'bool',
    ) &&
      avatar?.maxSize === 2 * 1024 * 1024 &&
      !avatar.mimeTypes.includes('image/svg+xml'),
    'The guest field or avatar limits are missing.',
  );
  assert(
    String(users.verificationTemplate?.body).includes('{APP_URL}/verify-email?token={TOKEN}') &&
      String(users.resetPasswordTemplate?.body).includes('{APP_URL}/reset-password?token={TOKEN}'),
    'Auth email templates do not link to the frontend.',
  );
  assert(
    notes.indexes.some((/** @type {string} */ index) =>
      index.includes('idx_notes_owner_archived_updated'),
    ),
    'The notes archive index is missing.',
  );

  // Five registrations per client IP per 15 minutes; superusers bypass limits.
  const limiterIp = '203.0.113.10';
  /** @type {number[]} */
  const statuses = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await request('POST', '/api/v1/auth/register', {
      body: {},
      ip: limiterIp,
    });
    statuses.push(response.status);
  }
  assert(
    statuses.slice(0, 5).every((status) => status === 403) && statuses[5] === 429,
    `The register rate limit did not trigger as expected (${statuses.join(',')}).`,
  );
}

/**
 * Phase 2: open registration without verification. Exercises the full user and notes contract.
 *
 * @param {ReturnType<typeof client>} request
 */
async function checkOpenRegistration(request) {
  const config = await request('GET', '/api/v1/config');
  assert(config.body?.features?.registration === true, 'Registration flag was not enabled.');

  const password = randomBytes(18).toString('base64url');
  /** @type {{ id: string, email: string, token: string }[]} */
  const accounts = [];
  for (const label of ['owner', 'other']) {
    const email = `${label}-${randomBytes(6).toString('hex')}@Example.invalid`;
    const registered = await request('POST', '/api/v1/auth/register', {
      body: { name: `Runtime ${label}`, email, password },
      ip: '198.51.100.1',
    });
    assert(registered.status === 201, `Registration failed (${registered.status}).`);
    assert(
      isDeepStrictEqual(Object.keys(registered.body).sort(), [
        'createdAt',
        'email',
        'guest',
        'id',
        'locale',
        'name',
        'verified',
      ]) &&
        registered.body.guest === false &&
        registered.body.email === email.toLowerCase() &&
        registered.body.verified === false &&
        !Number.isNaN(Date.parse(registered.body.createdAt)),
      'Registration did not return the allowlisted user DTO.',
    );

    const session = await request('POST', '/api/collections/users/auth-with-password', {
      body: { identity: email.toLowerCase(), password },
      ip: '198.51.100.1',
    });
    assert(session.status === 200, `Native password login failed (${session.status}).`);
    accounts.push({
      id: registered.body.id,
      email: email.toLowerCase(),
      token: session.body.token,
    });
  }
  const [owner, other] = accounts;

  const duplicate = await request('POST', '/api/v1/auth/register', {
    body: { name: 'Duplicate', email: owner.email.toUpperCase(), password },
    ip: '198.51.100.2',
  });
  assert(duplicate.status === 409 && duplicate.body?.code === 'EMAIL_TAKEN', 'Duplicate not 409.');

  const invalid = await request('POST', '/api/v1/auth/register', {
    body: { name: 'X', email: 'nope', password: 'short' },
    ip: '198.51.100.2',
  });
  assert(
    invalid.status === 400 &&
      invalid.body?.code === 'INVALID_INPUT' &&
      ['name', 'email', 'password'].every(
        (field) => typeof invalid.body.fields?.[field] === 'string',
      ),
    'Invalid registration did not return field errors.',
  );

  const userPath = `/api/collections/users/records/${owner.id}`;
  const profile = await request('PATCH', userPath, {
    token: owner.token,
    body: { name: 'Renamed Owner', locale: 'ar' },
  });
  assert(
    profile.status === 200 && profile.body.name === 'Renamed Owner' && profile.body.locale === 'ar',
    `Profile update failed (${profile.status}).`,
  );
  const badLocale = await request('PATCH', userPath, {
    token: owner.token,
    body: { locale: 'fr' },
  });
  assert(badLocale.status === 400, 'An unsupported locale was accepted.');
  const verify = await request('PATCH', userPath, { token: owner.token, body: { verified: true } });
  assert(verify.status === 400, 'A user was able to change the verified flag.');
  const foreign = await request('PATCH', `/api/collections/users/records/${other.id}`, {
    token: owner.token,
    body: { name: 'Hijacked' },
  });
  assert(foreign.status === 404, 'A user was able to update another account.');

  /** @type {string[]} */
  const noteIds = [];
  for (const [title, body, archived] of [
    ['Groceries', 'Buy oat milk', false],
    ['Travel plan', 'Pack the passport', true],
  ]) {
    const created = await request('POST', '/api/collections/notes/records', {
      token: owner.token,
      body: { owner: owner.id, title, body, archived },
    });
    assert(created.status === 200, `Note creation failed (${created.status}).`);
    noteIds.push(created.body.id);
  }
  const forged = await request('POST', '/api/collections/notes/records', {
    token: other.token,
    body: { owner: owner.id, title: 'Forged' },
  });
  assert(forged.status === 400, 'A user created a note for another owner.');

  const active = await request(
    'GET',
    `/api/collections/notes/records?filter=${encodeURIComponent('archived = false')}&sort=-updated`,
    { token: owner.token },
  );
  assert(
    active.status === 200 &&
      active.body.totalItems === 1 &&
      active.body.items[0].title === 'Groceries',
    'The archived filter did not narrow the owner list.',
  );
  const search = await request(
    'GET',
    `/api/collections/notes/records?filter=${encodeURIComponent('(title ~ "passport" || body ~ "passport")')}`,
    { token: owner.token },
  );
  assert(search.body?.totalItems === 1, 'Text search on title/body failed.');
  const otherList = await request('GET', '/api/collections/notes/records', { token: other.token });
  assert(otherList.body?.totalItems === 0, 'Notes leaked across owners.');
  const otherView = await request('GET', `/api/collections/notes/records/${noteIds[0]}`, {
    token: other.token,
  });
  assert(otherView.status === 404, 'A user could view another owner note.');
  const reassignment = await request('PATCH', `/api/collections/notes/records/${noteIds[0]}`, {
    token: owner.token,
    body: { owner: other.id },
  });
  assert(reassignment.status >= 400, 'The notes update rule allowed an owner reassignment.');
  const archive = await request('PATCH', `/api/collections/notes/records/${noteIds[0]}`, {
    token: owner.token,
    body: { archived: true, title: 'Groceries (done)' },
  });
  assert(archive.status === 200 && archive.body.archived === true, 'Note update failed.');
  const removed = await request('DELETE', `/api/collections/notes/records/${noteIds[1]}`, {
    token: owner.token,
  });
  assert(removed.status === 204, `Note deletion failed (${removed.status}).`);

  const newPassword = randomBytes(18).toString('base64url');
  const missingOld = await request('PATCH', userPath, {
    token: owner.token,
    body: { password: newPassword, passwordConfirm: newPassword },
  });
  assert(missingOld.status === 400, 'Password change without oldPassword was accepted.');
  const changed = await request('PATCH', userPath, {
    token: owner.token,
    body: { oldPassword: password, password: newPassword, passwordConfirm: newPassword },
  });
  assert(changed.status === 200, `Password change failed (${changed.status}).`);
  const staleToken = await request('GET', userPath, { token: owner.token });
  assert(staleToken.status === 404, 'The token issued before the password change still works.');
  const relogin = await request('POST', '/api/collections/users/auth-with-password', {
    body: { identity: owner.email, password: newPassword },
    ip: '198.51.100.3',
  });
  assert(relogin.status === 200, 'Login with the new password failed.');
  const refreshed = await request('POST', '/api/collections/users/auth-refresh', {
    token: relogin.body.token,
  });
  assert(refreshed.status === 200, `Native auth refresh failed (${refreshed.status}).`);

  const foreignDelete = await request('DELETE', `/api/collections/users/records/${other.id}`, {
    token: relogin.body.token,
  });
  assert(foreignDelete.status === 404, 'A user could delete another account.');
  const selfDelete = await request('DELETE', userPath, { token: relogin.body.token });
  assert(selfDelete.status === 204, `Self-delete failed (${selfDelete.status}).`);

  const token = await superuserToken(request);
  const orphanNotes = await request(
    'GET',
    `/api/collections/notes/records?filter=${encodeURIComponent(`owner = "${owner.id}"`)}`,
    { token },
  );
  assert(orphanNotes.body?.totalItems === 0, 'Deleting a user did not cascade to their notes.');
}

/**
 * Phase 3: guest sessions. Guests own data, cannot self-promote through record APIs, and are
 * upgraded in place.
 *
 * @param {ReturnType<typeof client>} request
 */
async function checkGuests(request) {
  const config = await request('GET', '/api/v1/config');
  assert(
    config.body?.features?.guest === true && config.body.features.guestTtlHours === 2,
    'The config route did not report guest access.',
  );

  const guest = await request('POST', '/api/v1/auth/guest', {
    body: { locale: 'ar' },
    ip: '198.51.100.20',
  });
  assert(
    guest.status === 200 &&
      typeof guest.body?.token === 'string' &&
      guest.body.record.guest === true &&
      guest.body.record.verified === true &&
      guest.body.record.locale === 'ar' &&
      /^guest-[a-z0-9]{24}@guest\.invalid$/.test(guest.body.record.email),
    `Guest creation failed (${guest.status}).`,
  );
  const id = guest.body.record.id;
  const userPath = `/api/collections/users/records/${id}`;

  const note = await request('POST', '/api/collections/notes/records', {
    token: guest.body.token,
    body: { owner: id, title: 'Guest note' },
  });
  assert(note.status === 200, `A guest could not create a note (${note.status}).`);
  for (const body of [
    { guest: false },
    { password: 'guest-pass-1', passwordConfirm: 'guest-pass-1' },
  ]) {
    const change = await request('PATCH', userPath, { token: guest.body.token, body });
    assert(change.status >= 400, 'A guest changed a protected field through the record API.');
  }
  const emailChange = await request('POST', '/api/collections/users/request-email-change', {
    token: guest.body.token,
    body: { newEmail: 'guest-change@example.invalid' },
  });
  assert(emailChange.status === 403, 'A guest could request an email change.');

  const email = `upgraded-${randomBytes(6).toString('hex')}@example.invalid`;
  const password = randomBytes(18).toString('base64url');
  const upgraded = await request('POST', '/api/v1/auth/guest/upgrade', {
    token: guest.body.token,
    body: { name: 'Upgraded Guest', email, password },
    ip: '198.51.100.21',
  });
  assert(
    upgraded.status === 200 &&
      upgraded.body.record.id === id &&
      upgraded.body.record.guest === false &&
      upgraded.body.record.email === email,
    `Guest upgrade failed (${upgraded.status}).`,
  );
  const staleGuest = await request('GET', userPath, { token: guest.body.token });
  assert(staleGuest.status === 404, 'The guest token still works after the upgrade.');
  const notes = await request('GET', '/api/collections/notes/records', {
    token: upgraded.body.token,
  });
  assert(notes.body?.totalItems === 1, 'The upgraded account lost its guest notes.');
  const again = await request('POST', '/api/v1/auth/guest/upgrade', {
    token: upgraded.body.token,
    body: { name: 'Again', email: `again-${email}`, password },
    ip: '198.51.100.21',
  });
  assert(
    again.status === 403 && again.body?.code === 'NOT_GUEST',
    'A regular account was upgraded.',
  );
  const login = await request('POST', '/api/collections/users/auth-with-password', {
    body: { identity: email, password },
    ip: '198.51.100.22',
  });
  assert(login.status === 200, 'The upgraded credentials do not sign in.');

  const token = await superuserToken(request);
  const crons = await request('GET', '/api/crons', { token });
  assert(
    Array.isArray(crons.body) &&
      crons.body.some((/** @type {any} */ job) => job.id === 'guestCleanup'),
    'The guest cleanup job is not registered.',
  );
}

/**
 * Phase 4: registration with required verification. Unverified accounts cannot authenticate.
 *
 * @param {ReturnType<typeof client>} request
 */
async function checkRequiredVerification(request) {
  const config = await request('GET', '/api/v1/config');
  assert(
    config.body?.features?.registration === true && config.body.features.emailVerification === true,
    'The config route did not report required verification.',
  );

  const email = `verify-${randomBytes(6).toString('hex')}@example.invalid`;
  const password = randomBytes(18).toString('base64url');
  const registered = await request('POST', '/api/v1/auth/register', {
    body: { name: 'Pending User', email, password },
  });
  assert(
    registered.status === 201 && registered.body.verified === false,
    `Registration with verification failed (${registered.status}).`,
  );

  const blocked = await request('POST', '/api/collections/users/auth-with-password', {
    body: { identity: email, password },
  });
  assert(blocked.status === 403, `An unverified user could log in (${blocked.status}).`);

  const token = await superuserToken(request);
  const verified = await request('PATCH', `/api/collections/users/records/${registered.body.id}`, {
    token,
    body: { verified: true },
  });
  assert(verified.status === 200, 'Superuser verification failed.');
  const allowed = await request('POST', '/api/collections/users/auth-with-password', {
    body: { identity: email, password },
  });
  assert(allowed.status === 200, `A verified user could not log in (${allowed.status}).`);

  const guest = await request('POST', '/api/v1/auth/guest');
  assert(guest.status === 200, `The verification gate blocked a guest (${guest.status}).`);
  const pending = await request('POST', '/api/v1/auth/guest/upgrade', {
    token: guest.body.token,
    body: { name: 'Pending Guest', email: `pending-${email}`, password },
  });
  assert(
    pending.status === 202 && pending.body.verified === false && !('token' in pending.body),
    `A guest upgrade skipped required verification (${pending.status}).`,
  );
}

await mkdir(runtimeDirectory, { recursive: true, mode: 0o700 });

/** @type {[string, Record<string, string>, (request: ReturnType<typeof client>, health: unknown) => Promise<void>][]} */
const phases = [
  ['defaults', { PB_TRUSTED_PROXY_HEADERS: 'X-Forwarded-For' }, checkDefaults],
  [
    'open registration',
    { PB_REGISTRATION_ENABLED: 'true', PB_TRUSTED_PROXY_HEADERS: 'X-Forwarded-For' },
    checkOpenRegistration,
  ],
  [
    'guests',
    {
      PB_REGISTRATION_ENABLED: 'true',
      PB_GUEST_ENABLED: 'true',
      PB_GUEST_TTL_HOURS: '2',
      PB_TRUSTED_PROXY_HEADERS: 'X-Forwarded-For',
    },
    checkGuests,
  ],
  [
    'required verification',
    {
      PB_REGISTRATION_ENABLED: 'true',
      PB_REQUIRE_EMAIL_VERIFICATION: 'true',
      PB_GUEST_ENABLED: 'true',
    },
    checkRequiredVerification,
  ],
];

try {
  for (const [name, overrides, check] of phases) {
    const instance = await startPocketBase(overrides);
    try {
      await check(client(instance.origin), instance.health);
    } catch (error) {
      console.error(`Runtime phase "${name}" failed.`);
      console.error(instance.output.join('').slice(-8_000));
      throw error;
    } finally {
      await instance.stop();
    }
  }
  console.log('PocketBase runtime smoke test passed.');
} finally {
  await rm(runtimeDirectory, { recursive: true, force: true });
}
