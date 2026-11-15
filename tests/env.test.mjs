import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  readFeatureFlags,
  readGuestSettings,
  readRuntimeSettings,
} = require('../pb_hooks/modules/shared/env.cjs');

/** @param {Record<string, string>} values */
const env = (values) => (/** @type {string} */ name) => values[name] ?? '';

describe('readFeatureFlags', () => {
  it('defaults registration, verification, and guests to disabled', () => {
    expect(readFeatureFlags(env({}))).toEqual({
      registrationEnabled: false,
      requireEmailVerification: false,
      guestEnabled: false,
    });
  });

  it('parses explicit boolean values', () => {
    expect(
      readFeatureFlags(
        env({ PB_REGISTRATION_ENABLED: ' TRUE ', PB_REQUIRE_EMAIL_VERIFICATION: '1' }),
      ),
    ).toEqual({ registrationEnabled: true, requireEmailVerification: true, guestEnabled: false });
    expect(readFeatureFlags(env({ PB_GUEST_ENABLED: 'true' })).guestEnabled).toBe(true);
    expect(readFeatureFlags(env({ PB_REGISTRATION_ENABLED: '0' })).registrationEnabled).toBe(false);
  });

  it('rejects ambiguous boolean values without echoing them', () => {
    expect(() => readFeatureFlags(env({ PB_REGISTRATION_ENABLED: 'yes-please' }))).toThrow(
      'PB_REGISTRATION_ENABLED must be "true" or "false".',
    );
  });
});

describe('readGuestSettings', () => {
  it('defaults the guest lifetime to 24 hours', () => {
    expect(readGuestSettings(env({}))).toEqual({ ttlHours: 24 });
  });

  it('accepts whole and fractional hours within bounds', () => {
    expect(readGuestSettings(env({ PB_GUEST_TTL_HOURS: '720' })).ttlHours).toBe(720);
    expect(readGuestSettings(env({ PB_GUEST_TTL_HOURS: '0.01' })).ttlHours).toBe(0.01);
  });

  it.each(['0', '0.001', '721', '-1', '1e3', 'soon'])('rejects %s', (value) => {
    expect(() => readGuestSettings(env({ PB_GUEST_TTL_HOURS: value }))).toThrow(
      'PB_GUEST_TTL_HOURS',
    );
  });
});

describe('readRuntimeSettings', () => {
  it('leaves every setting untouched when variables are unset', () => {
    expect(readRuntimeSettings(env({}))).toEqual({
      appName: null,
      appUrl: null,
      senderName: null,
      senderAddress: null,
      smtp: null,
      trustedProxyHeaders: null,
    });
  });

  it('normalizes the app URL, sender, SMTP, and proxy headers', () => {
    const settings = readRuntimeSettings(
      env({
        PB_APP_NAME: 'Example App',
        PB_APP_URL: 'https://app.example.com/',
        PB_MAIL_SENDER_NAME: 'Example',
        PB_MAIL_SENDER_ADDRESS: 'no-reply@example.com',
        PB_SMTP_HOST: 'smtp.example.com',
        PB_SMTP_PORT: '465',
        PB_SMTP_USERNAME: 'mailer',
        PB_SMTP_PASSWORD: ' secret ',
        PB_SMTP_AUTH_METHOD: 'login',
        PB_TRUSTED_PROXY_HEADERS: 'X-Forwarded-For, X-Real-IP',
      }),
    );

    expect(settings).toEqual({
      appName: 'Example App',
      appUrl: 'https://app.example.com',
      senderName: 'Example',
      senderAddress: 'no-reply@example.com',
      smtp: {
        host: 'smtp.example.com',
        port: 465,
        username: 'mailer',
        password: ' secret ',
        tls: true,
        authMethod: 'LOGIN',
      },
      trustedProxyHeaders: ['X-Forwarded-For', 'X-Real-IP'],
    });
  });

  it('defaults SMTP to port 587 without implicit TLS for local relays such as Mailpit', () => {
    const settings = readRuntimeSettings(env({ PB_SMTP_HOST: '127.0.0.1', PB_SMTP_PORT: '1025' }));
    expect(settings.smtp).toEqual({
      host: '127.0.0.1',
      port: 1025,
      username: '',
      password: '',
      tls: false,
      authMethod: 'PLAIN',
    });
    expect(readRuntimeSettings(env({ PB_SMTP_HOST: 'smtp.example.com' })).smtp?.port).toBe(587);
  });

  it.each([
    [{ PB_APP_NAME: 'x'.repeat(256) }, 'PB_APP_NAME'],
    [{ PB_APP_URL: 'app.example.com' }, 'PB_APP_URL'],
    [{ PB_APP_URL: 'https://app.example.com/?next=1' }, 'PB_APP_URL'],
    [{ PB_MAIL_SENDER_ADDRESS: 'not-an-email' }, 'PB_MAIL_SENDER_ADDRESS'],
    [{ PB_SMTP_HOST: 'smtp.example.com', PB_SMTP_PORT: '70000' }, 'PB_SMTP_PORT'],
    [{ PB_SMTP_HOST: 'smtp.example.com', PB_SMTP_AUTH_METHOD: 'CRAM' }, 'PB_SMTP_AUTH_METHOD'],
    [{ PB_TRUSTED_PROXY_HEADERS: 'X-Forwarded-For;evil' }, 'PB_TRUSTED_PROXY_HEADERS'],
  ])('rejects invalid configuration %#', (values, variable) => {
    expect(() => readRuntimeSettings(env(values))).toThrow(variable);
  });
});
