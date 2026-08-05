import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import Explorer from "./explorer";
import { ConfigContext } from "../../CONTAINERs/config/context";

jest.mock("../icon/icon", () => () => <span data-testid="icon" />);
jest.mock("../spinner/arc_spinner", () => () => <span data-testid="spinner" />);
/* mock 尊重懒挂载契约:unmountWhenClosed 且收起时不渲染 children,
   与真实 AnimatedChildren 的稳态行为一致(动画时序由其自身单测覆盖) */
jest.mock(
  "../class/animated_children",
  () =>
    ({ open, unmountWhenClosed, children }) =>
      unmountWhenClosed && !open ? null : children,
);

const renderExplorer = (props = {}) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <Explorer
        draggable
        style={{ width: 240 }}
        data={{
          character_chat: {
            label: "Nico",
            chatKind: "character",
            characterName: "Nico",
            characterAvatar: {
              url: "http://127.0.0.1:5879/characters/nico/avatar",
            },
          },
        }}
        root={["character_chat"]}
        {...props}
      />
    </ConfigContext.Provider>,
  );

describe("Explorer", () => {
  test("shows character avatars in the drag ghost for character chats", async () => {
    renderExplorer();

    fireEvent.mouseDown(screen.getByText("Nico"), {
      button: 0,
      clientX: 32,
      clientY: 20,
    });
    fireEvent.mouseMove(document, {
      clientX: 48,
      clientY: 36,
    });

    expect(await screen.findByAltText("Nico avatar")).toBeInTheDocument();

    fireEvent.mouseUp(document);
  });

  test("does not start dragging from inputs inside custom rows", () => {
    renderExplorer({
      data: {
        renaming_chat: {
          label: "Rename ghost",
          component: () => (
            <div data-explorer-drag-disabled="true">
              <input aria-label="Rename value" defaultValue="Nico" />
            </div>
          ),
        },
      },
      root: ["renaming_chat"],
    });

    const input = screen.getByLabelText("Rename value");
    fireEvent.mouseDown(input, {
      button: 0,
      clientX: 32,
      clientY: 20,
    });
    fireEvent.mouseMove(document, {
      clientX: 72,
      clientY: 20,
    });

    expect(screen.queryByText("Rename ghost")).not.toBeInTheDocument();
    expect(document.body.style.userSelect).toBe("");
  });

  /* Switch-chain incrementalization Task 3: rows are memo'd so that
     identity-stable row objects (from buildExplorerFromTree's generation
     cache) translate into SKIPPED row re-renders when the tree re-renders
     with fresh containers. */
  /* context value must be identity-stable across rerenders — in the app it
     comes from ConfigContainer state; an inline literal would re-mint theme
     and defeat the very memo under test */
  const STABLE_CONFIG = { theme: {}, onThemeMode: "light_mode" };
  const STABLE_STYLE = { width: 240 };

  test("memo: identity-stable row objects skip re-render across data container changes", () => {
    const renderCount = jest.fn();
    const stableRow = {
      label: "Stable row",
      component: () => {
        renderCount();
        return <div>Stable row body</div>;
      },
    };
    const root = ["stable"];

    const explorerEl = (data) => (
      <ConfigContext.Provider value={STABLE_CONFIG}>
        <Explorer style={STABLE_STYLE} data={data} root={root} />
      </ConfigContext.Provider>
    );

    const view = render(explorerEl({ stable: stableRow }));
    const initial = renderCount.mock.calls.length;
    expect(initial).toBeGreaterThan(0);

    /* new data CONTAINER, same row object → row must not re-render */
    view.rerender(explorerEl({ stable: stableRow }));
    expect(renderCount.mock.calls.length).toBe(initial);

    /* re-minted row object → row re-renders */
    view.rerender(explorerEl({ stable: { ...stableRow } }));
    expect(renderCount.mock.calls.length).toBeGreaterThan(initial);
  });

  test("memo: active_node_id moving between OTHER rows does not re-render an untargeted row", () => {
    const renderCount = jest.fn();
    const watchedRow = {
      label: "Watched row",
      component: () => {
        renderCount();
        return <div>Watched row body</div>;
      },
    };
    const data = {
      watched: watchedRow,
      one: { label: "One" },
      two: { label: "Two" },
    };
    const root = ["watched", "one", "two"];

    const explorerEl = (activeNodeId) => (
      <ConfigContext.Provider value={STABLE_CONFIG}>
        <Explorer
          style={STABLE_STYLE}
          data={data}
          root={root}
          active_node_id={activeNodeId}
        />
      </ConfigContext.Provider>
    );

    const view = render(explorerEl("one"));
    const initial = renderCount.mock.calls.length;

    /* active moves one → two: watched row's active-ness is unchanged */
    view.rerender(explorerEl("two"));
    expect(renderCount.mock.calls.length).toBe(initial);

    /* active moves onto the watched row → it must re-render */
    view.rerender(explorerEl("watched"));
    expect(renderCount.mock.calls.length).toBeGreaterThan(initial);
  });

  test("收起 folder 的子节点不挂载,点击展开后才挂载", () => {
    renderExplorer({
      data: {
        folder1: { label: "My folder", children: ["chat1"] },
        chat1: { label: "Hidden chat" },
      },
      root: ["folder1"],
    });

    /* 收起态:子节点完全不在 DOM(懒挂载,unmountWhenClosed) */
    expect(screen.queryByText("Hidden chat")).toBeNull();

    fireEvent.click(screen.getByText("My folder"));
    expect(screen.getByText("Hidden chat")).toBeInTheDocument();

    fireEvent.click(screen.getByText("My folder"));
    expect(screen.queryByText("Hidden chat")).toBeNull();
  });

  describe("trailing slot", () => {
    test("renders trailing element at the row and does not trigger select/expand on interaction", () => {
      const onTrailingClick = jest.fn();
      const onNodeClick = jest.fn();
      renderExplorer({
        data: {
          folder1: {
            label: "My folder",
            children: ["chat1"],
            on_click: onNodeClick,
            trailing: (
              <button type="button" onClick={onTrailingClick}>
                Trailing action
              </button>
            ),
          },
          chat1: { label: "Hidden chat" },
        },
        root: ["folder1"],
      });

      expect(screen.getByText("Trailing action")).toBeInTheDocument();
      /* collapsed at rest — trailing must not have expanded the folder */
      expect(screen.queryByText("Hidden chat")).toBeNull();

      fireEvent.click(screen.getByText("Trailing action"));

      expect(onTrailingClick).toHaveBeenCalledTimes(1);
      /* click stayed inside trailing — row's own click (select/expand) never fired */
      expect(onNodeClick).not.toHaveBeenCalled();
      expect(screen.queryByText("Hidden chat")).toBeNull();
    });

    test("trailing mousedown does not start a row drag", () => {
      renderExplorer({
        draggable: true,
        data: {
          folder1: {
            label: "Draggable folder",
            trailing: <button type="button">Trailing btn</button>,
          },
        },
        root: ["folder1"],
      });

      fireEvent.mouseDown(screen.getByText("Trailing btn"), {
        button: 0,
        clientX: 32,
        clientY: 20,
      });
      fireEvent.mouseMove(document, { clientX: 72, clientY: 20 });

      /* a real drag would flip body cursor/userSelect and mount a ghost row */
      expect(document.body.style.cursor).not.toBe("grabbing");
      expect(document.body.style.userSelect).toBe("");

      fireEvent.mouseUp(document);
    });
  });

  describe("locked_expanded", () => {
    test("locked folder starts expanded and its chevron ignores clicks", () => {
      renderExplorer({
        locked_expanded: ["root_folder"],
        data: {
          root_folder: { label: "Root", children: ["child1"] },
          child1: { label: "Child one" },
        },
        root: ["root_folder"],
      });

      /* expanded from the start, no click required */
      expect(screen.getByText("Child one")).toBeInTheDocument();

      /* clicking the row can never collapse it */
      fireEvent.click(screen.getByText("Root"));
      expect(screen.getByText("Child one")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Root"));
      expect(screen.getByText("Child one")).toBeInTheDocument();
    });

    test("non-locked folders keep normal collapse/expand behavior alongside a locked root", () => {
      renderExplorer({
        locked_expanded: ["root_folder"],
        data: {
          root_folder: { label: "Root", children: ["sub_folder"] },
          sub_folder: { label: "Sub folder", children: ["leaf"] },
          leaf: { label: "Leaf" },
        },
        root: ["root_folder"],
      });

      expect(screen.queryByText("Leaf")).toBeNull();
      fireEvent.click(screen.getByText("Sub folder"));
      expect(screen.getByText("Leaf")).toBeInTheDocument();
      fireEvent.click(screen.getByText("Sub folder"));
      expect(screen.queryByText("Leaf")).toBeNull();
    });
  });

  test("selection-less usage: no active_node_id renders rows without crashing or highlighting", () => {
    expect(() =>
      renderExplorer({
        active_node_id: undefined,
        data: {
          one: { label: "One" },
          two: { label: "Two" },
        },
        root: ["one", "two"],
      }),
    ).not.toThrow();

    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
  });

  /* 截断标签的 hover ghost:它是一个 portal 到 body 的 fixed 覆盖层。
     两条契约由这些用例锁定:
       1. 它必须留在 context menu 之下 —— ghost 是纯提示,菜单是可交互层;
       2. 任何 mousedown 必须立刻收起它 —— 点击往往会打开 modal 或右键菜单,
          而 mouseleave 不会触发(指针仍停在原行上),此前 ghost 会一直悬着。 */
  describe("label overflow ghost", () => {
    const LONG = "a very long chat label that overflows its row";

    /* jsdom 里 scrollWidth/clientWidth 恒为 0,溢出判定永远不成立,
       所以显式伪造一次溢出 */
    const forceOverflow = () => {
      Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
        configurable: true,
        get: () => 500,
      });
      Object.defineProperty(HTMLElement.prototype, "clientWidth", {
        configurable: true,
        get: () => 100,
      });
    };
    const restoreOverflow = () => {
      delete HTMLElement.prototype.scrollWidth;
      delete HTMLElement.prototype.clientWidth;
    };

    /* ghost 的形状特征:fixed + pointer-events:none + 承载完整标签 */
    const findGhost = () =>
      Array.from(document.body.querySelectorAll("div")).find(
        (el) =>
          el.style.position === "fixed" &&
          el.style.pointerEvents === "none" &&
          el.textContent.includes(LONG),
      );

    const renderLongRow = () =>
      renderExplorer({ data: { long_chat: { label: LONG } }, root: ["long_chat"] });

    const hoverUntilGhost = (row) => {
      fireEvent.mouseEnter(row);
      act(() => {
        jest.advanceTimersByTime(700); // ghost 延迟 600ms
      });
    };

    beforeEach(() => {
      jest.useFakeTimers();
      forceOverflow();
    });

    afterEach(() => {
      restoreOverflow();
      jest.useRealTimers();
    });

    test("ghost 必须留在 context menu 之下", () => {
      renderLongRow();
      hoverUntilGhost(screen.getByText(LONG));

      const ghost = findGhost();
      expect(ghost).toBeDefined();
      // context_menu.js 用 99999;ghost 必须低于它才不会盖住菜单
      expect(Number(ghost.style.zIndex)).toBeLessThan(99999);
    });

    test("ghost 仍需高于 modal,因为 explorer 会被用在 modal 内(memory-inspect)", () => {
      renderLongRow();
      hoverUntilGhost(screen.getByText(LONG));

      const ghost = findGhost();
      expect(ghost).toBeDefined();
      // modal.js 用 9999;压到它之下会让 modal 内的 explorer 提示被自己的 modal 遮住
      expect(Number(ghost.style.zIndex)).toBeGreaterThan(9999);
    });

    test("mousedown 立刻收起 ghost(点击通常会打开 modal,而 mouseleave 不会触发)", () => {
      renderLongRow();
      const row = screen.getByText(LONG);
      hoverUntilGhost(row);
      expect(findGhost()).toBeDefined();

      fireEvent.mouseDown(row, { button: 0 });

      expect(findGhost()).toBeUndefined();
    });

    test("右键 mousedown 同样收起 ghost(context menu 场景)", () => {
      renderLongRow();
      const row = screen.getByText(LONG);
      hoverUntilGhost(row);
      expect(findGhost()).toBeDefined();

      fireEvent.mouseDown(row, { button: 2 });

      expect(findGhost()).toBeUndefined();
    });

    test("mousedown 后即使定时器到期也不得再冒出 ghost", () => {
      renderLongRow();
      const row = screen.getByText(LONG);

      fireEvent.mouseEnter(row);
      fireEvent.mouseDown(row, { button: 0 }); // 在 600ms 窗口内就按下
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      expect(findGhost()).toBeUndefined();
    });
  });
});

describe("row_hover prop", () => {
  /* The hover/press wash is rendered as an aria-hidden span whose opacity
     is driven by state, so assert on that layer directly. */
  const hoverLayer = (container) =>
    Array.from(container.querySelectorAll("span[aria-hidden='true']")).filter(
      (el) => el.style.transition && el.style.transition.includes("transform"),
    );

  const DATA = { a: { label: "Alpha" }, b: { label: "Beta" } };

  test("defaults to showing hover feedback (existing consumers unchanged)", () => {
    const { container } = renderExplorer({ data: DATA, root: ["a", "b"] });
    const row = screen.getByText("Alpha").closest("div");
    fireEvent.mouseEnter(row);
    const layers = hoverLayer(container);
    expect(layers.some((el) => el.style.opacity === "1")).toBe(true);
  });

  test("row_hover=false suppresses hover feedback", () => {
    const { container } = renderExplorer({
      data: DATA,
      root: ["a", "b"],
      row_hover: false,
    });
    const row = screen.getByText("Alpha").closest("div");
    fireEvent.mouseEnter(row);
    const layers = hoverLayer(container);
    expect(layers.every((el) => el.style.opacity !== "1")).toBe(true);
  });

  test("row_hover=false still gives press feedback (rows remain clickable)", () => {
    const { container } = renderExplorer({
      data: DATA,
      root: ["a", "b"],
      row_hover: false,
    });
    const row = screen.getByText("Alpha").closest("div");
    fireEvent.mouseDown(row);
    const layers = hoverLayer(container);
    expect(layers.some((el) => el.style.opacity === "1")).toBe(true);
  });

  test("custom-component rows honour row_hover too (the duplicated path)", () => {
    const data = {
      c: { component: () => <div>Custom</div> },
    };
    const { container } = renderExplorer({ data, root: ["c"], row_hover: false });
    const row = screen.getByText("Custom").closest("div").parentElement;
    fireEvent.mouseEnter(row);
    const layers = hoverLayer(container);
    expect(layers.every((el) => el.style.opacity !== "1")).toBe(true);
  });
});
