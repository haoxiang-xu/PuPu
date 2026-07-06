const loadCommandRegistryModule = () => {
  jest.resetModules();
  return require("./command_registry");
};

describe("command_registry", () => {
  test("seeds /btw /fyi /steer, all available only while streaming", () => {
    const { listCommands } = loadCommandRegistryModule();

    const whileStreaming = listCommands({ isStreaming: true }, "");
    expect(whileStreaming.map((c) => c.name)).toEqual([
      "/btw",
      "/fyi",
      "/steer",
    ]);
    expect(whileStreaming[0]).toEqual({
      name: "/btw",
      description: "立即回答,不打断当前任务",
      insertText: "/btw ",
    });

    const notStreaming = listCommands({ isStreaming: false }, "");
    expect(notStreaming).toEqual([]);
  });

  test("empty prefix returns all available commands", () => {
    const { listCommands } = loadCommandRegistryModule();

    const items = listCommands({ isStreaming: true });
    expect(items.map((c) => c.name)).toEqual(["/btw", "/fyi", "/steer"]);
  });

  test("filters by case-insensitive name prefix", () => {
    const { listCommands } = loadCommandRegistryModule();

    expect(
      listCommands({ isStreaming: true }, "/b").map((c) => c.name),
    ).toEqual(["/btw"]);
    expect(
      listCommands({ isStreaming: true }, "/S").map((c) => c.name),
    ).toEqual(["/steer"]);
    expect(listCommands({ isStreaming: true }, "/f").map((c) => c.name)).toEqual([
      "/fyi",
    ]);
    expect(listCommands({ isStreaming: true }, "/zz")).toEqual([]);
  });

  test("filters by availability(ctx) in addition to prefix", () => {
    const { registerCommand, listCommands } = loadCommandRegistryModule();

    registerCommand({
      name: "/always",
      description: "always available",
      availability: () => true,
    });
    registerCommand({
      name: "/never",
      description: "never available",
      availability: () => false,
    });

    const items = listCommands({ isStreaming: false }, "/");
    const names = items.map((c) => c.name);
    expect(names).toContain("/always");
    expect(names).not.toContain("/never");
    // built-ins gated on isStreaming stay excluded here too
    expect(names).not.toContain("/btw");
  });

  test("defaults availability to always-available when omitted", () => {
    const { registerCommand, listCommands } = loadCommandRegistryModule();

    registerCommand({ name: "/plain", description: "no availability given" });

    expect(
      listCommands({ isStreaming: false }, "/plain").map((c) => c.name),
    ).toEqual(["/plain"]);
  });

  test("defaults insertText to name + a trailing space", () => {
    const { registerCommand, listCommands } = loadCommandRegistryModule();

    registerCommand({ name: "/noinsert", description: "no insertText given" });

    const [item] = listCommands({ isStreaming: false }, "/noinsert");
    expect(item.insertText).toBe("/noinsert ");
  });

  test("respects an explicit insertText override", () => {
    const { registerCommand, listCommands } = loadCommandRegistryModule();

    registerCommand({
      name: "/custom",
      description: "custom insert",
      insertText: "/custom --flag ",
    });

    const [item] = listCommands({ isStreaming: false }, "/custom");
    expect(item.insertText).toBe("/custom --flag ");
  });

  test("returns a stable order matching registration order for ties", () => {
    const { registerCommand, listCommands } = loadCommandRegistryModule();

    registerCommand({ name: "/zeta", description: "z" });
    registerCommand({ name: "/alpha", description: "a" });
    registerCommand({ name: "/mid", description: "m" });

    const names = listCommands({ isStreaming: false }, "/").map((c) => c.name);
    // registration order preserved: built-ins first (excluded, not streaming),
    // then zeta, alpha, mid in the order they were registered.
    expect(names).toEqual(["/zeta", "/alpha", "/mid"]);
  });

  test("throws when registering a command name without a leading slash", () => {
    const { registerCommand } = loadCommandRegistryModule();

    expect(() => registerCommand({ name: "bad", description: "x" })).toThrow();
  });
});
