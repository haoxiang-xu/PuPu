/* Mock the cross-domain computer_use import so the registry unit test never
   pulls the (heavy, bridge-touching) ComputerUseSettings stack — resolution is
   the only thing under test here. */
jest.mock("../settings/computer_use", () => ({
  __esModule: true,
  ComputerUseSettings: function ComputerUseSettingsStub() {
    return null;
  },
}));

const {
  getPluginSettingsEntry,
  PLUGIN_SETTINGS_REGISTRY,
  BUILTIN_COMPUTER_TOOLKIT_ID,
} = require("./plugin_settings_registry");
const { ComputerUseSettings } = require("../settings/computer_use");

describe("plugin_settings_registry", () => {
  test("the builtin Computer id is the canonical synthetic id", () => {
    expect(BUILTIN_COMPUTER_TOOLKIT_ID).toBe("builtin.computer");
  });

  test("resolves builtin.computer to ComputerUseSettings with its label + icon", () => {
    const entry = getPluginSettingsEntry("builtin.computer");
    expect(entry).not.toBeNull();
    expect(entry.Component).toBe(ComputerUseSettings);
    expect(entry.labelKey).toBe("toolkit.builtin_computer_name");
    expect(entry.icon).toBe("mouse");
  });

  test("registers exactly one entry (Computer is the only S1 surface)", () => {
    expect(Object.keys(PLUGIN_SETTINGS_REGISTRY)).toEqual(["builtin.computer"]);
  });

  /* Exact-id match only — deliberately no source/prefix fallback (a future
     decision, not built in S1). */
  test.each([
    ["unknown id", "builtin.unknown"],
    ["a store-style id", "mcp.productivity.notion"],
    ["a source prefix", "builtin"],
    ["empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["a number", 123],
  ])("returns null for %s", (_label, id) => {
    expect(getPluginSettingsEntry(id)).toBeNull();
  });
});
