/// <reference path="../generated/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    // Existing accounts receive the column default (false).
    users.fields.add(new BoolField({ name: 'guest', required: false }));

    // Only superusers and the guest routes change `guest`. Guests cannot set an email or
    // password through the record API; they use POST /api/v1/auth/guest/upgrade instead.
    users.updateRule =
      '@request.auth.collectionName = "users" && id = @request.auth.id && ' +
      '@request.body.guest:isset = false && ' +
      '(guest = false || (@request.body.email:isset = false && @request.body.password:isset = false))';

    // Raster images only (SVG can carry scripts), at most 2 MiB. Stored files are untouched.
    const avatar = /** @type {core.FileField | null} */ (users.fields.getByName('avatar'));
    if (avatar) {
      avatar.maxSize = 2 * 1024 * 1024;
      avatar.mimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    }

    // Serves the hourly expired-guest cleanup.
    users.addIndex('idx_users_guest_created', false, 'guest, created', '');
    app.save(users);

    const guestLimits = [
      { label: 'POST /api/v1/auth/guest', audience: '', duration: 3600, maxRequests: 10 },
      { label: 'POST /api/v1/auth/guest/upgrade', audience: '', duration: 900, maxRequests: 5 },
    ];
    const labels = guestLimits.map((limit) => limit.label);
    const settings = app.settings();
    const kept = [];
    for (const limit of settings.rateLimits.rules) {
      if (!labels.includes(limit.label)) kept.push(limit);
    }
    // Plain objects are converted to Go RateLimitRule structs by the JSVM.
    settings.rateLimits.rules = /** @type {core.RateLimitRule[]} */ (
      /** @type {unknown} */ (guestLimits.concat(/** @type {any[]} */ (kept)))
    );
    app.save(settings);
  },
  () => {
    throw new Error('Destructive rollback requires an isolated restore from a verified backup.');
  },
);
