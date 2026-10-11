/* The Skeleton document the builder edits.
 *
 * Shapes read from `unchain/skeleton/schema.py` and `execution.py` on
 * 2026-10-03. Every object below is CLOSED on the consumer side — an unknown
 * key is rejected, not ignored — so documents are built field by field.
 *
 * The schema layer treats a node's `config` as opaque; what lives inside it is
 * decided a layer down, where `resolve_inputs` is handed `config.inputs` and
 * `map_outputs` is handed `config.outputs`. Those two names are the whole
 * reason this module exists: "bindings" and "mappings" are what the runtime
 * calls them in its own errors, and `inputs` / `outputs` is where they are
 * stored. Keeping the translation in one place stops the panel from guessing. */

export const SKELETON_SCHEMA_VERSION = 1;

export const DOCUMENT_REQUIRED_KEYS = Object.freeze([
  "schema_version",
  "kind",
  "id",
  "name",
  "nodes",
  "edges",
]);
export const DOCUMENT_OPTIONAL_KEYS = Object.freeze(["description"]);

export const NODE_KEYS = Object.freeze(["id", "type", "config"]);
export const EDGE_KEYS = Object.freeze([
  "id",
  "kind",
  "source_node_id",
  "source_port_id",
  "target_node_id",
  "target_port_id",
]);

export const DOCUMENT_KINDS = Object.freeze(["agent", "workflow"]);
export const EDGE_KINDS = Object.freeze(["flow", "attach"]);

export const NODE_TYPES = Object.freeze([
  "start",
  "end",
  "agent",
  "toolkit_pool",
  "subagent_pool",
  "if_else",
  "switch_case",
  "tool_call",
  "skill_read",
  "code",
  "workflow_call",
  "hooks_pool",
]);

/* A Workflow is a strictly non-LLM graph, so it cannot reach a model directly
 * or through a pool. */
export const WORKFLOW_FORBIDDEN_NODE_TYPES = Object.freeze([
  "agent",
  "toolkit_pool",
  "subagent_pool",
  "hooks_pool",
]);

const is_object = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/* A table read with a node's type, which comes out of a draft and can be
   anything. `EXECUTION_KEYS_BY_TYPE["__proto__"]` is `Object.prototype` —
   truthy, and with no `includes` — so a node of that type took the panel down
   inside the code deciding which sections to draw. `is_skeleton_node` asks
   only for a config object, so such a node does reach here. */
function own(table, key) {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

/* ── Where the two IO lists live ─────────────────────────────────────────
 *
 * Not at the top of `config`: a node's config holds an `execution` object, and
 * the two IO lists live inside THAT. The runtime says so twice — `execution.py`
 * builds its error paths from `("document","nodes",i,"config","execution")`,
 * and the legacy converter writes `{"execution": {"inputs": …, "outputs": …}}`.
 * An agent node's config is closed to exactly `{execution, kernel}`, so putting
 * `inputs` beside them would be a refused document.
 *
 * Which keys `execution` must hold is decided by the node's type, and the set is
 * exact — a Start has outputs and no inputs, which is rule 2's "Start's fields
 * come from the calling context" expressed in the wire. */

export const EXECUTION_CONFIG_KEY = "execution";
export const BINDINGS_CONFIG_KEY = "inputs";
export const OUTPUT_MAPPINGS_CONFIG_KEY = "outputs";

/* An Agent's other half of config. `validate_kernel_config` closes it to
   exactly `{schema_version, profile, prompt, max_iterations, output_tokens,
   history, overflow, json_schema}`, so this is a key inside an object the
   editor must find rather than build: inventing a `kernel` to hold a schema
   would mean inventing a profile, an endpoint and a credential as a side
   effect of turning JSON output on. */
export const KERNEL_CONFIG_KEY = "kernel";
export const OUTPUT_SCHEMA_CONFIG_KEY = "json_schema";

const EXECUTION_KEYS_BY_TYPE = {
  start: ["outputs"],
  end: ["inputs", "outputs"],
  agent: ["inputs", "outputs"],
  code: ["inputs", "outputs"],
  tool_call: ["inputs", "outputs"],
  skill_read: ["inputs", "outputs"],
  workflow_call: ["inputs", "outputs"],
  if_else: ["inputs", "condition"],
  switch_case: ["inputs", "value", "cases"],
};

/* The pools attach to an agent rather than running in the flow, so they carry
 * no execution object at all. */
export const NON_EXECUTING_NODE_TYPES = Object.freeze([
  "toolkit_pool",
  "subagent_pool",
  "hooks_pool",
]);

export function execution_keys_for(node_type) {
  return own(EXECUTION_KEYS_BY_TYPE, node_type) || null;
}

export function node_takes_inputs(node_type) {
  const keys = execution_keys_for(node_type);
  return Boolean(keys) && keys.includes(BINDINGS_CONFIG_KEY);
}

export function node_declares_outputs(node_type) {
  const keys = execution_keys_for(node_type);
  return Boolean(keys) && keys.includes(OUTPUT_MAPPINGS_CONFIG_KEY);
}

/* Which side of a node an exported value may come from.
 *
 * `map_outputs` is handed two objects — the node's resolved inputs and its
 * result — and a mapping names one of them. Which of the two actually holds
 * anything is the runtime's decision, not a matter of taste, and at the two
 * ends of a graph only ever one of them does:
 *
 *   Start   result = inputs; _map_node_outputs(cfg["outputs"], {}, result)
 *   End     _map_node_outputs(cfg["outputs"], resolved, {})
 *
 * So a Start exports from the run's own inputs, which reach it as its result,
 * and its input side is the empty object: every non-empty path there fails,
 * statically in `StaticIOSurfaces.output_problem` and again at run time. An
 * End is the mirror image, and the runtime says so in its own words — "end
 * outputs may only use inputs". Offering the other side would be offering a
 * value that can never arrive, which is the empty-value trap the legacy output
 * picker was built to close.
 *
 * Everything else runs and so has both. */
const OUTPUT_SOURCE_KINDS_BY_TYPE = Object.freeze({
  start: Object.freeze(["result"]),
  end: Object.freeze(["input"]),
});

export function output_source_kinds_for(node_type) {
  if (!node_declares_outputs(node_type)) return [];
  return own(OUTPUT_SOURCE_KINDS_BY_TYPE, node_type) || ["input", "result"];
}

export function is_skeleton_node(node) {
  return is_object(node) && is_object(node.config);
}

export function node_execution(node) {
  const execution = is_skeleton_node(node) && node.config[EXECUTION_CONFIG_KEY];
  return is_object(execution) ? execution : null;
}

export function node_bindings(node) {
  const execution = node_execution(node);
  const list = execution && execution[BINDINGS_CONFIG_KEY];
  return Array.isArray(list) ? list : [];
}

export function node_output_mappings(node) {
  const execution = node_execution(node);
  const list = execution && execution[OUTPUT_MAPPINGS_CONFIG_KEY];
  return Array.isArray(list) ? list : [];
}

/* Immutable, scoped to the one node and the one list, so an edit to a binding
 * row leaves the rest of that node's execution config — a condition, a switch's
 * cases — exactly as it was. */
function with_node_execution_list(document, node_id, key, list) {
  if (!is_object(document) || !Array.isArray(document.nodes)) return document;
  return {
    ...document,
    nodes: document.nodes.map((node) => {
      if (!node || node.id !== node_id) return node;
      const config = is_object(node.config) ? node.config : {};
      const execution = is_object(config[EXECUTION_CONFIG_KEY])
        ? config[EXECUTION_CONFIG_KEY]
        : {};
      return {
        ...node,
        config: {
          ...config,
          [EXECUTION_CONFIG_KEY]: { ...execution, [key]: list },
        },
      };
    }),
  };
}

export function node_kernel(node) {
  const config = is_object(node) && is_object(node.config) ? node.config : null;
  return config && is_object(config[KERNEL_CONFIG_KEY])
    ? config[KERNEL_CONFIG_KEY]
    : null;
}

/* `null` means the Agent replies in prose and its result is exactly the two
   built-ins. `undefined` means this node has no kernel config at all, which is
   not the same answer and is not the editor's to fix. */
export function node_output_schema(node) {
  const kernel = node_kernel(node);
  return kernel ? kernel[OUTPUT_SCHEMA_CONFIG_KEY] : undefined;
}

/* Scoped to the one key, so the profile, prompt and history settings beside it
   are left exactly as they were. A node with no kernel object is returned
   unchanged — see `KERNEL_CONFIG_KEY`. */
export function with_node_output_schema(document, node_id, schema) {
  if (!is_object(document) || !Array.isArray(document.nodes)) return document;
  return {
    ...document,
    nodes: document.nodes.map((node) => {
      if (!node || node.id !== node_id) return node;
      const kernel = node_kernel(node);
      if (!kernel) return node;
      return {
        ...node,
        config: {
          ...node.config,
          [KERNEL_CONFIG_KEY]: { ...kernel, [OUTPUT_SCHEMA_CONFIG_KEY]: schema },
        },
      };
    }),
  };
}

/* ── A Subagent Pool's entries ───────────────────────────────────────────── */

/* The pool's `config` is CLOSED to exactly `{subagents}`
 * (`subagent_config.py:47`), so this is the whole of what a pool node holds.
 *
 * Returned exactly as the document has it, not normalised into an array: "no
 * `subagents` key at all" and "a pool holding nothing" are different
 * documents and the runtime refuses them with different codes
 * (`missing_field` and `missing_value`). Flattening them here would make one
 * of the two unsayable and the editor's account of the document wrong.
 *
 * A pool converted from a legacy definition is the third shape: it carries
 * `legacy_fields` and NO `subagents`, and the store expands it at preflight
 * (`skeleton_resource_store.py:328`). */
export const SUBAGENTS_CONFIG_KEY = "subagents";
export const LEGACY_FIELDS_CONFIG_KEY = "legacy_fields";

export function node_subagents(node) {
  const config = is_object(node) && is_object(node.config) ? node.config : null;
  return config ? config[SUBAGENTS_CONFIG_KEY] : undefined;
}

/* Whether this pool is a converted legacy definition rather than a Skeleton
   one. The store's own test decides it — `"subagents" in config`
   (`skeleton_resource_store.py:328`) — because that is the condition under
   which the store expands `legacy_fields` and the condition under which it
   does not. */
export function node_pool_is_legacy(node) {
  const config = is_object(node) && is_object(node.config) ? node.config : null;
  if (!config || SUBAGENTS_CONFIG_KEY in config) return false;
  return is_object(config[LEGACY_FIELDS_CONFIG_KEY]);
}

/* Writing entries never deletes anything else the node carries, and it
 * refuses outright on a legacy pool. That refusal is not caution: the store
 * expands `legacy_fields` only while there is no `subagents` key, so adding
 * one entry to a legacy pool would make every legacy entry stop being
 * expanded — the author would lose the subagents they had, at Run, silently.
 * The panel shows a legacy pool read-only; this makes that unreachable rather
 * than merely documented. */
export function with_node_subagents(document, node_id, entries) {
  const node = find_node(document, node_id);
  if (node === null || node_pool_is_legacy(node)) return document;
  return {
    ...document,
    nodes: document.nodes.map((candidate) => {
      if (!candidate || candidate.id !== node_id) return candidate;
      const config = is_object(candidate.config) ? candidate.config : {};
      return { ...candidate, config: { ...config, [SUBAGENTS_CONFIG_KEY]: entries } };
    }),
  };
}

export function with_node_bindings(document, node_id, bindings) {
  return with_node_execution_list(document, node_id, BINDINGS_CONFIG_KEY, bindings);
}

export function with_node_output_mappings(document, node_id, mappings) {
  return with_node_execution_list(
    document,
    node_id,
    OUTPUT_MAPPINGS_CONFIG_KEY,
    mappings,
  );
}

export function find_node(document, node_id) {
  if (!is_object(document) || !Array.isArray(document.nodes)) return null;
  return document.nodes.find((node) => node && node.id === node_id) || null;
}

/* ── What can be bound ───────────────────────────────────────────────────── */

/* Only a node that has already run can supply a value, so an input binds to a
 * node upstream of this one along flow edges. Offering the whole graph would
 * let an author bind to something that cannot have produced anything yet. */
export function upstream_node_ids(document, node_id) {
  if (!is_object(document) || !Array.isArray(document.edges)) return [];
  const incoming = new Map();
  document.edges.forEach((edge) => {
    if (!edge || edge.kind !== "flow") return;
    const list = incoming.get(edge.target_node_id) || [];
    list.push(edge.source_node_id);
    incoming.set(edge.target_node_id, list);
  });
  const seen = new Set();
  const order = [];
  const walk = (id) => {
    (incoming.get(id) || []).forEach((source) => {
      if (seen.has(source)) return;
      seen.add(source);
      order.push(source);
      walk(source);
    });
  };
  walk(node_id);
  return order;
}

/* ── The envelope's own rules ────────────────────────────────────────────── */

function problem(code, where, message) {
  return { code, where, message };
}

/* `_closed_object` (`io.py:27-38`): the object itself, then its unknown keys,
   then its missing required ones. The runtime raises at the first of those
   and names one key; this reports every one, because an editor that gives a
   fault per attempt makes a document something the author discovers by
   repeated rejection. */
function closed_object(value, where, required, optional, problems) {
  if (!is_object(value)) {
    problems.push(problem("invalid_type", where, "expected an object"));
    return false;
  }
  const allowed = new Set([...required, ...(optional || [])]);
  Object.keys(value).forEach((key) => {
    if (!allowed.has(key)) {
      problems.push(problem("unknown_field", `${where}.${key}`, "unknown field"));
    }
  });
  required.forEach((key) => {
    if (!(key in value)) {
      problems.push(problem("missing_field", `${where}.${key}`, "required field is missing"));
    }
  });
  return true;
}

/* `_nonempty_string` (`schema.py:16-20`). Three verdicts, not one: absent,
   the wrong type, and empty are different faults with different codes, and
   collapsing them was most of what this mirror had wrong. */
function nonempty_string(value, where, label, problems) {
  if (typeof value !== "string") {
    problems.push(problem("invalid_type", where, `${label} must be a string`));
    return false;
  }
  if (!value) {
    problems.push(problem("invalid_value", where, `${label} must be non-empty`));
    return false;
  }
  return true;
}

/* `validate_skeleton_document` (`schema.py:32-96`), mirrored rule by rule.
 *
 * This is the layer `save_draft` runs, so it is the only thing between a
 * draft and the store. The frozen answers are
 * `skeleton_document_envelope_capture`, enumerated from the validator against
 * the fixed installation pair; the version of this function written from a
 * reading of it disagreed on twenty of a hundred assertions, and every
 * disagreement was either a missing rule or one verdict standing in for
 * three.
 *
 * Not mirrored, and declared: `io.py`'s `_validate_json` limits — depth, node
 * count, byte size, cycles — which the runtime applies to the document before
 * this grammar. Those numbers are already mirrored for schemas in
 * `output_schema`. */
export function document_problems(document) {
  const problems = [];
  if (
    !closed_object(
      document,
      "document",
      DOCUMENT_REQUIRED_KEYS,
      DOCUMENT_OPTIONAL_KEYS,
      problems,
    )
  ) {
    return problems;
  }

  /* Each rule asks only about a key that is there: a key that is absent is
     already a `missing_field`, and saying a second thing about it would be
     describing a value the document does not have. */
  if (
    "schema_version" in document &&
    (typeof document.schema_version !== "number" ||
      document.schema_version !== SKELETON_SCHEMA_VERSION)
  ) {
    problems.push(
      problem("invalid_value", "document.schema_version", "schema_version must be integer 1"),
    );
  }
  if ("kind" in document) {
    if (typeof document.kind !== "string") {
      problems.push(problem("invalid_type", "document.kind", "kind must be a string"));
    } else if (!DOCUMENT_KINDS.includes(document.kind)) {
      problems.push(
        problem("unknown_variant", "document.kind", "kind must be agent or workflow"),
      );
    }
  }
  ["id", "name"].forEach((key) => {
    if (key in document) {
      nonempty_string(document[key], `document.${key}`, key, problems);
    }
  });
  if ("description" in document && typeof document.description !== "string") {
    problems.push(
      problem("invalid_type", "document.description", "description must be a string"),
    );
  }
  if ("nodes" in document && !Array.isArray(document.nodes)) {
    problems.push(problem("invalid_type", "document.nodes", "nodes must be an array"));
  }
  if ("edges" in document && !Array.isArray(document.edges)) {
    problems.push(problem("invalid_type", "document.edges", "edges must be an array"));
  }

  const node_ids = new Set();
  (Array.isArray(document.nodes) ? document.nodes : []).forEach((node, index) => {
    const where = `document.nodes[${index}]`;
    if (!closed_object(node, where, NODE_KEYS, [], problems)) return;
    if ("id" in node && nonempty_string(node.id, `${where}.id`, "node id", problems)) {
      if (node_ids.has(node.id)) {
        problems.push(problem("duplicate_name", `${where}.id`, "node id is duplicated"));
      } else {
        node_ids.add(node.id);
      }
    }
    if ("type" in node) {
      if (typeof node.type !== "string") {
        problems.push(problem("invalid_type", `${where}.type`, "node type must be a string"));
      } else if (!NODE_TYPES.includes(node.type)) {
        problems.push(problem("unknown_variant", `${where}.type`, "unknown node type"));
      } else if (
        document.kind === "workflow" &&
        WORKFLOW_FORBIDDEN_NODE_TYPES.includes(node.type)
      ) {
        problems.push(
          problem("invalid_value", `${where}.type`, "node type is forbidden in workflow"),
        );
      }
    }
    if ("config" in node && !is_object(node.config)) {
      problems.push(problem("invalid_type", `${where}.config`, "node config must be an object"));
    }
  });

  const edge_ids = new Set();
  (Array.isArray(document.edges) ? document.edges : []).forEach((edge, index) => {
    const where = `document.edges[${index}]`;
    if (!closed_object(edge, where, EDGE_KEYS, [], problems)) return;
    if ("id" in edge && nonempty_string(edge.id, `${where}.id`, "edge id", problems)) {
      if (edge_ids.has(edge.id)) {
        problems.push(problem("duplicate_name", `${where}.id`, "edge id is duplicated"));
      } else {
        edge_ids.add(edge.id);
      }
    }
    if ("kind" in edge) {
      if (typeof edge.kind !== "string") {
        problems.push(problem("invalid_type", `${where}.kind`, "edge kind must be a string"));
      } else if (!EDGE_KINDS.includes(edge.kind)) {
        problems.push(
          problem("unknown_variant", `${where}.kind`, "edge kind must be flow or attach"),
        );
      }
    }
    EDGE_KEYS.filter((key) => key !== "kind" && key !== "id").forEach((key) => {
      if (key in edge) nonempty_string(edge[key], `${where}.${key}`, key, problems);
    });
    /* Asked only of a name that could be one: a node id that is not a
       non-empty string has already been reported as that, and calling it
       unavailable as well would describe a lookup nobody made. */
    if (typeof edge.source_node_id === "string" && edge.source_node_id &&
        !node_ids.has(edge.source_node_id)) {
      problems.push(
        problem("missing_value", `${where}.source_node_id`, "edge source node is unavailable"),
      );
    }
    if (typeof edge.target_node_id === "string" && edge.target_node_id &&
        !node_ids.has(edge.target_node_id)) {
      problems.push(
        problem("missing_value", `${where}.target_node_id`, "edge target node is unavailable"),
      );
    }
  });

  return problems;
}
