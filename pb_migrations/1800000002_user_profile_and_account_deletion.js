/// <reference path="../generated/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    users.fields.add(
      new SelectField({
        name: 'locale',
        required: false,
        maxSelect: 1,
        values: ['en', 'ar'],
      }),
    );

    // Users may delete their own account; notes cascade through the owner relation.
    users.deleteRule = '@request.auth.collectionName = "users" && id = @request.auth.id';

    // Email links target the separate frontend origin configured through PB_APP_URL.
    users.verificationTemplate.body = [
      '<p>Hello,</p>',
      '<p>Thank you for joining {APP_NAME}. Confirm your email address to finish signing up.</p>',
      '<p><a class="btn" href="{APP_URL}/verify-email?token={TOKEN}" target="_blank" rel="noopener">Verify email</a></p>',
      "<p><i>If you didn't create an account, you can ignore this email.</i></p>",
      '<p>Thanks,<br/>{APP_NAME} team</p>',
    ].join('\n');

    users.resetPasswordTemplate.body = [
      '<p>Hello,</p>',
      '<p>Use the button below to choose a new password.</p>',
      '<p><a class="btn" href="{APP_URL}/reset-password?token={TOKEN}" target="_blank" rel="noopener">Reset password</a></p>',
      "<p><i>If you didn't ask to reset your password, you can ignore this email.</i></p>",
      '<p>Thanks,<br/>{APP_NAME} team</p>',
    ].join('\n');

    users.confirmEmailChangeTemplate.body = [
      '<p>Hello,</p>',
      '<p>Use the button below to confirm your new email address.</p>',
      '<p><a class="btn" href="{APP_URL}/confirm-email-change?token={TOKEN}" target="_blank" rel="noopener">Confirm new email</a></p>',
      "<p><i>If you didn't ask to change your email address, you can ignore this email.</i></p>",
      '<p>Thanks,<br/>{APP_NAME} team</p>',
    ].join('\n');

    app.save(users);
  },
  () => {
    throw new Error('Destructive rollback requires an isolated restore from a verified backup.');
  },
);
