/* Who may join a Subagent Pool.
 *
 * A pool holds Agents, never Workflows. Eligibility is decided by a resource's
 * declared Agent/Workflow kind — never by a file extension, and never by the
 * name of the field that references it. The legacy reference field is called
 * `recipe_ref`, and a recipe is an Agent; the pool panel used to print
 * "workflow" for exactly those rows, which was a field name misread as a kind.
 *
 * Admission separates two things that look alike and are not:
 *
 *   - **Nothing declared.** No `kind`, no `schema_version` — the shape the old
 *     producer emits. This is the legacy compat path, and it is admitted as an
 *     Agent, because the store cannot hold anything else: `recipe.py` refuses a
 *     graph with no agent node, a Workflow is by definition non-LLM with no
 *     Kernel Loop, and a resource is in this listing only because that
 *     validator accepted it. Pinned by
 *     `test_recipe.py::test_a_graph_without_an_agent_node_is_refused`.
 *   - **Something declared that this build cannot read** — an unrecognised
 *     `kind`, or a `schema_version` that is not in the known set. Refused. A
 *     newer definition cannot be interpreted, so calling it a legacy Agent
 *     would be a guess, and the guess admits exactly what the rule exists to
 *     keep out.
 *
 * When #356 makes an agent-less graph storable, that tripwire goes red first
 * and the legacy path has to become fail-closed before the picker may keep
 * admitting undeclared resources. */

export const AGENT_KIND = "agent";
export const WORKFLOW_KIND = "workflow";

/* Definition formats this build can interpret. Empty on purpose: the only
 * format it knows is the legacy one, which declares no version at all. #356
 * lists its Skeleton version here when that format lands; until a version is
 * listed, a resource declaring one is refused rather than guessed at. */
const KNOWN_SCHEMA_VERSIONS = new Set();

export const ADMISSION = Object.freeze({
  AGENT: "agent",
  LEGACY_AGENT: "legacy_agent",
  WORKFLOW: "workflow",
  UNKNOWN_KIND: "unknown_kind",
  UNKNOWN_SCHEMA: "unknown_schema",
  UNUSABLE: "unusable",
});

/* The verdict every add route is decided by. */
export function admission(resource) {
  if (!resource || !resource.name) return ADMISSION.UNUSABLE;

  const version = resource.schema_version;
  const declares_version = version !== undefined && version !== null;
  if (declares_version && !KNOWN_SCHEMA_VERSIONS.has(version)) {
    return ADMISSION.UNKNOWN_SCHEMA;
  }

  const declared = resource.kind;
  if (declared === undefined || declared === null) {
    /* A known format that declares no kind is malformed, not legacy — only the
     * versionless old shape takes the compat path. */
    return declares_version ? ADMISSION.UNKNOWN_KIND : ADMISSION.LEGACY_AGENT;
  }
  if (declared === AGENT_KIND) return ADMISSION.AGENT;
  if (declared === WORKFLOW_KIND) return ADMISSION.WORKFLOW;
  return ADMISSION.UNKNOWN_KIND;
}

/* The declared kind, or null when the resource declares none. Reported for
 * display; admission is what decides, so an unrecognised kind never reaches a
 * caller as though it were absent. */
export function resource_kind(resource) {
  const declared = resource && resource.kind;
  if (declared === AGENT_KIND || declared === WORKFLOW_KIND) return declared;
  return null;
}

/* The one gate every add route passes through. */
export function is_eligible_subagent(resource) {
  const verdict = admission(resource);
  return verdict === ADMISSION.AGENT || verdict === ADMISSION.LEGACY_AGENT;
}

const REFUSAL = Object.freeze({
  [ADMISSION.WORKFLOW]:
    "A Workflow cannot be a subagent — a subagent is an Agent with its own Kernel Loop.",
  [ADMISSION.UNKNOWN_KIND]:
    "This resource declares a kind this build does not recognise, so it cannot be admitted as an Agent.",
  [ADMISSION.UNKNOWN_SCHEMA]:
    "This resource uses a definition format this build cannot read.",
  [ADMISSION.UNUSABLE]: "This resource has no name to reference.",
});

export function ineligible_reason(resource) {
  return REFUSAL[admission(resource)] || null;
}

/* What a picker may offer: eligible, named, and not the definition being edited,
 * since a pool cannot hold its own parent. */
export function eligible_subagent_resources(resources, options) {
  const exclude_name = (options && options.exclude_name) || "";
  if (!Array.isArray(resources)) return [];
  return resources.filter(
    (resource) =>
      is_eligible_subagent(resource) && resource.name !== exclude_name,
  );
}

/* How a pool row describes where its Agent comes from. An entry's `kind` says
 * how it is referenced, not what it is — every one of these is an Agent, and a
 * legacy entry stays loadable and is convertible rather than wrong. */
const ENTRY_REFERENCE = {
  recipe_ref: { source: "Referenced", name: (entry) => entry.recipe_name },
  ref: { source: "Legacy template", name: (entry) => entry.template_name },
  inline: { source: "Legacy inline", name: (entry) => entry.name },
};

export function entry_reference(entry) {
  const spec = ENTRY_REFERENCE[entry && entry.kind];
  if (!spec) {
    return { name: (entry && entry.name) || "(unnamed)", source: "Unknown" };
  }
  return { name: spec.name(entry) || "(unnamed)", source: spec.source };
}

/* A referenced entry points at a shared definition, so editing it reaches the
 * other references. A legacy entry carries its own copy. */
export function entry_is_reference(entry) {
  return Boolean(entry) && entry.kind === "recipe_ref";
}
