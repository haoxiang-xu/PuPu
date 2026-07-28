/* eslint-env jest */
import { renderHook, act } from "@testing-library/react";
import useReducedMotion from "./use_reduced_motion";

const mockMatchMedia = (initialMatches) => {
  const listeners = new Set();
  const mql = {
    matches: initialMatches,
    addEventListener: (_event, cb) => listeners.add(cb),
    removeEventListener: (_event, cb) => listeners.delete(cb),
  };
  window.matchMedia = jest.fn(() => mql);
  return {
    fire: (matches) => {
      mql.matches = matches;
      listeners.forEach((cb) => cb({ matches }));
    },
  };
};

describe("useReducedMotion", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  test("reads the initial prefers-reduced-motion value", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  test("defaults to false when the query does not match", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  test("updates when the media query change event fires", () => {
    const media = mockMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => media.fire(true));
    expect(result.current).toBe(true);
  });

  test("unsubscribes on unmount without throwing", () => {
    mockMatchMedia(false);
    const { unmount } = renderHook(() => useReducedMotion());
    expect(() => unmount()).not.toThrow();
  });
});
