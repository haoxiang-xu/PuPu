import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { FloatingDetailShell } from "./canvas_chrome";
import { NavigationContext } from "../../../../CONTAINERs/config/context";

if (!global.ResizeObserver) global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const shell = (open, slot, onClose) => (
  <NavigationContext.Provider value={{ agentsDetailSlot: slot }}>
    <div data-testid="canvas">
      <FloatingDetailShell
        isDark={false}
        open={open}
        width={320}
        minWidth={300}
        resizing={false}
        testId="detail-shell"
        onClose={onClose}
        handle={{ testId: "detail-handle", pillTestId: "detail-pill", onDragStart() {}, onDrag() {}, onDragEnd() {} }}
      >
        <button type="button">field</button>
      </FloatingDetailShell>
    </div>
  </NavigationContext.Provider>
);

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

test("its close button sits in the title bar band and closes it", () => {
  const slot = document.createElement("div");
  document.body.appendChild(slot);
  const onClose = jest.fn();
  render(shell(true, slot, onClose));
  const close = screen.getByTestId("detail-shell-close");
  expect(slot.contains(close)).toBe(true);
  expect(screen.getByTestId("detail-shell").contains(close)).toBe(false);
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

test("on macOS the close button sits in the corner: as far from the right edge as from the top", () => {
  const original = window.osInfo;
  window.osInfo = { platform: "darwin" };
  const slot = document.createElement("div");
  document.body.appendChild(slot);
  render(shell(true, slot, () => {}));
  const holder = screen.getByTestId("detail-shell-close").closest("div[style*='position: absolute']");
  expect(holder.style.top).toBe("25px");
  expect(holder.style.right).toBe("25px");
  expect(holder.style.transform).toBe("translate(50%, -50%)");
  slot.remove();
  window.osInfo = original;
});
