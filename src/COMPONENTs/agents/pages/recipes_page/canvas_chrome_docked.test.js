import React, { useState } from "react";
import { createPortal } from "react-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { FloatingDetailShell } from "./canvas_chrome";
import { NavigationContext } from "../../../../CONTAINERs/config/context";

if (!global.ResizeObserver) global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const shell = (open, slot, onClose, appMode = "agents", children = <button type="button">field</button>, onOpen) => (
  <NavigationContext.Provider value={{ agentsDetailSlot: slot, appMode }}>
    <div data-testid="canvas">
      <FloatingDetailShell
        isDark={false}
        open={open}
        width={320}
        minWidth={300}
        resizing={false}
        testId="detail-shell"
        onClose={onClose}
        onOpen={onOpen}
        handle={{ testId: "detail-handle", pillTestId: "detail-pill", onDragStart() {}, onDrag() {}, onDragEnd() {} }}
      >
        {children}
      </FloatingDetailShell>
    </div>
  </NavigationContext.Provider>
);

test("switching to Chat hides the docked inspector and its popover without losing the draft", () => {
  const slot = document.createElement("div");
  document.body.appendChild(slot);
  try {
    function Builder({ mode }) {
      const [draft, setDraft] = useState("");
      return shell(true, slot, undefined, mode, <>
        <input aria-label="Draft field" value={draft} onChange={(event) => setDraft(event.target.value)} />
        {createPortal(<div data-testid="inspector-popover">Picker</div>, document.body)}
      </>);
    }
    const { rerender } = render(<Builder mode="agents" />);
    const field = screen.getByRole("textbox", { name: "Draft field" });
    fireEvent.change(field, { target: { value: "unsaved draft" } });
    const panel = screen.getByTestId("detail-shell");
    const popover = screen.getByTestId("inspector-popover");
    expect(panel).toBeVisible();
    expect(popover).toBeVisible();

    rerender(<Builder mode="chat" />);
    expect(panel).not.toBeInTheDocument();
    expect(popover).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Draft field" })).toBeNull();

    rerender(<Builder mode="agents" />);
    expect(screen.getByRole("textbox", { name: "Draft field" })).toHaveValue("unsaved draft");
  } finally {
    slot.remove();
  }
});

test("with the shell's anchor present, the panel is a full-height side menu at the window edge", () => {
  const slot = document.createElement("div");
  document.body.appendChild(slot);
  render(shell(true, slot));

  const panel = screen.getByTestId("detail-shell");
  expect(slot.contains(panel)).toBe(true);
  expect(screen.getByTestId("canvas").contains(panel)).toBe(false);
  expect(panel.dataset.docked).toBe("true");
  /* the colour runs to the top; the content starts below the title bar band */
  expect(panel.style.top).toBe("0px");
  expect(screen.getByTestId("detail-shell-band").style.height).toBe("50px");
  expect(panel.firstChild).toBe(screen.getByTestId("detail-shell-band"));
  expect(panel.style.bottom).toBe("0px");
  expect(panel.style.right).toBe("0px");
  expect(panel.style.borderRadius).toBe("");
  expect(slot.contains(screen.getByTestId("detail-handle"))).toBe(true);
  slot.remove();
});

test("its resize handle sits inside the panel like the left side menu's, over the full height", () => {
  const slot = document.createElement("div");
  document.body.appendChild(slot);
  render(shell(true, slot));
  const handle = screen.getByTestId("detail-handle");
  /* the whole height, title bar band included, so the pill is centred */
  expect(handle.style.top).toBe("0px");
  expect(handle.style.bottom).toBe("0px");
  /* its 12px hit area ends at the panel's inner edge, inside the panel
     (jsdom drops var(), so read the source value through the cssText) */
  expect(handle.getAttribute("style")).not.toContain("- 6px");
  slot.remove();
});

test("its close button sits in the title bar band and closes it", () => {
  const slot = document.createElement("div");
  document.body.appendChild(slot);
  const onClose = jest.fn();
  render(shell(true, slot, onClose));
  const close = screen.getByTestId("detail-shell-close");
  expect(slot.contains(close)).toBe(true);
  expect(screen.getByTestId("detail-shell-band")).toContainElement(close);
  fireEvent.click(close);
  expect(onClose).toHaveBeenCalledTimes(1);
  slot.remove();
});

test("a closed docked panel slides out and shuts itself", () => {
  const slot = document.createElement("div");
  document.body.appendChild(slot);
  render(shell(false, slot));

  const panel = screen.getByTestId("detail-shell");
  expect(panel.style.transform).toBe("translateX(100%)");
  expect(panel).toHaveAttribute("inert");
  expect(panel).toHaveAttribute("aria-hidden", "true");
  slot.remove();
});

test("without an anchor it stays the floating card inside the canvas", () => {
  render(shell(true, null));
  const panel = screen.getByTestId("detail-shell");
  expect(screen.getByTestId("canvas").contains(panel)).toBe(true);
  expect(panel.dataset.docked).toBeUndefined();
  expect(panel.style.borderRadius).toBe("10px");
});

test.each(["win32", "linux"])("the close button sits in the panel's upper-left corner, clear of the window buttons (%s)", (platform) => {
  const original = window.osInfo;
  window.osInfo = { platform };
  const slot = document.createElement("div");
  document.body.appendChild(slot);
  render(shell(true, slot, () => {}));
  const holder = screen.getByTestId("detail-shell-close").closest("div[style*='position: absolute']");
  expect(holder.style.top).toBe("25px");
  expect(holder.style.left).toBe("25px");
  expect(holder.style.transform).toBe("translate(-50%, -50%)");
  slot.remove();
  window.osInfo = original;
});

test("on macOS the toggle is one element at the right edge, outside the panel, open or closed", () => {
  const original = window.osInfo;
  window.osInfo = { platform: "darwin" };
  const slot = document.createElement("div");
  document.body.appendChild(slot);
  const onOpen = jest.fn();
  const onClose = jest.fn();
  const view = render(shell(true, slot, onClose, "agents", undefined, onOpen));
  const toggle = screen.getByTestId("detail-shell-toggle");
  expect([toggle.style.top, toggle.style.right, toggle.style.transform]).toEqual(["25px", "25px", "translate(50%, -50%)"]);
  /* Not inside the sliding panel, so it does not travel with it. */
  expect(screen.getByTestId("detail-shell").contains(toggle)).toBe(false);
  fireEvent.click(screen.getByTestId("detail-shell-close"));
  expect(onClose).toHaveBeenCalledTimes(1);
  view.rerender(shell(false, slot, onClose, "agents", undefined, onOpen));
  /* The same element, still in place; only its glyph changed. */
  expect(screen.getByTestId("detail-shell-toggle")).toBe(toggle);
  expect(screen.queryByTestId("detail-shell-close")).toBeNull();
  fireEvent.click(screen.getByTestId("detail-shell-open"));
  expect(onOpen).toHaveBeenCalledTimes(1);
  slot.remove();
  window.osInfo = original;
});

test("the resize handle slides with the panel instead of appearing at its place", () => {
  const slot = document.createElement("div");
  document.body.appendChild(slot);
  const view = render(shell(true, slot, () => {}));
  const handle = screen.getByTestId("detail-handle");
  expect(handle.style.transform).toBe("translateX(0)");
  expect(handle.style.transition).toContain("transform");
  view.rerender(shell(false, slot, () => {}));
  expect(screen.getByTestId("detail-handle").style.transform).toMatch(/^translateX\(var\(/);
  slot.remove();
});
