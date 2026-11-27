# Agent and Workflow deletion

The library uses Delete for Agents, Workflows and historical archived items. The existing confirmation asks about permanent deletion. There is no Archive or Restore action. Deleting the open resource clears its inspector and unsaved editor.

BC-001 follows the existing renderer facade and preload bridge into Main, then authenticated DELETE /skeleton_resources/v2/<resource_id>. The closed request contains expected_edit_token. The closed success reply is {ok: true}. Main validates both shapes and the managed-source capability handshake. Unknown fields, missing tokens, authentication failures and stale edits refuse the operation.

BC-002 covers the Store transaction. After CAS, delete the resource and its own published versions and outgoing dependency rows. External draft and published references refuse with resource_referenced and identify the caller. Other resources and immutable shared source blobs remain valid. Store schema v4 allows the authorized transaction to remove managed versions while ordinary SQL connections still refuse deletion. Upgrade v3 triggers within the same transaction.

SEQ-001 covers confirmation, stale-token rejection, successful deletion, repeat deletion and cold reopening. Rejection leaves every table unchanged. Deleted legacy identities retain their migration and alias records plus a deletion marker so startup cannot re-create them or send an old chat back to a legacy file. The old recipe listing excludes those deleted identities. Saved execution snapshots remain detached from the library.

AC-001 uses actual SQLite stores for native, migrated, managed-source, published, referenced, stale and cold-reopen cases. AC-002 exercises authenticated Flask responses through strict Main/preload validation. AC-003 verifies the explorer's Delete action, Cancel, successful removal, failure retention and clearing the selected resource.

Model execution, approvals and provider changes are not applicable to this library mutation. Existing frozen execution/source snapshots are checked for readable bytes after deletion. All tests use disposable data and offline runtime fixtures. A packaged release still needs its exact deployed wheel pair.
