import { agentEnglishText } from "./agents_i18n";

/* Which Skeleton resources a Subagent Pool may reference.
 *
 * One gate, so there is one place the rule lives. It is not the legacy
 * `subagent_eligibility`, and the two are deliberately separate: that one
 * reads the old recipe listing, which carries no `kind` at all and therefore
 * has to fail OPEN on a resource that declares nothing. This one reads the
 * Skeleton resource listing, where `kind` is a stored column the envelope
 * requires to be `agent` or `workflow` (`schema.py:44-47`,
 * `skeleton_resource_store.py:207`). So here an absent or unrecognised kind is
 * not a legacy Agent — it is a resource this build cannot read — and it fails
 * CLOSED. Merging the two gates would carry the old default into a listing
 * that does not need it, which is how a Workflow would become eligible by
 * being unfamiliar.
 *
 * Every refusal here is one the store would also raise at Run
 * (`_resolve_subagent_closure`): `wrong_kind` for a Workflow,
 * `resource_archived` for an archived one, `recursive_reference` for a cycle.
 * Offering what the store will refuse is the thing to avoid; the gate says
 * why instead of hiding the row, because a missing row cannot be understood.
 *
 * One cycle it cannot see: this knows the Agent being edited, so it refuses a
 * pool that references its own resource. A cycle through a third Agent needs
 * every candidate's own pool read, which is the store's job at Run with the
 * resource-id stack. Nothing here claims otherwise. */

const is_object = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const SUBAGENT_RESOURCE_KIND = "agent";

/* Said in one place because it is asked in two: of a resource being offered,
   and of a reference already in the document. */
const SELF_REFERENCE =
  "This is the Agent being edited. An Agent cannot be its own subagent.";

/* The half of the question an id alone can answer. A reference already stored
 * gets asked this even when the library cannot be read, because a cycle
 * through this very resource needs nothing but the document — and the store
 * refuses it at Run with `recursive_reference` either way.
 *
 * It is only this half. A cycle through a third Agent needs every
 * candidate's own pool read, which is the store's job with the resource-id
 * stack; nothing here claims to see it. */
export function why_not_this_reference(agent_id, options, t = agentEnglishText) {
  const owner_id = (options && options.owner_id) || null;
  if (typeof agent_id !== "string" || !agent_id) {
    return t("agents.eligibility.missing_id");
  }
  return agent_id === owner_id ? t === agentEnglishText ? SELF_REFERENCE : t("agents.eligibility.self") : null;
}

export function why_not_a_subagent(resource, options, t = agentEnglishText) {
  const owner_id = (options && options.owner_id) || null;
  if (!is_object(resource) || typeof resource.id !== "string" || !resource.id) {
    return t("agents.eligibility.missing_id");
  }
  if (resource.id === owner_id) {
    return t === agentEnglishText ? SELF_REFERENCE : t("agents.eligibility.self");
  }
  if (resource.kind === "workflow") {
    return t("agents.eligibility.workflow");
  }
  if (resource.kind !== SUBAGENT_RESOURCE_KIND) {
    return t("agents.eligibility.unknown_kind");
  }
  if (resource.archived) {
    return t("agents.eligibility.archived");
  }
  return null;
}

export function subagent_candidates(resources, options) {
  return (Array.isArray(resources) ? resources : []).filter(
    (resource) => why_not_a_subagent(resource, options) === null,
  );
}

/* What a row says about where its Agent comes from. The entry's own `source`
   is the only thing that decides it — never a file extension, never a field
   name. A legacy `recipe_ref` is an unknown field in this wire, not a kind. */
export function entry_source_label(entry, t = agentEnglishText) {
  const source = is_object(entry) && is_object(entry.source) ? entry.source : null;
  if (source && source.kind === "agent_ref") return t("agents.eligibility.reference");
  if (source && source.kind === "embedded") return t("agents.eligibility.embedded");
  return t("agents.eligibility.unreadable_source");
}

export function entry_agent_id(entry) {
  const source = is_object(entry) && is_object(entry.source) ? entry.source : null;
  return source && source.kind === "agent_ref" && typeof source.agent_id === "string"
    ? source.agent_id
    : null;
}
