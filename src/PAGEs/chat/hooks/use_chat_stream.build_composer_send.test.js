/**
 * buildComposerSend — focused unit tests (ticket #291 slice P5 / P-D5).
 *
 * `buildComposerSend` is exported (see use_chat_stream.js, the builder just
 * above the "Send-time custom-provider" section) purely so this contract can
 * be tested directly: the user's accepted composer text is sent and stored
 * VERBATIM — no trim, no command stripping, no template prefix. The Unchain
 * runtime now resolves `/name` tokens itself and never has the renderer
 * rewrite the user's message. `extractCommands` is still used internally,
 * but ONLY to compute `commands`/`extraToolkits` for routing and per-run
 * pack selection — never to alter `outgoingText`.
 *
 * See docs/implementation/ticket-291.md (decision P-D5) for the contract
 * this locks.
 */
import { buildComposerSend } from "./use_chat_stream";
import {
  registerCommand,
  unregisterBySource,
} from "../../../SERVICEs/command_registry";

const PLUGIN_SOURCE = "plugin:builderkit";
const TOOLKIT_ID = "builderkit";

describe("buildComposerSend", () => {
  afterEach(() => {
    unregisterBySource(PLUGIN_SOURCE);
  });

  test("outgoingText === rawText verbatim — leading/trailing whitespace kept, no stripping", () => {
    registerCommand({
      name: "/plan",
      description: "plan",
      source: PLUGIN_SOURCE,
      sourceToolkitId: TOOLKIT_ID,
      availability: () => true,
    });
    const rawText = "  /plan build the login flow  ";
    const { outgoingText } = buildComposerSend(rawText, []);
    expect(outgoingText).toBe(rawText);
  });

  test("keeps an inline /name token verbatim (mid-string, not just a leading token)", () => {
    registerCommand({
      name: "/inline",
      description: "inline",
      source: PLUGIN_SOURCE,
      sourceToolkitId: TOOLKIT_ID,
      availability: () => true,
    });
    const rawText = "please run /inline right here, thanks";
    const { outgoingText, composer } = buildComposerSend(rawText, []);
    expect(outgoingText).toBe(rawText);
    expect(composer.commands).toEqual([
      { name: "/inline", sourceToolkitId: TOOLKIT_ID },
    ]);
    expect(composer.rawText).toBe(rawText);
  });

  test("plain text with no command tokens passes through untouched, composer null", () => {
    const rawText = "  just a plain message with no commands  ";
    const { outgoingText, extraToolkits, composer } = buildComposerSend(
      rawText,
      [],
    );
    expect(outgoingText).toBe(rawText);
    expect(extraToolkits).toEqual([]);
    expect(composer).toBeNull();
  });

  test("computes extraToolkits from registered sourceToolkitIds, deduplicated", () => {
    registerCommand({
      name: "/a",
      description: "a",
      source: PLUGIN_SOURCE,
      sourceToolkitId: TOOLKIT_ID,
      availability: () => true,
    });
    registerCommand({
      name: "/b",
      description: "b",
      source: PLUGIN_SOURCE,
      sourceToolkitId: TOOLKIT_ID,
      availability: () => true,
    });
    const { extraToolkits } = buildComposerSend("/a /b do it", []);
    expect(extraToolkits).toEqual([TOOLKIT_ID]);
  });

  test("a command with no sourceToolkitId contributes nothing to extraToolkits", () => {
    registerCommand({
      name: "/builtinish",
      description: "no toolkit",
      source: PLUGIN_SOURCE,
      availability: () => true,
    });
    const { extraToolkits, composer } = buildComposerSend(
      "/builtinish go",
      [],
    );
    expect(extraToolkits).toEqual([]);
    expect(composer.commands).toEqual([
      { name: "/builtinish", sourceToolkitId: "" },
    ]);
  });

  test("returns a composer with templateLength: 0 when >=1 command token is found (contract §1.4/§2)", () => {
    registerCommand({
      name: "/plan",
      description: "plan",
      source: PLUGIN_SOURCE,
      sourceToolkitId: TOOLKIT_ID,
      availability: () => true,
    });
    const rawText = "/plan build the login flow";
    const { composer } = buildComposerSend(rawText, []);
    expect(composer).toEqual({
      v: 1,
      rawText,
      commands: [{ name: "/plan", sourceToolkitId: TOOLKIT_ID }],
      templateLength: 0,
    });
  });

  test("a zero-template command (no expandsTo) still contributes a composer chip", () => {
    registerCommand({
      name: "/noop",
      description: "no template",
      source: PLUGIN_SOURCE,
      sourceToolkitId: TOOLKIT_ID,
      expandsTo: "",
      availability: () => true,
    });
    const { composer } = buildComposerSend("/noop keep the visible text", []);
    expect(composer).not.toBeNull();
    expect(composer.templateLength).toBe(0);
    expect(composer.commands).toEqual([
      { name: "/noop", sourceToolkitId: TOOLKIT_ID },
    ]);
  });

  test("a registered expandsTo template is never spliced into outgoingText", () => {
    registerCommand({
      name: "/templated",
      description: "has a template",
      source: PLUGIN_SOURCE,
      sourceToolkitId: TOOLKIT_ID,
      expandsTo: "This template must never appear in the sent text.",
      availability: () => true,
    });
    const rawText = "/templated do the thing";
    const { outgoingText, composer } = buildComposerSend(rawText, []);
    expect(outgoingText).toBe(rawText);
    expect(outgoingText).not.toContain("must never appear");
    expect(composer.templateLength).toBe(0);
  });

  test("composer: null and extraToolkits: [] when no command token was found", () => {
    const { composer, extraToolkits, outgoingText } = buildComposerSend(
      "just a plain message",
      [],
    );
    expect(composer).toBeNull();
    expect(extraToolkits).toEqual([]);
    expect(outgoingText).toBe("just a plain message");
  });
});
