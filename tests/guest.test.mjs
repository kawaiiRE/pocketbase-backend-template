import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  createGuest,
  upgradeGuest,
  cleanupExpiredGuests,
} = require('../pb_hooks/modules/auth/guest.service.cjs');
const { toErrorResponse } = require('../pb_hooks/modules/shared/http-error.cjs');

/** @param {() => unknown} action */
function errorResponseOf(action) {
  try {
    action();
  } catch (error) {
    return toErrorResponse(error);
  }
  throw new Error('Expected the action to throw.');
}

/** @param {Partial<{ registrationEnabled: boolean, requireEmailVerification: boolean, guestEnabled: boolean }>} [flags] */
function features(flags = {}) {
  return {
    registrationEnabled: true,
    requireEmailVerification: false,
    guestEnabled: true,
    ...flags,
  };
}

/** @param {{ guest?: boolean, existing?: string[] }} [options] */
function store(options = {}) {
  const existing = new Set(options.existing ?? []);
  const guest = {
    id: 'guest1234567890',
    email: 'guest-abc@guest.invalid',
    name: 'Guest',
    locale: /** @type {''} */ (''),
    verified: true,
    guest: options.guest ?? true,
    created: '2026-10-18 12:00:00.000Z',
  };
  return {
    emailExists: vi.fn((/** @type {string} */ email) => existing.has(email)),
    findById: vi.fn((/** @type {string} */ id) => (id === guest.id ? guest : null)),
    createGuest: vi.fn((/** @type {{ email: string, name: string, locale: string }} */ input) => ({
      ...guest,
      ...input,
    })),
    upgradeGuest: vi.fn(
      (/** @type {string} */ id, /** @type {{ email: string, name: string }} */ input) => ({
        ...guest,
        id,
        email: input.email,
        name: input.name,
        verified: false,
        guest: false,
      }),
    ),
    sendVerification: vi.fn(),
  };
}

const upgradeBody = { name: 'Ada', email: 'Ada@Example.com', password: 'correct horse' };

describe('createGuest', () => {
  it('refuses when guests are disabled', () => {
    const users = store();
    const response = errorResponseOf(() =>
      createGuest(
        {},
        { features: features({ guestEnabled: false }), users, randomString: () => 'x' },
      ),
    );
    expect(response).toMatchObject({ status: 403, body: { code: 'GUEST_DISABLED' } });
    expect(users.createGuest).not.toHaveBeenCalled();
  });

  it('generates an identity on the reserved domain with a localized name', () => {
    const users = store();
    const randomString = vi.fn(() => 'a'.repeat(24));
    createGuest({ locale: 'ar' }, { features: features(), users, randomString });
    expect(randomString).toHaveBeenCalledWith(24);
    expect(users.createGuest).toHaveBeenCalledWith({
      email: `guest-${'a'.repeat(24)}@guest.invalid`,
      name: 'ضيف',
      locale: 'ar',
    });
    createGuest({}, { features: features(), users, randomString });
    expect(users.createGuest).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Guest', locale: '' }),
    );
  });

  it('rejects an unsupported locale', () => {
    const response = errorResponseOf(() =>
      createGuest(
        { locale: 'xx' },
        { features: features(), users: store(), randomString: () => 'x' },
      ),
    );
    expect(response).toMatchObject({ status: 400, body: { code: 'INVALID_INPUT' } });
  });
});

describe('upgradeGuest', () => {
  const logError = vi.fn();

  it('rejects accounts that are not guests', () => {
    const users = store({ guest: false });
    for (const id of ['guest1234567890', 'unknown00000000']) {
      const response = errorResponseOf(() =>
        upgradeGuest(id, upgradeBody, { features: features(), users, logError }),
      );
      expect(response).toMatchObject({ status: 403, body: { code: 'NOT_GUEST' } });
    }
    expect(users.upgradeGuest).not.toHaveBeenCalled();
  });

  it('requires open registration', () => {
    const response = errorResponseOf(() =>
      upgradeGuest('guest1234567890', upgradeBody, {
        features: features({ registrationEnabled: false }),
        users: store(),
        logError,
      }),
    );
    expect(response).toMatchObject({ status: 403, body: { code: 'REGISTRATION_DISABLED' } });
  });

  it('validates input like registration and maps taken emails to 409', () => {
    const invalid = errorResponseOf(() =>
      upgradeGuest(
        'guest1234567890',
        { name: 'A' },
        { features: features(), users: store(), logError },
      ),
    );
    expect(invalid.status).toBe(400);
    const taken = errorResponseOf(() =>
      upgradeGuest('guest1234567890', upgradeBody, {
        features: features(),
        users: store({ existing: ['ada@example.com'] }),
        logError,
      }),
    );
    expect(taken).toMatchObject({ status: 409, body: { code: 'EMAIL_TAKEN' } });
  });

  it('maps a lost unique-index race to 409', () => {
    const users = store();
    users.upgradeGuest.mockImplementationOnce(() => {
      users.emailExists.mockReturnValue(true);
      throw new Error('UNIQUE constraint failed');
    });
    const response = errorResponseOf(() =>
      upgradeGuest('guest1234567890', upgradeBody, { features: features(), users, logError }),
    );
    expect(response.status).toBe(409);
  });

  it('upgrades in place and sends verification only when required', () => {
    const users = store();
    const user = upgradeGuest('guest1234567890', upgradeBody, {
      features: features(),
      users,
      logError,
    });
    expect(users.upgradeGuest).toHaveBeenCalledWith('guest1234567890', {
      name: 'Ada',
      email: 'ada@example.com',
      password: 'correct horse',
      locale: '',
    });
    expect(user).toMatchObject({ id: 'guest1234567890', guest: false });
    expect(users.sendVerification).not.toHaveBeenCalled();

    upgradeGuest('guest1234567890', upgradeBody, {
      features: features({ requireEmailVerification: true }),
      users,
      logError,
    });
    expect(users.sendVerification).toHaveBeenCalledWith('guest1234567890');
  });
});

describe('cleanupExpiredGuests', () => {
  it('deletes guests created before the TTL cutoff in batches', () => {
    const deleteGuestsCreatedBefore = vi
      .fn()
      .mockReturnValueOnce({ deleted: 100, failed: 0 })
      .mockReturnValueOnce({ deleted: 7, failed: 0 });
    const result = cleanupExpiredGuests({
      users: { deleteGuestsCreatedBefore },
      ttlHours: 24,
      now: new Date('2026-10-18T12:00:00.000Z'),
    });
    expect(result).toEqual({ deleted: 107, failed: 0 });
    expect(deleteGuestsCreatedBefore).toHaveBeenCalledWith('2026-10-17 12:00:00.000Z', 100);
    expect(deleteGuestsCreatedBefore).toHaveBeenCalledTimes(2);
  });

  it('stops when a batch deletes nothing so persistent failures cannot loop', () => {
    const deleteGuestsCreatedBefore = vi.fn(() => ({ deleted: 0, failed: 100 }));
    const result = cleanupExpiredGuests({
      users: { deleteGuestsCreatedBefore },
      ttlHours: 1,
      now: new Date(),
    });
    expect(result).toEqual({ deleted: 0, failed: 100 });
    expect(deleteGuestsCreatedBefore).toHaveBeenCalledOnce();
  });
});
