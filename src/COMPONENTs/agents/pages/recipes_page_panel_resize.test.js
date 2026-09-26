import React from "react";
import { render, fireEvent, act, waitFor, screen } from "@testing-library/react";
import RecipesPage from "./recipes_page";
import {
  RECIPE_PANEL_LIMITS,
  panelMaxWidth,
  readRecipePanelWidths,
  writeRecipePanelWidth,
} from "../../../SERVICEs/recipe_panel_widths";

jest.mock("../../../SERVICEs/api", () => ({
  api: {
    unchain: {
      listRecipes: jest.fn(),
      getRecipe: jest.fn(),
      saveRecipe: jest.fn(),
    },
  },
}));

jest.mock("../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: () => <div data-testid="flow-editor" />,
}));

jest.mock("../../side-menu/side_menu_utils", () => ({
  getRuntimePlatform: () => "darwin",
}));

jest.mock("../../../SERVICEs/bridges/window_state_bridge", () => ({
  windowStateBridge: {
    isListenerAvailable: () => false,
    onWindowStateChange: () => () => {},
  },
}));

const mockRecipe = {
  name: "test",
  nodes: [
    { id: "start", type: "start", outputs: [], x: 0, y: 0 },
    { id: "end", type: "end", x: 0, y: 0 },
  ],
  edges: [],
};

const { api } = require("../../../SERVICEs/api");

beforeEach(() => {
  window.localStorage.clear();
  api.unchain.listRecipes.mockReset();
  api.unchain.getRecipe.mockReset();
  api.unchain.listRecipes.mockResolvedValue({ recipes: [mockRecipe] });
  api.unchain.getRecipe.mockResolvedValue(mockRecipe);
});

async function mount(selectedNodeId = null) {
  render(
    <RecipesPage
      isDark={false}
      selectedNodeId={selectedNodeId}
      onSelectNode={() => {}}
      fullscreen={false}
    />,
  );
  await waitFor(() => {
    expect(screen.getByTestId("flow-editor")).toBeTruthy();
  });
}

// jsdom has no PointerEvent, so fireEvent.pointer* drops clientX. Real
// PointerEvents extend MouseEvent, so dispatching a MouseEvent under the
// pointer type name exercises the same listeners with real coordinates.
const pointer = (target, type, clientX) =>
  fireEvent(
    target,
    new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button: 0 }),
  );

function drag(handle, from, to) {
  act(() => {
    pointer(handle, "pointerdown", from);
  });
  act(() => {
    pointer(window, "pointermove", to);
  });
}

function release(at) {
  act(() => {
    pointer(window, "pointerup", at);
  });
}

describe("RecipesPage panel resize", () => {
  test("panels start at their stored widths (defaults = minimums)", async () => {
    await mount("start");
    expect(screen.getByTestId("recipe-list-panel-shell").style.width).toBe("200px");
    expect(screen.getByTestId("recipe-detail-panel-shell").style.width).toBe("300px");
  });

  test("a previously stored width is restored on mount", async () => {
    writeRecipePanelWidth("list", 260);
    writeRecipePanelWidth("detail", 420);
    await mount("start");
    expect(screen.getByTestId("recipe-list-panel-shell").style.width).toBe("260px");
    expect(screen.getByTestId("recipe-detail-panel-shell").style.width).toBe("420px");
  });

  test("dragging the list handle right widens the list and persists on release", async () => {
    await mount("start");
    const handle = screen.getByTestId("recipe-list-resize-handle");
    drag(handle, 200, 240);
    expect(screen.getByTestId("recipe-list-panel-shell").style.width).toBe("240px");
    // not persisted until the pointer is released
    expect(readRecipePanelWidths().list).toBe(200);
    release(240);
    expect(readRecipePanelWidths().list).toBe(240);
  });

  test("dragging the detail handle left widens the detail panel", async () => {
    await mount("start");
    const handle = screen.getByTestId("recipe-detail-resize-handle");
    drag(handle, 700, 640);
    expect(screen.getByTestId("recipe-detail-panel-shell").style.width).toBe("360px");
    release(640);
    expect(readRecipePanelWidths().detail).toBe(360);
  });

  test("widths never go below the minimum or above the panel's share", async () => {
    await mount("start");
    const list = screen.getByTestId("recipe-list-resize-handle");
    drag(list, 200, 100);
    expect(screen.getByTestId("recipe-list-panel-shell").style.width).toBe(
      `${RECIPE_PANEL_LIMITS.list.min}px`,
    );
    release(100);

    const cap = panelMaxWidth("list", window.innerWidth);
    drag(list, 200, 200 + window.innerWidth * 2);
    expect(screen.getByTestId("recipe-list-panel-shell").style.width).toBe(
      `${cap}px`,
    );
    release(200 + window.innerWidth * 2);
    expect(readRecipePanelWidths(window.innerWidth).list).toBe(cap);
  });

  test("the panel does not animate width while dragging", async () => {
    await mount("start");
    const panel = screen.getByTestId("recipe-list-panel-shell");
    expect(panel.style.transition).toContain("opacity");
    drag(screen.getByTestId("recipe-list-resize-handle"), 200, 220);
    expect(panel.style.transition).toBe("none");
    release(220);
    expect(panel.style.transition).toContain("opacity");
  });
});

describe("RecipesPage resize indicator placement", () => {
  test("handles live outside the panels and track the panel edge", async () => {
    await mount("start");
    const listPanel = screen.getByTestId("recipe-list-panel-shell");
    const listHandle = screen.getByTestId("recipe-list-resize-handle");
    const detailPanel = screen.getByTestId("recipe-detail-panel-shell");
    const detailHandle = screen.getByTestId("recipe-detail-resize-handle");

    expect(listPanel.contains(listHandle)).toBe(false);
    expect(detailPanel.contains(detailHandle)).toBe(false);
    // panel inset 6 + width 200 → handle hit area begins just past the edge
    expect(listHandle.style.left).toBe("208px");
    expect(detailHandle.style.right).toBe("308px");

    drag(listHandle, 200, 240);
    expect(listHandle.style.left).toBe("248px");
    release(240);
  });

  test("the indicator is a pill: neutral at rest, blue on hover", async () => {
    await mount("start");
    const handle = screen.getByTestId("recipe-list-resize-handle");
    const pill = screen.getByTestId("recipe-list-resize-pill");
    expect(pill.style.borderRadius).toBe("999px");
    expect(parseInt(pill.style.height, 10)).toBeGreaterThan(
      parseInt(pill.style.width, 10),
    );
    // at rest it blends with the light canvas — a faint dark tint, not blue
    expect(pill.style.backgroundColor).toBe("rgba(0, 0, 0, 0.1)");

    fireEvent.mouseEnter(handle);
    expect(pill.style.backgroundColor).toBe("rgb(74, 91, 216)");

    fireEvent.mouseLeave(handle);
    expect(pill.style.backgroundColor).toBe("rgba(0, 0, 0, 0.1)");
  });

  test("at rest the pill takes a faint light tint on the dark theme", async () => {
    render(
      <RecipesPage
        isDark
        selectedNodeId="start"
        onSelectNode={() => {}}
        fullscreen={false}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("flow-editor")).toBeTruthy();
    });
    const pill = screen.getByTestId("recipe-list-resize-pill");
    expect(pill.style.backgroundColor).toBe("rgba(255, 255, 255, 0.12)");
  });

  test("the detail handle hides with its panel", async () => {
    await mount(null);
    const detailHandle = screen.getByTestId("recipe-detail-resize-handle");
    expect(detailHandle.style.pointerEvents).toBe("none");
    expect(detailHandle.style.opacity).toBe("0");
  });
});

describe("RecipesPage resize pill hover", () => {
  test("hovering stretches the pill to nearly the full panel height", async () => {
    await mount("start");
    const handle = screen.getByTestId("recipe-list-resize-handle");
    const pill = screen.getByTestId("recipe-list-resize-pill");
    expect(pill.style.height).toBe("36px");

    fireEvent.mouseEnter(handle);
    expect(pill.style.height).toBe("calc(100% - 16px)");

    fireEvent.mouseLeave(handle);
    expect(pill.style.height).toBe("36px");
  });
});

describe("RecipesPage panel widths are capped by share of the canvas", () => {
  /* jsdom reports 0 for every layout box, so the page's own measurement finds
     nothing; the component must fall back to the window's width rather than
     collapsing every panel to its minimum. */
  const CONTAINER = 1200;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      value: CONTAINER,
      configurable: true,
      writable: true,
    });
  });

  test("dragging stops at the panel's share of the width", async () => {
    await mount("start");
    const handle = screen.getByTestId("recipe-list-resize-handle");
    drag(handle, 200, 200 + CONTAINER); // far past any sane width
    const cap = panelMaxWidth("list", CONTAINER);
    expect(cap).toBe(420); // 35% of 1200
    expect(screen.getByTestId("recipe-list-panel-shell").style.width).toBe(
      `${cap}px`,
    );
    release(200 + CONTAINER);
  });

  test("the detail panel gets the larger share", async () => {
    await mount("start");
    const handle = screen.getByTestId("recipe-detail-resize-handle");
    drag(handle, 900, 900 - CONTAINER);
    const cap = panelMaxWidth("detail", CONTAINER);
    expect(cap).toBe(600); // 50% of 1200
    expect(screen.getByTestId("recipe-detail-panel-shell").style.width).toBe(
      `${cap}px`,
    );
    release(900 - CONTAINER);
  });

  test("a width stored when the window was wider comes back clamped", async () => {
    writeRecipePanelWidth("list", 900);
    await mount("start");
    expect(screen.getByTestId("recipe-list-panel-shell").style.width).toBe(
      `${panelMaxWidth("list", CONTAINER)}px`,
    );
  });
});
