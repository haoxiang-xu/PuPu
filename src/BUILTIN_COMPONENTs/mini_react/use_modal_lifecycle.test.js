import { renderHook } from "@testing-library/react";
import { useModalLifecycle, getModalRegistry } from "./use_modal_lifecycle";

describe("useModalLifecycle", () => {
  beforeEach(() => {
    delete window.__pupuModalRegistry;
  });

  test("registers id on mount when isOpen=true, deregisters on unmount", () => {
    const { unmount } = renderHook(() => useModalLifecycle("toolkit", true));
    expect(getModalRegistry().openIds()).toContain("toolkit");
    unmount();
    expect(getModalRegistry().openIds()).not.toContain("toolkit");
  });

  test("does not register when isOpen=false", () => {
    renderHook(() => useModalLifecycle("settings", false));
    const reg = getModalRegistry();
    expect(reg ? reg.openIds() : []).not.toContain("settings");
  });

  test("toggles when isOpen flips", () => {
    let open = true;
    const { rerender } = renderHook(() => useModalLifecycle("char", open));
    expect(getModalRegistry().openIds()).toContain("char");
    open = false;
    rerender();
    expect(getModalRegistry().openIds()).not.toContain("char");
  });
});
