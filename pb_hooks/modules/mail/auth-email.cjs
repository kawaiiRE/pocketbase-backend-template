/**
 * Localized auth emails. English uses the migration-managed collection templates; other locales
 * are rendered here because PocketBase stores a single template per collection.
 *
 * @typedef {'verification' | 'passwordReset' | 'emailChange' | 'authAlert'} AuthEmailKind
 *
 * @typedef AuthEmailValues
 * @property {string} appName
 * @property {string} appUrl frontend origin without a trailing slash
 * @property {string} token empty for login alerts
 * @property {string} info login alert details, empty for other kinds
 *
 * @typedef LocalizedEmail
 * @property {string} subject
 * @property {string} html
 *
 * @typedef EmailCopy
 * @property {(appName: string) => string} subject
 * @property {string[]} paragraphs
 * @property {{ label: string, path: string } | null} action
 * @property {string} ignore
 *
 * @typedef LocaleCopy
 * @property {'ltr' | 'rtl'} dir
 * @property {string} signature
 * @property {Record<AuthEmailKind, EmailCopy>} emails
 */

/** @type {Record<string, LocaleCopy>} */
const COPY = {
  ar: {
    dir: 'rtl',
    signature: 'شكرًا،<br/>فريق {APP_NAME}',
    emails: {
      verification: {
        subject: (appName) => `تأكيد بريدك الإلكتروني في ${appName}`,
        paragraphs: ['شكرًا لانضمامك إلى {APP_NAME}. أكّد عنوان بريدك الإلكتروني لإكمال التسجيل.'],
        action: { label: 'تأكيد البريد الإلكتروني', path: '/verify-email' },
        ignore: 'إذا لم تُنشئ حسابًا، يمكنك تجاهل هذه الرسالة.',
      },
      passwordReset: {
        subject: (appName) => `إعادة تعيين كلمة المرور في ${appName}`,
        paragraphs: ['استخدم الزر أدناه لاختيار كلمة مرور جديدة.'],
        action: { label: 'إعادة تعيين كلمة المرور', path: '/reset-password' },
        ignore: 'إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة.',
      },
      emailChange: {
        subject: (appName) => `تأكيد عنوان بريدك الإلكتروني الجديد في ${appName}`,
        paragraphs: ['استخدم الزر أدناه لتأكيد عنوان بريدك الإلكتروني الجديد.'],
        action: { label: 'تأكيد البريد الجديد', path: '/confirm-email-change' },
        ignore: 'إذا لم تطلب تغيير بريدك الإلكتروني، يمكنك تجاهل هذه الرسالة.',
      },
      authAlert: {
        subject: (appName) => `تسجيل دخول من موقع جديد إلى ${appName}`,
        paragraphs: ['لاحظنا تسجيل دخول إلى حسابك في {APP_NAME} من موقع جديد:', '{INFO}'],
        action: null,
        ignore:
          'إذا كنت أنت، يمكنك تجاهل هذه الرسالة. وإن لم تكن أنت، فغيّر كلمة المرور فورًا لإلغاء الوصول من جميع المواقع الأخرى.',
      },
    },
  },
};

/** @param {string} value */
function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {string} text
 * @param {AuthEmailValues} values
 */
function fill(text, values) {
  return text
    .replace(/\{APP_NAME\}/g, escapeHtml(values.appName))
    .replace(/\{INFO\}/g, escapeHtml(values.info));
}

/**
 * @param {AuthEmailKind} kind
 * @param {string} locale
 * @param {AuthEmailValues} values
 * @returns {LocalizedEmail | null} null when the collection template should be used
 */
function renderAuthEmail(kind, locale, values) {
  const localeCopy = COPY[locale];
  if (!localeCopy) return null;
  const copy = localeCopy.emails[kind];

  const lines = copy.paragraphs.map((paragraph) => `<p>${fill(paragraph, values)}</p>`);
  if (copy.action) {
    const href = `${values.appUrl}${copy.action.path}?token=${encodeURIComponent(values.token)}`;
    lines.push(
      `<p><a class="btn" href="${escapeHtml(href)}" target="_blank" rel="noopener">${copy.action.label}</a></p>`,
    );
  }
  lines.push(`<p><i>${copy.ignore}</i></p>`);
  lines.push(`<p>${fill(localeCopy.signature, values)}</p>`);

  return {
    subject: copy.subject(values.appName),
    html: `<div dir="${localeCopy.dir}" lang="${locale}">\n${lines.join('\n')}\n</div>`,
  };
}

module.exports = { renderAuthEmail };
