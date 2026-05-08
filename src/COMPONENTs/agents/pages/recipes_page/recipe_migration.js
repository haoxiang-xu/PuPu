/* Recipe schema migration: legacy single-agent shape -> node/edge graph. */

import { TOOLKIT_POOL_TYPE, normalize_node_type } from "./recipe_graph";

export function is_legacy_recipe(recipe) {
  return !!recipe && !Array.isArray(recipe.nodes);
}

const START_POS = { x: 80, y: 260 };
const AGENT_POS = { x: 380, y: 260 };
const END_POS = { x: 720, y: 260 };
const TOOLPOOL_POS = { x: 380, y: 80 };
const SUBAGENT_POOL_POS = { x: 380, y: 440 };

const DEFAULT_START_OUTPUTS = [
  { name: "text", type: "string" },
  { name: "images", type: "image[]" },
  { name: "files", type: "file[]" },
];

const DEFAULT_START_PREFIX =
  "{{#start.text#}}\n{{#start.images#}}\n{{#start.files#}}\n\n";
const BUILTIN_DEVELOPER_PROMPT_SENTINEL =
  "{{USE_BUILTIN_DEVELOPER_PROMPT}}";

function inject_start_vars(prompt) {
  const text = prompt || "";
  if (text.trim() === BUILTIN_DEVELOPER_PROMPT_SENTINEL) return text;
  if (/\{\{#start\.(text|images|files)#\}\}/.test(text)) return text;
  return DEFAULT_START_PREFIX + text;
}

function make_agent_node(legacy_agent) {
  return {
    id: "agent_main",
    type: "agent",
    kind: "workflow",
    deletable: true,
    override: {
      model: legacy_agent?.model,
      prompt_format: legacy_agent?.prompt_format || "soul",
      prompt: inject_start_vars(legacy_agent?.prompt),
      memory: legacy_agent?.memory,
    },
    outputs: [{ name: "output", type: "string" }],
    x: AGENT_POS.x,
    y: AGENT_POS.y,
  };
}

function make_toolkit_pool_node(legacy_toolkits, merge_with_user_selected) {
  const seen = new Set();
  const toolkits = [];
  for (const tk of legacy_toolkits) {
    if (!tk || typeof tk.id !== "string") continue;
    if (seen.has(tk.id)) continue;
    seen.add(tk.id);
    const entry = { id: tk.id, config: {} };
    if (Array.isArray(tk.enabled_tools)) {
      entry.enabled_tools = [...tk.enabled_tools];
    }
    toolkits.push(entry);
  }
  return {
    id: "tp_1",
    type: TOOLKIT_POOL_TYPE,
    kind: "plugin",
    deletable: true,
    toolkits,
    merge_with_user_selected: !!merge_with_user_selected,
    x: TOOLPOOL_POS.x,
    y: TOOLPOOL_POS.y,
  };
}

function migrate_existing_graph(recipe) {
  let changed = false;
  const nodes = recipe.nodes.map((node) =>
    node && typeof node === "object"
      ? (() => {
          const type = normalize_node_type(node.type);
          if (type === node.type) return node;
          changed = true;
          return { ...node, type };
        })()
      : node,
  );
  return changed ? { ...recipe, nodes } : recipe;
}

function make_subagent_pool_node(legacy_pool) {
  return {
    id: "sp_1",
    type: "subagent_pool",
    kind: "plugin",
    deletable: true,
    subagents: legacy_pool.map((e) => ({ ...e })),
    x: SUBAGENT_POOL_POS.x,
    y: SUBAGENT_POOL_POS.y,
  };
}

export function migrate_recipe(recipe) {
  if (!is_legacy_recipe(recipe)) return migrate_existing_graph(recipe);

  const nodes = [
    {
      id: "start",
      type: "start",
      kind: "workflow",
      deletable: false,
      outputs: DEFAULT_START_OUTPUTS,
      x: START_POS.x,
      y: START_POS.y,
    },
    make_agent_node(recipe.agent),
    {
      id: "end",
      type: "end",
      kind: "workflow",
      deletable: false,
      outputs_schema: [{ name: "output", type: "string" }],
      x: END_POS.x,
      y: END_POS.y,
    },
  ];

  const edges = [
    {
      id: "e_start_agent",
      source_node_id: "start",
      source_port_id: "out",
      target_node_id: "agent_main",
      target_port_id: "in",
      kind: "flow",
    },
    {
      id: "e_agent_end",
      source_node_id: "agent_main",
      source_port_id: "out",
      target_node_id: "end",
      target_port_id: "in",
      kind: "flow",
    },
  ];

  if (Array.isArray(recipe.toolkits) && recipe.toolkits.length > 0) {
    const tp = make_toolkit_pool_node(
      recipe.toolkits,
      recipe.merge_with_user_selected !== false,
    );
    nodes.push(tp);
    edges.push({
      id: "e_agent_tp",
      source_node_id: "agent_main",
      source_port_id: "attach_top",
      target_node_id: tp.id,
      target_port_id: "attach_bot",
      kind: "attach",
    });
  }

  if (Array.isArray(recipe.subagent_pool) && recipe.subagent_pool.length > 0) {
    const sp = make_subagent_pool_node(recipe.subagent_pool);
    nodes.push(sp);
    edges.push({
      id: "e_agent_sp",
      source_node_id: "agent_main",
      source_port_id: "attach_bot",
      target_node_id: sp.id,
      target_port_id: "attach_top",
      kind: "attach",
    });
  }

  const { agent, toolkits, subagent_pool, ...rest } = recipe;
  const merge =
    typeof recipe.merge_with_user_selected === "boolean"
      ? recipe.merge_with_user_selected
      : true;
  return { ...rest, merge_with_user_selected: merge, nodes, edges };
}
