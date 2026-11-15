const { createAppError } = require('../shared/http-error.cjs');
const {
  GUEST_EMAIL_DOMAIN,
  parseLocaleInput,
  parseRegistrationInput,
} = require('./register.validation.cjs');

/**
 * @typedef {import('../shared/env.cjs').FeatureFlags} FeatureFlags
 * @typedef {import('./register.validation.cjs').Locale} Locale
 * @typedef {import('./register.validation.cjs').RegistrationInput} RegistrationInput
 * @typedef {import('./user.repository.cjs').UserEntity} UserEntity
 * @typedef {import('./user.repository.cjs').GuestInput} GuestInput
 *
 * @typedef GuestStore
 * @property {(email: string) => boolean} emailExists
 * @property {(userId: string) => UserEntity | null} findById
 * @property {(input: GuestInput) => UserEntity} createGuest
 * @property {(userId: string, input: RegistrationInput) => UserEntity} upgradeGuest
 * @property {(userId: string) => void} sendVerification
 *
 * @typedef CreateGuestDependencies
 * @property {FeatureFlags} features
 * @property {Pick<GuestStore, 'createGuest'>} users
 * @property {(length: number) => string} randomString lowercase alphanumeric
 *
 * @typedef UpgradeGuestDependencies
 * @property {FeatureFlags} features
 * @property {Omit<GuestStore, 'createGuest'>} users
 * @property {(message: string, error: unknown) => void} logError
 *
 * @typedef CleanupStore
 * @property {(cutoff: string, limit: number) => { deleted: number, failed: number }} deleteGuestsCreatedBefore
 *
 * @typedef CleanupDependencies
 * @property {CleanupStore} users
 * @property {number} ttlHours
 * @property {Date} now
 */

const GUEST_ID_LENGTH = 24;
const CLEANUP_BATCH_SIZE = 100;

/** @type {Record<Locale, string>} */
const GUEST_NAMES = { '': 'Guest', en: 'Guest', ar: 'ضيف' };

/** @param {string} email */
function emailTaken(email) {
  return createAppError(409, 'EMAIL_TAKEN', `An account with ${email} already exists.`);
}

/**
 * Creates a guest account with a generated identity on the reserved guest domain.
 *
 * @param {Record<string, unknown>} body
 * @param {CreateGuestDependencies} deps
 * @returns {UserEntity}
 */
function createGuest(body, deps) {
  if (!deps.features.guestEnabled) {
    throw createAppError(403, 'GUEST_DISABLED', 'Guest access is currently disabled.');
  }

  const locale = parseLocaleInput(body);
  return deps.users.createGuest({
    email: `guest-${deps.randomString(GUEST_ID_LENGTH)}@${GUEST_EMAIL_DOMAIN}`,
    name: GUEST_NAMES[locale],
    locale,
  });
}

/**
 * Turns the authenticated guest into a regular account in place, so its data is kept.
 *
 * @param {string} userId authenticated users record id
 * @param {Record<string, unknown>} body
 * @param {UpgradeGuestDependencies} deps
 * @returns {UserEntity}
 */
function upgradeGuest(userId, body, deps) {
  const current = deps.users.findById(userId);
  if (!current || !current.guest) {
    throw createAppError(403, 'NOT_GUEST', 'Only guest accounts can be upgraded.');
  }
  if (!deps.features.registrationEnabled) {
    throw createAppError(403, 'REGISTRATION_DISABLED', 'Registration is currently disabled.');
  }

  const input = parseRegistrationInput(body);
  if (deps.users.emailExists(input.email)) {
    throw emailTaken(input.email);
  }

  /** @type {UserEntity} */
  let user;
  try {
    user = deps.users.upgradeGuest(userId, input);
  } catch (error) {
    if (deps.users.emailExists(input.email)) {
      throw emailTaken(input.email);
    }
    throw error;
  }

  if (deps.features.requireEmailVerification) {
    try {
      deps.users.sendVerification(user.id);
    } catch (error) {
      deps.logError('Failed to send the guest upgrade verification email.', error);
    }
  }
  return user;
}

/**
 * Deletes guests older than the TTL in batches. Safe to run repeatedly; a batch without any
 * successful deletion stops the run so persistent failures cannot loop.
 *
 * @param {CleanupDependencies} deps
 * @returns {{ deleted: number, failed: number }}
 */
function cleanupExpiredGuests(deps) {
  const cutoff = new Date(deps.now.getTime() - deps.ttlHours * 3_600_000)
    .toISOString()
    .replace('T', ' ');
  let deleted = 0;
  let failed = 0;
  for (;;) {
    const batch = deps.users.deleteGuestsCreatedBefore(cutoff, CLEANUP_BATCH_SIZE);
    deleted += batch.deleted;
    failed += batch.failed;
    if (batch.deleted === 0 || batch.deleted + batch.failed < CLEANUP_BATCH_SIZE) break;
  }
  return { deleted, failed };
}

module.exports = { createGuest, upgradeGuest, cleanupExpiredGuests };
