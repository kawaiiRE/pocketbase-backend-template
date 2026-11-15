import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { parseRegistrationInput } = require('../pb_hooks/modules/auth/register.validation.cjs');
const { registerUser } = require('../pb_hooks/modules/auth/register.service.cjs');
const { presentRegisteredUser } = require('../pb_hooks/modules/auth/user.presenter.cjs');
const { toErrorResponse } = require('../pb_hooks/modules/shared/http-error.cjs');

const validBody = {
  name: '  Ada Lovelace ',
  email: ' Ada@Example.COM ',
  password: 'correct horse',
};

/** @param {() => unknown} action */
function errorResponseOf(action) {
  try {
    action();
  } catch (error) {
    return toErrorResponse(error);
  }
  throw new Error('Expected the action to throw.');
}

/**
 * @param {{ existing?: string[], registrationEnabled?: boolean, requireEmailVerification?: boolean }} [options]
 */
function setup(options = {}) {
  const existing = new Set(options.existing ?? []);
  const users = {
    emailExists: vi.fn((/** @type {string} */ email) => existing.has(email)),
    create: vi.fn((/** @type {{ name: string, email: string, password: string }} */ input) => {
      existing.add(input.email);
      return {
        id: 'user1234567890a',
        email: input.email,
        name: input.name,
        locale: '',
        verified: false,
        guest: false,
        created: '2026-10-18 12:00:00.000Z',
      };
    }),
    sendVerification: vi.fn(),
  };
  const logError = vi.fn();
  const deps = {
    features: {
      registrationEnabled: options.registrationEnabled ?? true,
      requireEmailVerification: options.requireEmailVerification ?? false,
    },
    users,
    logError,
  };
  return { deps, users, logError };
}

describe('parseRegistrationInput', () => {
  it('trims the name, normalizes the email, and keeps the password verbatim', () => {
    expect(parseRegistrationInput({ ...validBody, role: 'admin', verified: true })).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'correct horse',
      locale: '',
    });
  });

  it('accepts a supported locale and treats null or "" as no preference', () => {
    expect(parseRegistrationInput({ ...validBody, locale: 'ar' }).locale).toBe('ar');
    expect(parseRegistrationInput({ ...validBody, locale: null }).locale).toBe('');
    expect(parseRegistrationInput({ ...validBody, locale: '' }).locale).toBe('');
  });

  it('rejects unsupported locales', () => {
    const response = errorResponseOf(() => parseRegistrationInput({ ...validBody, locale: 'fr' }));
    expect(response.body.fields).toEqual({ locale: 'Locale must be one of: en, ar.' });
  });

  it('reserves the guest email domain', () => {
    expect(() =>
      parseRegistrationInput({ ...validBody, email: 'guest-abc@guest.invalid' }),
    ).toThrow();
  });

  it('reports every invalid field', () => {
    const response = errorResponseOf(() =>
      parseRegistrationInput({ name: 'A', email: 'a@b', password: 'short' }),
    );
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: 'Check the highlighted fields.',
      code: 'INVALID_INPUT',
      fields: {
        name: 'Name must be 2 to 120 characters.',
        email: 'Enter a valid email address.',
        password: 'Password must be 8 to 71 characters.',
      },
    });
  });

  it('rejects non-string values', () => {
    const response = errorResponseOf(() =>
      parseRegistrationInput({ name: 42, email: ['a@example.com'], password: null }),
    );
    expect(Object.keys(response.body.fields ?? {})).toEqual(['name', 'email', 'password']);
  });

  it('enforces the name length in characters, not UTF-16 units', () => {
    expect(parseRegistrationInput({ ...validBody, name: '😀😀' }).name).toBe('😀😀');
    expect(() => parseRegistrationInput({ ...validBody, name: 'x'.repeat(121) })).toThrow();
    expect(parseRegistrationInput({ ...validBody, name: 'x'.repeat(120) }).name).toHaveLength(120);
  });

  it('enforces the PocketBase bcrypt password limit of 71 bytes', () => {
    expect(
      parseRegistrationInput({ ...validBody, password: 'p'.repeat(71) }).password,
    ).toHaveLength(71);
    expect(() => parseRegistrationInput({ ...validBody, password: 'p'.repeat(72) })).toThrow();
    expect(() => parseRegistrationInput({ ...validBody, password: 'é'.repeat(36) })).toThrow();
  });

  it('rejects malformed email addresses', () => {
    for (const email of [
      'plain',
      'a@b',
      'a b@example.com',
      'a@example..com',
      `${'a'.repeat(250)}@x.io`,
    ]) {
      expect(() => parseRegistrationInput({ ...validBody, email })).toThrow();
    }
  });
});

describe('registerUser', () => {
  it('refuses registration when the feature is disabled before reading input', () => {
    const { deps, users } = setup({ registrationEnabled: false });
    const response = errorResponseOf(() => registerUser({}, deps));
    expect(response).toMatchObject({
      status: 403,
      body: { code: 'REGISTRATION_DISABLED', message: 'Registration is currently disabled.' },
    });
    expect(users.create).not.toHaveBeenCalled();
  });

  it('creates an unverified user from allowlisted input', () => {
    const { deps, users } = setup();
    const user = registerUser(validBody, deps);
    expect(users.create).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'correct horse',
      locale: '',
    });
    expect(user.verified).toBe(false);
    expect(users.sendVerification).not.toHaveBeenCalled();
  });

  it('returns 409 for an existing email', () => {
    const { deps, users } = setup({ existing: ['ada@example.com'] });
    const response = errorResponseOf(() => registerUser(validBody, deps));
    expect(response).toMatchObject({ status: 409, body: { code: 'EMAIL_TAKEN' } });
    expect(users.create).not.toHaveBeenCalled();
  });

  it('maps a lost unique-index race to 409', () => {
    const { deps, users } = setup();
    users.create.mockImplementationOnce(() => {
      users.emailExists.mockReturnValue(true);
      throw new Error('UNIQUE constraint failed: users.email');
    });
    expect(errorResponseOf(() => registerUser(validBody, deps)).status).toBe(409);
  });

  it('keeps unexpected persistence failures as safe 500 responses', () => {
    const { deps, users } = setup();
    users.create.mockImplementationOnce(() => {
      throw new Error('disk I/O error at /var/lib/secret');
    });
    expect(errorResponseOf(() => registerUser(validBody, deps))).toEqual({
      status: 500,
      expected: false,
      body: { message: 'Something went wrong. Try again later.', code: 'INTERNAL_ERROR' },
    });
  });

  it('sends a verification email when verification is required', () => {
    const { deps, users } = setup({ requireEmailVerification: true });
    registerUser(validBody, deps);
    expect(users.sendVerification).toHaveBeenCalledWith('user1234567890a');
  });

  it('still returns the account when the verification email fails', () => {
    const { deps, users, logError } = setup({ requireEmailVerification: true });
    users.sendVerification.mockImplementationOnce(() => {
      throw new Error('SMTP unavailable');
    });
    expect(registerUser(validBody, deps).email).toBe('ada@example.com');
    expect(logError).toHaveBeenCalledOnce();
  });
});

describe('presentRegisteredUser', () => {
  it('allowlists fields and converts the PocketBase timestamp to ISO 8601', () => {
    expect(
      presentRegisteredUser({
        id: 'user1234567890a',
        email: 'ada@example.com',
        name: 'Ada',
        locale: 'ar',
        verified: false,
        guest: false,
        created: '2026-10-18 12:00:00.000Z',
        tokenKey: 'secret',
      }),
    ).toEqual({
      id: 'user1234567890a',
      email: 'ada@example.com',
      name: 'Ada',
      locale: 'ar',
      verified: false,
      guest: false,
      createdAt: '2026-10-18T12:00:00.000Z',
    });
  });
});
