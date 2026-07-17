import {
  isComputerToolConfirmation,
  isToolConfirmationCacheable,
  shouldCacheToolConfirmationDecision,
} from "./tool_confirmation_cache_policy";

describe("tool confirmation cache policy", () => {
  test("computer confirmations are never cacheable", () => {
    expect(
      isComputerToolConfirmation("builtin.computer", "computer"),
    ).toBe(true);
    expect(isToolConfirmationCacheable("builtin.computer", "computer")).toBe(
      false,
    );
    expect(
      shouldCacheToolConfirmationDecision({
        approved: true,
        scope: "session",
        toolkitId: "builtin.computer",
        toolName: "computer",
      }),
    ).toBe(false);
  });

  test("legacy computer frames without toolkit identity also fail closed", () => {
    expect(isComputerToolConfirmation("", "computer")).toBe(true);
    expect(isToolConfirmationCacheable("", "computer")).toBe(false);
    expect(isToolConfirmationCacheable("mcp.remote.desktop", "computer")).toBe(
      true,
    );
  });

  test("future tools in the built-in computer toolkit remain non-cacheable", () => {
    expect(isToolConfirmationCacheable("builtin.computer", "drag")).toBe(false);
  });

  test("ordinary confirmations keep the existing session-cache behavior", () => {
    expect(isToolConfirmationCacheable("core", "delete_file")).toBe(true);
    expect(
      shouldCacheToolConfirmationDecision({
        approved: true,
        scope: "session",
        toolkitId: "core",
        toolName: "delete_file",
      }),
    ).toBe(true);
    expect(
      shouldCacheToolConfirmationDecision({
        approved: true,
        scope: "once",
        toolkitId: "core",
        toolName: "delete_file",
      }),
    ).toBe(false);
  });
});
