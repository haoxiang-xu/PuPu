const { CHANNELS } = require("../../../shared/channels");

// Memory V2 P0 vault IPC surface. Invoke/handle ONLY — no sync channel, no
// event channel, and above all NO read/resolve/decrypt handler: stored
// secrets never travel main → renderer in any form (security sign-off
// condition). DEPOSIT is the single plaintext-carrying channel and only in
// the renderer → main direction.
const MEMORY_VAULT_INVOKE_CHANNELS = Object.freeze([
  CHANNELS.MEMORY_VAULT.DEPOSIT,
  CHANNELS.MEMORY_VAULT.LIST_DESCRIPTORS,
  CHANNELS.MEMORY_VAULT.DELETE,
  CHANNELS.MEMORY_VAULT.GRANT,
  CHANNELS.MEMORY_VAULT.REVOKE,
  CHANNELS.MEMORY_VAULT.GET_STATUS,
]);

// Logging policy (stricter than the settings default, same as the provider
// secret handlers): the payload is NEVER logged — not on success, not on
// failure — and neither is error.message (a malformed payload is attacker-
// controlled and could itself contain secret material). Only the operation
// name and the stable error CODE are printed; an uncoded throw logs a stable
// placeholder.
const logFailure = (operation, error) => {
  console.warn(
    `[memory-vault] ${operation} failed:`,
    (error && error.code) || "uncoded_error",
  );
};

const registerMemoryVaultHandlers = ({ ipcMain, memoryVaultService }) => {
  if (!ipcMain || !memoryVaultService) {
    throw new Error("registerMemoryVaultHandlers: missing dependencies");
  }

  ipcMain.handle(CHANNELS.MEMORY_VAULT.DEPOSIT, async (_event, payload) => {
    try {
      return memoryVaultService.deposit(payload);
    } catch (error) {
      logFailure("deposit", error);
      throw error;
    }
  });

  ipcMain.handle(
    CHANNELS.MEMORY_VAULT.LIST_DESCRIPTORS,
    async (_event, payload) => {
      try {
        return memoryVaultService.listDescriptors(payload);
      } catch (error) {
        logFailure("list-descriptors", error);
        throw error;
      }
    },
  );

  ipcMain.handle(CHANNELS.MEMORY_VAULT.DELETE, async (_event, payload) => {
    try {
      return memoryVaultService.deleteSecret(payload);
    } catch (error) {
      logFailure("delete", error);
      throw error;
    }
  });

  ipcMain.handle(CHANNELS.MEMORY_VAULT.GRANT, async (_event, payload) => {
    try {
      return memoryVaultService.grant(payload);
    } catch (error) {
      logFailure("grant", error);
      throw error;
    }
  });

  ipcMain.handle(CHANNELS.MEMORY_VAULT.REVOKE, async (_event, payload) => {
    try {
      return memoryVaultService.revoke(payload);
    } catch (error) {
      logFailure("revoke", error);
      throw error;
    }
  });

  ipcMain.handle(CHANNELS.MEMORY_VAULT.GET_STATUS, async () => {
    try {
      return memoryVaultService.getStatus();
    } catch (error) {
      logFailure("get-status", error);
      throw error;
    }
  });
};

module.exports = {
  registerMemoryVaultHandlers,
  MEMORY_VAULT_INVOKE_CHANNELS,
};
