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

  test("set() clamps an over-range value to 100", () => {
    mountOverlay();
    const bootProgress = loadFreshModule();

    bootProgress.set(150);
    expect(document.getElementById("boot-progress-bar").style.width).toBe("100%");
  });

  test("set() clamps an under-range value to 0", () => {
    // Its own fresh module: clamping and monotonicity are separate concerns,
    // and from a non-zero pct the monotonic guard would (correctly) swallow it.
    mountOverlay();
    const bootProgress = loadFreshModule();

    bootProgress.set(-10);
    expect(bootProgress.getState().pct).toBe(0);
  });

  test("set() is monotonic — the bar never walks backwards", () => {
    // pct is user-visible now. The milestones do not arrive in a fixed order:
    // a ChatInterface remount re-runs its set(80) after the backend already
    // pushed 88/96.
    mountOverlay();
    const bootProgress = loadFreshModule();
    const cb = jest.fn();

    bootProgress.set(88);
    bootProgress.subscribe(cb);
    bootProgress.set(80);

    expect(bootProgress.getState().pct).toBe(88);
    expect(document.getElementById("boot-progress-bar").style.width).toBe("88%");
    // A swallowed regression must not even notify — subscribers re-render on it.
    expect(cb).not.toHaveBeenCalled();

    bootProgress.set(96);
    expect(bootProgress.getState().pct).toBe(96);
  });

  test("a swallowed regression still repaints a re-created bar node", () => {
    // The DOM is a separate output from the state. A shell rebuilt after pct
    // has already advanced starts at width "" — if the monotonic guard skipped
    // the paint too, that bar would stay blank forever while state said 88.
    mountOverlay();
    const bootProgress = loadFreshModule();
    bootProgress.set(88);

    mountOverlay(); // fresh node, width ""
    expect(document.getElementById("boot-progress-bar").style.width).toBe("");

    bootProgress.set(55); // regression — rejected as a value...

    // ...but the authoritative pct is painted, not the rejected argument.
    expect(document.getElementById("boot-progress-bar").style.width).toBe("88%");
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

  describe("subscribe / signalReady / takeOver", () => {
    test("getState() starts at { pct: 0, ready: false }", () => {
      const bootProgress = loadFreshModule();
      expect(bootProgress.getState()).toEqual({ pct: 0, ready: false });
    });

    test("subscribe(cb) is notified on set() with the new pct", () => {
      mountOverlay();
      const bootProgress = loadFreshModule();
      const cb = jest.fn();
      bootProgress.subscribe(cb);

      bootProgress.set(42);

      expect(cb).toHaveBeenCalledWith({ pct: 42, ready: false });
      expect(bootProgress.getState()).toEqual({ pct: 42, ready: false });
    });

    test("subscribe() returns an unsubscribe function", () => {
      const bootProgress = loadFreshModule();
      const cb = jest.fn();
      const unsubscribe = bootProgress.subscribe(cb);

      unsubscribe();
      bootProgress.set(10);

      expect(cb).not.toHaveBeenCalled();
    });

    test("signalReady() alone does NOT flip ready — the backend gate is still closed", () => {
      mountOverlay();
      const bootProgress = loadFreshModule();
      const cb = jest.fn();
      bootProgress.subscribe(cb);

      bootProgress.signalReady();

      // This is the whole point of the readiness rework: chat reaching its
      // first screen says nothing about whether the local backend is up.
      expect(bootProgress.getState()).toEqual({ pct: 0, ready: false });
      expect(cb).not.toHaveBeenCalled();
      // Static DOM untouched — React BootOverlay owns the ready UI, not the shell.
      expect(document.getElementById("boot-overlay")).not.toBeNull();
      expect(document.getElementById("boot-progress-bar").style.width).toBe("");
    });

    test("ready flips only once EVERY gate is satisfied, and snaps pct to 100", () => {
      const bootProgress = loadFreshModule();
      const cb = jest.fn();
      bootProgress.subscribe(cb);

      bootProgress.satisfyGate(bootProgress.BOOT_GATES.BACKEND);
      expect(bootProgress.getState()).toEqual({ pct: 0, ready: false });
      expect(cb).not.toHaveBeenCalled();

      bootProgress.signalReady();

      expect(bootProgress.getState()).toEqual({ pct: 100, ready: true });
      expect(cb).toHaveBeenCalledWith({ pct: 100, ready: true });
    });

    test("gate order does not matter", () => {
      const bootProgress = loadFreshModule();

      bootProgress.signalReady();
      expect(bootProgress.getState().ready).toBe(false);
      bootProgress.satisfyGate(bootProgress.BOOT_GATES.BACKEND);

      expect(bootProgress.getState()).toEqual({ pct: 100, ready: true });
    });

    test("resetGate() re-closes the gate when the backend dies after coming up", () => {
      const bootProgress = loadFreshModule();
      bootProgress.signalReady();
      bootProgress.satisfyGate(bootProgress.BOOT_GATES.BACKEND);
      expect(bootProgress.getState().ready).toBe(true);

      const cb = jest.fn();
      bootProgress.subscribe(cb);
      bootProgress.resetGate(bootProgress.BOOT_GATES.BACKEND);

      // ready drops; pct deliberately stays put rather than walking backwards.
      expect(bootProgress.getState()).toEqual({ pct: 100, ready: false });
      expect(cb).toHaveBeenCalledWith({ pct: 100, ready: false });
    });

    test("signalReady() is idempotent", () => {
      const bootProgress = loadFreshModule();
      const cb = jest.fn();
      bootProgress.satisfyGate(bootProgress.BOOT_GATES.BACKEND);
      bootProgress.signalReady();
      bootProgress.subscribe(cb);

      bootProgress.signalReady();

      expect(cb).not.toHaveBeenCalled();
    });

    test("unknown gate keys are ignored and cannot hold the gate open or shut", () => {
      const bootProgress = loadFreshModule();
      bootProgress.satisfyGate("nope");
      expect(bootProgress.getGates()).toEqual({
        chatFirstScreen: false,
        backend: false,
      });

      bootProgress.signalReady();
      bootProgress.satisfyGate(bootProgress.BOOT_GATES.BACKEND);
      bootProgress.resetGate("nope");
      expect(bootProgress.getState().ready).toBe(true);
    });

    test("takeOver() removes the static overlay node and disables further DOM driving from set()", () => {
      mountOverlay();
      const bootProgress = loadFreshModule();

      bootProgress.takeOver();
      expect(document.getElementById("boot-overlay")).toBeNull();

      const cb = jest.fn();
      bootProgress.subscribe(cb);
      bootProgress.set(60);

      // subscriber still gets state updates post-takeOver...
      expect(cb).toHaveBeenCalledWith({ pct: 60, ready: false });
      // ...but there is no DOM left for it to (re)drive.
      expect(document.getElementById("boot-overlay")).toBeNull();
    });

    test("takeOver() is idempotent and safe when the overlay is already absent", () => {
      const bootProgress = loadFreshModule();
      expect(() => {
        bootProgress.takeOver();
        bootProgress.takeOver();
      }).not.toThrow();
    });

    test("release() after takeOver() still updates state/notifies but does not throw touching a gone DOM node", () => {
      mountOverlay();
      const bootProgress = loadFreshModule();
      bootProgress.takeOver();

      const cb = jest.fn();
      bootProgress.subscribe(cb);

      expect(() => bootProgress.release()).not.toThrow();
      expect(cb).toHaveBeenCalledWith({ pct: 100, ready: true });
    });

    test("post-takeOver, the 8s failsafe NEVER opens the gate — a timeout is not evidence the backend is up", () => {
      jest.useFakeTimers();
      mountOverlay();
      const bootProgress = loadFreshModule();
      bootProgress.takeOver();

      const cb = jest.fn();
      bootProgress.subscribe(cb);

      jest.advanceTimersByTime(8000);
      // and well past it — there is no time limit at all once React owns the gate
      jest.advanceTimersByTime(120000);

      expect(bootProgress.getState()).toEqual({ pct: 0, ready: false });
      expect(cb).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    test("post-takeOver, the renderer milestone gate self-satisfies so a non-chat route cannot hang", () => {
      // /mini demo route, a HashRouter reload on a stale #/… fragment, or a
      // chat render that threw: nobody ever calls signalReady(), and the gate
      // would otherwise wait on a milestone that will never arrive.
      jest.useFakeTimers();
      const bootProgress = loadFreshModule();
      bootProgress.takeOver();

      expect(bootProgress.getGates().chatFirstScreen).toBe(false);
      jest.advanceTimersByTime(8000);

      expect(bootProgress.getGates().chatFirstScreen).toBe(true);
      // ...and it did NOT touch the backend gate, so the user is still held out.
      expect(bootProgress.getGates().backend).toBe(false);
      expect(bootProgress.getState().ready).toBe(false);
      jest.useRealTimers();
    });

    test("no clock can open the backend gate, however long it runs", () => {
      jest.useFakeTimers();
      const bootProgress = loadFreshModule();
      bootProgress.takeOver();

      jest.advanceTimersByTime(60 * 60 * 1000);

      expect(bootProgress.getGates().backend).toBe(false);
      expect(bootProgress.getState().ready).toBe(false);
      jest.useRealTimers();
    });

    test("post-takeOver, a chat-ready app with a dead backend stays gated forever", () => {
      jest.useFakeTimers();
      const bootProgress = loadFreshModule();
      bootProgress.takeOver();
      bootProgress.signalReady();

      jest.advanceTimersByTime(600000);

      expect(bootProgress.getState().ready).toBe(false);
      jest.useRealTimers();
    });

    test("pre-takeOver with an EMPTY #root, the 8s failsafe still falls back to the legacy release()", () => {
      // The ONE surviving timed release: React produced nothing at all, so
      // there is no overlay to render a status or a retry and no bridge to ask.
      // A permanently opaque screen is the worse failure here.
      jest.useFakeTimers();
      mountOverlay();
      document.body.insertAdjacentHTML("beforeend", '<div id="root"></div>');
      const bootProgress = loadFreshModule();

      jest.advanceTimersByTime(8000);
      jest.advanceTimersByTime(240);

      expect(document.getElementById("boot-overlay")).toBeNull();
      expect(bootProgress.getState()).toEqual({ pct: 100, ready: true });
      jest.useRealTimers();
    });

    test("REGRESSION: a slow theme resolve cannot let the failsafe bypass the backend gate", () => {
      /* BootOverlay lives under ConfigContainer's `isThemeBooting` branch, so a
         slow theme resolve delays takeOver() while React is perfectly alive.
         Theme resolution is synchronous today, but the settings->SQLite
         migration makes it async — the moment it can exceed 8s, a release()
         here would force-open a gate whose backend half was never checked.
         Anchoring on "React rendered something" rather than "takeOver ran" is
         what keeps the invariant true. */
      jest.useFakeTimers();
      mountOverlay();
      // React IS alive — it just rendered ThemeBootScreen, not BootOverlay yet.
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div id="root"><div id="theme-boot-screen"></div></div>',
      );
      const bootProgress = loadFreshModule();

      jest.advanceTimersByTime(8000);
      jest.advanceTimersByTime(240);

      expect(bootProgress.getState().ready).toBe(false);
      expect(bootProgress.getGates().backend).toBe(false);
      // The static shell is still up, still covering the app.
      expect(document.getElementById("boot-overlay")).not.toBeNull();
      jest.useRealTimers();
    });

    test("release() force-opens the gate and later gate updates cannot re-close it", () => {
      const bootProgress = loadFreshModule();
      bootProgress.release();
      expect(bootProgress.getState()).toEqual({ pct: 100, ready: true });

      bootProgress.resetGate(bootProgress.BOOT_GATES.BACKEND);

      // The overlay node is already gone; re-closing would strand the user
      // behind nothing.
      expect(bootProgress.getState()).toEqual({ pct: 100, ready: true });
    });

    test("release() never CLAIMS the backend gate was satisfied", () => {
      // It force-opens via the `released` flag, but nothing in this module may
      // assert the backend came up when it was never checked — getGates() has
      // to stay honest for any reader.
      const bootProgress = loadFreshModule();
      bootProgress.release();

      expect(bootProgress.getGates()).toEqual({
        chatFirstScreen: true,
        backend: false,
      });
    });
  });
});
