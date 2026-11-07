/* The resource lifecycle, as the real store answers it.
 *
 * Captured 2026-10-10 against `SkeletonResourceStore` with the candidate
 * Unchain source, so the session below is written against what the store
 * actually returns rather than what the route signature suggests.
 *
 * The two that matter most and are easy to assume wrong:
 *
 *   - A refused save is an ERROR, not a result with a flag: `edit_conflict`
 *     at `["expected_edit_token"]` with HTTP 409, and the stored document is
 *     left exactly as it was. Nothing is merged and nothing is lost.
 *   - A refused preflight is also an error — the FIRST problem, with an HTTP
 *     400 — not a list. `validate_skeleton_for_execution` raises on the first
 *     diagnostic it finds, so the complete list still only comes from
 *     `diagnose`. A Run button that showed "the" problem would be showing one
 *     of several.
 */

export const RESOURCE_RESULT_KEYS = [
  "archived",
  "description",
  "diagnostics",
  "document",
  "draft_digest",
  "edit_token",
  "id",
  "kind",
  "name",
  "source_identity"
];

export const PREFLIGHT_RESULT_KEYS = [
  "definition_digest",
  "dependencies",
  "diagnostics",
  "document",
  "edit_token",
  "id",
  "kind",
  "ok",
  "subagents"
];

export const EDIT_CONFLICT_ERROR = {
  "code": "edit_conflict",
  "path": [
    "expected_edit_token"
  ],
  "message": "resource changed in another editor",
  "status": 409
};

export const PREFLIGHT_REFUSED_ERROR = {
  "code": "end_count",
  "path": [
    "document",
    "nodes"
  ],
  "message": "graph requires exactly one end node",
  "status": 400
};
