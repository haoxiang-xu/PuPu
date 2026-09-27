import {
  addable_nodes,
  build_node,
  catalog_entry,
  excluded_nodes,
  next_node_id,
  ports_for_type,
  search_nodes,
  NODE_GROUPS,
  NODE_GROUP_ICONS,
} from "./recipe_node_catalog";
import { TOOLKIT_POOL_TYPE, LEGACY_TOOLPOOL_TYPE } from "./recipe_graph";
import { validate_recipe_connection } from "./recipe_connection_rules";

describe("recipe node catalog", () => {
  test("every addable entry is complete and lands in a known group", () => {
    const entries = addable_nodes("agent");
    expect(entries.length).toBeGreaterThan(0);
    entries.forEach((entry) => {
      expect(typeof entry.type).toBe("string");
      expect(entry.label).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.icon).toBeTruthy();
      expect(NODE_GROUPS).toContain(entry.group);
      expect(Array.isArray(entry.ports)).toBe(true);
      expect(typeof entry.defaults).toBe("function");
    });
  });

  test("every group has an icon, and it exists in the manifest", () => {
    const { UISVGs } = require("../../../../BUILTIN_COMPONENTs/icon/icon_manifest");
    NODE_GROUPS.forEach((group) => {
      expect(NODE_GROUP_ICONS[group]).toBeTruthy();
      expect(NODE_GROUP_ICONS[group] in UISVGs).toBe(true);
    });
    expect(NODE_GROUP_ICONS.steps).toBe("route");
    expect(NODE_GROUP_ICONS.attachments).toBe("puzzle_2");
  });

  test("the palette can only offer nodes creation knows how to build", () => {
    addable_nodes("agent").forEach((entry) => {
      const node = build_node(entry.type, { id: "n_1", x: 10, y: 20 });
      expect(node).toMatchObject({ id: "n_1", type: entry.type, x: 10, y: 20 });
      expect(node.deletable).toBe(true);
    });
  });

  test("build_node falls back to the entry's own position when none is given", () => {
    const node = build_node("agent", { id: "agent_1" });
    expect(node.x).toBe(400);
    expect(node.y).toBe(300);
  });

  test("build_node rounds a fractional canvas position", () => {
    expect(build_node("agent", { id: "a", x: 10.6, y: -3.2 })).toMatchObject({
      x: 11,
      y: -3,
    });
  });

  test("build_node refuses a type it does not know", () => {
    expect(build_node("nonsense", { id: "x", x: 0, y: 0 })).toBeNull();
    expect(catalog_entry("nonsense")).toBeNull();
  });

  test("the legacy toolpool type resolves to the toolkit pool entry", () => {
    expect(catalog_entry(LEGACY_TOOLPOOL_TYPE).type).toBe(TOOLKIT_POOL_TYPE);
    expect(ports_for_type(LEGACY_TOOLPOOL_TYPE)).toEqual(
      ports_for_type(TOOLKIT_POOL_TYPE),
    );
  });

  test("start and end keep their ports without being addable", () => {
    expect(ports_for_type("start")).toEqual([
      { id: "out", side: "right", kind: "out" },
    ]);
    expect(ports_for_type("end")).toEqual([
      { id: "in", side: "left", kind: "in" },
    ]);
    const addable = addable_nodes("agent").map((e) => e.type);
    expect(addable).not.toContain("start");
    expect(addable).not.toContain("end");
  });

  test("an unknown type has no ports rather than borrowing another node's", () => {
    expect(ports_for_type("nonsense")).toEqual([]);
  });

  test("ids avoid the ones already on the canvas", () => {
    const taken = new Set(["agent_1", "agent_2"]);
    expect(next_node_id("agent", taken)).toBe("agent_3");
    expect(next_node_id(TOOLKIT_POOL_TYPE, new Set())).toBe("tp_1");
    expect(next_node_id("subagent_pool", new Set(["sp_1"]))).toBe("sp_2");
  });

  test("a workflow graph is offered no agent node and no attach pool", () => {
    const workflow = addable_nodes("workflow").map((e) => e.type);
    expect(workflow).not.toContain("agent");
    expect(workflow).not.toContain(TOOLKIT_POOL_TYPE);
    expect(workflow).not.toContain("subagent_pool");

    const excluded = excluded_nodes("workflow").map((e) => e.type);
    expect(excluded).toContain("agent");
    expect(excluded).toContain("subagent_pool");
  });

  test("a missing graph kind reads as an agent graph, so today is unchanged", () => {
    expect(addable_nodes(undefined)).toEqual(addable_nodes("agent"));
    expect(addable_nodes(null)).toEqual(addable_nodes("agent"));
    expect(excluded_nodes("agent")).toEqual([]);
  });

  test("search matches the description, not only the label", () => {
    expect(search_nodes("delegate").map((e) => e.type)).toEqual([
      "subagent_pool",
    ]);
    expect(search_nodes("AGENT").map((e) => e.type)).toContain("agent");
    expect(search_nodes("   ")).toEqual(addable_nodes("agent"));
    expect(search_nodes("zzz-no-such-node")).toEqual([]);
  });

  test("a built node connects under the existing connection rules", () => {
    /* The canvas attaches ports at render time rather than storing them on the
     * node (recipe_canvas.js `nodes` memo), so do the same here. */
    const on_canvas = (type, id) => ({
      ...build_node(type, { id, x: 0, y: 0 }),
      ports: ports_for_type(type),
    });
    const agent = on_canvas("agent", "agent_9");
    const pool = on_canvas(TOOLKIT_POOL_TYPE, "tp_9");
    const end = on_canvas("end", "end");

    expect(
      validate_recipe_connection(
        { node: agent, port: "attach_bot" },
        { node: pool, port: "attach_top" },
        { edges: [] },
      ),
    ).toBe(true);

    expect(
      validate_recipe_connection(
        { node: agent, port: "out" },
        { node: end, port: "in" },
        { edges: [] },
      ),
    ).toBe(true);
  });

  test("an end node built from the catalog has no addable entry but does have ports", () => {
    expect(catalog_entry("end")).toBeNull();
    expect(build_node("end", { id: "end" })).toBeNull();
    expect(ports_for_type("end")).toHaveLength(1);
  });
});
