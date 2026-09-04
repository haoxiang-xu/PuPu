// memory_agent_settings — persisted Memory V2 curator preferences.
//
// The curator is an internal worker of the optional Unchain Memory module. It
// is not an Agent Builder node. Core prompt, toolkits, and permissions are not
// stored here; this namespace only retains the existing preference payload:
//   { displayName, additionalInstructions, provider, modelId }
//
// Empty provider  → provider default (runtime decides).
// Empty modelId   → current chat model fallback.
//
// All persistence goes through settings_repository (namespace
// "memory_agent_v2") — never through bare localStorage. Write failures are
// NEVER swallowed here: updateMemoryAgentSettings returns the repository's
// persistence promise so a future settings surface can expose the error.

import {
  readNamespace,
  updateNamespace,
  subscribeSettings,
} from "./settings_repository";

const MEMORY_AGENT_NAMESPACE = "memory_agent_v2";

export const DEFAULT_MEMORY_AGENT_DISPLAY_NAME = "Memory Agent";

const isPlainObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const asString = (value) => (typeof value === "string" ? value : "");

/**
 * Normalize any raw record into the canonical shape. Missing / corrupted
 * fields fall back to safe defaults; a blank display name falls back to the
 * default so the internal trace label never renders nameless.
 */
export const normalizeMemoryAgentSettings = (raw) => {
  const source = isPlainObject(raw) ? raw : {};
  const displayName = asString(source.displayName).trim();
  return {
    displayName: displayName || DEFAULT_MEMORY_AGENT_DISPLAY_NAME,
    additionalInstructions: asString(source.additionalInstructions),
    provider: asString(source.provider).trim(),
    modelId: asString(source.modelId).trim(),
  };
};

export const readMemoryAgentSettings = () =>
  normalizeMemoryAgentSettings(readNamespace(MEMORY_AGENT_NAMESPACE, {}));

/**
 * Merge a partial patch into the stored record and persist it.
 * Returns the repository persistence promise — callers MUST handle rejection
 * to keep write failures visible.
 */
export const updateMemoryAgentSettings = (patch = {}) =>
  updateNamespace(MEMORY_AGENT_NAMESPACE, (current) =>
    normalizeMemoryAgentSettings({
      ...(isPlainObject(current) ? current : {}),
      ...(isPlainObject(patch) ? patch : {}),
    }),
  );

/**
 * Subscribe to memory-agent settings changes. The listener receives the
 * normalized settings object. Returns an unsubscribe function.
 */
export const subscribeMemoryAgentSettings = (listener) => {
  if (typeof listener !== "function") {
    return () => {};
  }
  return subscribeSettings(({ namespace }) => {
    if (namespace !== MEMORY_AGENT_NAMESPACE) return;
    listener(readMemoryAgentSettings());
  });
};
