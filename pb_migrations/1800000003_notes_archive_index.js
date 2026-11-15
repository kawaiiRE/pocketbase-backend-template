/// <reference path="../generated/types.d.ts" />

migrate(
  (app) => {
    const notes = app.findCollectionByNameOrId('notes');

    // Supports owner-scoped lists filtered by archived and sorted by updated. Text search with
    // `title ~ "..." || body ~ "..."` uses LIKE and scans only the rows this index narrows to.
    notes.addIndex('idx_notes_owner_archived_updated', false, 'owner, archived, updated', '');
    app.save(notes);
  },
  () => {
    throw new Error('Destructive rollback requires an isolated restore from a verified backup.');
  },
);
