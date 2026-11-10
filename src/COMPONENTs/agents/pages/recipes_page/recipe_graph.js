import { agentError } from "./agents_i18n";
import { normalize_recipe_toolkit_entries } from "./recipe_toolkit_ids";

const VAR_REF_RE = /\{\{#([^.}]+)\.([^#}]+)#\}\}/g;

export const TOOLKIT_POOL_TYPE = "toolkit_pool";
export const LEGACY_TOOLPOOL_TYPE = "toolpool";

export function normalize_node_type(type) {
  return type === LEGACY_TOOLPOOL_TYPE ? TOOLKIT_POOL_TYPE : type;
}

export function is_toolkit_pool_type(type) {
  return normalize_node_type(type) === TOOLKIT_POOL_TYPE;
}

function normalize_node(node) {
  if (!node || typeof node !== "object") return node;
  const type = normalize_node_type(node.type);
  const normalized = type === node.type ? { ...node } : { ...node, type };
  if (type === TOOLKIT_POOL_TYPE) {
    normalized.toolkits = normalize_recipe_toolkit_entries(node.toolkits, {
      includeConfig: true,
    });
  }
  return normalized;
}

function port_kind(port_id) {
  if (port_id === "in") return "in";
  if (port_id === "out") return "out";
  if (port_id === "attach_top" || port_id === "attach_bot") return "attach";
  return "";
}

function edge_kind(edge) {
  if (edge.kind === "flow" || edge.kind === "attach") return edge.kind;
  return port_kind(edge.source_port_id) === "attach" ||
    port_kind(edge.target_port_id) === "attach"
    ? "attach"
    : "flow";
}

function normalize_edge(edge) {
  const kind = edge_kind(edge);
  if (
    kind === "flow" &&
    port_kind(edge.source_port_id) === "in" &&
    port_kind(edge.target_port_id) === "out"
  ) {
    return {
      ...edge,
      kind,
      source_node_id: edge.target_node_id,
      source_port_id: edge.target_port_id,
      target_node_id: edge.source_node_id,
      target_port_id: edge.source_port_id,
    };
  }
  return { ...edge, kind };
}

function default_outputs(node) {
  if (!node) return [];
  if (node.type === "start") {
    return Array.isArray(node.outputs) && node.outputs.length > 0
      ? node.outputs
      : [
          { name: "text", type: "string" },
          { name: "images", type: "image[]" },
          { name: "files", type: "file[]" },
        ];
  }
  if (node.type === "agent") {
    return Array.isArray(node.outputs) && node.outputs.length > 0
      ? node.outputs
      : [{ name: "output", type: "string" }];
  }
  return [];
}

function projection_toolkits(pool_nodes) {
  const merged = [];
  for (const pool of pool_nodes) {
    merged.push(...(Array.isArray(pool.toolkits) ? pool.toolkits : []));
  }
  return normalize_recipe_toolkit_entries(merged);
}

function projection_subagents(pool_nodes) {
  const out = [];
  for (const pool of pool_nodes) {
    for (const subagent of Array.isArray(pool.subagents) ? pool.subagents : []) {
      out.push({ ...subagent });
    }
  }
  return out;
}

function find_nodes(nodes, type) {
  return nodes.filter((node) => node.type === type);
}

function compile_error(key, vars) {
  const error = agentError(key, vars);
  error.code = "recipe_graph_invalid";
  return error;
}

function validate_attach_edge(edge, by_id) {
  const source = by_id.get(edge.source_node_id);
  const target = by_id.get(edge.target_node_id);
  if (!source || !target) throw compile_error("agents.graph.legacy_edge_missing", { value1: edge.id });
  if (
    port_kind(edge.source_port_id) !== "attach" ||
    port_kind(edge.target_port_id) !== "attach"
  ) {
    throw compile_error("agents.graph.legacy_attachment_ports", { value1: edge.id });
  }
  const source_is_agent = source.type === "agent";
  const target_is_agent = target.type === "agent";
  const source_is_plugin =
    is_toolkit_pool_type(source.type) || source.type === "subagent_pool";
  const target_is_plugin =
    is_toolkit_pool_type(target.type) || target.type === "subagent_pool";
  if (!((source_is_agent && target_is_plugin) || (target_is_agent && source_is_plugin))) {
    throw compile_error("agents.graph.legacy_attachment_pair", { value1: edge.id });
  }
}

function extract_variable_refs(text) {
  const refs = [];
  VAR_REF_RE.lastIndex = 0;
  let match;
  while ((match = VAR_REF_RE.exec(text || "")) !== null) {
    refs.push({ node_id: match[1], field: match[2] });
  }
  return refs;
}

function validate_variables(agents, start, by_id) {
  const upstream = new Map();
  upstream.set(
    start.id,
    new Set(default_outputs(start).map((item) => item.name).filter(Boolean)),
  );

  for (const agent of agents) {
    const prompt = agent.override?.prompt || "";
    for (const ref of extract_variable_refs(prompt)) {
      const fields = upstream.get(ref.node_id);
      if (!fields) {
        throw compile_error(
          "agents.graph.legacy_variable_upstream", { value1: ref.node_id, value2: ref.field, value3: agent.id },
        );
      }
      if (!fields.has(ref.field)) {
        throw compile_error(
          "agents.graph.legacy_variable_missing", { value1: ref.node_id, value2: ref.field },
        );
      }
    }
    const source = by_id.get(agent.id);
    upstream.set(
      agent.id,
      new Set(default_outputs(source).map((item) => item.name).filter(Boolean)),
    );
  }
}

export function compile_recipe_graph(recipe) {
  if (!recipe || !Array.isArray(recipe.nodes)) {
    throw compile_error("agents.graph.legacy_nodes_missing");
  }
  const nodes = recipe.nodes.map(normalize_node);
  const edges = (Array.isArray(recipe.edges) ? recipe.edges : []).map(normalize_edge);
  const by_id = new Map(nodes.map((node) => [node.id, node]));

  if (by_id.size !== nodes.length) {
    throw compile_error("agents.graph.legacy_duplicate_ids");
  }

  const starts = find_nodes(nodes, "start");
  const ends = find_nodes(nodes, "end");
  const all_agents = find_nodes(nodes, "agent");
  if (starts.length !== 1) throw compile_error("agents.graph.legacy_start_count");
  if (ends.length !== 1) throw compile_error("agents.graph.legacy_end_count");
  if (all_agents.length < 1) throw compile_error("agents.graph.legacy_agent_count");

  const flow_edges = edges.filter((edge) => edge.kind === "flow");
  const attach_edges = edges.filter((edge) => edge.kind === "attach");
  const outgoing = new Map();
  const incoming = new Map();
  const attached_plugins = new Set();

  for (const edge of flow_edges) {
    const source = by_id.get(edge.source_node_id);
    const target = by_id.get(edge.target_node_id);
    if (!source || !target) throw compile_error("agents.graph.legacy_edge_missing", { value1: edge.id });
    if (
      port_kind(edge.source_port_id) !== "out" ||
      port_kind(edge.target_port_id) !== "in"
    ) {
      throw compile_error("agents.graph.legacy_flow_ports", { value1: edge.id });
    }
    if (source.type !== "start" && source.type !== "agent") {
      throw compile_error("agents.graph.legacy_flow_source", { value1: edge.id, value2: source.type });
    }
    if (target.type !== "agent" && target.type !== "end") {
      throw compile_error("agents.graph.legacy_flow_target", { value1: edge.id, value2: target.type });
    }
    if (outgoing.has(source.id)) throw compile_error("agents.graph.legacy_multiple_outputs", { value1: source.id });
    if (incoming.has(target.id)) throw compile_error("agents.graph.legacy_multiple_inputs", { value1: target.id });
    outgoing.set(source.id, edge);
    incoming.set(target.id, edge);
  }

  for (const edge of attach_edges) {
    validate_attach_edge(edge, by_id);
    const source = by_id.get(edge.source_node_id);
    const target = by_id.get(edge.target_node_id);
    if (source && (is_toolkit_pool_type(source.type) || source.type === "subagent_pool")) {
      attached_plugins.add(source.id);
    }
    if (target && (is_toolkit_pool_type(target.type) || target.type === "subagent_pool")) {
      attached_plugins.add(target.id);
    }
  }

  const start = starts[0];
  const end = ends[0];
  if (incoming.has(start.id)) throw compile_error("agents.graph.legacy_start_input");
  if (outgoing.has(end.id)) throw compile_error("agents.graph.legacy_end_output");

  const ordered = [start];
  const agents = [];
  const visited = new Set([start.id]);
  let current = start;
  while (current.id !== end.id) {
    const edge = outgoing.get(current.id);
    if (!edge) throw compile_error("agents.graph.legacy_to_end", { value1: current.id });
    const next = by_id.get(edge.target_node_id);
    if (!next) throw compile_error("agents.graph.legacy_target_missing", { value1: edge.id });
    if (visited.has(next.id)) throw compile_error("agents.graph.legacy_cycle");
    visited.add(next.id);
    ordered.push(next);
    if (next.type === "agent") agents.push(next);
    current = next;
  }

  for (const agent of all_agents) {
    if (!visited.has(agent.id)) throw compile_error("agents.graph.legacy_disconnected", { value1: agent.id });
    if (!incoming.has(agent.id)) throw compile_error("agents.graph.legacy_agent_input", { value1: agent.id });
    if (!outgoing.has(agent.id)) throw compile_error("agents.graph.legacy_agent_output", { value1: agent.id });
  }

  for (const plugin of nodes.filter(
    (node) => is_toolkit_pool_type(node.type) || node.type === "subagent_pool",
  )) {
    if (!attached_plugins.has(plugin.id)) {
      throw compile_error("agents.graph.legacy_unattached", { value1: plugin.id });
    }
  }

  validate_variables(agents, start, by_id);

  const toolkit_pools = find_nodes(nodes, TOOLKIT_POOL_TYPE);
  const subagent_pools = find_nodes(nodes, "subagent_pool");
  return {
    nodes,
    edges,
    ordered,
    agents,
    start,
    end,
    toolkit_pools,
    subagent_pools,
    toolkits: projection_toolkits(toolkit_pools),
    subagent_pool: projection_subagents(subagent_pools),
    merge_with_user_selected: toolkit_pools.some(
      (node) => node.merge_with_user_selected === true,
    ),
  };
}
