import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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
});
