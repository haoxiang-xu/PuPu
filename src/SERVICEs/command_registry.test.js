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
      description: "commands.btw",
      icon: "btw",
      insertText: "/btw ",
      exclusiveGroup: "interject-channel",
    });
    expect(whileStreaming[1].icon).toBe("fyi");
    expect(whileStreaming[2].icon).toBe("steer_arrow");

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

describe("exclusive groups & token scanning", () => {
  const ctx = { isStreaming: true };
  let listCommands, findCommandTokens, extractCommands;
  beforeEach(() => {
    ({ listCommands, findCommandTokens, extractCommands } =
      loadCommandRegistryModule());
  });

  test("listCommands filters out commands conflicting with activeCommands", () => {
    const withActive = listCommands(
      { isStreaming: true, activeCommands: ["/fyi"] },
      "",
    );
    // fyi/btw/steer share "interject-channel" — all gone once one is active
    expect(withActive.map((c) => c.name)).toEqual([]);
  });

  test("findCommandTokens: first token takes the group, later same-group tokens stay inactive", () => {
    const tokens = findCommandTokens("check this /fyi and then /steer after", ctx);
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatchObject({ name: "/fyi", active: true });
    expect(tokens[1]).toMatchObject({ name: "/steer", active: false });
  });

  test("findCommandTokens: word boundary + availability required", () => {
    expect(findCommandTokens("path/fyi none", ctx)).toEqual([]); // no boundary
    expect(findCommandTokens("/fyi hi", { isStreaming: false })).toEqual([]); // unavailable
    const atEnd = findCommandTokens("note /btw", ctx); // end-of-text counts
    expect(atEnd).toHaveLength(1);
    expect(atEnd[0]).toMatchObject({ name: "/btw", active: true });
  });

  test("extractCommands strips active tokens (plus one space) and keeps inactive ones", () => {
    const { commands, body } = extractCommands(
      "check this /fyi and then /steer after",
      ctx,
    );
    expect(commands).toEqual(["/fyi"]);
    expect(body).toBe("check this and then /steer after");
  });

  test("extractCommands with no tokens returns text unchanged", () => {
    expect(extractCommands("plain text", ctx)).toEqual({
      commands: [],
      body: "plain text",
    });
  });
});
