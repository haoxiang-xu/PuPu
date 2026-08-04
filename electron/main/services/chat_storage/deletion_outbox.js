// Durable cross-store chat deletion coordinator.
//
// The renderer only asks the chat store to delete a chat. The local chat rows
// and this outbox record are committed in the same chats.db transaction; the
// main process then finishes Context V2 and chat-scoped Vault cleanup in the
// background. No method in this module is registered as IPC.

const OUTBOX_STATUS = Object.freeze({
  PENDING: "pending",
  RETRY: "retry",
  COMPLETE: "complete",
});

const STATIC_ERROR_CODES = Object.freeze({
  CONTEXT: "context_delete_failed",
  VAULT_USE_STATE: "vault_use_state_delete_failed",
  VAULT_LIST: "vault_list_failed",
  VAULT_DELETE: "vault_delete_failed",
  STATE: "deletion_outbox_state_failed",
});

const CHAT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RECEIPT_LIMIT = 256;
const RETRY_BASE_MS = 250;
const RETRY_CAP_MS = 60 * 1000;
const IDLE_POLL_MS = 1000;
const MAX_WAKE_MS = 5000;

const codedError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

// The frozen chat-id contract. It is exported (rather than re-spelled by
// callers) because any store that can be IMPORTED must also be DELETABLE: a
// chat whose id this predicate rejects could never be enqueued here, so it
// could never be cleaned out of Context V2 or the Vault. Import-time
// validation and deletion-time validation must therefore be the same rule,
// from the same place.
const isValidChatId = (chatId) =>
  typeof chatId === "string" && CHAT_ID_PATTERN.test(chatId);

const validateChatId = (chatId) => {
  if (!isValidChatId(chatId)) {
    throw codedError(
      "chat_deletion_invalid_chat_id",
      "chat deletion requires a valid chat identifier",
    );
  }
};

const isPutForChat = (op) =>
  op?.type === "put_chat_meta" || op?.type === "put_messages";

const createChatDeletionOutbox = ({ getDb, crypto } = {}) => {
  if (typeof getDb !== "function" || !crypto) {
    throw new Error("createChatDeletionOutbox: missing dependencies");
  }

  let deletionTargets = null;
  let runnerEnabled = false;
  let runnerTimer = null;
  let processing = false;

  const now = () => Date.now();

  const newDeletionId = () => crypto.randomBytes(16).toString("hex");

  const vaultDeleteOperationId = (deletionId, handle) =>
    `vaultdel_${crypto
      .createHash("sha256")
      .update(`${deletionId}\u0000${handle}`, "utf8")
      .digest("hex")}`;

  const findActiveDeletion = (chatId) =>
    getDb()
      .prepare(
        "SELECT deletion_id, operation_id FROM chat_deletion_outbox " +
          "WHERE owner_chat_id = ? AND status != ? " +
          "ORDER BY created_at DESC LIMIT 1",
      )
      .get(chatId, OUTBOX_STATUS.COMPLETE);

  const enqueue = (chatId) => {
    validateChatId(chatId);
    const existing = findActiveDeletion(chatId);
    if (existing) {
      return {
        deletionId: existing.deletion_id,
        operationId: existing.operation_id,
        replayed: true,
      };
    }

    const deletionId = newDeletionId();
    const operationId = `ctxdel_${deletionId}`;
    const stamp = now();
    getDb()
      .prepare(
        "INSERT INTO chat_deletion_outbox(" +
          "deletion_id, owner_chat_id, operation_id, context_done, " +
          "vault_done, status, retry_count, next_attempt_at, " +
          "last_error_code, receipt_json, created_at, updated_at, completed_at" +
          ") VALUES (?, ?, ?, 0, 0, ?, 0, ?, NULL, ?, ?, ?, NULL)",
      )
      .run(
        deletionId,
        chatId,
        operationId,
        OUTBOX_STATUS.PENDING,
        stamp,
        JSON.stringify({ contextDone: false, vaultDone: false }),
        stamp,
        stamp,
      );
    return { deletionId, operationId, replayed: false };
  };

  const assertChatWritable = (chatId) => {
    if (findActiveDeletion(chatId)) {
      throw codedError(
        "chat_deletion_pending",
        "chat cannot be recreated while deletion is pending",
      );
    }
  };

  const assertOpWritable = (op) => {
    if (isPutForChat(op)) {
      assertChatWritable(op.chatId);
      return;
    }
    if (op?.type === "import_store") {
      for (const chatId of Object.keys(op.store?.chatsById || {})) {
        assertChatWritable(chatId);
      }
    }
  };

  const configureDeletionTargets = ({
    unchainService,
    memoryVaultService,
  } = {}) => {
    if (
      !unchainService ||
      typeof unchainService.deleteContextV2Chat !== "function" ||
      !memoryVaultService ||
      typeof memoryVaultService.deleteUseStateForOwnerChat !== "function" ||
      typeof memoryVaultService.listDescriptors !== "function" ||
      typeof memoryVaultService.deleteSecret !== "function"
    ) {
      throw new Error("configureDeletionTargets: missing dependencies");
    }
    deletionTargets = { unchainService, memoryVaultService };
  };

  const receiptFor = (row, updates = {}) => ({
    contextDone:
      updates.contextDone === undefined
        ? Number(row.context_done) === 1
        : updates.contextDone,
    vaultDone:
      updates.vaultDone === undefined
        ? Number(row.vault_done) === 1
        : updates.vaultDone,
    ...(Number.isSafeInteger(updates.vaultDeleted)
      ? { vaultDeleted: updates.vaultDeleted }
      : {}),
  });

  const persistProgress = (row, fields) => {
    const stamp = now();
    const contextDone = fields.contextDone
      ? 1
      : Number(row.context_done) === 1
        ? 1
        : 0;
    const vaultDone = fields.vaultDone
      ? 1
      : Number(row.vault_done) === 1
        ? 1
        : 0;
    getDb()
      .prepare(
        "UPDATE chat_deletion_outbox SET context_done = ?, vault_done = ?, " +
          "status = ?, last_error_code = NULL, receipt_json = ?, updated_at = ? " +
          "WHERE deletion_id = ?",
      )
      .run(
        contextDone,
        vaultDone,
        OUTBOX_STATUS.PENDING,
        JSON.stringify(receiptFor(row, fields)),
        stamp,
        row.deletion_id,
      );
    row.context_done = contextDone;
    row.vault_done = vaultDone;
  };

  const retryDelay = (retryCount) =>
    Math.min(
      RETRY_BASE_MS * 2 ** Math.min(Math.max(retryCount, 0), 16),
      RETRY_CAP_MS,
    );

  const persistRetry = (row, errorCode) => {
    const retryCount = Number(row.retry_count) + 1;
    const stamp = now();
    const nextAttemptAt = stamp + retryDelay(retryCount - 1);
    getDb()
      .prepare(
        "UPDATE chat_deletion_outbox SET status = ?, retry_count = ?, " +
          "next_attempt_at = ?, last_error_code = ?, updated_at = ? " +
          "WHERE deletion_id = ?",
      )
      .run(
        OUTBOX_STATUS.RETRY,
        retryCount,
        nextAttemptAt,
        errorCode,
        stamp,
        row.deletion_id,
      );
    // Never log the chat id, handle, upstream error message, or response.
    console.warn(`[chat-deletion-outbox] ${errorCode}`);
    return nextAttemptAt;
  };

  const pruneReceipts = () => {
    getDb()
      .prepare(
        "DELETE FROM chat_deletion_outbox WHERE status = ? AND deletion_id " +
          "NOT IN (SELECT deletion_id FROM chat_deletion_outbox " +
          "WHERE status = ? ORDER BY completed_at DESC, deletion_id DESC LIMIT ?)",
      )
      .run(OUTBOX_STATUS.COMPLETE, OUTBOX_STATUS.COMPLETE, RECEIPT_LIMIT);
  };

  const persistComplete = (row, vaultDeleted) => {
    const stamp = now();
    getDb()
      .prepare(
        "UPDATE chat_deletion_outbox SET context_done = 1, vault_done = 1, " +
          "status = ?, last_error_code = NULL, receipt_json = ?, " +
          "updated_at = ?, completed_at = ? WHERE deletion_id = ?",
      )
      .run(
        OUTBOX_STATUS.COMPLETE,
        JSON.stringify(
          receiptFor(row, {
            contextDone: true,
            vaultDone: true,
            vaultDeleted,
          }),
        ),
        stamp,
        stamp,
        row.deletion_id,
      );
    pruneReceipts();
  };

  const nextDue = () =>
    getDb()
      .prepare(
        "SELECT deletion_id, owner_chat_id, operation_id, context_done, " +
          "vault_done, retry_count, next_attempt_at FROM chat_deletion_outbox " +
          "WHERE status != ? AND next_attempt_at <= ? " +
          "ORDER BY next_attempt_at ASC, created_at ASC LIMIT 1",
      )
      .get(OUTBOX_STATUS.COMPLETE, now());

  const processDeletionOutboxOnce = async () => {
    if (processing) return { processed: false, reason: "busy" };
    if (!deletionTargets) {
      throw new Error("deletion outbox targets are not configured");
    }
    const row = nextDue();
    if (!row) return { processed: false, reason: "not_due" };

    processing = true;
    try {
      if (Number(row.context_done) !== 1) {
        try {
          const result = await deletionTargets.unchainService.deleteContextV2Chat({
            ownerChatId: row.owner_chat_id,
            operationId: row.operation_id,
          });
          if (
            !result ||
            result.deleted !== true ||
            result.owner_chat_id !== row.owner_chat_id
          ) {
            throw new Error("invalid context deletion response");
          }
          persistProgress(row, { contextDone: true });
        } catch (_error) {
          const nextAttemptAt = persistRetry(row, STATIC_ERROR_CODES.CONTEXT);
          return {
            processed: true,
            completed: false,
            errorCode: STATIC_ERROR_CODES.CONTEXT,
            nextAttemptAt,
          };
        }
      }

      try {
        const result =
          deletionTargets.memoryVaultService.deleteUseStateForOwnerChat(
            row.owner_chat_id,
          );
        if (
          !result ||
          result.ok !== true ||
          result.ownerChatId !== row.owner_chat_id ||
          !Number.isSafeInteger(result.deletedIntents) ||
          result.deletedIntents < 0 ||
          !Number.isSafeInteger(result.deletedReceipts) ||
          result.deletedReceipts < 0
        ) {
          throw new Error("invalid vault use-state deletion response");
        }
      } catch (_error) {
        const nextAttemptAt = persistRetry(
          row,
          STATIC_ERROR_CODES.VAULT_USE_STATE,
        );
        return {
          processed: true,
          completed: false,
          errorCode: STATIC_ERROR_CODES.VAULT_USE_STATE,
          nextAttemptAt,
        };
      }

      let descriptors;
      try {
        const result = deletionTargets.memoryVaultService.listDescriptors({
          scopeKind: "chat",
          scopeId: row.owner_chat_id,
        });
        if (!result || result.ok !== true || !Array.isArray(result.descriptors)) {
          throw new Error("invalid vault descriptor response");
        }
        descriptors = result.descriptors;
      } catch (_error) {
        const nextAttemptAt = persistRetry(row, STATIC_ERROR_CODES.VAULT_LIST);
        return {
          processed: true,
          completed: false,
          errorCode: STATIC_ERROR_CODES.VAULT_LIST,
          nextAttemptAt,
        };
      }

      let deleted = 0;
      for (const descriptor of descriptors) {
        try {
          const result = await deletionTargets.memoryVaultService.deleteSecret({
            operationId: vaultDeleteOperationId(
              row.deletion_id,
              descriptor?.handle,
            ),
            handle: descriptor?.handle,
          });
          if (
            !result ||
            result.ok !== true ||
            result.handle !== descriptor?.handle
          ) {
            throw new Error("invalid vault deletion response");
          }
          deleted += 1;
        } catch (_error) {
          const nextAttemptAt = persistRetry(
            row,
            STATIC_ERROR_CODES.VAULT_DELETE,
          );
          return {
            processed: true,
            completed: false,
            errorCode: STATIC_ERROR_CODES.VAULT_DELETE,
            nextAttemptAt,
          };
        }
      }

      persistProgress(row, { vaultDone: true, vaultDeleted: deleted });
      persistComplete(row, deleted);
      return { processed: true, completed: true };
    } catch (_error) {
      try {
        const nextAttemptAt = persistRetry(row, STATIC_ERROR_CODES.STATE);
        return {
          processed: true,
          completed: false,
          errorCode: STATIC_ERROR_CODES.STATE,
          nextAttemptAt,
        };
      } catch (_persistError) {
        console.warn(`[chat-deletion-outbox] ${STATIC_ERROR_CODES.STATE}`);
        return {
          processed: true,
          completed: false,
          errorCode: STATIC_ERROR_CODES.STATE,
        };
      }
    } finally {
      processing = false;
    }
  };

  const nextWakeDelay = () => {
    let row;
    try {
      row = getDb()
        .prepare(
          "SELECT MIN(next_attempt_at) AS next_attempt_at " +
            "FROM chat_deletion_outbox WHERE status != ?",
        )
        .get(OUTBOX_STATUS.COMPLETE);
    } catch (_error) {
      return IDLE_POLL_MS;
    }
    if (row?.next_attempt_at === null || row?.next_attempt_at === undefined) {
      return IDLE_POLL_MS;
    }
    return Math.min(
      Math.max(Number(row.next_attempt_at) - now(), 0),
      MAX_WAKE_MS,
    );
  };

  const schedule = (delay) => {
    if (!runnerEnabled || runnerTimer) return;
    runnerTimer = setTimeout(() => {
      runnerTimer = null;
      void runLoop();
    }, delay);
    if (typeof runnerTimer?.unref === "function") runnerTimer.unref();
  };

  const runLoop = async () => {
    if (!runnerEnabled) return;
    try {
      await processDeletionOutboxOnce();
    } catch (_error) {
      console.warn(`[chat-deletion-outbox] ${STATIC_ERROR_CODES.STATE}`);
    }
    schedule(nextWakeDelay());
  };

  const startDeletionOutboxRunner = () => {
    if (!deletionTargets) {
      throw new Error("deletion outbox targets are not configured");
    }
    if (runnerEnabled) return;
    runnerEnabled = true;
    schedule(0);
  };

  const stopDeletionOutboxRunner = () => {
    runnerEnabled = false;
    if (runnerTimer) {
      clearTimeout(runnerTimer);
      runnerTimer = null;
    }
  };

  return {
    enqueue,
    assertOpWritable,
    configureDeletionTargets,
    processDeletionOutboxOnce,
    startDeletionOutboxRunner,
    stopDeletionOutboxRunner,
  };
};

module.exports = {
  createChatDeletionOutbox,
  isValidChatId,
  CHAT_DELETION_OUTBOX_STATUS: OUTBOX_STATUS,
};
