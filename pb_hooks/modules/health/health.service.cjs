/**
 * @typedef HealthResult
 * @property {'ok'} status
 * @property {1} apiVersion
 * @property {string} service
 * @property {string} time
 */

/**
 * @param {Date} [now]
 * @returns {HealthResult}
 */
function getHealth(now) {
  const checkedAt = now || new Date();

  return {
    status: 'ok',
    apiVersion: 1,
    service: 'pocketbase-backend-template',
    time: checkedAt.toISOString(),
  };
}

module.exports = { getHealth };
