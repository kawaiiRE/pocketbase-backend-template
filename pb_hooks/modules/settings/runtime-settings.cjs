/**
 * @typedef {import('../shared/env.cjs').RuntimeSettings} RuntimeSettings
 *
 * Structural subset of PocketBase core.Settings touched by environment configuration.
 * @typedef MutableSettings
 * @property {{ appName: string, appURL: string, senderName: string, senderAddress: string }} meta
 * @property {{ enabled: boolean, host: string, port: number, username: string, password: string, tls: boolean, authMethod: string }} smtp
 * @property {{ headers: ArrayLike<string> }} trustedProxy
 */

/**
 * Go slices exposed to the JSVM are array-like, so compare by index instead of Array methods.
 *
 * @param {ArrayLike<string>} current
 * @param {string[]} next
 */
function sameList(current, next) {
  if (!current || current.length !== next.length) return false;
  for (let index = 0; index < next.length; index += 1) {
    if (current[index] !== next[index]) return false;
  }
  return true;
}

/**
 * Applies environment-managed values to the settings object in place.
 *
 * @param {MutableSettings} settings
 * @param {RuntimeSettings} runtime
 * @returns {string[]} names of the changed setting groups (never values)
 */
function applyRuntimeSettings(settings, runtime) {
  /** @type {Set<string>} */
  const changed = new Set();

  if (runtime.appName && settings.meta.appName !== runtime.appName) {
    settings.meta.appName = runtime.appName;
    changed.add('meta');
  }
  if (runtime.appUrl && settings.meta.appURL !== runtime.appUrl) {
    settings.meta.appURL = runtime.appUrl;
    changed.add('meta');
  }
  if (runtime.senderName && settings.meta.senderName !== runtime.senderName) {
    settings.meta.senderName = runtime.senderName;
    changed.add('meta');
  }
  if (runtime.senderAddress && settings.meta.senderAddress !== runtime.senderAddress) {
    settings.meta.senderAddress = runtime.senderAddress;
    changed.add('meta');
  }

  const smtp = runtime.smtp;
  if (smtp) {
    const current = settings.smtp;
    if (
      !current.enabled ||
      current.host !== smtp.host ||
      current.port !== smtp.port ||
      current.username !== smtp.username ||
      current.password !== smtp.password ||
      current.tls !== smtp.tls ||
      current.authMethod !== smtp.authMethod
    ) {
      current.enabled = true;
      current.host = smtp.host;
      current.port = smtp.port;
      current.username = smtp.username;
      current.password = smtp.password;
      current.tls = smtp.tls;
      current.authMethod = smtp.authMethod;
      changed.add('smtp');
    }
  }

  const headers = runtime.trustedProxyHeaders;
  if (headers && !sameList(settings.trustedProxy.headers, headers)) {
    settings.trustedProxy.headers = headers;
    changed.add('trustedProxy');
  }

  return Array.from(changed);
}

module.exports = { applyRuntimeSettings };
