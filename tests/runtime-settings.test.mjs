import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { applyRuntimeSettings } = require('../pb_hooks/modules/settings/runtime-settings.cjs');

function defaultSettings() {
  return {
    meta: {
      appName: 'PocketBase backend template',
      appURL: 'http://localhost:8090',
      senderName: 'Support',
      senderAddress: 'support@example.com',
    },
    smtp: {
      enabled: false,
      host: 'smtp.example.com',
      port: 587,
      username: '',
      password: '',
      tls: false,
      authMethod: '',
    },
    trustedProxy: { headers: /** @type {string[]} */ ([]) },
  };
}

const unset = {
  appName: null,
  appUrl: null,
  senderName: null,
  senderAddress: null,
  smtp: null,
  trustedProxyHeaders: null,
};

describe('applyRuntimeSettings', () => {
  it('changes nothing when no environment settings are provided', () => {
    const settings = defaultSettings();
    expect(applyRuntimeSettings(settings, unset)).toEqual([]);
    expect(settings).toEqual(defaultSettings());
  });

  it('applies provided values and reports changed groups only', () => {
    const settings = defaultSettings();
    const changed = applyRuntimeSettings(settings, {
      ...unset,
      appName: 'Example App',
      appUrl: 'http://localhost:3000',
      smtp: {
        host: '127.0.0.1',
        port: 1025,
        username: '',
        password: '',
        tls: false,
        authMethod: 'PLAIN',
      },
      trustedProxyHeaders: ['X-Forwarded-For'],
    });

    expect(changed).toEqual(['meta', 'smtp', 'trustedProxy']);
    expect(settings.meta.appName).toBe('Example App');
    expect(settings.meta.appURL).toBe('http://localhost:3000');
    expect(settings.meta.senderName).toBe('Support');
    expect(settings.smtp).toMatchObject({ enabled: true, host: '127.0.0.1', port: 1025 });
    expect(settings.trustedProxy.headers).toEqual(['X-Forwarded-For']);
  });

  it('is idempotent so unchanged settings are not saved again', () => {
    const settings = defaultSettings();
    const runtime = { ...unset, appUrl: 'https://app.example.com', trustedProxyHeaders: ['X-A'] };
    applyRuntimeSettings(settings, runtime);
    expect(applyRuntimeSettings(settings, runtime)).toEqual([]);
  });
});
