import {
  COMPUTER_TOOLKIT_ID,
  buildComputerToolkitOption,
  isComputerModelSupported,
  stripModelProviderPrefix,
} from "./computer_use_toolkit_option";

describe("stripModelProviderPrefix", () => {
  test("removes the provider prefix up to the first colon", () => {
    expect(stripModelProviderPrefix("anthropic:claude-opus-4-8")).toBe(
      "claude-opus-4-8",
    );
  });

  test("strips only the first colon segment for custom providers", () => {
    expect(stripModelProviderPrefix("custom.acme:claude-3")).toBe("claude-3");
  });

  test("returns a bare id (no colon) unchanged", () => {
    expect(stripModelProviderPrefix("claude-opus-4-8")).toBe("claude-opus-4-8");
  });

  test("handles non-string / empty input", () => {
    expect(stripModelProviderPrefix(undefined)).toBe("");
    expect(stripModelProviderPrefix(null)).toBe("");
    expect(stripModelProviderPrefix("   ")).toBe("");
  });
});

describe("isComputerModelSupported", () => {
  test("matches when the stripped id starts with a supported prefix", () => {
    expect(
      isComputerModelSupported("anthropic:claude-opus-4-8", ["claude-opus"]),
    ).toBe(true);
  });

  test("does not match a different family", () => {
    expect(
      isComputerModelSupported("openai:gpt-5", ["claude-opus", "claude-sonnet"]),
    ).toBe(false);
  });

  test("treats a missing / empty prefix list as unsupported", () => {
    expect(isComputerModelSupported("anthropic:claude-opus-4-8", [])).toBe(
      false,
    );
    expect(
      isComputerModelSupported("anthropic:claude-opus-4-8", undefined),
    ).toBe(false);
  });

  test("ignores empty / non-string prefixes", () => {
    expect(
      isComputerModelSupported("anthropic:claude-opus-4-8", ["", null, "claude"]),
    ).toBe(true);
    expect(isComputerModelSupported("anthropic:claude-opus-4-8", ["", null])).toBe(
      false,
    );
  });
});

describe("buildComputerToolkitOption", () => {
  const t = (key) => key;

  test("uses the canonical builtin.computer id and is enabled when supported", () => {
    const option = buildComputerToolkitOption({ t, isDark: false, supported: true });
    expect(option.value).toBe(COMPUTER_TOOLKIT_ID);
    expect(option.value).toBe("builtin.computer");
    expect(option.disabled).toBe(false);
    expect(option.label).toBe("chat.attach.computer");
    expect(option.description).toBe("chat.attach.computer_description");
    expect(option.icon).toBeTruthy();
  });

  test("is disabled with the requires-model hint when unsupported", () => {
    const option = buildComputerToolkitOption({ t, isDark: true, supported: false });
    expect(option.disabled).toBe(true);
    expect(option.description).toBe(
      "chat.attach.computer_requires_supported_model",
    );
  });

  test("carries a search string that includes the id", () => {
    const option = buildComputerToolkitOption({ t, isDark: false, supported: true });
    expect(option.search).toContain("builtin.computer");
  });
});
