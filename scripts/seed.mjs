import PocketBase, { ClientResponseError } from 'pocketbase';

// Local development seed. Idempotent: creates a verified demo user and sample notes only when
// they are missing, and never updates or deletes existing data.

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const DEMO_NOTES = [
  {
    title: 'Welcome to the template',
    body: 'Notes are owner-scoped by collection rules. Edit, archive, or delete this note.',
    archived: false,
  },
  {
    title: 'Search works on title and body',
    body: 'Try filtering with title ~ "search" || body ~ "search".',
    archived: false,
  },
  {
    title: 'An archived note',
    body: 'Archived notes are hidden by the archived = false filter.',
    archived: true,
  },
];

/** @param {string} name */
function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required to seed local data.`);
  }
  return value;
}

/** @param {string} value */
function isLoopbackUrl(value) {
  try {
    return LOOPBACK_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed when NODE_ENV=production.');
}

const target =
  process.env.PB_SEED_URL?.trim() || `http://127.0.0.1:${process.env.PB_PORT ?? '8090'}`;
const endpoint = new URL(target);
if (endpoint.protocol !== 'http:' || !LOOPBACK_HOSTS.has(endpoint.hostname)) {
  throw new Error('PB_SEED_URL must be a loopback http:// URL of a local PocketBase instance.');
}

const superuserEmail = requiredEnvironment('PB_SUPERUSER_EMAIL');
const superuserPassword = requiredEnvironment('PB_SUPERUSER_PASSWORD');
const demoEmail = (process.env.PB_SEED_DEMO_EMAIL?.trim() || 'demo@example.com').toLowerCase();
const demoPassword = process.env.PB_SEED_DEMO_PASSWORD || 'demo-password-123';
if (demoPassword.length < 8) {
  throw new Error('PB_SEED_DEMO_PASSWORD must contain at least 8 characters.');
}

const client = new PocketBase(endpoint.toString());
client.autoCancellation(false);

try {
  await client.collection('_superusers').authWithPassword(superuserEmail, superuserPassword);

  // An SSH tunnel to a deployed instance is also loopback; deployed instances set PB_APP_URL to
  // their public frontend origin, so a non-loopback app URL means this is not a local database.
  const settings = await client.settings.getAll();
  const appUrl = String(settings?.meta?.appURL ?? '');
  if (!isLoopbackUrl(appUrl)) {
    throw new Error('Refusing to seed: the target app URL is not a local development origin.');
  }

  const users = client.collection('users');
  let user;
  try {
    user = await users.getFirstListItem(client.filter('email = {:email}', { email: demoEmail }));
    console.log(`Demo user ${demoEmail} already exists; leaving it unchanged.`);
  } catch (error) {
    if (!(error instanceof ClientResponseError) || error.status !== 404) throw error;
    user = await users.create({
      email: demoEmail,
      password: demoPassword,
      passwordConfirm: demoPassword,
      name: 'Demo User',
      locale: 'en',
      verified: true,
    });
    console.log(`Created demo user ${demoEmail}.`);
  }

  const notes = client.collection('notes');
  let created = 0;
  for (const note of DEMO_NOTES) {
    const existing = await notes.getList(1, 1, {
      filter: client.filter('owner = {:owner} && title = {:title}', {
        owner: user.id,
        title: note.title,
      }),
      skipTotal: true,
    });
    if (existing.items.length === 0) {
      await notes.create({ ...note, owner: user.id });
      created += 1;
    }
  }
  console.log(`Seed complete: ${created} note(s) created.`);
} finally {
  client.authStore.clear();
}
