const loadCommandRegistryModule = () => {
  jest.resetModules();
  return require("./command_registry");
};

describe("command_registry", () => {
  test("seeds /btw /fyi /queue, all available only while streaming", () => {
    const { listCommands } = loadCommandRegistryModule();

    const whileStreaming = listCommands({ isStreaming: true }, "");
    expect(whileStreaming.map((c) => c.name)).toEqual([
      "/btw",
      "/fyi",
      "/queue",
    ]);
    expect(whileStreaming[0]).toEqual({
      name: "/btw",
      description: "commands.btw",
      icon: "btw",
      insertText: "/btw ",
      exclusiveGroup: "interject-channel",
      channel: "btw",
    });
    expect(whileStreaming[1].icon).toBe("fyi");
    expect(whileStreaming[1].channel).toBe("fyi");
    expect(whileStreaming[2].icon).toBe("queue_arrow");
    expect(whileStreaming[2].channel).toBe("queue");

    const notStreaming = listCommands({ isStreaming: false }, "");
    expect(notStreaming).toEqual([]);
  });

  test("empty prefix returns all available commands", () => {
    const { listCommands } = loadCommandRegistryModule();

    const items = listCommands({ isStreaming: true });
    expect(items.map((c) => c.name)).toEqual(["/btw", "/fyi", "/queue"]);
  });

  test("filters by case-insensitive name prefix", () => {
    const { listCommands } = loadCommandRegistryModule();

    expect(
      listCommands({ isStreaming: true }, "/b").map((c) => c.name),
    ).toEqual(["/btw"]);
    expect(
      listCommands({ isStreaming: true }, "/Q").map((c) => c.name),
    ).toEqual(["/queue"]);
    expect(listCommands({ isStreaming: true }, "/f").map((c) => c.name)).toEqual([
      "/fyi",
    ]);
    expect(listCommands({ isStreaming: true }, "/zz")).toEqual([]);
  });

  test("channel defaults to empty string when omitted at registration", () => {
    const { registerCommand, listCommands } = loadCommandRegistryModule();

    registerCommand({ name: "/nochan", description: "no channel given" });

    const [item] = listCommands({ isStreaming: false }, "/nochan");
    expect(item.channel).toBe("");
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
    // fyi/btw/queue share "interject-channel" — all gone once one is active
    expect(withActive.map((c) => c.name)).toEqual([]);
  });

  test("findCommandTokens: first token takes the group, later same-group tokens stay inactive", () => {
    const tokens = findCommandTokens("check this /fyi and then /queue after", ctx);
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatchObject({ name: "/fyi", channel: "fyi", active: true });
    expect(tokens[1]).toMatchObject({ name: "/queue", channel: "queue", active: false });
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
      "check this /fyi and then /queue after",
      ctx,
    );
    // commands carry the registry channel so consumers never derive the
    // wire channel from the command NAME again
    expect(commands).toEqual([{ name: "/fyi", channel: "fyi" }]);
    expect(body).toBe("check this and then /queue after");
  });

  test("extractCommands with no tokens returns text unchanged", () => {
    expect(extractCommands("plain text", ctx)).toEqual({
      commands: [],
      body: "plain text",
    });
  });
});

describe("phase ctx (composer/streaming)", () => {
  test("derives phase from isStreaming when phase is absent; explicit phase wins", () => {
    const { registerCommand, listCommands } = loadCommandRegistryModule();
    const seen = [];
    registerCommand({
      name: "/probe",
      description: "records ctx",
      availability: (ctx) => {
        seen.push(ctx.phase);
        return true;
      },
    });
    listCommands({ isStreaming: true }, "/probe");
    listCommands({ isStreaming: false }, "/probe");
    listCommands({ phase: "composer", isStreaming: true }, "/probe");
    expect(seen).toEqual(["streaming", "composer", "composer"]);
  });

  test("interject seeds are streaming-phase only", () => {
    const { listCommands } = loadCommandRegistryModule();
    const names = (ctx) => listCommands(ctx, "").map((c) => c.name);
    expect(names({ phase: "streaming" })).toEqual(["/btw", "/fyi", "/queue"]);
    expect(names({ phase: "composer" })).toEqual([]);
    // legacy callers keep working unchanged:
    expect(names({ isStreaming: true })).toEqual(["/btw", "/fyi", "/queue"]);
    expect(names({ isStreaming: false })).toEqual([]);
  });

  test("normalizes selectedToolkits to an array", () => {
    const { registerCommand, listCommands } = loadCommandRegistryModule();
    let got;
    registerCommand({
      name: "/tk",
      description: "ctx probe",
      availability: (ctx) => {
        got = ctx.selectedToolkits;
        return true;
      },
    });
    listCommands({}, "/tk");
    expect(got).toEqual([]);
    listCommands({ selectedToolkits: ["plan"] }, "/tk");
    expect(got).toEqual(["plan"]);
  });
});

describe("source, priority & unregisterBySource", () => {
  test("defaults source to 'builtin' and exposes it via getCommand", () => {
    const { registerCommand, getCommand } = loadCommandRegistryModule();
    registerCommand({ name: "/x", description: "d" });
    expect(getCommand("/x")).toMatchObject({ name: "/x", source: "builtin" });
    expect(getCommand("/X")).toMatchObject({ name: "/x" });
    expect(getCommand("/nope")).toBeNull();
    expect(getCommand("/btw").source).toBe("interject");
  });

  test("same name + same source overwrites (idempotent re-register)", () => {
    const { registerCommand, getCommand } = loadCommandRegistryModule();
    registerCommand({ name: "/x", description: "first" });
    expect(registerCommand({ name: "/x", description: "second" })).toBe(true);
    expect(getCommand("/x").description).toBe("second");
  });

  test("lower-priority source cannot shadow an existing name", () => {
    const { registerCommand, getCommand } = loadCommandRegistryModule();
    registerCommand({ name: "/plan", description: "app" });
    const ok = registerCommand({
      name: "/plan",
      description: "from plugin",
      source: "plugin:plan",
    });
    expect(ok).toBe(false);
    expect(getCommand("/plan").source).toBe("builtin");
    expect(getCommand("/plan").description).toBe("app");
  });

  test("same-priority different source: first registration wins", () => {
    const { registerCommand, getCommand } = loadCommandRegistryModule();
    registerCommand({ name: "/sum", description: "a", source: "plugin:a" });
    expect(
      registerCommand({ name: "/sum", description: "b", source: "plugin:b" }),
    ).toBe(false);
    expect(getCommand("/sum").description).toBe("a");
  });

  test("higher-priority source replaces a plugin command", () => {
    const { registerCommand, getCommand } = loadCommandRegistryModule();
    registerCommand({ name: "/y", description: "plugin", source: "plugin:p" });
    expect(registerCommand({ name: "/y", description: "app" })).toBe(true);
    expect(getCommand("/y").source).toBe("builtin");
  });

  test("unregisterBySource removes exactly that source's commands", () => {
    const { registerCommand, unregisterBySource, getCommand } =
      loadCommandRegistryModule();
    registerCommand({ name: "/a", description: "a", source: "plugin:p1" });
    registerCommand({ name: "/b", description: "b", source: "plugin:p1" });
    registerCommand({ name: "/c", description: "c", source: "plugin:p2" });
    unregisterBySource("plugin:p1");
    expect(getCommand("/a")).toBeNull();
    expect(getCommand("/b")).toBeNull();
    expect(getCommand("/c")).not.toBeNull();
    expect(getCommand("/btw")).not.toBeNull();
  });

  test("case-variant registration is case-insensitive for priority gate", () => {
    const warnSpy = jest.spyOn(console, "warn");
    const {
      registerCommand,
      getCommand,
      listCommands,
    } = loadCommandRegistryModule();

    // Register builtin /testcmd (not seeded)
    registerCommand({ name: "/testcmd", description: "original" });
    expect(getCommand("/testcmd").source).toBe("builtin");

    // Clear previous spy calls from module load
    warnSpy.mockClear();

    // Try to register lower-priority plugin with case-variant /TESTCMD
    const result = registerCommand({
      name: "/TESTCMD",
      description: "from plugin",
      source: "plugin:p",
    });

    expect(result).toBe(false); // Should be rejected
    expect(getCommand("/testcmd").description).toBe("original"); // Original unchanged
    expect(getCommand("/TESTCMD").description).toBe("original"); // Case-insensitive lookup

    // Verify conflict warning was logged (check the last argument which is the message)
    expect(warnSpy).toHaveBeenCalled();
    const lastCall = warnSpy.mock.calls[warnSpy.mock.calls.length - 1];
    const message = lastCall[lastCall.length - 1]; // Last arg is the message
    expect(message).toContain("TESTCMD");
    expect(message).toContain("plugin:p");

    warnSpy.mockRestore();
  });

  test("same-source case-variant re-register overwrites and leaves one entry", () => {
    const { registerCommand, getCommand, listCommands } =
      loadCommandRegistryModule();

    // Register /myCmd with builtin source
    registerCommand({ name: "/myCmd", description: "first" });
    expect(listCommands({}, "/mycmd")).toHaveLength(1);

    // Re-register same name with different case but same source
    const result = registerCommand({
      name: "/MYCMD",
      description: "second",
      source: "builtin",
    });

    expect(result).toBe(true); // Should succeed (same source)
    expect(getCommand("/mycmd").description).toBe("second"); // Updated
    expect(getCommand("/MYCMD").description).toBe("second"); // Case-insensitive
    const allMatches = listCommands({}, "/mycmd");
    expect(allMatches).toHaveLength(1); // Exactly one entry, not two
    expect(allMatches[0].name).toBe("/MYCMD"); // Stored under new casing
  });

  test("higher-priority case-variant replaces lower-priority and deletes old key", () => {
    const warnSpy = jest.spyOn(console, "warn");
    const { registerCommand, getCommand, listCommands } =
      loadCommandRegistryModule();

    // Register plugin version
    registerCommand({ name: "/cmd", description: "plugin", source: "plugin:p" });
    expect(getCommand("/cmd").source).toBe("plugin:p");

    // Clear previous spy calls from module load
    warnSpy.mockClear();

    // Higher-priority builtin replaces with different case
    const result = registerCommand({
      name: "/CMD",
      description: "builtin",
      source: "builtin",
    });

    expect(result).toBe(true);
    expect(getCommand("/cmd").description).toBe("builtin");
    expect(getCommand("/CMD").description).toBe("builtin");
    const allMatches = listCommands({}, "/cmd");
    expect(allMatches).toHaveLength(1); // Single entry
    expect(allMatches[0].name).toBe("/CMD"); // Stored under new casing

    // Verify override warning was logged (check the last argument which is the message)
    expect(warnSpy).toHaveBeenCalled();
    const lastCall = warnSpy.mock.calls[warnSpy.mock.calls.length - 1];
    const message = lastCall[lastCall.length - 1]; // Last arg is the message
    expect(message).toContain("/CMD");
    expect(message).toContain("builtin");

    warnSpy.mockRestore();
  });
});

describe("expandsTo & expandCommands", () => {
  test("expanding token: body template prepended, user text follows", () => {
    const { registerCommand, expandCommands } = loadCommandRegistryModule();
    registerCommand({
      name: "/plan",
      description: "plan first",
      expandsTo: "Draft a plan first and wait for confirmation.",
    });
    const { commands, body } = expandCommands("/plan build a todo app", {});
    expect(commands).toEqual([{ name: "/plan", channel: "" }]);
    expect(body).toBe(
      "Draft a plan first and wait for confirmation.\n\nbuild a todo app",
    );
  });

  test("non-expanding commands strip exactly like extractCommands", () => {
    const { expandCommands } = loadCommandRegistryModule();
    const { commands, body } = expandCommands("/fyi tests are green", {
      isStreaming: true,
    });
    expect(commands).toEqual([{ name: "/fyi", channel: "fyi" }]);
    expect(body).toBe("tests are green");
  });

  test("template-only message yields just the template", () => {
    const { registerCommand, expandCommands } = loadCommandRegistryModule();
    registerCommand({ name: "/p", description: "p", expandsTo: "PLAN." });
    expect(expandCommands("/p", {})).toEqual({
      commands: [{ name: "/p", channel: "" }],
      body: "PLAN.",
    });
  });

  test("no tokens: passthrough", () => {
    const { expandCommands } = loadCommandRegistryModule();
    expect(expandCommands("plain text", {})).toEqual({
      commands: [],
      body: "plain text",
    });
  });
});
