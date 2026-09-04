const { CHANNELS } = require("../../shared/channels");

// window.memoryVaultAPI — Memory V2 P0 vault control plane. Exactly six
// methods: deposit / listDescriptors / delete / grant / revoke / getStatus.
// There is deliberately NO read/resolve/decrypt method: stored secrets never
// travel main → renderer in any form (security sign-off condition).
//
// Every payload is REBUILT from an explicit field allowlist before it crosses
// the renderer → main boundary (same hardening as the settings quit-drain
// path): extra fields on a caller-supplied object can never smuggle data onto
// the channel. deposit is the single method that carries plaintext, and only
// renderer → main for immediate encryption.
//
// P0 follow-up hardening: listDescriptors and grant are SCOPE-BOUND — both
// always forward scopeKind + scopeId, so no call shape on this surface can
// enumerate the vault globally or grant across scopes. grant targets a
// controlled `sinkKind` enum (validated in main); the old free-text `grantee`
// field is gone from the allowlist entirely.
const createMemoryVaultBridge = (ipcRenderer) => {
  if (!ipcRenderer) {
    throw new Error("createMemoryVaultBridge: ipcRenderer is required");
  }

  const deposit = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.MEMORY_VAULT.DEPOSIT, {
      operationId: payload.operationId,
      scopeKind: payload.scopeKind,
      scopeId: payload.scopeId,
      label: payload.label,
      plaintext: payload.plaintext,
    });

  // Scope-bound: both fields are ALWAYS forwarded (never conditionally
  // omitted) so a missing scope arrives as an explicit undefined and main
  // rejects it. There is no "list everything" call shape to construct.
  const listDescriptors = (filter = {}) =>
    ipcRenderer.invoke(CHANNELS.MEMORY_VAULT.LIST_DESCRIPTORS, {
      scopeKind: filter ? filter.scopeKind : undefined,
      scopeId: filter ? filter.scopeId : undefined,
    });

  const deleteSecret = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.MEMORY_VAULT.DELETE, {
      operationId: payload.operationId,
      handle: payload.handle,
    });

  // Scope-bound grant against a controlled sink kind. `grantee` no longer
  // exists on this surface: an arbitrary string can never reach main, because
  // the field is not on the allowlist at all.
  const grant = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.MEMORY_VAULT.GRANT, {
      operationId: payload.operationId,
      scopeKind: payload.scopeKind,
      scopeId: payload.scopeId,
      handle: payload.handle,
      sinkKind: payload.sinkKind,
    });

  const revoke = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.MEMORY_VAULT.REVOKE, {
      operationId: payload.operationId,
      grantId: payload.grantId,
    });

  const getStatus = () =>
    ipcRenderer.invoke(CHANNELS.MEMORY_VAULT.GET_STATUS);

  return {
    deposit,
    listDescriptors,
    delete: deleteSecret,
    grant,
    revoke,
    getStatus,
  };
};

module.exports = { createMemoryVaultBridge };
