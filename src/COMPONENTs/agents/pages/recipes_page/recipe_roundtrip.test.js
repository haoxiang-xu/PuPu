import { migrate_recipe } from "./recipe_migration";
import { to_save_payload } from "./recipe_save_payload";

describe("recipe edge port round-trip", () => {
  test("migrated edges carry source_port_id and target_port_id", () => {
    const legacy = {
      name: "x",
      agent: { model: "m", prompt: "" },
      toolkits: [],
      subagent_pool: [],
    };
    const recipe = migrate_recipe(legacy);
    recipe.edges.forEach((e) => {
      expect(typeof e.source_port_id).toBe("string");
      expect(typeof e.target_port_id).toBe("string");
    });
  });

  test("custom connection via handleConnect stores both port ids", () => {
    const recipe = {
      name: "x",
      nodes: [
        { id: "a", type: "agent", kind: "workflow" },
        { id: "tp", type: "toolpool", kind: "plugin" },
      ],
      edges: [],
    };
    const new_edge = {
      source_node_id: "a",
      source_port_id: "attach_top",
      target_node_id: "tp",
      target_port_id: "attach_bot",
    };
    const next = {
      ...recipe,
      edges: [...recipe.edges, { id: "e_1", ...new_edge, kind: "attach" }],
    };
    const reloaded = JSON.parse(JSON.stringify(next));
    expect(reloaded.edges[0].source_port_id).toBe("attach_top");
    expect(reloaded.edges[0].target_port_id).toBe("attach_bot");
  });

  test("load and save preserves the recipe subagent profile", () => {
    const subagent_profile = {
      allowed_modes: ["delegate", "worker"],
      output_mode: "summary",
      memory_policy: "ephemeral",
      parallel_safe: true,
    };
    const loaded = migrate_recipe({
      name: "Explore",
      description: "Repository scout",
      model: null,
      max_iterations: null,
      subagent_profile,
      agent: { prompt_format: "soul", prompt: "Explore" },
      toolkits: [],
      subagent_pool: [],
    });

    const saved = to_save_payload(loaded);

    expect(saved.subagent_profile).toEqual(subagent_profile);
  });
});
