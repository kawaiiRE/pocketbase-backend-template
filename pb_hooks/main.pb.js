/// <reference path="../generated/types.d.ts" />

// Handlers run in isolated scopes: require modules inside each handler with absolute paths.

routerAdd(
  'GET',
  '/api/v1/health',
  (event) => {
    const healthService = require(__hooks + '/modules/health/health.service.cjs');
    const healthPresenter = require(__hooks + '/modules/health/health.presenter.cjs');
    const result = healthService.getHealth();

    return event.json(200, healthPresenter.presentHealth(result));
  },
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  'GET',
  '/api/v1/config',
  (event) => {
    const { readFeatureFlags, readGuestSettings } = require(__hooks + '/modules/shared/env.cjs');
    const { presentPublicConfig } = require(__hooks + '/modules/config/config.presenter.cjs');
    const { sendError } = require(__hooks + '/modules/shared/http-error.cjs');

    try {
      const getenv = (/** @type {string} */ name) => $os.getenv(name);
      return event.json(
        200,
        presentPublicConfig(readFeatureFlags(getenv), readGuestSettings(getenv)),
      );
    } catch (error) {
      return sendError(event, error);
    }
  },
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  'POST',
  '/api/v1/auth/register',
  (event) => {
    const { readFeatureFlags } = require(__hooks + '/modules/shared/env.cjs');
    const { sendError } = require(__hooks + '/modules/shared/http-error.cjs');
    const { readJsonObjectBody } = require(__hooks + '/modules/shared/http-request.cjs');
    const { registerUser } = require(__hooks + '/modules/auth/register.service.cjs');
    const { createUserRepository } = require(__hooks + '/modules/auth/user.repository.cjs');
    const { presentRegisteredUser } = require(__hooks + '/modules/auth/user.presenter.cjs');

    try {
      const features = readFeatureFlags((/** @type {string} */ name) => $os.getenv(name));
      const body = features.registrationEnabled ? readJsonObjectBody(event) : {};
      const user = registerUser(body, {
        features,
        users: createUserRepository(event.app),
        logError: (/** @type {string} */ message, /** @type {unknown} */ error) =>
          event.app.logger().error(message, 'error', String(error)),
      });
      return event.json(201, presentRegisteredUser(user));
    } catch (error) {
      return sendError(event, error);
    }
  },
  $apis.bodyLimit(16 * 1024),
);

// Creates a guest account and responds with PocketBase's standard `{ token, record }`.
routerAdd(
  'POST',
  '/api/v1/auth/guest',
  (event) => {
    const { readFeatureFlags } = require(__hooks + '/modules/shared/env.cjs');
    const { sendError } = require(__hooks + '/modules/shared/http-error.cjs');
    const { readOptionalJsonObjectBody } = require(__hooks + '/modules/shared/http-request.cjs');
    const { createGuest } = require(__hooks + '/modules/auth/guest.service.cjs');
    const { createUserRepository } = require(__hooks + '/modules/auth/user.repository.cjs');

    /** @type {string} */
    let guestId;
    try {
      const features = readFeatureFlags((/** @type {string} */ name) => $os.getenv(name));
      const body = features.guestEnabled ? readOptionalJsonObjectBody(event) : {};
      guestId = createGuest(body, {
        features,
        users: createUserRepository(event.app),
        randomString: (/** @type {number} */ length) =>
          $security.randomStringWithAlphabet(length, 'abcdefghijklmnopqrstuvwxyz0123456789'),
      }).id;
    } catch (error) {
      return sendError(event, error);
    }
    return $apis.recordAuthResponse(event, event.app.findRecordById('users', guestId), '', null);
  },
  $apis.bodyLimit(4 * 1024),
);

// Converts the authenticated guest into a regular account in place. Responds with a fresh
// `{ token, record }`, or `202` with the user DTO when the new address must be verified first.
routerAdd(
  'POST',
  '/api/v1/auth/guest/upgrade',
  (event) => {
    const { readFeatureFlags } = require(__hooks + '/modules/shared/env.cjs');
    const { createAppError, sendError } = require(__hooks + '/modules/shared/http-error.cjs');
    const { readJsonObjectBody } = require(__hooks + '/modules/shared/http-request.cjs');
    const { upgradeGuest } = require(__hooks + '/modules/auth/guest.service.cjs');
    const { createUserRepository } = require(__hooks + '/modules/auth/user.repository.cjs');
    const { presentRegisteredUser } = require(__hooks + '/modules/auth/user.presenter.cjs');

    /** @type {string} */
    let userId;
    try {
      const auth = event.auth;
      if (!auth) {
        throw createAppError(401, 'AUTH_REQUIRED', 'Sign in as a guest first.');
      }
      if (auth.collection().name !== 'users') {
        throw createAppError(403, 'NOT_GUEST', 'Only guest accounts can be upgraded.');
      }

      const features = readFeatureFlags((/** @type {string} */ name) => $os.getenv(name));
      const user = upgradeGuest(auth.id, readJsonObjectBody(event), {
        features,
        users: createUserRepository(event.app),
        logError: (/** @type {string} */ message, /** @type {unknown} */ error) =>
          event.app.logger().error(message, 'error', String(error)),
      });
      if (features.requireEmailVerification) {
        return event.json(202, presentRegisteredUser(user));
      }
      userId = user.id;
    } catch (error) {
      return sendError(event, error);
    }
    return $apis.recordAuthResponse(event, event.app.findRecordById('users', userId), '', null);
  },
  $apis.bodyLimit(16 * 1024),
);

// Blocks every users auth method (password, OTP, OAuth2, refresh) for unverified accounts when
// PB_REQUIRE_EMAIL_VERIFICATION=true. Responds with the native 403 error shape.
onRecordAuthRequest((event) => {
  const { readFeatureFlags } = require(__hooks + '/modules/shared/env.cjs');
  const { requireEmailVerification } = readFeatureFlags((/** @type {string} */ name) =>
    $os.getenv(name),
  );

  if (requireEmailVerification && event.record && !event.record.verified()) {
    throw new ForbiddenError('Verify your email address before signing in.');
  }
  return event.next();
}, 'users');

// Guests own a generated address; they choose a real one through the upgrade route.
onRecordRequestEmailChangeRequest((event) => {
  if (event.record && event.record.getBool('guest')) {
    throw new ForbiddenError('Upgrade the guest account to set an email address.');
  }
  return event.next();
}, 'users');

onMailerRecordVerificationSend((event) => {
  require(__hooks + '/modules/mail/auth-email.hook.cjs').handleAuthEmail(event, 'verification');
}, 'users');

onMailerRecordPasswordResetSend((event) => {
  require(__hooks + '/modules/mail/auth-email.hook.cjs').handleAuthEmail(event, 'passwordReset');
}, 'users');

onMailerRecordEmailChangeSend((event) => {
  require(__hooks + '/modules/mail/auth-email.hook.cjs').handleAuthEmail(event, 'emailChange');
}, 'users');

onMailerRecordAuthAlertSend((event) => {
  require(__hooks + '/modules/mail/auth-email.hook.cjs').handleAuthEmail(event, 'authAlert');
}, 'users');

// Removes guests older than PB_GUEST_TTL_HOURS (their notes cascade). Runs even when new guests
// are disabled so existing ones still expire.
cronAdd('guestCleanup', '0 * * * *', () => {
  const { readGuestSettings } = require(__hooks + '/modules/shared/env.cjs');
  const { cleanupExpiredGuests } = require(__hooks + '/modules/auth/guest.service.cjs');
  const { createUserRepository } = require(__hooks + '/modules/auth/user.repository.cjs');

  const { ttlHours } = readGuestSettings((/** @type {string} */ name) => $os.getenv(name));
  const result = cleanupExpiredGuests({
    users: createUserRepository($app),
    ttlHours,
    now: new Date(),
  });
  if (result.deleted > 0 || result.failed > 0) {
    $app
      .logger()
      .info('Expired guest accounts removed.', 'deleted', result.deleted, 'failed', result.failed);
  }
});

// Applies environment-managed settings (app name and URL for email links, sender, SMTP, trusted
// proxy headers) at every start. Invalid values stop the process instead of running misconfigured.
onBootstrap((event) => {
  event.next();

  const { readFeatureFlags, readGuestSettings, readRuntimeSettings } = require(
    __hooks + '/modules/shared/env.cjs',
  );
  const { applyRuntimeSettings } = require(__hooks + '/modules/settings/runtime-settings.cjs');

  const getenv = (/** @type {string} */ name) => $os.getenv(name);
  const flags = readFeatureFlags(getenv);
  readGuestSettings(getenv);
  const runtime = readRuntimeSettings(getenv);
  const settings = event.app.settings();
  const changed = applyRuntimeSettings(settings, runtime);
  if (changed.length > 0) {
    event.app.save(settings);
    event.app.logger().info('Applied environment settings.', 'groups', changed.join(','));
  }

  if (flags.requireEmailVerification && !settings.smtp.enabled) {
    event.app.logger().warn('PB_REQUIRE_EMAIL_VERIFICATION is enabled but SMTP is not configured.');
  }
  if (settings.rateLimits.enabled && settings.trustedProxy.headers.length === 0) {
    event.app
      .logger()
      .warn(
        'Rate limits use the connecting IP. Behind a gateway set PB_TRUSTED_PROXY_HEADERS, ' +
          'or all users share one limit.',
      );
  }
});
