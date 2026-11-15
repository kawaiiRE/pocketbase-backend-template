/**
 * @typedef {import('../shared/env.cjs').FeatureFlags} FeatureFlags
 * @typedef {import('../shared/env.cjs').GuestSettings} GuestSettings
 *
 * @typedef PublicFeatures
 * @property {boolean} registration
 * @property {boolean} emailVerification
 * @property {boolean} guest
 * @property {number} guestTtlHours lifetime of a guest account before cleanup
 *
 * @typedef PublicConfigResponse
 * @property {1} apiVersion
 * @property {PublicFeatures} features
 */

/**
 * @param {FeatureFlags} flags
 * @param {GuestSettings} guest
 * @returns {PublicConfigResponse}
 */
function presentPublicConfig(flags, guest) {
  return {
    apiVersion: 1,
    features: {
      registration: flags.registrationEnabled === true,
      emailVerification: flags.requireEmailVerification === true,
      guest: flags.guestEnabled === true,
      guestTtlHours: guest.ttlHours,
    },
  };
}

module.exports = { presentPublicConfig };
