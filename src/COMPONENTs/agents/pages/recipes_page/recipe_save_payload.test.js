import { to_save_payload } from "./recipe_save_payload";

const baseAgent = {
  id: "agent_main",
  type: "agent",
  override: { model: "gpt", prompt: "hi" },
  outputs: [{ name: "output", type: "string" }],
};

function graphRecipe(extraNodes = [], extraEdges = []) {
  return {
    name: "X",
    nodes: [
      {
        id: "start",
        type: "start",
        outputs: [{ name: "text", type: "string" }],
      },
      baseAgent,
      { id: "end", type: "end", outputs_schema: [{ name: "output", type: "string" }] },
      ...extraNodes,
    ],
    edges: [
      {
        id: "e_start_agent",
        kind: "flow",
        source_node_id: "start",
        source_port_id: "out",
        target_node_id: "agent_main",
        target_port_id: "in",
      },
      {
        id: "e_agent_end",
        kind: "flow",
        source_node_id: "agent_main",
        source_port_id: "out",
        target_node_id: "end",
        target_port_id: "in",
      },
      ...extraEdges,
    ],
  };
}

test("converts node.toolkits to legacy whole-toolkit refs", () => {
  const recipe = graphRecipe(
    [
      {
        id: "tp_1",
        type: "toolkit_pool",
        toolkits: [
          { id: "core", config: {} },
          { id: "external_api", config: {} },
        ],
      },
    ],
    [
      {
        id: "e_agent_tp",
        kind: "attach",
        source_node_id: "agent_main",
        source_port_id: "attach_top",
        target_node_id: "tp_1",
        target_port_id: "attach_bot",
      },
    ],
  );
  const out = to_save_payload(recipe);
  expect(out.toolkits).toEqual([{ id: "core" }, { id: "external_api" }]);
});

test("dedupes duplicate toolkit ids", () => {
  const recipe = graphRecipe(
    [
      {
        id: "tp_1",
        type: "toolkit_pool",
        toolkits: [
          { id: "core", config: {} },
          { id: "core", config: {} },
        ],
      },
    ],
    [
      {
        id: "e_agent_tp",
        kind: "attach",
        source_node_id: "agent_main",
        source_port_id: "attach_top",
        target_node_id: "tp_1",
        target_port_id: "attach_bot",
      },
    ],
  );
  const out = to_save_payload(recipe);
  expect(out.toolkits).toEqual([{ id: "core" }]);
});

test("projects merge_with_user_selected from ToolkitPool switches", () => {
  const r1 = graphRecipe();
  expect(to_save_payload(r1).merge_with_user_selected).toBe(false);

  const r2 = graphRecipe(
    [{ id: "tp_1", type: "toolkit_pool", merge_with_user_selected: true }],
    [
      {
        id: "e_agent_tp",
        kind: "attach",
        source_node_id: "agent_main",
        source_port_id: "attach_top",
        target_node_id: "tp_1",
        target_port_id: "attach_bot",
      },
    ],
  );
  expect(to_save_payload(r2).merge_with_user_selected).toBe(true);
});

test("missing ToolkitPool node yields empty toolkits", () => {
  const recipe = graphRecipe();
  expect(to_save_payload(recipe).toolkits).toEqual([]);
});

test("plain agent prompt is saved as soul by default", () => {
  const out = to_save_payload(graphRecipe());
  expect(out.agent).toEqual({ prompt_format: "soul", prompt: "hi" });
});

test("normalizes start-prefixed built-in developer sentinel before saving", () => {
  const out = to_save_payload({
    ...graphRecipe(),
    name: "Default",
    nodes: [
      {
        id: "start",
        type: "start",
        outputs: [{ name: "text", type: "string" }],
      },
      {
        id: "agent_main",
        type: "agent",
        outputs: [{ name: "output", type: "string" }],
        override: {
          prompt:
            "{{#start.text#}}\n{{#start.images#}}\n{{#start.files#}}\n\n{{USE_BUILTIN_DEVELOPER_PROMPT}}",
        },
      },
      { id: "end", type: "end" },
    ],
  });

  expect(out.agent).toEqual({
    prompt_format: "skeleton",
    prompt: "{{USE_BUILTIN_DEVELOPER_PROMPT}}",
  });
});
