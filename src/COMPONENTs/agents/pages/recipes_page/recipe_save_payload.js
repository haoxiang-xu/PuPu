/* Build a save-ready payload from a node/edge recipe.
 *
 * The graph is the source of truth. The legacy top-level fields are still
 * emitted as a compatibility projection for old list/API paths. */

import { compile_recipe_graph } from "./recipe_graph";

const DEFAULT_START_PREFIX_RE =
  /^\s*\{\{#start\.text#\}\}\s*\{\{#start\.images#\}\}\s*\{\{#start\.files#\}\}\s*/;
const BUILTIN_DEVELOPER_PROMPT_SENTINEL =
  "{{USE_BUILTIN_DEVELOPER_PROMPT}}";

function normalize_agent_prompt(raw_prompt) {
  const prompt = typeof raw_prompt === "string" ? raw_prompt : "";
  const without_start_prelude = prompt.replace(DEFAULT_START_PREFIX_RE, "").trim();
  if (without_start_prelude === BUILTIN_DEVELOPER_PROMPT_SENTINEL) {
    return BUILTIN_DEVELOPER_PROMPT_SENTINEL;
  }
  return prompt;
}

function infer_prompt_format(override, prompt) {
  if (
    override &&
    typeof override.prompt_format === "string" &&
    override.prompt_format
  ) {
    return override.prompt_format;
  }
  return prompt.trim() === BUILTIN_DEVELOPER_PROMPT_SENTINEL
    ? "skeleton"
    : "soul";
}

function normalize_agent_node(node) {
  if (!node || node.type !== "agent") return node;
  const override = node.override || {};
  const prompt = normalize_agent_prompt(override.prompt);
  return {
    ...node,
    override: {
      ...override,
      prompt_format: infer_prompt_format(override, prompt),
      prompt,
    },
  };
}

export function to_save_payload(recipe) {
  if (!recipe || !Array.isArray(recipe.nodes)) return recipe;

  const normalized_recipe = {
    ...recipe,
    nodes: recipe.nodes.map(normalize_agent_node),
  };
  const graph = compile_recipe_graph(normalized_recipe);
  const first_agent = graph.agents[0];
  const override = first_agent?.override || {};

  const prompt = normalize_agent_prompt(override.prompt);
  const agent = {
    prompt_format: infer_prompt_format(override, prompt),
    prompt,
  };

  const model =
    typeof override.model === "string" && override.model
      ? override.model
      : recipe.model ?? null;

  return {
    ...normalized_recipe,
    nodes: graph.nodes,
    edges: graph.edges,
    agent,
    model,
    merge_with_user_selected: graph.merge_with_user_selected,
    toolkits: graph.toolkits,
    subagent_pool: graph.subagent_pool,
  };
}
