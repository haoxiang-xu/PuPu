import { migrate_recipe, is_legacy_recipe } from "./recipe_migration";

describe("is_legacy_recipe", () => {
  test("returns true when recipe has no nodes field", () => {
    expect(is_legacy_recipe({ name: "x", agent: {} })).toBe(true);
  });
  test("returns false when recipe already has nodes", () => {
    expect(is_legacy_recipe({ name: "x", nodes: [], edges: [] })).toBe(false);
  });
});

describe("migrate_recipe", () => {
  test("passes through an already-migrated recipe", () => {
    const recipe = { name: "x", nodes: [{ id: "start" }], edges: [] };
    expect(migrate_recipe(recipe)).toBe(recipe);
  });

  test("creates start / agent_main / end from legacy minimal recipe", () => {
    const legacy = {
      name: "x",
      agent: { model: "claude-opus-4-7", prompt: "Hello" },
      toolkits: [],
      subagent_pool: [],
    };
    const migrated = migrate_recipe(legacy);
    const ids = migrated.nodes.map((n) => n.id);
    expect(ids).toEqual(["start", "agent_main", "end"]);
    const agent = migrated.nodes.find((n) => n.id === "agent_main");
    expect(agent.override.model).toBe("claude-opus-4-7");
    expect(agent.override.prompt).toContain("{{#start.text#}}");
    expect(agent.override.prompt).toContain("Hello");
    const edgePairs = migrated.edges.map(
      (e) => `${e.source_node_id}->${e.target_node_id}`,
    );
    expect(edgePairs).toContain("start->agent_main");
    expect(edgePairs).toContain("agent_main->end");
  });

  test("adds ToolkitPool when legacy recipe has toolkits", () => {
    const legacy = {
      name: "x",
      agent: { model: "m", prompt: "" },
      toolkits: [{ id: "web", enabled_tools: ["web_search"] }],
      subagent_pool: [],
    };
    const migrated = migrate_recipe(legacy);
    const tp = migrated.nodes.find((n) => n.type === "toolkit_pool");
    expect(tp).toBeTruthy();
    expect(tp.toolkits.length).toBe(1);
    const attach = migrated.edges.find((e) => e.kind === "attach");
    expect(attach).toBeTruthy();
    expect(attach.source_node_id).toBe("agent_main");
    expect(attach.target_node_id).toBe(tp.id);
  });

  test("adds subagent_pool when legacy recipe has subagent_pool entries", () => {
    const legacy = {
      name: "x",
      agent: { model: "m", prompt: "" },
      toolkits: [],
      subagent_pool: [{ kind: "ref", template_name: "reviewer" }],
    };
    const migrated = migrate_recipe(legacy);
    const sp = migrated.nodes.find((n) => n.type === "subagent_pool");
    expect(sp).toBeTruthy();
    expect(sp.subagents.length).toBe(1);
  });

  test("does not duplicate {{#start.text#}} if prompt already references it", () => {
    const legacy = {
      name: "x",
      agent: { model: "m", prompt: "Prefix {{#start.text#}} suffix" },
      toolkits: [],
      subagent_pool: [],
    };
    const migrated = migrate_recipe(legacy);
    const agent = migrated.nodes.find((n) => n.id === "agent_main");
    const matches = agent.override.prompt.match(/\{\{#start\.text#\}\}/g);
    expect(matches.length).toBe(1);
  });

  test("does not prepend start variables to the built-in developer sentinel", () => {
    const legacy = {
      name: "Default",
      agent: {
        prompt_format: "skeleton",
        prompt: "{{USE_BUILTIN_DEVELOPER_PROMPT}}",
      },
      toolkits: [],
      subagent_pool: [],
    };
    const migrated = migrate_recipe(legacy);
    const agent = migrated.nodes.find((n) => n.id === "agent_main");
    expect(agent.override.prompt_format).toBe("skeleton");
    expect(agent.override.prompt).toBe("{{USE_BUILTIN_DEVELOPER_PROMPT}}");
  });
});

describe("migrate_recipe — toolkits schema", () => {
  test("legacy top-level toolkits become node.toolkits with whole-toolkit refs", () => {
    const legacy = {
      name: "X",
      agent: { model: "gpt", prompt: "" },
      toolkits: [
        { id: "core" },
        { id: "external_api", enabled_tools: ["fetch"] },
      ],
    };
    const out = migrate_recipe(legacy);
    const tp = out.nodes.find((n) => n.type === "toolkit_pool");
    expect(tp).toBeTruthy();
    expect(tp.toolkits).toEqual([
      { id: "core", config: {} },
      { id: "external_api", config: {}, enabled_tools: ["fetch"] },
    ]);
    expect(tp.tools).toBeUndefined();
  });

  test("ToolkitPool merge_with_user_selected defaults to true on migration", () => {
    const legacy = {
      name: "X",
      agent: { prompt: "" },
      toolkits: [{ id: "core" }],
    };
    const out = migrate_recipe(legacy);
    const tp = out.nodes.find((n) => n.type === "toolkit_pool");
    expect(tp.merge_with_user_selected).toBe(true);
  });

  test("explicit merge_with_user_selected is preserved on ToolkitPool", () => {
    const legacy = {
      name: "X",
      agent: { prompt: "" },
      toolkits: [{ id: "core" }],
      merge_with_user_selected: false,
    };
    const out = migrate_recipe(legacy);
    const tp = out.nodes.find((n) => n.type === "toolkit_pool");
    expect(tp.merge_with_user_selected).toBe(false);
  });

  test("dedupes legacy duplicate toolkit ids", () => {
    const legacy = {
      name: "X",
      agent: { prompt: "" },
      toolkits: [{ id: "core" }, { id: "core", enabled_tools: ["read"] }],
    };
    const out = migrate_recipe(legacy);
    const tp = out.nodes.find((n) => n.type === "toolkit_pool");
    expect(tp.toolkits).toEqual([{ id: "core", config: {} }]);
  });
});
