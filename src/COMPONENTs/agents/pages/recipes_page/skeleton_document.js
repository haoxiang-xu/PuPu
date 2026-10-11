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

export function document_problems(document) {
  const problems = [];
  if (!is_object(document)) {
    return [problem("invalid_type", "document", "document must be an object")];
  }
  const allowed = new Set([...DOCUMENT_REQUIRED_KEYS, ...DOCUMENT_OPTIONAL_KEYS]);
  Object.keys(document).forEach((key) => {
    if (!allowed.has(key)) {
      problems.push(problem("unknown_field", `document.${key}`, "unknown field"));
    }
  });
  DOCUMENT_REQUIRED_KEYS.forEach((key) => {
    if (!(key in document)) {
      problems.push(problem("missing_field", `document.${key}`, "required field is missing"));
    }
  });
  if (document.schema_version !== SKELETON_SCHEMA_VERSION) {
    problems.push(
      problem("invalid_value", "document.schema_version", "schema_version must be integer 1"),
    );
  }
  if (!DOCUMENT_KINDS.includes(document.kind)) {
    problems.push(problem("unknown_variant", "document.kind", "kind must be agent or workflow"));
  }
  ["id", "name"].forEach((key) => {
    if (typeof document[key] !== "string" || !document[key]) {
      problems.push(problem("invalid_value", `document.${key}`, `${key} must be non-empty`));
    }
  });

  const node_ids = new Set();
  (Array.isArray(document.nodes) ? document.nodes : []).forEach((node, index) => {
    const where = `document.nodes[${index}]`;
    if (!is_object(node)) {
      problems.push(problem("invalid_type", where, "node must be an object"));
      return;
    }
    Object.keys(node).forEach((key) => {
      if (!NODE_KEYS.includes(key)) {
        problems.push(problem("unknown_field", `${where}.${key}`, "unknown field"));
      }
    });
    if (typeof node.id !== "string" || !node.id) {
      problems.push(problem("invalid_value", `${where}.id`, "node id must be non-empty"));
    } else if (node_ids.has(node.id)) {
      problems.push(problem("duplicate_name", `${where}.id`, "node id is duplicated"));
    } else {
      node_ids.add(node.id);
    }
    if (!NODE_TYPES.includes(node.type)) {
      problems.push(problem("unknown_variant", `${where}.type`, "unknown node type"));
    } else if (
      document.kind === "workflow" &&
      WORKFLOW_FORBIDDEN_NODE_TYPES.includes(node.type)
    ) {
      problems.push(
        problem("invalid_value", `${where}.type`, "node type is forbidden in workflow"),
      );
    }
    if (!is_object(node.config)) {
      problems.push(problem("invalid_type", `${where}.config`, "node config must be an object"));
    }
  });

  const edge_ids = new Set();
  (Array.isArray(document.edges) ? document.edges : []).forEach((edge, index) => {
    const where = `document.edges[${index}]`;
    if (!is_object(edge)) {
      problems.push(problem("invalid_type", where, "edge must be an object"));
      return;
    }
    Object.keys(edge).forEach((key) => {
      if (!EDGE_KEYS.includes(key)) {
        problems.push(problem("unknown_field", `${where}.${key}`, "unknown field"));
      }
    });
    if (!EDGE_KINDS.includes(edge.kind)) {
      problems.push(problem("unknown_variant", `${where}.kind`, "edge kind must be flow or attach"));
    }
    if (typeof edge.id === "string" && edge.id) {
      if (edge_ids.has(edge.id)) {
        problems.push(problem("duplicate_name", `${where}.id`, "edge id is duplicated"));
      } else {
        edge_ids.add(edge.id);
      }
    }
    EDGE_KEYS.filter((key) => key !== "kind").forEach((key) => {
      if (typeof edge[key] !== "string" || !edge[key]) {
        problems.push(problem("invalid_value", `${where}.${key}`, `${key} must be non-empty`));
      }
    });
    if (edge.source_node_id && !node_ids.has(edge.source_node_id)) {
      problems.push(
        problem("missing_value", `${where}.source_node_id`, "edge source node is unavailable"),
      );
    }
    if (edge.target_node_id && !node_ids.has(edge.target_node_id)) {
      problems.push(
        problem("missing_value", `${where}.target_node_id`, "edge target node is unavailable"),
      );
    }
  });

  return problems;
}
