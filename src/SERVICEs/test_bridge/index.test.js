describe("test bridge installer", () => {
  let originalConsole;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
    };
    window.__pupuTestBridge = {
      markReady: jest.fn(),
      pushLog: jest.fn(),
      register: jest.fn(),
    };
    window.unchainAPI = {
      getStatus: jest.fn(async () => ({ status: "starting", ready: false })),
      getModelCatalog: jest.fn(async () => ({ models: [] })),
      getToolkitCatalog: jest.fn(async () => ({ toolkits: [] })),
      listCharacters: jest.fn(async () => ({ characters: [] })),
    };
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    delete window.__pupuTestBridge;
    delete window.unchainAPI;
    jest.resetModules();
  });

  test("does not fetch catalog counts before Unchain is ready", async () => {
    require("./index");
    await Promise.resolve();
    await Promise.resolve();

    expect(window.unchainAPI.getStatus).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.getModelCatalog).not.toHaveBeenCalled();
    expect(window.unchainAPI.getToolkitCatalog).not.toHaveBeenCalled();
    expect(window.unchainAPI.listCharacters).not.toHaveBeenCalled();
  });
});
