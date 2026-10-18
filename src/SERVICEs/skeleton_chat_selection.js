/* Choosing a stored Skeleton Agent to run an ordinary chat with.
 *
 * The server's contract is closed and it is not ours: `prepare_skeleton_chat_selection`
 * compares the key set exactly, accepts one schema string, requires the id to
 * be canonical and URL-safe, and refuses a selection that arrives beside a
 * non-empty `recipe_name`. What travels is an id and nothing else — the server
 * resolves it, preflights it and freezes the material. Nothing here projects a
 * document, a digest or a preflight result; there is no second copy of the
 * admission rules in the renderer to drift from.
 *
 * What this module does own is the three questions the renderer has to answer
 * before sending: which stored resources may be offered at all, which one this
 * chat has chosen, and what to say when the answer comes back a refusal.
 */

export const SKELETON_CHAT_SELECTION_SCHEMA = "pupu.skeleton_chat_selection.v1";

/* The server's own spelling, mirrored character for character, not an
   approximation of it: `^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$` plus "equals its
   own strip()". A colon is legal INSIDE an id, so nothing here may encode an
   id by joining it to a prefix with one. */
const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

/* The id as a string, or "" for every value that is not one. The caller may
   hold anything: a store row, a stale per-chat value, a restored draft. */
export const skeleton_agent_id = (value) => {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (text !== value || !RESOURCE_ID.test(text)) return "";
  return text;
};

/* The wire object, or null when there is nothing to send.
 *
 * Exactly three keys. A fourth would be `unknown_field` and a missing one
 * `invalid_shape`, so this is built as a literal rather than spread from
 * anything the caller holds. */
export const skeleton_selection_payload = (resourceId) => {
  const id = skeleton_agent_id(resourceId);
  if (!id) return null;
  return {
    schema: SKELETON_CHAT_SELECTION_SCHEMA,
    kind: "resource",
    resource_id: id,
  };
};

/* Which stored resources may be offered as a chat Agent.
 *
 * Declared `kind: "agent"` and not archived. A Workflow is a different kind of
 * resource and the server refuses it as one (`wrong_kind`); an archived record
 * is not on offer. Both are left out here so the list does not invite a
 * refusal, and the server still refuses them if an id arrives by another
 * route — this is a menu, not an admission.
 *
 * Addressed by id throughout. Two resources may carry one name, and a name may
 * equal a legacy Recipe's, so the name is a label and never an identity. */
export const skeleton_agent_options = (resources) => {
  if (!Array.isArray(resources)) return [];
  const seen = new Set();
  const options = [];
  resources.forEach((row) => {
    if (!row || typeof row !== "object") return;
    if (row.kind !== "agent" || row.archived === true) return;
    const id = skeleton_agent_id(row.id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : id;
    options.push({ id, name });
  });
  return options;
};

/* Whether this chat's stored choice is still one of the resources on offer.
 *
 * A chat keeps the id it was given. The resource can be archived, renamed,
 * converted or deleted while the chat sits there, and the honest answer is
 * then "this chat names a resource that is not available", not a quiet move to
 * the default Agent. */
export const skeleton_agent_option_for = (options, resourceId) => {
  const id = skeleton_agent_id(resourceId);
  if (!id || !Array.isArray(options)) return null;
  return options.find((option) => option && option.id === id) || null;
};

/* What to say about a selection that cannot run.
 *
 * The server's message is already shown — it arrives as `{code, message}` and
 * the chat renders it. These are the sentences for the two things the server
 * cannot word for us: a selection this chat holds for a resource that is no
 * longer on offer, and a Skeleton run's relationship to the composer. */
export const SKELETON_AGENT_MISSING_REASON =
  "This chat names an Agent that is not available any more — it may have been archived, deleted, or turned into a Workflow. Choose an Agent again, or switch back to Default.";

export const SKELETON_AGENT_RUNS_SAVED_DEFINITION =
  "Runs the saved definition of this Agent, with the model saved inside it. Unsaved edits in the Builder are not part of it until they are saved.";

/* The server's refusal codes, in this chat's own words.
 *
 * Only the ones that are about the selection. Anything else keeps the server's
 * own sentence, which is more specific than a category would be. */
const SELECTION_REASONS = {
  wrong_kind:
    "That resource is not an Agent, so an ordinary chat cannot run it.",
  resource_missing:
    "That Agent was not found. It may have been deleted or renamed somewhere else.",
  skeleton_chat_admission_failed:
    "This Agent could not be admitted to run. Open it in the Builder and check it can run.",
  skeleton_chat_execution_unavailable:
    "Running a Skeleton Agent is not connected on this build yet.",
  skeleton_active_context_required:
    "Running an Agent needs Context V2 active for this chat.",
  unsupported_version:
    "This build sent an Agent selection this runtime does not accept. Update the app.",
};

export const skeleton_selection_reason = (code) => {
  if (typeof code !== "string" || !code) return "";
  return Object.prototype.hasOwnProperty.call(SELECTION_REASONS, code)
    ? SELECTION_REASONS[code]
    : "";
};
