/* Characterization tests for the runtime workspace storage helpers.
   Written against the pre-repository localStorage implementation and kept
   green across the settings-repository conversion (Phase 1B T3). */

import {
  readWorkspaceRoot,
  writeWorkspaceRoot,
  readWorkspaces,
  writeWorkspaces,
  makeWorkspaceId,
} from "./runtime";
import { getSettingsPersistenceStatus } from "../../SERVICEs/settings_repository";

jest.mock("../workspace/workspace_editor", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("../../SERVICEs/bridges/unchain_bridge", () => ({
  __esModule: true,
  runtimeBridge: {
    isWorkspaceValidationAvailable: () => false,
    validateWorkspaceRoot: jest.fn(),
  },
}));

const readRoot = () =>
  JSON.parse(window.localStorage.getItem("settings") || "{}");

beforeEach(() => {
  window.localStorage.clear();
});

describe("readWorkspaceRoot", () => {
  test("returns empty string when settings are absent", () => {
    expect(readWorkspaceRoot()).toBe("");
  });

  test("returns the trimmed workspace root", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ runtime: { workspace_root: "  /tmp/ws  " } }),
    );
    expect(readWorkspaceRoot()).toBe("/tmp/ws");
  });

  test("returns empty string for a non-string workspace root", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ runtime: { workspace_root: 42 } }),
    );
    expect(readWorkspaceRoot()).toBe("");
  });

  test("tolerates corrupt settings JSON", () => {
    window.localStorage.setItem("settings", "{not json");
    expect(readWorkspaceRoot()).toBe("");
  });

  test("tolerates a non-object runtime section", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ runtime: ["nope"] }),
    );
    expect(readWorkspaceRoot()).toBe("");
  });
});

describe("writeWorkspaceRoot", () => {
  test("writes the trimmed root and reads it back", () => {
    writeWorkspaceRoot("  /tmp/demo  ");
    expect(readWorkspaceRoot()).toBe("/tmp/demo");
    expect(readRoot().runtime.workspace_root).toBe("/tmp/demo");
  });

  test("coerces non-string input to empty string", () => {
    writeWorkspaceRoot(null);
    expect(readRoot().runtime.workspace_root).toBe("");
  });

  test("preserves sibling runtime keys and sibling settings sections", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        runtime: { workspace_root: "/old", other_flag: true },
        appearance: { theme_mode: "dark_mode" },
      }),
    );
    writeWorkspaceRoot("/new");
    const root = readRoot();
    expect(root.runtime).toEqual({ workspace_root: "/new", other_flag: true });
    expect(root.appearance).toEqual({ theme_mode: "dark_mode" });
  });

  test("repairs corrupt settings JSON by rebuilding the root", () => {
    window.localStorage.setItem("settings", "{not json");
    writeWorkspaceRoot("/repaired");
    expect(readRoot()).toEqual({ runtime: { workspace_root: "/repaired" } });
  });
});

describe("readWorkspaces", () => {
  test("returns empty list when settings are absent", () => {
    expect(readWorkspaces()).toEqual([]);
  });

  test("returns empty list when workspaces is not an array", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ runtime: { workspaces: { id: "w1" } } }),
    );
    expect(readWorkspaces()).toEqual([]);
  });

  test("filters out malformed workspace entries", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        runtime: {
          workspaces: [
            { id: "w1", name: "PuPu", path: "/repo/PuPu" },
            { id: "w2", path: "/repo/two" },
            { id: "w3", name: "named-only" },
            { id: "   ", path: "/blank-id" },
            { id: "w4" },
            { path: "/no-id" },
            "not-an-object",
            null,
          ],
        },
      }),
    );
    expect(readWorkspaces()).toEqual([
      { id: "w1", name: "PuPu", path: "/repo/PuPu" },
      { id: "w2", path: "/repo/two" },
      { id: "w3", name: "named-only" },
    ]);
  });

  test("tolerates corrupt settings JSON", () => {
    window.localStorage.setItem("settings", "{not json");
    expect(readWorkspaces()).toEqual([]);
  });
});

describe("writeWorkspaces", () => {
  test("writes the list and reads it back", () => {
    const list = [{ id: "w1", name: "PuPu", path: "/repo/PuPu" }];
    writeWorkspaces(list);
    expect(readWorkspaces()).toEqual(list);
  });

  test("preserves sibling runtime keys and sibling settings sections", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        runtime: { workspace_root: "/root" },
        memory: { enabled: false },
      }),
    );
    writeWorkspaces([{ id: "w1", path: "/p" }]);
    const root = readRoot();
    expect(root.runtime.workspace_root).toBe("/root");
    expect(root.runtime.workspaces).toEqual([{ id: "w1", path: "/p" }]);
    expect(root.memory).toEqual({ enabled: false });
  });
});

describe("makeWorkspaceId", () => {
  test("produces unique ws_-prefixed ids", () => {
    const a = makeWorkspaceId();
    const b = makeWorkspaceId();
    expect(a).toMatch(/^ws_[a-z0-9]+_[a-z0-9]+$/);
    expect(a).not.toBe(b);
  });
});

describe("write failures (legacy bare-setItem contract)", () => {
  /* The pre-repository writers called localStorage.setItem without try/catch:
     a quota error propagated synchronously to the caller. The repository
     conversion must keep that contract in fallback mode. */

  const withThrowingSetItem = (fn) => {
    const spy = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    try {
      fn();
    } finally {
      spy.mockRestore();
    }
  };

  test("writeWorkspaceRoot throws synchronously on a storage write failure", () => {
    withThrowingSetItem(() => {
      expect(() => writeWorkspaceRoot("/tmp/pupu")).toThrow(
        /localstorage_write_failed/,
      );
    });
    expect(getSettingsPersistenceStatus().lastErrorCode).toBe(
      "localstorage_write_failed",
    );
    // the write really was dropped — readback still sees the old value
    expect(readWorkspaceRoot()).toBe("");
  });

  test("writeWorkspaces throws synchronously on a storage write failure", () => {
    withThrowingSetItem(() => {
      expect(() => writeWorkspaces([{ id: "w1", path: "/p" }])).toThrow(
        /localstorage_write_failed/,
      );
    });
    expect(readWorkspaces()).toEqual([]);
  });
});
