/**
 * PocketBase persistence for the users auth collection. JSVM-only: depends on Record, $dbx,
 * $mails, and $security globals, so it is exercised by the runtime smoke test rather than unit
 * tests.
 *
 * @typedef {import('./register.validation.cjs').Locale} Locale
 * @typedef {import('./register.validation.cjs').RegistrationInput} RegistrationInput
 *
 * @typedef UserEntity
 * @property {string} id
 * @property {string} email
 * @property {string} name
 * @property {Locale} locale
 * @property {boolean} verified
 * @property {boolean} guest
 * @property {string} created
 *
 * @typedef GuestInput
 * @property {string} email
 * @property {string} name
 * @property {Locale} locale
 */

const USERS = 'users';
const GUEST_PASSWORD_LENGTH = 48;

/**
 * @param {core.Record} record
 * @returns {UserEntity}
 */
function toUserEntity(record) {
  return {
    id: record.id,
    email: record.email(),
    name: record.getString('name'),
    locale: /** @type {Locale} */ (record.getString('locale')),
    verified: record.verified(),
    guest: record.getBool('guest'),
    created: record.getString('created'),
  };
}

/**
 * @param {CoreApp} app
 */
function createUserRepository(app) {
  return {
    /** @param {string} email */
    emailExists(email) {
      return app.countRecords(USERS, $dbx.exp('LOWER(email) = {:email}', { email })) > 0;
    },

    /**
     * @param {string} userId
     * @returns {UserEntity | null}
     */
    findById(userId) {
      try {
        return toUserEntity(app.findRecordById(USERS, userId));
      } catch {
        return null;
      }
    },

    /**
     * @param {RegistrationInput} input
     * @returns {UserEntity}
     */
    create(input) {
      const record = new Record(app.findCollectionByNameOrId(USERS));
      record.setEmail(input.email);
      record.setPassword(input.password);
      record.setVerified(false);
      record.set('name', input.name);
      record.set('locale', input.locale);
      record.set('guest', false);
      app.save(record);
      return toUserEntity(record);
    },

    /**
     * Guests are verified so the verification gate never blocks them, and get a random password
     * nobody knows: they authenticate only through the token returned at creation.
     *
     * @param {GuestInput} input
     * @returns {UserEntity}
     */
    createGuest(input) {
      const record = new Record(app.findCollectionByNameOrId(USERS));
      record.setEmail(input.email);
      record.setPassword($security.randomString(GUEST_PASSWORD_LENGTH));
      record.setVerified(true);
      record.set('name', input.name);
      record.set('locale', input.locale);
      record.set('guest', true);
      app.save(record);
      return toUserEntity(record);
    },

    /**
     * Converts a guest in place, so its notes keep their owner. Changing the password rotates the
     * token key, which invalidates the guest token.
     *
     * @param {string} userId
     * @param {RegistrationInput} input
     * @returns {UserEntity}
     */
    upgradeGuest(userId, input) {
      const record = app.findRecordById(USERS, userId);
      record.setEmail(input.email);
      record.setPassword(input.password);
      record.setVerified(false);
      record.set('name', input.name);
      if (input.locale) record.set('locale', input.locale);
      record.set('guest', false);
      record.refreshTokenKey();
      app.save(record);
      return toUserEntity(record);
    },

    /**
     * Deletes up to `limit` guests created before the cutoff. Notes cascade through the owner
     * relation.
     *
     * @param {string} cutoff PocketBase datetime ("YYYY-MM-DD HH:MM:SS.sssZ")
     * @param {number} limit
     * @returns {{ deleted: number, failed: number }}
     */
    deleteGuestsCreatedBefore(cutoff, limit) {
      const records = app.findRecordsByFilter(
        USERS,
        'guest = true && created < {:cutoff}',
        'created',
        limit,
        0,
        { cutoff },
      );
      let deleted = 0;
      let failed = 0;
      for (const record of records) {
        if (!record) continue;
        try {
          app.delete(record);
          deleted += 1;
        } catch (error) {
          failed += 1;
          app.logger().error('Failed to delete an expired guest.', 'error', String(error));
        }
      }
      return { deleted, failed };
    },

    /** @param {string} userId */
    sendVerification(userId) {
      $mails.sendRecordVerification(app, app.findRecordById(USERS, userId));
    },
  };
}

module.exports = { createUserRepository };
