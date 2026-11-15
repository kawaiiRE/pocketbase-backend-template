const { createAppError } = require('../shared/http-error.cjs');

/**
 * @typedef {'' | 'en' | 'ar'} Locale
 *
 * @typedef RegistrationInput
 * @property {string} name
 * @property {string} email
 * @property {string} password
 * @property {Locale} locale
 */

const NAME_MIN = 2;
const NAME_MAX = 120;
const EMAIL_MAX = 254;
const PASSWORD_MIN = 8;
// PocketBase stores bcrypt hashes and rejects passwords above 71 UTF-8 bytes.
const PASSWORD_MAX_BYTES = 71;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const LOCALES = ['en', 'ar'];
// Reserved (RFC 2606) domain for generated guest identities; it can never receive mail.
const GUEST_EMAIL_DOMAIN = 'guest.invalid';

/** @param {string} value */
function codePointLength(value) {
  return Array.from(value).length;
}

/** @param {string} value */
function utf8ByteLength(value) {
  let bytes = 0;
  for (const character of value) {
    const codePoint = /** @type {number} */ (character.codePointAt(0));
    bytes += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/**
 * Reads the optional `locale` key. Missing, null, and "" mean "no preference".
 *
 * @param {Record<string, unknown>} body
 * @param {Record<string, string>} fields collects the field error
 * @returns {Locale}
 */
function readLocale(body, fields) {
  const value = body.locale;
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string' && LOCALES.includes(value)) return /** @type {Locale} */ (value);
  fields.locale = `Locale must be one of: ${LOCALES.join(', ')}.`;
  return '';
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Locale}
 */
function parseLocaleInput(body) {
  /** @type {Record<string, string>} */
  const fields = {};
  const locale = readLocale(body, fields);
  if (fields.locale) {
    throw createAppError(400, 'INVALID_INPUT', 'Check the highlighted fields.', fields);
  }
  return locale;
}

/**
 * Allowlists and validates the registration body. Unknown keys are ignored.
 *
 * @param {Record<string, unknown>} body
 * @returns {RegistrationInput}
 */
function parseRegistrationInput(body) {
  /** @type {Record<string, string>} */
  const fields = {};

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const nameLength = codePointLength(name);
  if (nameLength < NAME_MIN || nameLength > NAME_MAX) {
    fields.name = `Name must be ${NAME_MIN} to ${NAME_MAX} characters.`;
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (
    email.length === 0 ||
    email.length > EMAIL_MAX ||
    !EMAIL_PATTERN.test(email) ||
    email.endsWith(`@${GUEST_EMAIL_DOMAIN}`)
  ) {
    fields.email = 'Enter a valid email address.';
  }

  const password = typeof body.password === 'string' ? body.password : '';
  if (codePointLength(password) < PASSWORD_MIN || utf8ByteLength(password) > PASSWORD_MAX_BYTES) {
    fields.password = `Password must be ${PASSWORD_MIN} to ${PASSWORD_MAX_BYTES} characters.`;
  }

  const locale = readLocale(body, fields);

  if (Object.keys(fields).length > 0) {
    throw createAppError(400, 'INVALID_INPUT', 'Check the highlighted fields.', fields);
  }

  return { name, email, password, locale };
}

module.exports = {
  parseRegistrationInput,
  parseLocaleInput,
  GUEST_EMAIL_DOMAIN,
};
