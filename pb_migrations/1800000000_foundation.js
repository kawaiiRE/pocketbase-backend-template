/// <reference path="../generated/types.d.ts" />

migrate(
  (app) => {
    /**
     * @param {{ name: string, type: string, [key: string]: unknown }} definition
     * @returns {core.Collection}
     */
    const defineCollection = (definition) => {
      app.importCollectionsByMarshaledJSON(JSON.stringify([definition]), false);
      return app.findCollectionByNameOrId(definition.name);
    };

    const ownUserRule = '@request.auth.collectionName = "users" && id = @request.auth.id';
    const users = defineCollection({
      name: 'users',
      type: 'auth',
      listRule: ownUserRule,
      viewRule: ownUserRule,
      createRule: null,
      updateRule: ownUserRule,
      deleteRule: null,
      passwordAuth: { enabled: true, identityFields: ['email'] },
      authToken: { duration: 604800 },
      fields: [{ name: 'name', type: 'text', required: true, min: 2, max: 120 }],
    });
    app.save(users);

    const ownNoteRule = '@request.auth.collectionName = "users" && owner = @request.auth.id';
    const createNoteRule =
      '@request.auth.collectionName = "users" && @request.body.owner = @request.auth.id';

    app.save(
      defineCollection({
        name: 'notes',
        type: 'base',
        listRule: ownNoteRule,
        viewRule: ownNoteRule,
        createRule: createNoteRule,
        updateRule: ownNoteRule,
        deleteRule: ownNoteRule,
        fields: [
          {
            name: 'owner',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: 'title', type: 'text', required: true, min: 1, max: 160 },
          { name: 'body', type: 'text', max: 20000 },
          { name: 'archived', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_notes_owner_updated ON notes (owner, updated)'],
      }),
    );

    const settings = app.settings();
    settings.meta.appName = 'PocketBase backend template';
    settings.logs.maxDays = 7;
    settings.logs.logIP = false;
    app.save(settings);

    const recoveryEmail = $os.getenv('PB_SUPERUSER_EMAIL');
    const recoveryPassword = $os.getenv('PB_SUPERUSER_PASSWORD');
    if (recoveryEmail || recoveryPassword) {
      if (!recoveryEmail || !recoveryPassword || recoveryPassword.length < 24) {
        throw new Error('Recovery credentials must include an email and a 24+ character password.');
      }

      const recoveryUser = new Record(app.findCollectionByNameOrId('_superusers'));
      recoveryUser.setEmail(recoveryEmail);
      recoveryUser.setPassword(recoveryPassword);
      app.save(recoveryUser);
    }
  },
  () => {
    throw new Error('Destructive rollback requires an isolated restore from a verified backup.');
  },
);
