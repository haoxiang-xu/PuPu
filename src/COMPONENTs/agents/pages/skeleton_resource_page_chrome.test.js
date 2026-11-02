import React from "react";
import { install_legacy_store_bridge } from "./recipes_page/legacy_store_test_bridge";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import { api } from "../../../SERVICEs/api";
import { EDIT_CONFLICT_ERROR, RESOURCE_RESULT_KEYS } from "./recipes_page/skeleton_resource_capture";
import { openRunMenu, pressCanvasNode } from "./recipes_page/skeleton_canvas_test_helpers";
import { new_agent_document } from "./recipes_page/skeleton_graph_edits";

/* The native page in the unified design (owner decision 2026-10-22): the
 * graph full-bleed, the detail panel floating on the right, one control center
 * at the bottom middle — undo / redo / home · Run · Save — the breadcrumb at
 * the top left, and nothing else. Everything the old bar, the canvas's own
 * buttons and the row of nodes did is still reachable, and these say where.
 * The editor is drawn by a probe that reports a press as a click and keeps
 * its last props, so Home can be read off the token it moves. */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
/* The editor speaks v2 only (#357 G1); these mocks are graph-only. */
install_legacy_store_bridge(api.unchain);
let editor = null;
jest.mock("../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: (props) => {
    editor = props;
    return (
      <div data-testid="flow-editor">
        {(props.nodes || []).map((node) => (
          <div key={node.id} onMouseDown={() => props.on_select?.(node.id)}>{props.render_node(node)}</div>
        ))}
      </div>
    );
  },
}));

const cfg = { theme: {}, onThemeMode: "light_mode" };
const result = (overrides) => ({
  ...Object.fromEntries(RESOURCE_RESULT_KEYS.map((key) => [key, key === "diagnostics" ? [] : null])),
  id: "life", kind: "workflow", name: "life", ...overrides,
});
const flow = (id, a, b) => ({ id, kind: "flow", source_node_id: a, source_port_id: "out", target_node_id: b, target_port_id: "in" });
const doc = () => ({
  schema_version: 1, kind: "workflow", id: "life", name: "life",
  nodes: [
    { id: "start", type: "start", config: { execution: { outputs: [{ name: "text", source: { kind: "result", path: ["text"] } }] } } },
    { id: "end", type: "end", config: { execution: {
      inputs: [{ name: "payload", value: { kind: "ref", node_id: "start", path: ["text"] }, missing: "error" }], outputs: [] } } },
  ],
  edges: [flow("e1", "start", "end")],
});
const show = () => render(<ConfigContext.Provider value={cfg}><SkeletonResourcePage resourceId="life" /></ConfigContext.Provider>);
const open = async () => {
  api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(result({ document: doc(), edit_token: "t1" }));
  show();
  await screen.findByTestId("skeleton-node-end");
};
const control = (title) => within(screen.getByTitle(title)).getByRole("button");
const saveButton = () => screen.getByRole("button", { name: /^(Save|Saving…)$/ });
const endInputs = (payload) => payload.document.nodes.find((n) => n.id === "end").config.execution.inputs;
const keys = (init) => fireEvent.keyDown(window, init);

beforeEach(() => {
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.saveSkeletonResource = jest.fn(async ({ document }) => result({ document, edit_token: "t2" }));
});

describe("what is on the page", () => {
  test("the canvas and the floating chrome, and none of the old bar, buttons or node row", async () => {
    await open();
    expect(screen.getByTestId("skeleton-control-center")).toBeInTheDocument();
    expect(screen.queryByTestId("skeleton-save-bar")).toBeNull();
    expect(screen.queryByTestId("skeleton-node-list")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add node" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fit graph" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Center this graph" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/^Saved$/);
    expect(screen.getByTestId("skeleton-detail-panel-shell").style.opacity).toBe("0");
  });

  test("the canvas fills the page: a full-page flex column it grows into", async () => {
    /* jsdom lays nothing out, so the contract is pinned as styles. The canvas
       takes its height by growing (flex: 1); once the page stopped being a
       flex column it grew into nothing, and the graph was 0px tall in the
       app (2026-10-22). */
    await open();
    const canvas = screen.getByTestId("skeleton-canvas");
    const frame = canvas.parentElement; // eslint-disable-line testing-library/no-node-access
    expect(canvas.style.flex).toMatch(/^1/);
    expect(frame.style.position).toBe("absolute");
    expect(frame.getAttribute("style")).toMatch(/inset: 0/);
    expect(frame.style.display).toBe("flex");
    expect(frame.style.flexDirection).toBe("column");
  });

  test("pressing a node on the canvas opens the right side menu", async () => {
    await open();
    pressCanvasNode("end");
    expect(screen.getByTestId("skeleton-detail-panel-shell").style.opacity).toBe("1");
    expect(screen.getByText("+ Add input")).toBeInTheDocument();
  });
});

describe("Save, in the control center", () => {
  test("withheld when there is nothing to save, offered after an edit, and not pressed twice", async () => {
    let release;
    api.unchain.saveSkeletonResource = jest.fn(() => new Promise((resolve) => { release = resolve; }));
    await open();
    expect(saveButton()).toBeDisabled();
    pressCanvasNode("end");
    fireEvent.click(screen.getByText("+ Add input"));
    expect(screen.getByRole("status")).toHaveTextContent(/unsaved/i);
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());
    expect(saveButton()).toHaveTextContent("Saving…");
    expect(saveButton()).toBeDisabled();
    await act(async () => { release(result({ document: doc(), edit_token: "t2" })); });
  });

  test("a refused save is said in the strip above the control center", async () => {
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({ error: { code: "invalid_type", message: "document must be an object" } });
    await open();
    pressCanvasNode("end");
    fireEvent.click(screen.getByText("+ Add input"));
    fireEvent.click(saveButton());
    expect(await screen.findByTestId("skeleton-save-error")).toHaveTextContent(/must be an object/i);
    expect(within(screen.getByTestId("skeleton-above-controls")).getByTestId("skeleton-save-error")).toBeInTheDocument();
  });

  test("someone else saved first: a card above Save with two named choices, and Save withheld", async () => {
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({ error: EDIT_CONFLICT_ERROR });
    await open();
    pressCanvasNode("end");
    fireEvent.click(screen.getByText("+ Add input"));
    fireEvent.click(saveButton());
    await screen.findByTestId("skeleton-save-conflict");
    const card = within(screen.getByTestId("skeleton-above-controls")).getByTestId("skeleton-save-conflict");
    expect(card).toHaveTextContent(/nothing has been overwritten/i);
    expect(card.textContent).not.toMatch(/retry|try again/i);
    expect(saveButton()).toBeDisabled();
    api.unchain.getSkeletonResource.mockResolvedValue(result({ document: doc(), edit_token: "t9" }));
    fireEvent.click(within(card).getByRole("button", { name: "Look at theirs" }));
    await waitFor(() => expect(screen.queryByTestId("skeleton-save-conflict")).toBeNull());
    expect(api.unchain.getSkeletonResource).toHaveBeenCalledTimes(2);
    expect(within(screen.getByRole("status")).queryByText(/unsaved/i)).toBeNull();
  });
});

describe("undo and redo", () => {
  test("the control center steps the draft back and forward, and Save sends what is on screen", async () => {
    await open();
    expect(control(/^Undo/)).toBeDisabled();
    pressCanvasNode("end");
    fireEvent.click(screen.getByText("+ Add input"));
    expect(control(/^Undo/)).toBeEnabled();
    fireEvent.click(control(/^Undo/));
    expect(control(/^Redo/)).toBeEnabled();
    fireEvent.click(saveButton());
    await waitFor(() => expect(api.unchain.saveSkeletonResource).toHaveBeenCalled());
    expect(endInputs(api.unchain.saveSkeletonResource.mock.calls[0][0])).toHaveLength(1);
  });

  test("the keyboard does the same, but not while a field is being typed in", async () => {
    await open();
    pressCanvasNode("end");
    fireEvent.click(screen.getByText("+ Add input"));
    keys({ key: "z", metaKey: true });
    expect(control(/^Redo/)).toBeEnabled();
    keys({ key: "Z", metaKey: true, shiftKey: true });
    expect(control(/^Redo/)).toBeDisabled();
    const field = screen.getAllByRole("textbox")[0];
    field.focus();
    keys({ key: "z", metaKey: true });
    expect(control(/^Redo/)).toBeDisabled();
    field.blur();
    fireEvent.click(saveButton());
    await waitFor(() => expect(api.unchain.saveSkeletonResource).toHaveBeenCalled());
    expect(endInputs(api.unchain.saveSkeletonResource.mock.calls[0][0])).toHaveLength(2);
  });
});

describe("the rest of the control center", () => {
  test("Home asks the canvas to center this graph's Start", async () => {
    await open();
    const before = editor.reset_token;
    fireEvent.click(control("Center"));
    expect(editor.reset_token).toBe(before + 1);
    expect(editor.reset_focus_node_id).toBe("start");
  });

  test("Run opens its menu, which asks once whether the saved version can run; Escape closes it first", async () => {
    await open();
    api.unchain.preflightSkeletonResource = jest.fn().mockResolvedValue({ ok: true, definition_digest: "sha256:a" });
    await act(async () => { openRunMenu(); });
    expect(api.unchain.preflightSkeletonResource).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("skeleton-preflight-state")).toHaveTextContent("Ready to run.");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("skeleton-run-menu")).toBeNull();
  });
});

describe("finding a node by name, now that the row of nodes is gone", () => {
  test("⌘F opens the finder; picking a node opens it and centers it", async () => {
    await open();
    fireEvent.keyDown(document, { key: "f", metaKey: true });
    expect(screen.getByRole("textbox", { name: "Find a node" })).toBeInTheDocument();
    const before = editor.reset_token;
    fireEvent.click(screen.getByTestId("palette-node-end"));
    expect(screen.queryByRole("textbox", { name: "Find a node" })).toBeNull();
    expect(screen.getByTestId("skeleton-detail-panel-shell").style.opacity).toBe("1");
    expect(screen.getByText("+ Add input")).toBeInTheDocument();
    expect(editor.reset_token).toBe(before + 1);
    expect(editor.reset_focus_node_id).toBe("end");
    fireEvent.click(control("Center"));
    expect(editor.reset_focus_node_id).toBe("start");
  });

  test("the empty canvas's right-click menu offers it too, on a graph that can be edited", async () => {
    const agent = new_agent_document({ id: "life", name: "life" }).document;
    api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(result({ kind: "agent", document: agent, edit_token: "t1" }));
    api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [], unavailable: [] });
    show();
    await screen.findByTestId("skeleton-node-agent");
    act(() => editor.on_context_menu({ client_x: 5, client_y: 5, canvas_x: 0, canvas_y: 0, target: { kind: "canvas", id: null } }));
    fireEvent.click(await screen.findByText("Find node…"));
    expect(screen.getByRole("textbox", { name: "Find a node" })).toBeInTheDocument();
  });
});
