/* skill_inventory_store — renderer-side cache of the backend-authoritative
 * `pupu.skill_inventory.v1` payload (ticket #291 P4, `GET /skills/inventory`
 * via `unchainAPI.getSkillInventory` → `api.unchain.getSkillInventory`).
 *
 * Two independent consumers read this cache:
 *   - plugin_skill_sync.syncSkillInventory() turns `skills` into slash
 *     commands (source "skill-inventory").
 *   - api.unchain's injectSkillsOptionsIntoPayload() attaches the last known
 *     `revision` to every composer send so route_chat can catch a stale
 *     selection (`options.skill_inventory_revision` → 409
 *     `skill_inventory_stale`, P-D4/P-D4a).
 *
 * State lives in module scope (mirrors command_registry's in-memory Map) —
 * this is a renderer-process cache, not persisted storage. A malformed or
 * partial response must never blank out a previously good command set or
 * revision, so `applySkillInventory` validates the CLOSED wire schema before
 * touching state and leaves everything untouched on any violation.
 *
 * Ticket #291 P5 audit fix: admission used to be permissive — an unknown
 * top-level key was ignored and `diagnostics` was never validated at all.
 * The schema is now CLOSED end to end: the payload must have EXACTLY the
 * keys `schema, revision, skills, diagnostics`; `revision` must match the
 * sha256 digest shape the backend actually emits; every `skills[]` entry
 * must have EXACTLY its nine CLOSED fields with the right types; every
 * `diagnostics[]` entry must have EXACTLY its five CLOSED fields, all
 * strings. Any violation rejects the WHOLE payload (returns false, logs via
 * the module logger, leaves state untouched) rather than partially applying
 * it.
 */
import { createLogger } from "./console_logger";

const logger = createLogger("COMMANDS", "src/SERVICEs/skill_inventory_store.js");

const INVENTORY_SCHEMA = "pupu.skill_inventory.v1";
const REVISION_PATTERN = /^sha256:[0-9a-f]{64}$/;

const PAYLOAD_KEYS = ["schema", "revision", "skills", "diagnostics"];
const SKILL_ENTRY_KEYS = [
  "id",
  "name",
  "description",
  "source",
  "source_id",
  "aliases",
  "model_invocable",
  "user_invocable",
  "reserved",
];
const DIAGNOSTIC_ENTRY_KEYS = ["kind", "name", "source", "source_id", "message"];

const isPlainObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (value, expectedKeys) => {
  const keys = Object.keys(value);
  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
};

const isValidSkillEntry = (entry) =>
  isPlainObject(entry) &&
  hasExactKeys(entry, SKILL_ENTRY_KEYS) &&
  typeof entry.id === "string" &&
  typeof entry.name === "string" &&
  typeof entry.description === "string" &&
  typeof entry.source === "string" &&
  typeof entry.source_id === "string" &&
  Array.isArray(entry.aliases) &&
  entry.aliases.every((alias) => typeof alias === "string") &&
  typeof entry.model_invocable === "boolean" &&
  typeof entry.user_invocable === "boolean" &&
  typeof entry.reserved === "boolean";

const isValidDiagnosticEntry = (entry) =>
  isPlainObject(entry) &&
  hasExactKeys(entry, DIAGNOSTIC_ENTRY_KEYS) &&
  typeof entry.kind === "string" &&
  typeof entry.name === "string" &&
  typeof entry.source === "string" &&
  typeof entry.source_id === "string" &&
  typeof entry.message === "string";

const initialState = () => ({
  revision: "",
  skills: [],
  workspaceRoot: "",
  includeUserDirs: true,
});

let state = initialState();

const reject = (reason) => {
  logger.warn(
    "skill_inventory_invalid_payload",
    `Rejecting skill inventory response: ${reason}`,
  );
  return false;
};

/**
 * Validate and apply a `GET /skills/inventory` response.
 *
 * @param {*} payload — the raw response, expected shape (CLOSED, exactly
 *   these four top-level keys) `{ schema, revision, skills: [...],
 *   diagnostics: [...] }`.
 * @param {{workspaceRoot?: string, includeUserDirs?: boolean}} context —
 *   the request context the payload was fetched for; recorded alongside the
 *   response so later reads know which workspace/settings produced it.
 * @returns {boolean} true when applied; false (state left untouched, a
 *   diagnostic logged) on ANY schema violation: extra/missing top-level
 *   keys, wrong schema id, a revision not matching `sha256:<64 hex>`, or any
 *   `skills[]`/`diagnostics[]` entry with an extra/missing/mistyped field.
 */
export const applySkillInventory = (
  payload,
  { workspaceRoot = "", includeUserDirs = true } = {},
) => {
  if (!isPlainObject(payload)) {
    return reject("payload is not an object");
  }
  if (!hasExactKeys(payload, PAYLOAD_KEYS)) {
    return reject(
      `payload keys must be exactly ${PAYLOAD_KEYS.join(", ")} (got ${Object.keys(payload).join(", ")})`,
    );
  }
  if (payload.schema !== INVENTORY_SCHEMA) {
    return reject(`schema must be ${INVENTORY_SCHEMA}`);
  }
  if (typeof payload.revision !== "string" || !REVISION_PATTERN.test(payload.revision)) {
    return reject("revision must match sha256:<64 lowercase hex chars>");
  }
  if (!Array.isArray(payload.skills) || !payload.skills.every(isValidSkillEntry)) {
    return reject("skills[] must all match the CLOSED skill entry shape");
  }
  if (
    !Array.isArray(payload.diagnostics) ||
    !payload.diagnostics.every(isValidDiagnosticEntry)
  ) {
    return reject("diagnostics[] must all match the CLOSED diagnostic entry shape");
  }

  state = {
    revision: payload.revision,
    skills: payload.skills,
    workspaceRoot: typeof workspaceRoot === "string" ? workspaceRoot : "",
    includeUserDirs: includeUserDirs !== false,
  };
  return true;
};

/** The last successfully-applied inventory's revision, or "" before any
 *  valid response has been applied. */
export const getLastSkillInventoryRevision = () => state.revision;

/** The last successfully-applied inventory's `skills[]` rows. */
export const getSkillInventorySkills = () => state.skills;

/** Test-only reset back to the pre-fetch default state. */
export const _resetSkillInventoryForTest = () => {
  state = initialState();
};
