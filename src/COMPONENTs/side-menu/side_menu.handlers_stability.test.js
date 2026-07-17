// Switch-chain incrementalization Task 3: the explorer handlers object passed
// to buildExplorerFromTree must keep a CONSTANT reference across re-renders
// (it is part of the row cache key — a new handlers object per render would
// defeat the cache entirely), the row cache object must be held stable by the
// side menu, and untouched rows must keep reference identity across store
// writes end-to-end (store emit → hook setState → useMemo rebuild).

import { act, render } from "@testing-library/react";

import SideMenu from "./side_menu";
import { ConfigContext, LocaleContext } from "../../CONTAINERs/config/context";

jest.mock("../../SERVICEs/chat_storage", () => {
  const actual = jest.requireActual("../../SERVICEs/chat_storage");
  return {
    ...actual,
    buildExplorerFromTree: jest.fn(actual.buildExplorerFromTree),
  };
});

jest.mock("../settings/settings_modal_content", () => ({
  SettingsModalContent: () => {
    throw new Promise(() => {});
  },
}));

jest.mock("../toolkit/plugins_shell", () => ({
  PluginsShell: () => {
    throw new Promise(() => {});
  },
}));

jest.mock("../workspace/workspace_modal_content", () => ({
  WorkspaceModalContent: () => {
    throw new Promise(() => {});
  },
}));

jest.mock(
  "../agents/agents_modal_content",
  () => ({
    AgentsModalContent: () => {
      throw new Promise(() => {});
    },
  }),
  { virtual: true },
);

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => (
  <span data-testid="icon" />
));

jest.mock("../../BUILTIN_COMPONENTs/explorer/explorer", () => () => (
  <div data-testid="explorer" />
));

const {
  buildExplorerFromTree,
  createChatInSelectedContext,
  flushStoreEmitSync,
} = require("../../SERVICEs/chat_storage");

const renderSideMenu = () =>
  render(
    <ConfigContext.Provider
      value={{
        theme: {},
        onFragment: "side_menu",
        setOnFragment: jest.fn(),
        onThemeMode: "light_mode",
      }}
    >
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <SideMenu />
      </LocaleContext.Provider>
    </ConfigContext.Provider>,
  );

const writeChat = async (title) => {
  let created;
  await act(async () => {
    created = createChatInSelectedContext({ title }, { source: "test" });
    flushStoreEmitSync();
    await Promise.resolve();
  });
  return created;
};

const findNodeIdByLabel = (model, label) =>
  Object.keys(model.data).find((id) => model.data[id]?.label === label);

describe("SideMenu explorer incremental wiring", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Cross-generation reference identity (T1) holds on the IPC-backend path
    // (memoryStore generations); the localStorage fallback re-parses JSON per
    // write. Install the same bridge mock the store identity tests use.
    window.chatStorageAPI = {
      bootstrap: () => null,
      write: jest.fn(),
      readMessages: () => [],
      applyOps: jest.fn(),
    };
    // CRA sets resetMocks: true — re-attach the real implementation so the
    // jest.fn is a pure pass-through spy.
    buildExplorerFromTree.mockImplementation(
      jest.requireActual("../../SERVICEs/chat_storage").buildExplorerFromTree,
    );
  });

  afterEach(() => {
    delete window.chatStorageAPI;
  });

  test("handlers object and row cache keep constant identity across re-renders; untouched rows keep identity across writes", async () => {
    renderSideMenu();

    await writeChat("Alpha");
    await writeChat("Beta");
    const callsAfterBeta = buildExplorerFromTree.mock.calls.length;
    await writeChat("Gamma");

    const calls = buildExplorerFromTree.mock.calls;
    expect(calls.length).toBeGreaterThan(callsAfterBeta);

    // (1) handlers object: SAME reference on every single build
    const firstHandlers = calls[0][2];
    expect(firstHandlers).toBeDefined();
    for (const call of calls) {
      expect(call[2]).toBe(firstHandlers);
    }
    // handler methods are stable dispatchers, present and callable
    expect(typeof firstHandlers.onSelect).toBe("function");
    expect(typeof firstHandlers.onContextMenu).toBe("function");
    expect(typeof firstHandlers.onStartRename).toBe("function");

    // (2) row cache: side menu owns ONE cache object for its lifetime
    const firstCache = calls[0][3];
    expect(firstCache).toBeDefined();
    expect(firstCache.rowsByNodeId).toBeInstanceOf(Map);
    for (const call of calls) {
      expect(call[3]).toBe(firstCache);
    }

    // (3) end-to-end row identity: Alpha's chat was untouched (and unselected)
    // between the post-Beta and post-Gamma builds → its row object must be
    // reference-identical across the two builds.
    const results = buildExplorerFromTree.mock.results;
    const afterBeta = results[callsAfterBeta - 1].value;
    const afterGamma = results[results.length - 1].value;

    const alphaNodeId = findNodeIdByLabel(afterGamma, "Alpha");
    expect(alphaNodeId).toBeDefined();
    expect(afterBeta.data[alphaNodeId]).toBeDefined();
    expect(afterGamma.data[alphaNodeId]).toBe(afterBeta.data[alphaNodeId]);

    // sanity: the freshly created/selected row is NOT reused stale — Gamma is
    // present in the last build only, and Beta's row was re-minted (selection
    // moved off it).
    const gammaNodeId = findNodeIdByLabel(afterGamma, "Gamma");
    expect(gammaNodeId).toBeDefined();
    const betaNodeId = findNodeIdByLabel(afterGamma, "Beta");
    expect(afterGamma.data[betaNodeId]).not.toBe(afterBeta.data[betaNodeId]);
  });
});
