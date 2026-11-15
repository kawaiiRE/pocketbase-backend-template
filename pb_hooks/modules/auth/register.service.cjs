const { createAppError } = require('../shared/http-error.cjs');
const { parseRegistrationInput } = require('./register.validation.cjs');

/**
 * @typedef {import('../shared/env.cjs').FeatureFlags} FeatureFlags
 * @typedef {import('./register.validation.cjs').RegistrationInput} RegistrationInput
 * @typedef {import('./user.repository.cjs').UserEntity} UserEntity
 *
 * @typedef UserStore
 * @property {(email: string) => boolean} emailExists
 * @property {(input: RegistrationInput) => UserEntity} create
 * @property {(userId: string) => void} sendVerification
 *
 * @typedef RegisterDependencies
 * @property {FeatureFlags} features
 * @property {UserStore} users
 * @property {(message: string, error: unknown) => void} logError
 */

/** @param {string} email */
function emailTaken(email) {
  return createAppError(409, 'EMAIL_TAKEN', `An account with ${email} already exists.`);
}

/**
 * Self-service registration workflow. The users collection keeps createRule = null, so this
 * route is the only non-superuser way to create accounts.
 *
 * @param {Record<string, unknown>} body
 * @param {RegisterDependencies} deps
 * @returns {UserEntity}
 */
function registerUser(body, deps) {
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
    user = deps.users.create(input);
  } catch (error) {
    // A concurrent registration can win the unique index between the check and the insert.
    if (deps.users.emailExists(input.email)) {
      throw emailTaken(input.email);
    }
    throw error;
  }

  if (deps.features.requireEmailVerification) {
    try {
      deps.users.sendVerification(user.id);
    } catch (error) {
      // The account exists; the client can resend through the native request-verification API.
      deps.logError('Failed to send the registration verification email.', error);
    }
  }

  return user;
}

module.exports = { registerUser };
