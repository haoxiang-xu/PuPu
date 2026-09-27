import {
  buildRecipeCanvasContextMenuItems,
  buildRecipeContextMenuItems,
  buildRecipeEdgeContextMenuItems,
  buildRecipeNodeContextMenuItems,
} from "./recipe_canvas_context_menu_items";
import { TOOLKIT_POOL_TYPE } from "./recipe_graph";
import { UISVGs } from "../../../../BUILTIN_COMPONENTs/icon/icon_manifest";

const ids = (items) => items.filter((i) => i.type !== "separator").map((i) => i.id);
const byId = (items, id) => items.find((i) => i.id === id);

const agent = { id: "agent_1", type: "agent", deletable: true };
const start = { id: "start", type: "start", deletable: false };
const end = { id: "end", type: "end", deletable: false };
const pool = { id: "tp_1", type: TOOLKIT_POOL_TYPE, deletable: true };

describe("canvas menu", () => {
  test("offers adding, clipboard and view actions", () => {
    expect(ids(buildRecipeCanvasContextMenuItems({}))).toEqual([
      "add_node",
      "paste",
      "select_all",
      "fit_to_view",
      "reset_zoom",
    ]);
  });

  test("paste is disabled until there is something to paste", () => {
    expect(byId(buildRecipeCanvasContextMenuItems({}), "paste").disabled).toBe(true);
    expect(
      byId(buildRecipeCanvasContextMenuItems({ canPaste: true }), "paste").disabled,
    ).toBe(false);
  });

  test("shortcuts follow the platform, with the command glyph on macOS", () => {
    const mac = byId(buildRecipeCanvasContextMenuItems({ isMac: true }), "paste");
    expect(mac).toMatchObject({ trail_icon: "command", trail: "V" });

    const win = byId(buildRecipeCanvasContextMenuItems({ isMac: false }), "paste");
    expect(win.trail).toBe("Ctrl+V");
    expect(win.trail_icon).toBeUndefined();
  });

  test("the view actions advertise no shortcut, because nothing binds one", () => {
    const items = buildRecipeCanvasContextMenuItems({ isMac: true });
    ["fit_to_view", "reset_zoom"].forEach((id) => {
      const row = byId(items, id);
      expect(row.trail).toBeUndefined();
      expect(row.trail_icon).toBeUndefined();
    });
  });

  test("a row that opens another surface is marked as a doorway", () => {
    expect(byId(buildRecipeCanvasContextMenuItems({}), "add_node").trail_icon).toBe(
      "arrow_right_s",
    );
    expect(
      byId(buildRecipeNodeContextMenuItems({ node: agent }), "insert_after").trail_icon,
    ).toBe("arrow_right_s");
    expect(
      byId(buildRecipeEdgeContextMenuItems({}), "insert_node_here").trail_icon,
    ).toBe("arrow_right_s");
  });

  test("the view rows are bare — no glyph, no shortcut", () => {
    const items = buildRecipeCanvasContextMenuItems({ isMac: true });
    ["fit_to_view", "reset_zoom"].forEach((id) => {
      const row = byId(items, id);
      expect(row.icon).toBeUndefined();
      expect(row.prefix_icon).toBeUndefined();
      expect(row.trail).toBeUndefined();
      expect(row.trail_icon).toBeUndefined();
    });
  });

  test("select all is the one view-adjacent row that keeps a glyph", () => {
    expect(byId(buildRecipeCanvasContextMenuItems({}), "select_all").icon).toBe("shape");
  });
});

describe("node menu keeps its shape across kinds", () => {
  const shape = (items) =>
    items.map((i) => (i.type === "separator" ? "—" : i.id)).join(" ");

  test("an agent node has every row enabled", () => {
    const items = buildRecipeNodeContextMenuItems({
      node: agent,
      isMac: true,
      onRename: () => {},
    });
    expect(shape(items)).toBe(
      "open_detail — rename copy — insert_after disconnect — delete",
    );
    items
      .filter((i) => i.type !== "separator")
      .forEach((i) => expect(i.disabled).toBeFalsy());
  });

  test("start keeps the same rows, greyed, with the reason in the trailing slot", () => {
    const items = buildRecipeNodeContextMenuItems({ node: start, onRename: () => {} });
    expect(shape(items)).toBe(
      "open_detail — rename copy — insert_after disconnect — delete",
    );
    expect(byId(items, "rename")).toMatchObject({ disabled: true, trail: "fixed" });
    expect(byId(items, "copy")).toMatchObject({ disabled: true, trail: "one only" });
    expect(byId(items, "delete")).toMatchObject({ disabled: true, trail: "required" });
  });

  test("end is protected the same way", () => {
    const items = buildRecipeNodeContextMenuItems({ node: end });
    expect(byId(items, "delete").disabled).toBe(true);
  });

  test("delete follows node.deletable, the flag the delete key already reads", () => {
    expect(
      byId(buildRecipeNodeContextMenuItems({ node: { ...agent, deletable: false } }), "delete")
        .disabled,
    ).toBe(true);
    /* A node that simply does not carry the flag is deletable. */
    expect(
      byId(buildRecipeNodeContextMenuItems({ node: { id: "x", type: "agent" } }), "delete")
        .disabled,
    ).toBe(false);
  });

  test("an attach node says Detach and is offered nothing to insert after", () => {
    const items = buildRecipeNodeContextMenuItems({ node: pool });
    expect(byId(items, "disconnect").label).toBe("Detach");
    expect(byId(items, "insert_after")).toBeUndefined();
    expect(byId(items, "copy").disabled).toBe(false);
  });

  test("delete is last and alone behind a separator", () => {
    const items = buildRecipeNodeContextMenuItems({ node: agent });
    expect(items[items.length - 1].id).toBe("delete");
    expect(items[items.length - 2]).toEqual({ type: "separator" });
    expect(items.filter((i) => i.danger)).toHaveLength(1);
  });

  test("kind-specific rows appear only when their handler is supplied", () => {
    expect(ids(buildRecipeNodeContextMenuItems({ node: pool }))).not.toContain("edit_graph");
    expect(
      ids(buildRecipeNodeContextMenuItems({ node: pool, onEditGraph: () => {} })),
    ).toContain("edit_graph");
    expect(
      ids(buildRecipeNodeContextMenuItems({ node: agent, onViewCode: () => {} })),
    ).toContain("view_code");
  });

  test("copy carries the platform shortcut, and Duplicate no longer exists", () => {
    const items = buildRecipeNodeContextMenuItems({ node: agent, isMac: true });
    expect(byId(items, "copy")).toMatchObject({
      disabled: false,
      trail_icon: "command",
      trail: "C",
    });
    expect(byId(buildRecipeNodeContextMenuItems({ node: start }), "copy").disabled).toBe(true);
    /* Copy + Paste covers it; two rows for one capability was one too many. */
    expect(byId(items, "duplicate")).toBeUndefined();
  });

  test("rename only appears once something can rename, like the other kind-specific rows", () => {
    expect(ids(buildRecipeNodeContextMenuItems({ node: agent }))).not.toContain("rename");
    expect(
      ids(buildRecipeNodeContextMenuItems({ node: agent, onRename: () => {} })),
    ).toContain("rename");
  });

  test("no node means no menu", () => {
    expect(buildRecipeNodeContextMenuItems({ node: null })).toEqual([]);
  });
});

describe("edge menu", () => {
  test("offers inserting and deleting, with delete marked destructive", () => {
    const items = buildRecipeEdgeContextMenuItems({});
    expect(ids(items)).toEqual(["insert_node_here", "delete_connection"]);
    expect(byId(items, "delete_connection").danger).toBe(true);
  });

  test("attach wiring is offered no insertion, only deletion", () => {
    const items = buildRecipeEdgeContextMenuItems({ edgeIsAttach: true });
    expect(ids(items)).toEqual(["delete_connection"]);
    expect(items.some((i) => i.type === "separator")).toBe(false);
  });
});

describe("dispatch by target", () => {
  test("each target kind gets its own menu", () => {
    expect(ids(buildRecipeContextMenuItems({ kind: "canvas" }, {}))).toContain("add_node");
    expect(ids(buildRecipeContextMenuItems({ kind: "node" }, { node: agent }))).toContain("delete");
    expect(ids(buildRecipeContextMenuItems({ kind: "edge" }, {}))).toContain("delete_connection");
  });

  test("an unknown or missing target falls back to the canvas menu", () => {
    expect(ids(buildRecipeContextMenuItems(null, {}))).toContain("add_node");
    expect(ids(buildRecipeContextMenuItems({ kind: "nonsense" }, {}))).toContain("add_node");
  });
});

describe("icons", () => {
  test("every glyph the menus name exists in the icon manifest", () => {
    const menus = [
      buildRecipeCanvasContextMenuItems({}),
      buildRecipeNodeContextMenuItems({ node: agent, onEditGraph: () => {}, onViewCode: () => {} }),
      buildRecipeNodeContextMenuItems({ node: pool }),
      buildRecipeEdgeContextMenuItems({}),
    ];
    menus.flat().forEach((item) => {
      [item.icon, item.prefix_icon, item.trail_icon].filter(Boolean).forEach((name) => {
        expect(name in UISVGs).toBe(true);
      });
    });
  });
});
