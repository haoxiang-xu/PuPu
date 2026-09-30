import { render, screen, fireEvent, within } from "@testing-library/react";
import RecipeNodePalette from "./recipe_node_palette";
import { TOOLKIT_POOL_TYPE } from "./recipe_graph";

if (typeof global.ResizeObserver === "undefined") {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

function open(props = {}) {
  const onPick = jest.fn();
  const onClose = jest.fn();
  const utils = render(
    <RecipeNodePalette
      visible
      x={100}
      y={100}
      onPick={onPick}
      onClose={onClose}
      isDark={false}
      {...props}
    />,
  );
  return { ...utils, onPick, onClose };
}

const palette = () => screen.getByTestId("recipe-node-palette");

describe("node palette", () => {
  test("nothing renders while hidden", () => {
    render(<RecipeNodePalette visible={false} x={0} y={0} isDark={false} />);
    expect(screen.queryByTestId("recipe-node-palette")).not.toBeInTheDocument();
  });

  test("an agent graph lists every addable node under its group", () => {
    open();
    expect(within(palette()).getByText("Agent")).toBeInTheDocument();
    expect(within(palette()).getByText("Toolkit Pool")).toBeInTheDocument();
    expect(within(palette()).getByText("Subagent Pool")).toBeInTheDocument();
    expect(within(palette()).getByText("Steps")).toBeInTheDocument();
    expect(within(palette()).getByText("Attachments")).toBeInTheDocument();
  });

  test("each entry carries the line saying what it is for", () => {
    open();
    expect(
      within(palette()).getByText("A model loop with its tools and memory"),
    ).toBeInTheDocument();
  });

  test("clicking an entry adds that node type", () => {
    const { onPick } = open();
    fireEvent.click(screen.getByTestId("palette-entry-agent"));
    expect(onPick).toHaveBeenCalledWith("agent");
  });

  test("typing narrows the list", () => {
    open();
    fireEvent.change(screen.getByLabelText("Search nodes"), {
      target: { value: "delegate" },
    });
    expect(within(palette()).getByText("Subagent Pool")).toBeInTheDocument();
    expect(within(palette()).queryByText("Agent")).not.toBeInTheDocument();
  });

  test("Enter adds the highlighted entry", () => {
    const { onPick } = open();
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith("agent");
  });

  test("arrow keys move the highlight before Enter takes it", () => {
    const { onPick } = open();
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith(TOOLKIT_POOL_TYPE);
  });

  test("arrow up from the first entry wraps to the last", () => {
    const { onPick } = open();
    fireEvent.keyDown(document, { key: "ArrowUp" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith("subagent_pool");
  });

  test("Escape closes without adding anything, and never reaches the window", () => {
    const windowSpy = jest.fn();
    window.addEventListener("keydown", windowSpy);
    const { onPick, onClose } = open();
    fireEvent.keyDown(document, { key: "Escape" });
    window.removeEventListener("keydown", windowSpy);
    expect(onClose).toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
    expect(windowSpy).not.toHaveBeenCalled();
  });

  test("clicking outside closes it", () => {
    const { onClose } = open();
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  test("a workflow graph offers no agent node and no attach pool", () => {
    open({ graphKind: "workflow" });
    expect(within(palette()).queryByText("Agent")).not.toBeInTheDocument();
    expect(within(palette()).queryByText("Toolkit Pool")).not.toBeInTheDocument();
    expect(within(palette()).queryByText("Subagent Pool")).not.toBeInTheDocument();
  });

  test("an empty result in a workflow graph says what that graph forbids", () => {
    open({ graphKind: "workflow" });
    const box = palette();
    expect(within(box).getByText(/this is a workflow graph/i)).toBeInTheDocument();
    expect(within(box).getByText(/Agent/)).toBeInTheDocument();
  });

  test("an empty search in an agent graph says so without inventing a rule", () => {
    open();
    fireEvent.change(screen.getByLabelText("Search nodes"), {
      target: { value: "zzz-no-such-node" },
    });
    expect(within(palette()).getByText(/no node matches/i)).toBeInTheDocument();
    expect(within(palette()).queryByText(/not offered here/i)).not.toBeInTheDocument();
  });

  test("Enter on an empty result adds nothing", () => {
    const { onPick } = open();
    fireEvent.change(screen.getByLabelText("Search nodes"), {
      target: { value: "zzz-no-such-node" },
    });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onPick).not.toHaveBeenCalled();
  });

  test("flowOnly keeps only steps that can be wired into the flow", () => {
    open({ flowOnly: true });
    expect(within(palette()).getByText("Agent")).toBeInTheDocument();
    expect(within(palette()).queryByText("Toolkit Pool")).not.toBeInTheDocument();
    expect(within(palette()).queryByText("Subagent Pool")).not.toBeInTheDocument();
    expect(within(palette()).getByText(/wired in where you right-clicked/i)).toBeInTheDocument();
  });

  test("flowOnly with no match says why attachments are absent", () => {
    open({ flowOnly: true });
    fireEvent.change(screen.getByLabelText("Search nodes"), {
      target: { value: "toolkit" },
    });
    expect(
      within(palette()).getByText(/only steps with an input and an output/i),
    ).toBeInTheDocument();
  });

  test("the footer's return key is drawn by Icon, not a text glyph", async () => {
    open();
    const box = palette();
    /* Icon resolves its SVG asynchronously, so assert on what is stable: the
     * literal ↵ character is gone and the footer hands that slot to Icon. */
    expect(within(box).queryByText("\u21b5")).not.toBeInTheDocument();
    expect(box.innerHTML).not.toContain("\u21b5");
    await screen.findByTestId("recipe-node-palette");
    expect(box.querySelector(".mini-ui-img-icon, .mini-ui-svg-icon")).toBeTruthy();
  });

  test("it stays on screen when opened at the bottom-right corner", () => {
    open({ x: window.innerWidth - 4, y: window.innerHeight - 4 });
    const box = palette();
    expect(parseFloat(box.style.left) + 320).toBeLessThanOrEqual(window.innerWidth);
    expect(parseFloat(box.style.top) + 360).toBeLessThanOrEqual(window.innerHeight);
  });
});
