/**
 * @typedef HealthResult
 * @property {'ok'} status
 * @property {1} apiVersion
 * @property {string} service
 * @property {string} time
 */

/**
 * @param {HealthResult} result
 * @returns {HealthResult}
 */
function presentHealth(result) {
  return {
    status: result.status,
    apiVersion: result.apiVersion,
    service: result.service,
    time: result.time,
  };
}

module.exports = { presentHealth };
