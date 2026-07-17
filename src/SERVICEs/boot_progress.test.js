/* eslint-env jest */

const OVERLAY_HTML = `
  <div id="boot-overlay">
    <div class="boot-progress-track">
      <div id="boot-progress-bar"></div>
    </div>
  </div>
`;

const mountOverlay = () => {
  document.body.innerHTML = OVERLAY_HTML;
};

const loadFreshModule = () => {
  let mod;
  jest.isolateModules(() => {
    mod = require("./boot_progress");
  });
  return mod;
};

describe("boot_progress", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    jest.useRealTimers();
  });

  test("set() updates the progress bar width", () => {
    mountOverlay();
    const bootProgress = loadFreshModule();

    bootProgress.set(42);

    const bar = document.getElementById("boot-progress-bar");
    expect(bar.style.width).toBe("42%");
  });

  test("set() clamps out-of-range values", () => {
    mountOverlay();
    const bootProgress = loadFreshModule();

    bootProgress.set(150);
    expect(document.getElementById("boot-progress-bar").style.width).toBe("100%");

    bootProgress.set(-10);
    expect(document.getElementById("boot-progress-bar").style.width).toBe("0%");
  });

  test("set() is a no-op when the overlay is absent from the DOM", () => {
    // No mountOverlay() call — simulates hot reload / web-only builds
    // where the static markup never existed.
    const bootProgress = loadFreshModule();
    expect(() => bootProgress.set(50)).not.toThrow();
  });

  test("release() jumps to 100%, fades, then removes the overlay", () => {
    jest.useFakeTimers();
    mountOverlay();
    const bootProgress = loadFreshModule();

    bootProgress.release();

    const overlay = document.getElementById("boot-overlay");
    const bar = document.getElementById("boot-progress-bar");
    expect(bar.style.width).toBe("100%");
    expect(overlay.style.opacity).toBe("0");
    expect(document.getElementById("boot-overlay")).not.toBeNull();

    jest.advanceTimersByTime(240);

    expect(document.getElementById("boot-overlay")).toBeNull();
    jest.useRealTimers();
  });

  test("release() is idempotent — a second call does not throw or re-remove", () => {
    jest.useFakeTimers();
    mountOverlay();
    const bootProgress = loadFreshModule();

    bootProgress.release();
    jest.advanceTimersByTime(240);
    expect(document.getElementById("boot-overlay")).toBeNull();

    expect(() => bootProgress.release()).not.toThrow();
    jest.useRealTimers();
  });

  test("set() is a no-op after release()", () => {
    jest.useFakeTimers();
    mountOverlay();
    const bootProgress = loadFreshModule();

    bootProgress.release();
    jest.advanceTimersByTime(240);

    // Overlay is gone; re-mount a fresh one to prove set() still refuses
    // to touch it once this module instance has released.
    mountOverlay();
    bootProgress.set(77);
    expect(document.getElementById("boot-progress-bar").style.width).toBe("");
    jest.useRealTimers();
  });

  test("8s failsafe auto-releases the overlay if release() is never called", () => {
    jest.useFakeTimers();
    mountOverlay();
    loadFreshModule();

    expect(document.getElementById("boot-overlay")).not.toBeNull();

    jest.advanceTimersByTime(8000);
    jest.advanceTimersByTime(240);

    expect(document.getElementById("boot-overlay")).toBeNull();
    jest.useRealTimers();
  });

  test("failsafe does not fire again once release() already ran manually", () => {
    jest.useFakeTimers();
    mountOverlay();
    const bootProgress = loadFreshModule();

    bootProgress.release();
    jest.advanceTimersByTime(240);
    expect(document.getElementById("boot-overlay")).toBeNull();

    // Advancing past the 8s failsafe window should not throw even though
    // the overlay is already gone.
    expect(() => jest.advanceTimersByTime(8000)).not.toThrow();
    jest.useRealTimers();
  });
});
