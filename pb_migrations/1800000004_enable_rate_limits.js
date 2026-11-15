/// <reference path="../generated/types.d.ts" />

migrate(
  (app) => {
    const settings = app.settings();

    // Limits are per client IP and per fixed window (seconds). Behind a gateway, configure
    // PB_TRUSTED_PROXY_HEADERS or every client shares the gateway's address.
    settings.rateLimits.enabled = true;
    const rules = [
      { label: 'POST /api/v1/auth/register', audience: '', duration: 900, maxRequests: 5 },
      { label: '*:auth', audience: '', duration: 60, maxRequests: 10 },
      { label: '*:authRefresh', audience: '', duration: 60, maxRequests: 30 },
      { label: '*:requestPasswordReset', audience: '', duration: 900, maxRequests: 3 },
      { label: '*:confirmPasswordReset', audience: '', duration: 900, maxRequests: 10 },
      { label: '*:requestVerification', audience: '', duration: 900, maxRequests: 3 },
      { label: '*:confirmVerification', audience: '', duration: 900, maxRequests: 10 },
      { label: '*:requestEmailChange', audience: '', duration: 900, maxRequests: 3 },
      { label: '*:confirmEmailChange', audience: '', duration: 900, maxRequests: 10 },
      { label: '*:requestOTP', audience: '', duration: 900, maxRequests: 3 },
      { label: '*:create', audience: '', duration: 60, maxRequests: 30 },
      { label: '/api/batch', audience: '', duration: 1, maxRequests: 3 },
      { label: '/api/', audience: '', duration: 10, maxRequests: 300 },
    ];
    // Plain objects are converted to Go RateLimitRule structs by the JSVM.
    settings.rateLimits.rules = /** @type {core.RateLimitRule[]} */ (
      /** @type {unknown} */ (rules)
    );
    app.save(settings);
  },
  () => {
    throw new Error('Destructive rollback requires an isolated restore from a verified backup.');
  },
);
