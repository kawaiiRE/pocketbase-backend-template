import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { renderAuthEmail } = require('../pb_hooks/modules/mail/auth-email.cjs');

const values = {
  appName: 'Notes <App>',
  appUrl: 'https://app.example.com',
  token: 'header.payload.signature',
  info: '',
};

describe('renderAuthEmail', () => {
  it('keeps the collection template for English and unset locales', () => {
    expect(renderAuthEmail('verification', 'en', values)).toBeNull();
    expect(renderAuthEmail('passwordReset', '', values)).toBeNull();
  });

  it.each([
    ['verification', '/verify-email'],
    ['passwordReset', '/reset-password'],
    ['emailChange', '/confirm-email-change'],
  ])('renders an Arabic %s email linking to the frontend', (kind, path) => {
    const email = renderAuthEmail(kind, 'ar', values);
    expect(email?.subject).toContain('Notes <App>');
    expect(email?.html).toContain('dir="rtl" lang="ar"');
    expect(email?.html).toContain(
      `href="https://app.example.com${path}?token=header.payload.signature"`,
    );
    expect(email?.html).toContain('Notes &lt;App&gt;');
    expect(email?.html).not.toContain('<App>');
  });

  it('renders the login alert with escaped details and no action link', () => {
    const email = renderAuthEmail('authAlert', 'ar', {
      ...values,
      token: '',
      info: '<b>Chrome</b>',
    });
    expect(email?.html).toContain('&lt;b&gt;Chrome&lt;/b&gt;');
    expect(email?.html).not.toContain('href=');
  });
});
