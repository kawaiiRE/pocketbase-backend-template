/**
 * @typedef {import('./user.repository.cjs').UserEntity} UserEntity
 *
 * @typedef RegisteredUserResponse
 * @property {string} id
 * @property {string} email
 * @property {string} name
 * @property {'' | 'en' | 'ar'} locale
 * @property {boolean} verified
 * @property {boolean} guest
 * @property {string} createdAt ISO 8601 UTC timestamp
 */

/**
 * PocketBase stores datetimes as "YYYY-MM-DD HH:MM:SS.sssZ"; the custom API returns ISO 8601.
 *
 * @param {string} value
 * @returns {string}
 */
function toIsoTimestamp(value) {
  return value.replace(' ', 'T');
}

/**
 * @param {UserEntity} user
 * @returns {RegisteredUserResponse}
 */
function presentRegisteredUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    locale: user.locale || '',
    verified: user.verified === true,
    guest: user.guest === true,
    createdAt: toIsoTimestamp(user.created),
  };
}

module.exports = { presentRegisteredUser, toIsoTimestamp };
