import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigContext, LocaleContext, NavigationContext } from "../../../../CONTAINERs/config/context";
import { CanvasControlCenter, FloatingDetailShell } from "./canvas_chrome";
import { RunTrigger } from "./skeleton_run_menu";
import { UISVGs } from "../../../../BUILTIN_COMPONENTs/icon/icon_manifest";

/* Every control in the bottom bar names what it does, in the app's tooltip
   and to assistive tech, whether or not it can be pressed right now. In jsdom
   the bubble never measures, so it stays visibility:hidden: it is found by
   its test id, not by role or visible text. */

const localized = (locale, children) => (
  <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <LocaleContext.Provider value={{ locale }}>{children}</LocaleContext.Provider>
  </ConfigContext.Provider>
);

const bar = (props = {}, locale = "en") =>
  localized(
    locale,
    <CanvasControlCenter
      testId="cc"
      onUndo={jest.fn()}
      onRedo={jest.fn()}
      canUndo={false}
      canRedo
      onHome={jest.fn()}
      onSave={jest.fn()}
      saveDisabled
      run={<RunTrigger testId="cc-run" open={false} onToggle={jest.fn()} />}
      {...props}
    />,
  );

/* The Tooltip's trigger is the element wrapping the control. */
const hover = (testId) => {
  // eslint-disable-next-line testing-library/no-node-access
  fireEvent.mouseEnter(screen.getByTestId(testId).parentElement);
};

test.each([
  ["cc-undo", /^Undo \((⌘Z|Ctrl\+Z)\)$/, true],
  ["cc-redo", /^Redo \((⌘⇧Z|Ctrl\+Y)\)$/, false],
  ["cc-start", /^Go to Start$/, false],
  ["cc-run", /^Run$/, false],
  ["cc-save", /^Save$/, true],
])("%s shows its hint on hover", async (testId, text, disabled) => {
  render(bar());
  const button = screen.getByTestId(testId);
  expect(button.disabled).toBe(disabled);
  /* A disabled button lets the pointer through to the hint's trigger. */
  expect(button.style.pointerEvents).toBe(disabled ? "none" : "");
  expect(screen.queryByTestId(`${testId}-hint`)).toBeNull();
  hover(testId);
  expect(await screen.findByTestId(`${testId}-hint`)).toHaveTextContent(text);
});

test("icon-only controls carry the same names as aria-labels; native titles are gone", () => {
  render(bar());
  expect(screen.getByRole("button", { name: /^Undo \(/ })).toBe(screen.getByTestId("cc-undo"));
  expect(screen.getByRole("button", { name: /^Redo \(/ })).toBe(screen.getByTestId("cc-redo"));
  expect(screen.getByRole("button", { name: "Go to Start" })).toBe(screen.getByTestId("cc-start"));
  expect(screen.getByRole("button", { name: "Open the run menu" })).toBe(screen.getByTestId("cc-run"));
  expect(screen.getByRole("button", { name: "Save" })).toBe(screen.getByTestId("cc-save"));
  // eslint-disable-next-line testing-library/no-node-access
  expect(screen.getByTestId("cc").querySelectorAll("[title]")).toHaveLength(0);
});

test("Go to Start draws the locate_start glyph and calls onHome", async () => {
  const onHome = jest.fn();
  render(bar({ onHome }));
  const start = screen.getByTestId("cc-start");
  const { container } = render(UISVGs.locate_start());
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  const expected = container.querySelector("svg path").getAttribute("d");
  /* Icon resolves its glyph asynchronously. */
  // eslint-disable-next-line testing-library/no-node-access
  await waitFor(() => expect(start.querySelector("svg path")).not.toBeNull());
  // eslint-disable-next-line testing-library/no-node-access
  expect(start.querySelector("svg path").getAttribute("d")).toBe(expected);
  // eslint-disable-next-line testing-library/no-node-access
  expect(start.querySelector("svg").getAttribute("fill")).toBe("currentColor");
  fireEvent.click(start);
  expect(onHome).toHaveBeenCalledTimes(1);
});

test("hints and names follow the locale", async () => {
  render(bar({}, "zh-CN"));
  expect(screen.getByRole("button", { name: "回到开始节点" })).toBe(screen.getByTestId("cc-start"));
  hover("cc-start");
  expect(await screen.findByTestId("cc-start-hint")).toHaveTextContent("回到开始节点");
});

test("the docked detail panel's close toggle has a hint too", async () => {
  const slot = document.createElement("div");
  document.body.appendChild(slot);
  try {
    render(localized("en",
      <NavigationContext.Provider value={{ agentsDetailSlot: slot, appMode: "agents" }}>
        <FloatingDetailShell isDark={false} open width={320} minWidth={300} resizing={false} testId="detail" onClose={jest.fn()}>
          <span>body</span>
        </FloatingDetailShell>
      </NavigationContext.Provider>,
    ));
    const close = screen.getByTestId("detail-close");
    expect(close).toHaveAttribute("aria-label", "Close");
    // eslint-disable-next-line testing-library/no-node-access
    fireEvent.mouseEnter(close.parentElement.parentElement);
    expect(await screen.findByTestId("detail-close-hint")).toHaveTextContent("Close");
  } finally {
    slot.remove();
  }
});
