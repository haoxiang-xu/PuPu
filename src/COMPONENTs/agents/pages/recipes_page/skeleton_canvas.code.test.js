import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import SkeletonCanvas from "./skeleton_canvas";
import { code_source_text } from "./code_config";
import capture from "./code_capture.json";
import { Z } from "../../../../BUILTIN_COMPONENTs/layer/z_layers";
import { writeSkeletonViewport } from "../../../../SERVICEs/skeleton_layout";

/* A Code node on the native canvas (#357): shape C — header, three lines, a
   count — at a fixed height, with an expand button that opens a read-only
   viewer; the header alone below half zoom; the source path while the
   runtime holds a file reference. The editor is a probe that keeps its props
   and draws each node; the source reader is the one seam that is faked, so
   the drawing can be exercised before a text source exists (G1). */

let editor = null;
jest.mock("../../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: (props) => {
    editor = props;
    return <div data-testid="editor">{(props.nodes || []).map((node) => <div key={node.id}>{props.render_node(node)}</div>)}</div>;
  },
}));
jest.mock("./code_config", () => ({ ...jest.requireActual("./code_config"), code_source_text: jest.fn() }));
jest.mock("../../../../BUILTIN_COMPONENTs/code/code", () => function MockCode({ code }) {
  return <pre data-testid="viewer-code">{code}</pre>;
});

const complete = capture.rows.find((row) => row.case === "complete").config.code;
const SOURCE = "def main(input, context):\n    rows = [r for r in input[\"diff\"]]\n    if not rows:\n        return {\"rows\": 0}\n    return {\"rows\": len(rows)}\n";
const doc = (code) => ({
  schema_version: 1, kind: "agent", id: "c", name: "c",
  nodes: [
    { id: "start", type: "start", config: { execution: { outputs: [{ name: "message", source: { kind: "result", path: ["message"] } }] } } },
    { id: "score", type: "code", config: { execution: { inputs: [], outputs: [] }, ...(code === undefined ? {} : { code }) } },
    { id: "end", type: "end", config: { execution: { inputs: [], outputs: [] } } },
  ],
  edges: [],
});
const onSelectNode = jest.fn();
const show = (code, extra = {}) => render(
  <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <SkeletonCanvas resourceId="c" document={doc(code)} onSelectNode={onSelectNode} isDark={false} onGraphCommand={() => ({ ok: true })} {...extra} />
  </ConfigContext.Provider>,
);
const node = () => screen.getByTestId("code-node-score");
const actual = jest.requireActual("./code_config").code_source_text;

beforeEach(() => {
  localStorage.clear();
  onSelectNode.mockReset();
  code_source_text.mockImplementation(actual);
});

test("its ports are one inlet and one outlet, level with the header", () => {
  show(complete);
  expect(editor.nodes.find((entry) => entry.id === "score").ports).toStrictEqual([
    { id: "in", side: "left", kind: "in", anchor: 27 },
    { id: "out", side: "right", kind: "out", anchor: 27 },
  ]);
});

test("today's file source: the header names the runtime and the path is shown in place of the code", () => {
  show(complete);
  expect(node()).toHaveTextContent("score");
  expect(node()).toHaveTextContent("Code · builtin");
  expect(screen.getByTestId("code-node-score-source")).toHaveTextContent("tools/score.py · read when the run gets here");
  expect(screen.queryByTestId("code-node-score-block")).toBeNull();
  expect(screen.queryByTestId("code-node-score-expand")).toBeNull();
});

test("a new node says so", () => {
  show(undefined);
  expect(node()).toHaveTextContent("Code · choose a runtime");
  expect(screen.getByTestId("code-node-score-source")).toHaveTextContent("No source file yet");
});

test("a stored id that is not text is drawn without throwing", () => {
  const original = console.error;
  console.error = () => {};
  try {
    show({ ...complete, environment_profile_id: { toString: null }, source: { kind: "file", path: { toString: null } } });
  } finally {
    console.error = original;
  }
  expect(node()).toHaveTextContent("Code · choose a runtime");
  expect(screen.getByTestId("code-node-score-source")).toHaveTextContent("No source file yet");
});

describe("with a text source (the seam faked)", () => {
  beforeEach(() => {
    code_source_text.mockReturnValue({ available: true, text: SOURCE, path: "tools/score.py", reason: null });
  });

  test("three lines and a count at a fixed height; the expand button is there and opens the viewer on hover", async () => {
    show(complete);
    const block = screen.getByTestId("code-node-score-block");
    expect(block).toHaveTextContent("def main(input, context):");
    expect(block).toHaveTextContent("if not rows:");
    expect(block).not.toHaveTextContent("return {\"rows\": 0}");
    expect(block).toHaveTextContent("+2 lines");
    expect(block.style.height).toBe("72px");
    expect(node()).toHaveAttribute("data-viewer-open", "false");
    expect(screen.queryByTestId("code-node-score-source")).toBeNull();

    const expand = screen.getByTestId("code-node-score-expand");
    expect(expand.style.opacity).toBe("0");
    fireEvent.mouseEnter(node());
    expect(expand.style.opacity).toBe("1");
    /* A click pins it, which the engine reports the same way a hover does. */
    fireEvent.click(screen.getByRole("button", { name: "View the code of score" }));
    expect(node()).toHaveAttribute("data-viewer-open", "true");
    const viewer = await screen.findByTestId("code-node-score-viewer");
    expect(viewer).toHaveTextContent("Read-only · 5 lines");
    expect(screen.getByTestId("viewer-code")).toHaveTextContent("return {\"rows\": len(rows)}");
    /* jsdom cannot measure the bubble, so the engine keeps it hidden and the
       a11y tree skips it; the text query does not. */
    fireEvent.click(within(viewer).getByText("Edit in panel"));
    expect(onSelectNode).toHaveBeenCalledWith("score");
    expect(node()).toHaveAttribute("data-viewer-open", "false");
  });

  test("the block's height does not follow the code", () => {
    show(complete);
    const tall = screen.getByTestId("code-node-score-block").style.height;
    code_source_text.mockReturnValue({ available: true, text: "x = 1\n", path: "tools/score.py", reason: null });
    show({ ...complete, source: { kind: "file", path: "tools/other.py" } });
    const blocks = screen.getAllByTestId("code-node-score-block");
    expect(blocks[1].style.height).toBe(tall);
    expect(blocks[1]).toHaveTextContent("1 line");
  });

  test("a press on the node closes the viewer and keeps it shut until the button is released", async () => {
    show(complete);
    fireEvent.mouseEnter(node());
    fireEvent.click(screen.getByRole("button", { name: "View the code of score" }));
    expect(node()).toHaveAttribute("data-viewer-open", "true");
    fireEvent.mouseDown(node(), { button: 0 });
    expect(node()).toHaveAttribute("data-viewer-open", "false");
    /* Held: the button's own reports are ignored, and releasing does not
       reopen what the press closed. */
    fireEvent.click(screen.getByRole("button", { name: "View the code of score" }));
    expect(node()).toHaveAttribute("data-viewer-open", "false");
    fireEvent.mouseUp(window);
    expect(node()).toHaveAttribute("data-viewer-open", "false");
    fireEvent.click(screen.getByRole("button", { name: "View the code of score" }));
    expect(node()).toHaveAttribute("data-viewer-open", "true");
  });

  test("below half zoom the block and its button go away and the header stays", async () => {
    show(complete);
    expect(screen.getByTestId("code-node-score-block")).toBeInTheDocument();
    editor.viewport_out_ref.current = { x: 0, y: 0, zoom: 0.4 };
    fireEvent.wheel(screen.getByTestId("skeleton-canvas"));
    expect(screen.queryByTestId("code-node-score-block")).toBeNull();
    expect(screen.queryByTestId("code-node-score-expand")).toBeNull();
    expect(node()).toHaveTextContent("Code · builtin");
    editor.viewport_out_ref.current = { x: 0, y: 0, zoom: 0.5 };
    fireEvent.mouseUp(screen.getByTestId("skeleton-canvas"));
    expect(screen.getByTestId("code-node-score-block")).toBeInTheDocument();
  });

  test("a graph opened at low zoom starts folded, and a gesture back to readable zoom unfolds it", () => {
    writeSkeletonViewport("c", { x: 0, y: 0, zoom: 0.3 });
    show(complete);
    expect(editor.restore_viewport).toMatchObject({ zoom: 0.3 });
    expect(screen.queryByTestId("code-node-score-block")).toBeNull();
    expect(node()).toHaveTextContent("Code · builtin");
    editor.viewport_out_ref.current = { x: 0, y: 0, zoom: 1 };
    fireEvent.mouseUp(screen.getByTestId("skeleton-canvas"));
    expect(screen.getByTestId("code-node-score-block")).toBeInTheDocument();
  });
});


test("the code viewer uses the popover layer of the real Tooltip engine", async () => {
  code_source_text.mockReturnValue({ available: true, text: SOURCE, path: "tools/score.py", reason: null });
  show(complete);
  fireEvent.mouseEnter(node());
  fireEvent.click(screen.getByRole("button", { name: "View the code of score" }));
  const viewer = await screen.findByTestId("code-node-score-viewer");
  expect(viewer.closest('[role="tooltip"]').style.zIndex).toBe(String(Z.POPOVER));
});
