import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigContext, LocaleContext } from "../../CONTAINERs/config/context";
import defaultTheme from "../../BUILTIN_COMPONENTs/theme/default_mini_theme.json";
import ChatInput from "./chat_input";
import {
  MOVABLE_ATTACH_WIDGETS,
  writeAttachPanelLayout,
} from "../../SERVICEs/attach_panel_layout";

// Keep the real composer, panel, Select, Tooltip and Button event handlers.
// Only catalog providers are replaced: this regression needs no backend.
jest.mock("./hooks/use_chat_input_models", () => ({
  useChatInputModels: () => ({
    modelOptions: [{ value: "test-model", label: "Test model" }],
    handleGroupToggle: jest.fn(),
  }),
}));
jest.mock("./hooks/use_chat_input_toolkits", () => ({
  __esModule: true,
  default: () => ({ toolkitOptions: [], refreshToolkits: jest.fn() }),
}));
jest.mock("./hooks/use_chat_input_workspaces", () => ({
  __esModule: true,
  default: () => ({ workspaceOptions: [] }),
}));

const renderComposer = () => {
  const onAttachFile = jest.fn();
  render(
    <ConfigContext.Provider
      value={{ theme: defaultTheme.dark_mode, onThemeMode: "dark_mode" }}
    >
      <LocaleContext.Provider value={{ locale: "en" }}>
        <ChatInput
          value=""
          onChange={() => {}}
          selectedModelId="test-model"
          onAttachFile={onAttachFile}
        />
        <button>Outside action</button>
      </LocaleContext.Provider>
    </ConfigContext.Provider>,
  );
  const input = screen.getByRole("textbox", { name: "Message PuPu..." });
  const model = screen.getByRole("combobox");
  // This is the real FloatingTextField content wrapper that moves the row.
  let panelPosition = model.parentElement;
  while (panelPosition && panelPosition.style.position !== "absolute") {
    panelPosition = panelPosition.parentElement;
  }
  return { input, model, panelPosition, onAttachFile };
};

const openFloatingModelMenu = async ({ input, model }) => {
  act(() => input.focus());
  userEvent.click(model);
  const search = await screen.findByPlaceholderText("Search models…");
  await waitFor(() => expect(search).toHaveFocus());
  return search;
};

// jsdom does not implement PointerEvent; retain the actual pointer button so
// React's primary-button guard sees the same sequence as Chromium.
const pressControl = (target) => {
  fireEvent(target, new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  fireEvent.mouseDown(target);
};

test("restores composer focus on pointerdown before document mousedown can dismiss the menu", async () => {
  const composer = renderComposer();
  await openFloatingModelMenu(composer);
  const next = screen.getByRole("button", { name: "Select workspaces" });
  fireEvent(next, new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  expect(composer.input).toHaveFocus();
  expect(composer.panelPosition.style.transform).toBe("translateY(0)");
});

test.each(["Select plugins", "Select workspaces"])(
  "switches from the floating model menu to %s without retracting on mousedown",
  async (name) => {
    const composer = renderComposer();
    await openFloatingModelMenu(composer);
    expect(composer.panelPosition.style.transform).toBe("translateY(0)");

    const next = screen.getByRole("button", { name });
    pressControl(next);
    // Check BEFORE mouseup/click: jsdom cannot simulate the moving hit target.
    expect(composer.panelPosition.style.transform).toBe("translateY(0)");
    expect(composer.input).toHaveFocus();
    fireEvent.mouseUp(next);
    fireEvent.click(next);

    const placeholder =
      name === "Select plugins" ? "Search plugins..." : "Search workspaces...";
    await waitFor(() =>
      expect(screen.getByPlaceholderText(placeholder)).toHaveFocus(),
    );
    expect(composer.panelPosition.style.transform).toBe("translateY(0)");

    // Repeated switches must preserve the same hold, including the model
    // trigger whose bubble-phase mousedown stops propagation.
    pressControl(composer.model);
    expect(composer.panelPosition.style.transform).toBe("translateY(0)");
    fireEvent.mouseUp(composer.model);
    fireEvent.click(composer.model);
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Search models…")).toHaveFocus(),
    );
  },
);

test("a plain attachment action works on the first click after a floating menu", async () => {
  /* the first-launch layout tucks the attach widget into the "…" menu; this
     test wants it on the row */
  writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: [] });
  const composer = renderComposer();
  await openFloatingModelMenu(composer);
  const attach = screen.getByTitle("Attach image or PDF").querySelector("button");
  pressControl(attach);
  expect(composer.panelPosition.style.transform).toBe("translateY(0)");
  fireEvent.mouseUp(attach);
  fireEvent.click(attach);
  expect(composer.onAttachFile).toHaveBeenCalledTimes(1);
  expect(composer.input).toHaveFocus();
});

test("a resting panel stays resting when its menu is opened and switched", async () => {
  const composer = renderComposer();
  userEvent.click(composer.model);
  await waitFor(() =>
    expect(screen.getByPlaceholderText("Search models…")).toHaveFocus(),
  );
  expect(composer.panelPosition.style.transform).toBe("translateY(-50%)");
  userEvent.click(screen.getByRole("button", { name: "Select workspaces" }));
  await waitFor(() =>
    expect(screen.getByPlaceholderText("Search workspaces...")).toHaveFocus(),
  );
  expect(composer.panelPosition.style.transform).toBe("translateY(-50%)");
});

test("search interaction retains focus, while an outside click dismisses the floated menu", async () => {
  const composer = renderComposer();
  const search = await openFloatingModelMenu(composer);
  pressControl(search);
  await userEvent.type(search, "test", { skipClick: true });
  expect(search).toHaveFocus();
  expect(search).toHaveValue("test");
  userEvent.click(screen.getByRole("button", { name: "Outside action" }));
  expect(composer.panelPosition.style.transform).toBe("translateY(-50%)");
  expect(composer.input).not.toHaveFocus();
});

test("clicking portaled menu content does not steal search focus", async () => {
  const composer = renderComposer();
  const search = await openFloatingModelMenu(composer);
  // jsdom has no geometry for Tooltip's visibility/position measurement.
  const option = screen.getByRole("option", { hidden: true });
  pressControl(option);
  expect(search).toHaveFocus();
  expect(composer.input).not.toHaveFocus();
});

test("Escape returns focus from a keyboard-opened menu to the composer", async () => {
  const composer = renderComposer();
  act(() => composer.input.focus());
  fireEvent.keyDown(composer.input, { key: "ArrowUp" });
  fireEvent.keyDown(composer.input, { key: "Enter" });
  const search = await screen.findByPlaceholderText("Search models…");
  await waitFor(() => expect(search).toHaveFocus());
  fireEvent.keyDown(search, { key: "Escape" });
  expect(composer.input).toHaveFocus();
  expect(composer.panelPosition.style.transform).toBe("translateY(0)");
});
