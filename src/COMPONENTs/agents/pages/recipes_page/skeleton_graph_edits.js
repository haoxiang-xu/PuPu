/* Native Skeleton graph authoring — the pure command core.
 *
 * Six commands turn one native Agent or Workflow document into the next one:
 *
 *   new_agent_document({id, name})
 *   new_workflow_document({id, name})
 *   add_node(document, {type, id?})
 *   delete_node(document, node_id)
 *   connect_nodes(document, {kind, source_node_id, source_port_id,
 *                            target_node_id, target_port_id, id?})
 *   delete_edge(document, edge_id)
 *
 * Every one answers exactly `{ok, document, problem}`. On success `problem`
 * is `null` and `document` is a new object. On refusal `ok` is `false`,
 * `document` is the very object that was handed in (the factory answers
 * `null`, it had nothing to hand back) and `problem` is `{code, message}`.
 *
 * This file has no imports on purpose. It reads no storage, no clock, no
 * random source, no provider catalog, no session; the caller names the
 * resource and the module names nodes and edges deterministically from the
 * ids already in the document, using `Set`/`Map` so that a node id such as
 * `__proto__` or `constructor` is just another string.
 *
 * The wire it writes is the CLOSED native shape the fixed runtime accepts
 * (`unchain/skeleton/schema.py`, mirrored by `skeleton_document.js`):
 *
 *   document = {schema_version: 1, kind: "agent" | "workflow", id, name, nodes, edges}
 *   node     = {id, type, config}
 *   edge     = {id, kind, source_node_id, source_port_id,
 *               target_node_id, target_port_id}
 *
 * No layout, no label, no kernel, no description are invented. A fresh Agent
 * is Start → Agent → End with empty execution IO: the real store saves it
 * and the real preflight refuses it at `nodes[1].config` for having no
 * Kernel (native-seed-capture.json, case "seed"). That is the intended
 * unfinished draft, not a runnable one. A fresh Workflow is Start → End with
 * empty execution IO: the real store saves it, diagnoses it clean and
 * preflights it (workflow_authoring_capture.json, "wf_seed_*").
 *
 * A Workflow holds no model node and no pool, so it has no attachment either:
 * the runtime refuses `agent`, `toolkit_pool`, `subagent_pool` and `hooks_pool`
 * in a Workflow (`schema.py`), and an attach edge there can join nothing it
 * accepts (capture "wf_attach_edge_diagnose"). Both are refused here first.
 *
 * Successful commands touch only what the command names. Every other node,
 * edge, config, binding, default, missing-policy and unknown top-level key
 * is carried over by reference, never normalized, never stripped. Bad
 * stored values are left exactly as bad as they were; the module only has
 * to not crash on them and to refuse rather than guess when an identity it
 * was asked about is missing or appears more than once.
 */

const RESOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

const FACTORY_NODE_START = "start";
const FACTORY_NODE_AGENT = "agent";
const FACTORY_NODE_END = "end";
const FACTORY_EDGE_START_AGENT = "flow-start-agent";
const FACTORY_EDGE_AGENT_END = "flow-agent-end";
const FACTORY_EDGE_START_END = "flow-start-end";

/* The node types this slice can add, with the id base used when the caller
 * does not name the node and the config a brand-new node of that type
 * carries. Agent and pool configs are the shapes the real store saved and read
 * back unchanged (capture cases "added_agent" and "added_pool"). The two branch
 * seeds are the unfinished drafts measured for #351: the store saves them and
 * reports the missing condition / switch value, and preflight refuses them
 * until the author supplies one (branch-candidate-capture-01, "if-seed-wired",
 * "switch-seed-wired"). No condition, value or case is invented here. */
const ADDABLE = new Map([
  ["toolkit_pool", { id_base: "tools", config: () => ({ toolkits: [], merge_with_user_selected: false }) }],
  [
    "agent",
    {
      id_base: "agent",
      config: () => ({ execution: { inputs: [], outputs: [] } }),
    },
  ],
  [
    "subagent_pool",
    {
      id_base: "pool",
      config: () => ({ subagents: [] }),
    },
  ],
  ["if_else", { id_base: "if", config: () => ({ execution: { inputs: [] } }) }],
  ["switch_case", { id_base: "switch", config: () => ({ execution: { inputs: [], cases: [] } }) }],
  /* #352: an unfinished draft the store saves and preflight refuses with
     `missing_field` at `config.tool` until the author picks a tool, an error
     policy and an approval limit (steps-352/probe/tool-call-store-01, "seed").
     None of the three is chosen here. */
  ["tool_call", { id_base: "tool", config: () => ({ execution: { inputs: [], outputs: [] } }) }],
  /* Likewise refused at `config.skill` until a skill is picked
     (steps-352/probe/skill-read-store-01, "seed"). It takes no inputs. */
  ["skill_read", { id_base: "skill", config: () => ({ execution: { inputs: [], outputs: [] } }) }],
  /* Code (#357): the same unfinished seed. Measured on the fixed pair
     (code-01/out/code-store-capture.json, "seed"): the store saves it, its
     draft check says nothing, and — unlike the two above — preflight passes
     it too, because the runtime admits `config.code` only when it is there;
     the node then fails at run start. No runtime, source, limit or schema is
     chosen here; the panel says what is missing. */
  ["code", { id_base: "code", config: () => ({ execution: { inputs: [], outputs: [] } }) }],
  /* Workflow Call (#357): the same unfinished seed, refused by preflight with
     `missing_field` at `config.workflow` (workflow-call-01, "caller_seed")
     until a published revision is pinned. Nothing is pinned here. */
  ["workflow_call", { id_base: "call", config: () => ({ execution: { inputs: [], outputs: [] } }) }],
  /* Hooks Pool (#357): an attach pool with no hooks yet. Measured
     (hooks-pool-01, "seed"): the store saves it and its draft check passes;
     preflight refuses it with `missing_value` at `config.hooks` until a hook
     is added. No hook is invented here. */
  ["hooks_pool", { id_base: "hooks", config: () => ({ hooks: [] }) }],
]);

export const ADDABLE_NODE_TYPES = Object.freeze([...ADDABLE.keys()]);

const AGENT_KIND = "agent";
const WORKFLOW_KIND = "workflow";
const WORKFLOW_FORBIDDEN_TYPES = new Set(["agent", "toolkit_pool", "subagent_pool", "hooks_pool"]);

/* Which node types a graph of this kind can be given here. */
export function addable_node_types(kind) {
  if (kind === AGENT_KIND) return ADDABLE_NODE_TYPES;
  if (kind === WORKFLOW_KIND) return ADDABLE_NODE_TYPES.filter((type) => !WORKFLOW_FORBIDDEN_TYPES.has(type));
  return [];
}

const PROTECTED_NODE_TYPES = new Set([FACTORY_NODE_START, FACTORY_NODE_END]);

const EDGE_KINDS = new Set(["flow", "attach"]);

/* Flow runs from an outlet into `in` between flow nodes. Start only leaves,
 * End only arrives, a pool never takes part. Only the types this slice has
 * real producer evidence for are admitted as flow endpoints.
 *
 * Which outlets a node has is the runtime's rule, not a drawing's: `out` for
 * an ordinary flow node, exactly `true` and `false` for If / Else, and each
 * declared case id plus the reserved `default` for Switch / Case
 * (`validation.py`, `durable_execution.py`; measured on the fixed pair). */
const FLOW_OUT_PORT = "out";
const FLOW_IN_PORT = "in";
const BRANCH_IF = "if_else";
const BRANCH_SWITCH = "switch_case";
const IF_OUTLETS = Object.freeze(["true", "false"]);
const SWITCH_DEFAULT_OUTLET = "default";
const FLOW_SOURCE_TYPES = new Set([FACTORY_NODE_START, "agent", BRANCH_IF, BRANCH_SWITCH, "tool_call", "skill_read", "code", "workflow_call"]);
const FLOW_TARGET_TYPES = new Set(["agent", FACTORY_NODE_END, BRANCH_IF, BRANCH_SWITCH, "tool_call", "skill_read", "code", "workflow_call"]);

/* Attach joins one Agent and one Subagent Pool through attach_top /
 * attach_bot. Top and bottom are placement, not execution order, so the
 * edge may run from either node to the other. Any combination of these
 * ports is admitted, including top-to-top and bottom-to-bottom. */
const ATTACH_PORTS = new Set(["attach_top", "attach_bot"]);
const ATTACH_AGENT_TYPE = "agent";
const ATTACH_POOL_TYPES = new Set(["subagent_pool", "toolkit_pool", "hooks_pool"]);

const NEW_DOCUMENT_KEYS = new Set(["id", "name"]);
const ADD_NODE_REQUIRED = new Set(["type"]);
const ADD_NODE_OPTIONAL = new Set(["id"]);
const CONNECT_REQUIRED = new Set([
  "kind",
  "source_node_id",
  "source_port_id",
  "target_node_id",
  "target_port_id",
]);
const CONNECT_OPTIONAL = new Set(["id"]);
const NO_KEYS = new Set();

/* ----------------------------------------------------------------------- */
/* answers                                                                 */

const accept = (document) => ({ ok: true, document, problem: null });

const refuse = (document, code, message) => ({
  ok: false,
  document,
  problem: { code, message },
});

/* ----------------------------------------------------------------------- */
/* value checks — the only strings ever interpolated into a message are
 * ones that passed `is_nonempty_string` or came out of `Object.keys`.     */

const is_record = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const is_nonempty_string = (value) => typeof value === "string" && value.length > 0;

const has_own = (record, key) => Object.prototype.hasOwnProperty.call(record, key);

function document_issue(document) {
  if (!is_record(document)) return "document must be an object";
  if (document.schema_version !== 1) return "only schema_version 1 can be edited here";
  if (document.kind !== AGENT_KIND && document.kind !== WORKFLOW_KIND) {
    return "only Agent and Workflow documents can be edited here";
  }
  if (!Array.isArray(document.nodes)) return "document.nodes must be an array";
  if (!Array.isArray(document.edges)) return "document.edges must be an array";
  return null;
}

function command_issue(command, required, optional) {
  if (!is_record(command)) return "command must be an object";
  for (const key of Object.keys(command)) {
    if (!required.has(key) && !optional.has(key)) {
      return `unexpected command key "${key}"`;
    }
  }
  for (const key of required) {
    if (!has_own(command, key)) return `command key "${key}" is required`;
  }
  return null;
}

/* ----------------------------------------------------------------------- */
/* identities                                                              */

function matching(list, id) {
  const found = [];
  for (const entry of list) {
    if (is_record(entry) && entry.id === id) found.push(entry);
  }
  return found;
}

function taken_ids(list) {
  const taken = new Set();
  for (const entry of list) {
    if (is_record(entry) && typeof entry.id === "string") taken.add(entry.id);
  }
  return taken;
}

/* `base`, then `base-2`, `base-3`, … — the first id nobody holds. The same
 * document always yields the same answer. */
function free_id(taken, base) {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/* One node for one id, or the reason there is not one. */
function resolve_node(nodes, node_id, role) {
  const found = matching(nodes, node_id);
  if (found.length === 0) {
    return { node: null, code: "node_not_found", message: `${role} node "${node_id}" does not exist` };
  }
  if (found.length > 1) {
    return {
      node: null,
      code: "ambiguous_node_id",
      message: `${role} node id "${node_id}" matches ${found.length} nodes`,
    };
  }
  return { node: found[0], code: null, message: null };
}

/* ----------------------------------------------------------------------- */
/* flow structure                                                          */

const is_incident = (edge, node_id) =>
  is_record(edge) && (edge.source_node_id === node_id || edge.target_node_id === node_id);

const occupies_outlet = (edge, node_id, port_id) =>
  is_record(edge) && edge.source_node_id === node_id && edge.source_port_id === port_id;

/* Is `to` reachable from `from` along the existing flow edges? Only edges
 * that say `kind: "flow"` and name string endpoints count; a join (many
 * edges into one inlet) is just more edges to walk, not a cycle. */
function flow_reaches(edges, from, to) {
  if (from === to) return true;
  const next = new Map();
  for (const edge of edges) {
    if (!is_record(edge) || edge.kind !== "flow") continue;
    if (typeof edge.source_node_id !== "string" || typeof edge.target_node_id !== "string") {
      continue;
    }
    if (!next.has(edge.source_node_id)) next.set(edge.source_node_id, []);
    next.get(edge.source_node_id).push(edge.target_node_id);
  }
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length > 0) {
    const here = queue.shift();
    for (const there of next.get(here) || []) {
      if (there === to) return true;
      if (!seen.has(there)) {
        seen.add(there);
        queue.push(there);
      }
    }
  }
  return false;
}

/* The outlets a flow node leaves through, or why they cannot be told.
 *
 * A Switch's outlets are its case ids, so they are read from its stored
 * cases — and only when every case is readable the way the runtime reads it:
 * an object with a non-empty string id, not `default`, not repeated. A list
 * that is anything else does not get guessed outlets; the author repairs the
 * cases first and the refusal says so. Answers `{ok, outlets, problem}` with
 * `outlets` an array (possibly empty: End and pools never leave) or `null`. */
export function flow_outlets(node) {
  if (!is_record(node)) {
    return { ok: false, outlets: null, problem: "the node is not readable" };
  }
  if (node.type === BRANCH_IF) return { ok: true, outlets: [...IF_OUTLETS], problem: null };
  if (node.type === BRANCH_SWITCH) {
    const execution = is_record(node.config) ? node.config.execution : null;
    const cases = is_record(execution) ? execution.cases : undefined;
    if (!Array.isArray(cases)) {
      return { ok: false, outlets: null, problem: "this switch has no readable list of cases" };
    }
    const ids = [];
    const seen = new Set();
    for (const entry of cases) {
      if (!is_record(entry) || !is_nonempty_string(entry.id)) {
        return { ok: false, outlets: null, problem: "a case has no usable id" };
      }
      if (entry.id === SWITCH_DEFAULT_OUTLET) {
        return { ok: false, outlets: null, problem: `a case uses the reserved id "${SWITCH_DEFAULT_OUTLET}"` };
      }
      if (seen.has(entry.id)) {
        return { ok: false, outlets: null, problem: `case id "${entry.id}" is used twice` };
      }
      seen.add(entry.id);
      ids.push(entry.id);
    }
    return { ok: true, outlets: [...ids, SWITCH_DEFAULT_OUTLET], problem: null };
  }
  if (FLOW_SOURCE_TYPES.has(node.type)) return { ok: true, outlets: [FLOW_OUT_PORT], problem: null };
  return { ok: true, outlets: [], problem: null };
}

const attach_joins = (edge, a, b) =>
  is_record(edge) &&
  edge.kind === "attach" &&
  ((edge.source_node_id === a && edge.target_node_id === b) ||
    (edge.source_node_id === b && edge.target_node_id === a));

function flow_issue(document, command, source, target) {
  const { source_node_id, source_port_id, target_node_id, target_port_id } = command;
  if (!FLOW_SOURCE_TYPES.has(source.type)) {
    return {
      code: "invalid_flow_source",
      message: `node "${source_node_id}" cannot start a flow edge (start, agent or a branch only; End and pools never leave)`,
    };
  }
  if (!FLOW_TARGET_TYPES.has(target.type)) {
    return {
      code: "invalid_flow_target",
      message: `node "${target_node_id}" cannot receive a flow edge (agent, a branch or end only; Start and pools never arrive)`,
    };
  }
  const outlets = flow_outlets(source);
  if (!outlets.ok) {
    return {
      code: "unreadable_outlets",
      message: `node "${source_node_id}" cannot be wired yet: ${outlets.problem}; repair it first`,
    };
  }
  if (!outlets.outlets.includes(source_port_id)) {
    return {
      code: "unknown_port",
      message: `node "${source_node_id}" leaves through ${outlets.outlets.map((port) => `"${port}"`).join(", ")}, not "${source_port_id}"`,
    };
  }
  if (target_port_id !== FLOW_IN_PORT) {
    return {
      code: "unknown_port",
      message: `flow edges arrive through port "${FLOW_IN_PORT}", not "${target_port_id}"`,
    };
  }
  for (const edge of document.edges) {
    if (occupies_outlet(edge, source_node_id, source_port_id)) {
      return {
        code: "outlet_occupied",
        message: `outlet "${source_port_id}" of node "${source_node_id}" already has an edge; delete it first`,
      };
    }
  }
  if (flow_reaches(document.edges, target_node_id, source_node_id)) {
    return {
      code: "flow_cycle",
      message: `a flow edge from "${source_node_id}" to "${target_node_id}" would close a cycle`,
    };
  }
  return null;
}

function attach_issue(document, command, source, target) {
  const { source_node_id, source_port_id, target_node_id, target_port_id } = command;
  const agent_to_pool = source.type === ATTACH_AGENT_TYPE && ATTACH_POOL_TYPES.has(target.type);
  const pool_to_agent = ATTACH_POOL_TYPES.has(source.type) && target.type === ATTACH_AGENT_TYPE;
  if (!agent_to_pool && !pool_to_agent) {
    return {
      code: "invalid_attachment",
      message: `attach edges join one ${ATTACH_AGENT_TYPE} and one subagent_pool, toolkit_pool or hooks_pool; "${source_node_id}" and "${target_node_id}" are not such a pair`,
    };
  }
  if (!ATTACH_PORTS.has(source_port_id)) {
    return {
      code: "unknown_port",
      message: `"${source_port_id}" is not an attach port (attach_top, attach_bot)`,
    };
  }
  if (!ATTACH_PORTS.has(target_port_id)) {
    return {
      code: "unknown_port",
      message: `"${target_port_id}" is not an attach port (attach_top, attach_bot)`,
    };
  }
  for (const edge of document.edges) {
    if (attach_joins(edge, source_node_id, target_node_id)) {
      return {
        code: "duplicate_attachment",
        message: `nodes "${source_node_id}" and "${target_node_id}" are already attached; delete that edge first`,
      };
    }
  }
  return null;
}

/* ----------------------------------------------------------------------- */
/* commands                                                                */

const flow_edge = (id, source_node_id, target_node_id) => ({
  id,
  kind: "flow",
  source_node_id,
  source_port_id: FLOW_OUT_PORT,
  target_node_id,
  target_port_id: FLOW_IN_PORT,
});

/**
 * A fresh native Agent: Start → Agent → End, nothing configured.
 *
 * `id` is the resource id and follows the store's own rule
 * (`^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$`, so `constructor` is fine and
 * `__proto__` is not — that is a resource rule, not a node rule). `name` is
 * the display name and must be a non-empty string. Anything else in the
 * argument object is refused rather than carried along.
 */
export function new_agent_document(args) {
  const shape = command_issue(args, NEW_DOCUMENT_KEYS, NO_KEYS);
  if (shape) return refuse(null, "invalid_command", shape);
  if (typeof args.id !== "string" || !RESOURCE_ID_PATTERN.test(args.id)) {
    return refuse(
      null,
      "invalid_resource_id",
      "resource id must be a string matching ^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$",
    );
  }
  if (!is_nonempty_string(args.name)) {
    return refuse(null, "invalid_resource_name", "resource name must be a non-empty string");
  }
  return accept({
    schema_version: 1,
    kind: "agent",
    id: args.id,
    name: args.name,
    nodes: [
      { id: FACTORY_NODE_START, type: "start", config: { execution: { outputs: [] } } },
      { id: FACTORY_NODE_AGENT, type: "agent", config: ADDABLE.get("agent").config() },
      { id: FACTORY_NODE_END, type: "end", config: { execution: { inputs: [], outputs: [] } } },
    ],
    edges: [
      flow_edge(FACTORY_EDGE_START_AGENT, FACTORY_NODE_START, FACTORY_NODE_AGENT),
      flow_edge(FACTORY_EDGE_AGENT_END, FACTORY_NODE_AGENT, FACTORY_NODE_END),
    ],
  });
}

/**
 * A fresh Workflow: Start → End, nothing else. Same arguments and refusals
 * as `new_agent_document`.
 */
export function new_workflow_document(args) {
  const shape = command_issue(args, NEW_DOCUMENT_KEYS, NO_KEYS);
  if (shape) return refuse(null, "invalid_command", shape);
  if (typeof args.id !== "string" || !RESOURCE_ID_PATTERN.test(args.id)) {
    return refuse(
      null,
      "invalid_resource_id",
      "resource id must be a string matching ^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$",
    );
  }
  if (!is_nonempty_string(args.name)) {
    return refuse(null, "invalid_resource_name", "resource name must be a non-empty string");
  }
  return accept({
    schema_version: 1,
    kind: WORKFLOW_KIND,
    id: args.id,
    name: args.name,
    nodes: [
      { id: FACTORY_NODE_START, type: "start", config: { execution: { outputs: [] } } },
      { id: FACTORY_NODE_END, type: "end", config: { execution: { inputs: [], outputs: [] } } },
    ],
    edges: [flow_edge(FACTORY_EDGE_START_END, FACTORY_NODE_START, FACTORY_NODE_END)],
  });
}

/**
 * Append one node of an addable type. With no `id` the node is named
 * `agent`/`pool`, then `-2`, `-3`, … past whatever the document holds.
 */
export function add_node(document, command) {
  const doc = document_issue(document);
  if (doc) return refuse(document, "invalid_document", doc);
  const shape = command_issue(command, ADD_NODE_REQUIRED, ADD_NODE_OPTIONAL);
  if (shape) return refuse(document, "invalid_command", shape);
  const { type } = command;
  if (typeof type !== "string") {
    return refuse(document, "invalid_command", "node type must be a string");
  }
  if (PROTECTED_NODE_TYPES.has(type)) {
    return refuse(
      document,
      "protected_node_type",
      `"${type}" is created by the factory exactly once and cannot be added`,
    );
  }
  if (document.kind === WORKFLOW_KIND && WORKFLOW_FORBIDDEN_TYPES.has(type)) {
    return refuse(
      document,
      "not_allowed_in_workflow",
      `a Workflow cannot hold a "${type}" node; it runs no model and has no pools`,
    );
  }
  const addable = ADDABLE.get(type);
  if (!addable) {
    return refuse(
      document,
      "unsupported_node_type",
      `node type "${type}" cannot be added here (${ADDABLE_NODE_TYPES.join(", ")})`,
    );
  }
  const taken = taken_ids(document.nodes);
  let id;
  if (has_own(command, "id")) {
    if (!is_nonempty_string(command.id)) {
      return refuse(document, "invalid_node_id", "node id must be a non-empty string");
    }
    if (taken.has(command.id)) {
      return refuse(document, "duplicate_node_id", `node id "${command.id}" already exists`);
    }
    id = command.id;
  } else {
    id = free_id(taken, addable.id_base);
  }
  const node = { id, type, config: addable.config() };
  return accept({ ...document, nodes: [...document.nodes, node] });
}

/**
 * Remove one ordinary node and every edge touching it. Start and End stay.
 * Other nodes' input refs to the removed node, their defaults and their
 * missing policies are left exactly as they are: the real diagnose is the
 * one that gets to explain what is now unresolved.
 */
export function delete_node(document, node_id) {
  const doc = document_issue(document);
  if (doc) return refuse(document, "invalid_document", doc);
  if (!is_nonempty_string(node_id)) {
    return refuse(document, "invalid_node_id", "node id must be a non-empty string");
  }
  const found = resolve_node(document.nodes, node_id, "the");
  if (!found.node) return refuse(document, found.code, found.message);
  if (PROTECTED_NODE_TYPES.has(found.node.type)) {
    return refuse(
      document,
      "protected_node",
      `node "${node_id}" is the ${found.node.type} node and cannot be deleted`,
    );
  }
  const nodes = document.nodes.filter((entry) => entry !== found.node);
  const edges = document.edges.filter((edge) => !is_incident(edge, node_id));
  return accept({ ...document, nodes, edges });
}

/**
 * Add one edge. `flow` runs from an outlet (`out`; `true`/`false` for If /
 * Else; a case id or `default` for Switch / Case) into `in`: one edge per
 * outlet, any number into one inlet (a join or a branch rejoin), never a cycle. `attach` joins
 * an Agent and a Subagent Pool through attach_top/attach_bot in either
 * direction; a pool may have several owners, a pair is attached once.
 * Without `id` the edge is named `<kind>-<source>-<target>` with the same
 * `-2`, `-3`, … rule as nodes.
 */
export function connect_nodes(document, command) {
  const doc = document_issue(document);
  if (doc) return refuse(document, "invalid_document", doc);
  const shape = command_issue(command, CONNECT_REQUIRED, CONNECT_OPTIONAL);
  if (shape) return refuse(document, "invalid_command", shape);
  const { kind } = command;
  if (typeof kind !== "string") {
    return refuse(document, "invalid_command", "edge kind must be a string");
  }
  if (!EDGE_KINDS.has(kind)) {
    return refuse(document, "unknown_edge_kind", `edge kind "${kind}" is not flow or attach`);
  }
  if (kind === "attach" && document.kind === WORKFLOW_KIND) {
    return refuse(document, "not_allowed_in_workflow", "a Workflow has no pools, so nothing can be attached");
  }
  for (const key of ["source_node_id", "source_port_id", "target_node_id", "target_port_id"]) {
    if (!is_nonempty_string(command[key])) {
      return refuse(document, "invalid_command", `${key} must be a non-empty string`);
    }
  }
  const taken = taken_ids(document.edges);
  if (has_own(command, "id")) {
    if (!is_nonempty_string(command.id)) {
      return refuse(document, "invalid_edge_id", "edge id must be a non-empty string");
    }
    if (taken.has(command.id)) {
      return refuse(document, "duplicate_edge_id", `edge id "${command.id}" already exists`);
    }
  }
  const { source_node_id, source_port_id, target_node_id, target_port_id } = command;
  if (source_node_id === target_node_id) {
    return refuse(
      document,
      "self_connection",
      `node "${source_node_id}" cannot be connected to itself`,
    );
  }
  const source = resolve_node(document.nodes, source_node_id, "source");
  if (!source.node) return refuse(document, source.code, source.message);
  const target = resolve_node(document.nodes, target_node_id, "target");
  if (!target.node) return refuse(document, target.code, target.message);
  const issue =
    kind === "flow"
      ? flow_issue(document, command, source.node, target.node)
      : attach_issue(document, command, source.node, target.node);
  if (issue) return refuse(document, issue.code, issue.message);
  const id = has_own(command, "id")
    ? command.id
    : free_id(taken, `${kind}-${source_node_id}-${target_node_id}`);
  const edge = { id, kind, source_node_id, source_port_id, target_node_id, target_port_id };
  return accept({ ...document, edges: [...document.edges, edge] });
}

/**
 * Remove exactly one edge. Nothing is reconnected or rebound in its place;
 * the draft may become unfinished and the real diagnose will say so.
 */
export function delete_edge(document, edge_id) {
  const doc = document_issue(document);
  if (doc) return refuse(document, "invalid_document", doc);
  if (!is_nonempty_string(edge_id)) {
    return refuse(document, "invalid_edge_id", "edge id must be a non-empty string");
  }
  const found = matching(document.edges, edge_id);
  if (found.length === 0) {
    return refuse(document, "edge_not_found", `edge "${edge_id}" does not exist`);
  }
  if (found.length > 1) {
    return refuse(
      document,
      "ambiguous_edge_id",
      `edge id "${edge_id}" matches ${found.length} edges`,
    );
  }
  const edges = document.edges.filter((entry) => entry !== found[0]);
  return accept({ ...document, edges });
}
