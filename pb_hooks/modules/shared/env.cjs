/**
 * Environment parsing shared by hooks. Pure functions: callers pass a getenv function so the
 * same code runs inside the PocketBase JSVM ($os.getenv) and in Node tests.
 *
 * @typedef {(name: string) => string} GetEnv
 *
 * @typedef FeatureFlags
 * @property {boolean} registrationEnabled
 * @property {boolean} requireEmailVerification
 * @property {boolean} guestEnabled
 *
 * @typedef GuestSettings
 * @property {number} ttlHours
 *
 * @typedef SmtpSettings
 * @property {string} host
 * @property {number} port
 * @property {string} username
 * @property {string} password
 * @property {boolean} tls
 * @property {'PLAIN' | 'LOGIN'} authMethod
 *
 * @typedef RuntimeSettings
 * @property {string | null} appName
 * @property {string | null} appUrl
 * @property {string | null} senderName
 * @property {string | null} senderAddress
 * @property {SmtpSettings | null} smtp
 * @property {string[] | null} trustedProxyHeaders
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HTTP_URL_PATTERN = /^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/;
const HEADER_NAME_PATTERN = /^[A-Za-z0-9-]+$/;
const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;
const GUEST_TTL_DEFAULT_HOURS = 24;
const GUEST_TTL_MIN_HOURS = 0.01;
const GUEST_TTL_MAX_HOURS = 720;

/**
 * @param {GetEnv} getenv
 * @param {string} name
 * @returns {string}
 */
function read(getenv, name) {
  const value = getenv(name);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {GetEnv} getenv
 * @param {string} name
 * @param {boolean} fallback
 * @returns {boolean}
 */
function readBoolean(getenv, name, fallback) {
  const value = read(getenv, name).toLowerCase();
  if (value === '') return fallback;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new Error(`${name} must be "true" or "false".`);
}

/**
 * @param {GetEnv} getenv
 * @returns {FeatureFlags}
 */
function readFeatureFlags(getenv) {
  return {
    registrationEnabled: readBoolean(getenv, 'PB_REGISTRATION_ENABLED', false),
    requireEmailVerification: readBoolean(getenv, 'PB_REQUIRE_EMAIL_VERIFICATION', false),
    guestEnabled: readBoolean(getenv, 'PB_GUEST_ENABLED', false),
  };
}

/**
 * @param {GetEnv} getenv
 * @returns {GuestSettings}
 */
function readGuestSettings(getenv) {
  const raw = read(getenv, 'PB_GUEST_TTL_HOURS');
  if (raw === '') return { ttlHours: GUEST_TTL_DEFAULT_HOURS };

  const ttlHours = Number(raw);
  if (
    !DECIMAL_PATTERN.test(raw) ||
    ttlHours < GUEST_TTL_MIN_HOURS ||
    ttlHours > GUEST_TTL_MAX_HOURS
  ) {
    throw new Error(
      `PB_GUEST_TTL_HOURS must be a number of hours from ${GUEST_TTL_MIN_HOURS} through ${GUEST_TTL_MAX_HOURS}.`,
    );
  }
  return { ttlHours };
}

/**
 * @param {GetEnv} getenv
 * @returns {SmtpSettings | null}
 */
function readSmtp(getenv) {
  const host = read(getenv, 'PB_SMTP_HOST');
  if (!host) return null;

  const rawPort = read(getenv, 'PB_SMTP_PORT') || '587';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || port < 1 || port > 65535) {
    throw new Error('PB_SMTP_PORT must be an integer from 1 through 65535.');
  }

  const authMethod = (read(getenv, 'PB_SMTP_AUTH_METHOD') || 'PLAIN').toUpperCase();
  if (authMethod !== 'PLAIN' && authMethod !== 'LOGIN') {
    throw new Error('PB_SMTP_AUTH_METHOD must be PLAIN or LOGIN.');
  }

  return {
    host,
    port,
    username: read(getenv, 'PB_SMTP_USERNAME'),
    password: getenv('PB_SMTP_PASSWORD') || '',
    tls: readBoolean(getenv, 'PB_SMTP_TLS', port === 465),
    authMethod,
  };
}

/**
 * Settings that, when present, are applied to PocketBase at every start. Unset variables leave
 * the stored (dashboard-managed) value untouched.
 *
 * @param {GetEnv} getenv
 * @returns {RuntimeSettings}
 */
function readRuntimeSettings(getenv) {
  const appName = read(getenv, 'PB_APP_NAME');
  if (appName.length > 255) {
    throw new Error('PB_APP_NAME must be at most 255 characters.');
  }

  const appUrl = read(getenv, 'PB_APP_URL').replace(/\/+$/, '');
  if (appUrl && !HTTP_URL_PATTERN.test(appUrl)) {
    throw new Error('PB_APP_URL must be an absolute http(s) URL without query or fragment.');
  }

  const senderAddress = read(getenv, 'PB_MAIL_SENDER_ADDRESS');
  if (senderAddress && !EMAIL_PATTERN.test(senderAddress)) {
    throw new Error('PB_MAIL_SENDER_ADDRESS must be an email address.');
  }

  const senderName = read(getenv, 'PB_MAIL_SENDER_NAME');
  if (senderName.length > 255) {
    throw new Error('PB_MAIL_SENDER_NAME must be at most 255 characters.');
  }

  const rawHeaders = read(getenv, 'PB_TRUSTED_PROXY_HEADERS');
  const trustedProxyHeaders = rawHeaders
    ? rawHeaders
        .split(',')
        .map((header) => header.trim())
        .filter((header) => header.length > 0)
    : null;
  if (trustedProxyHeaders && trustedProxyHeaders.some((h) => !HEADER_NAME_PATTERN.test(h))) {
    throw new Error('PB_TRUSTED_PROXY_HEADERS must be a comma-separated list of header names.');
  }

  return {
    appName: appName || null,
    appUrl: appUrl || null,
    senderName: senderName || null,
    senderAddress: senderAddress || null,
    smtp: readSmtp(getenv),
    trustedProxyHeaders,
  };
}

module.exports = { readFeatureFlags, readGuestSettings, readRuntimeSettings };
