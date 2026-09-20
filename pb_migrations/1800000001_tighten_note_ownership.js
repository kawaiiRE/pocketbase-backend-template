/// <reference path="../generated/types.d.ts" />

migrate(
  (app) => {
    const notes = app.findCollectionByNameOrId('notes');
    notes.updateRule =
      '@request.auth.collectionName = "users" && owner = @request.auth.id && ' +
      '(@request.body.owner:isset = false || @request.body.owner = @request.auth.id)';
    app.save(notes);
  },
  () => {
    throw new Error('Destructive rollback requires an isolated restore from a verified backup.');
  },
);
