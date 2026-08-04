// memory_agent_settings — Memory V2 P0 system-agent configuration.
//
// The Memory Agent is a SYSTEM agent surfaced in the Agent Builder (System
// Agents group). Its core prompt / toolkits / permissions are managed by PuPu
// and are NOT stored here — only the small user-tunable surface is:
//   { displayName, additionalInstructions, provider, modelId }
//
// Empty provider  → provider default (runtime decides).
// Empty modelId   → current chat model fallback.
//
// All persistence goes through settings_repository (namespace
// "memory_agent_v2") — never through bare localStorage. Write failures are
// NEVER swallowed here: updateMemoryAgentSettings returns the repository's
// persistence promise so callers can surface the error.

import {
  readNamespace,
  updateNamespace,
  subscribeSettings,
} from "./settings_repository";

const MEMORY_AGENT_NAMESPACE = "memory_agent_v2";

// Fixed, non-deletable node id in the Agent Builder recipe list.
export const MEMORY_AGENT_SYSTEM_NODE_ID = "system:memory-agent";

export const DEFAULT_MEMORY_AGENT_DISPLAY_NAME = "Memory Agent";

const isPlainObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const asString = (value) => (typeof value === "string" ? value : "");

/**
 * Normalize any raw record into the canonical shape. Missing / corrupted
 * fields fall back to safe defaults; a blank display name falls back to the
 * default so the system row never renders nameless.
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
 * to keep write failures visible (the panel surfaces them inline).
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
