const { renderAuthEmail } = require('./auth-email.cjs');

/**
 * Shared handler for the users auth mailer hooks. Guests have undeliverable generated
 * addresses, so their emails are dropped by not continuing the hook chain. Other emails are
 * localized from the recipient's `locale` when a translation exists.
 *
 * @param {core.MailerRecordEvent} event
 * @param {import('./auth-email.cjs').AuthEmailKind} kind
 */
function handleAuthEmail(event, kind) {
  const record = event.record;
  if (record && record.getBool('guest')) {
    event.app.logger().info('Skipped an auth email for a guest account.', 'kind', kind);
    return;
  }

  if (record && event.message) {
    const meta = event.meta || {};
    const settings = event.app.settings();
    const localized = renderAuthEmail(kind, record.getString('locale'), {
      appName: settings.meta.appName,
      appUrl: settings.meta.appURL.replace(/\/+$/, ''),
      token: typeof meta.token === 'string' ? meta.token : '',
      info: typeof meta.info === 'string' ? meta.info : '',
    });
    if (localized) {
      event.message.subject = localized.subject;
      event.message.html = localized.html;
    }
  }
  event.next();
}

module.exports = { handleAuthEmail };
