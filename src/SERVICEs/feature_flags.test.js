const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_BUILD_FEATURE_FLAGS = process.env.REACT_APP_BUILD_FEATURE_FLAGS;
const fs = require("fs");
const path = require("path");

const loadFeatureFlagsModule = ({
  nodeEnv = "test",
  buildFeatureFlagsEnv,
} = {}) => {
  jest.resetModules();
  process.env.NODE_ENV = nodeEnv;

  if (typeof buildFeatureFlagsEnv === "string") {
    process.env.REACT_APP_BUILD_FEATURE_FLAGS = buildFeatureFlagsEnv;
  } else {
    delete process.env.REACT_APP_BUILD_FEATURE_FLAGS;
  }

  return require("./feature_flags");
};

describe("feature_flags service", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterAll(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (typeof ORIGINAL_BUILD_FEATURE_FLAGS === "string") {
      process.env.REACT_APP_BUILD_FEATURE_FLAGS = ORIGINAL_BUILD_FEATURE_FLAGS;
    } else {
      delete process.env.REACT_APP_BUILD_FEATURE_FLAGS;
    }
  });

  test("reads the agent and character flags as disabled by default in development", () => {
    const { readFeatureFlags, isFeatureFlagEnabled } = loadFeatureFlagsModule();

    expect(readFeatureFlags()).toEqual({
      enable_user_access_to_agents: false,
      enable_user_access_to_characters: false,
      enable_custom_model_providers: false,
      enable_computer_use: false,
      enable_memory_v2: false,
    });
    expect(isFeatureFlagEnabled("enable_user_access_to_agents")).toBe(false);
    expect(isFeatureFlagEnabled("enable_user_access_to_characters")).toBe(false);
    expect(isFeatureFlagEnabled("enable_custom_model_providers")).toBe(false);
    expect(isFeatureFlagEnabled("enable_computer_use")).toBe(false);
  });

  test("uses build feature flags as a production gate", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        feature_flags: {
          format: 2,
          flags: {
            enable_user_access_to_agents: false,
            enable_user_access_to_characters: false,
          },
        },
      }),
    );

    const { readFeatureFlags } = loadFeatureFlagsModule({
      nodeEnv: "production",
      buildFeatureFlagsEnv: JSON.stringify({
        enable_user_access_to_agents: true,
        enable_user_access_to_characters: true,
        enable_custom_model_providers: true,
        enable_computer_use: true,
        enable_memory_v2: true,
      }),
    });

    // Production never reads the storage namespace at all — the stored
    // (even correctly sparse+versioned) overrides above must have zero
    // effect on the resolved flags.
    expect(readFeatureFlags()).toEqual({
      enable_user_access_to_agents: true,
      enable_user_access_to_characters: true,
      enable_custom_model_providers: true,
      enable_computer_use: true,
      enable_memory_v2: true,
    });
  });

  test("an old unversioned full-snapshot namespace is discarded wholesale on read", () => {
    // A legacy false must not override the current build default of true.
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        feature_flags: {
          enable_user_access_to_agents: false,
          enable_user_access_to_characters: false,
          enable_custom_model_providers: false,
          enable_computer_use: false,
          enable_memory_v2: false,
        },
      }),
    );

    const { readFeatureFlags } = loadFeatureFlagsModule({
      buildFeatureFlagsEnv: JSON.stringify({ enable_user_access_to_agents: true }),
    });

    expect(readFeatureFlags()).toEqual({
      enable_user_access_to_agents: true,
      enable_user_access_to_characters: false,
      enable_custom_model_providers: false,
      enable_computer_use: false,
      enable_memory_v2: false,
    });
  });

  test("consumer tests never handcraft the private feature-flag storage envelope", () => {
    const pendingDirectories = [path.resolve(__dirname, "..")];
    const offenders = [];

    while (pendingDirectories.length > 0) {
      const directory = pendingDirectories.pop();
      fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          pendingDirectories.push(entryPath);
          return;
        }
        if (!/\.test\.(?:js|cjs)$/.test(entry.name) || entryPath === __filename) {
          return;
        }
        const source = fs.readFileSync(entryPath, "utf8");
        if (/\bfeature_flags\s*:\s*\{/.test(source)) {
          offenders.push(path.relative(path.resolve(__dirname, ".."), entryPath));
        }
      });
    }

    expect(offenders.sort()).toEqual([]);
  });

  test("writeFeatureFlags persists only the patched key, sparse, under the versioned envelope", () => {
    const { writeFeatureFlags } = loadFeatureFlagsModule();

    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        appearance: {
          theme: "dark_mode",
        },
      }),
    );

    const resolved = writeFeatureFlags({
      enable_user_access_to_agents: true,
    });

    // Public return shape is unchanged: a fully resolved flags object.
    expect(resolved).toEqual({
      enable_user_access_to_agents: true,
      enable_user_access_to_characters: false,
      enable_custom_model_providers: false,
      enable_computer_use: false,
      enable_memory_v2: false,
    });

    // Storage shape: sparse (only the patched key) + format sentinel.
    expect(JSON.parse(window.localStorage.getItem("settings") || "{}")).toEqual({
      appearance: {
        theme: "dark_mode",
      },
      feature_flags: {
        format: 2,
        flags: {
          enable_user_access_to_agents: true,
        },
      },
    });
  });

  test("an explicit false override keeps suppressing a build-enabled flag", () => {
    const { writeFeatureFlags, readFeatureFlags, isFeatureFlagEnabled } =
      loadFeatureFlagsModule({
        buildFeatureFlagsEnv: JSON.stringify({ enable_user_access_to_agents: true }),
      });

    expect(isFeatureFlagEnabled("enable_user_access_to_agents")).toBe(true);
    writeFeatureFlags({ enable_user_access_to_agents: false });

    expect(readFeatureFlags().enable_user_access_to_agents).toBe(false);
    expect(isFeatureFlagEnabled("enable_user_access_to_agents")).toBe(false);
    // Repeated reads must retain the explicit override.
    expect(readFeatureFlags().enable_user_access_to_agents).toBe(false);
  });

  test("two sequential writes of different keys both persist as explicit sparse choices", () => {
    const { writeFeatureFlags, readFeatureFlags } = loadFeatureFlagsModule();

    writeFeatureFlags({ enable_user_access_to_agents: true });
    writeFeatureFlags({ enable_computer_use: true });

    expect(readFeatureFlags()).toEqual({
      enable_user_access_to_agents: true,
      enable_user_access_to_characters: false,
      enable_custom_model_providers: false,
      enable_computer_use: true,
      enable_memory_v2: false,
    });

    expect(JSON.parse(window.localStorage.getItem("settings") || "{}")).toEqual({
      feature_flags: {
        format: 2,
        flags: {
          enable_user_access_to_agents: true,
          enable_computer_use: true,
        },
      },
    });
  });

  test("falls back to defaults when the settings JSON is corrupted", () => {
    const { readFeatureFlags, writeFeatureFlags } = loadFeatureFlagsModule();

    window.localStorage.setItem("settings", "{not valid json");

    expect(readFeatureFlags()).toEqual({
      enable_user_access_to_agents: false,
      enable_user_access_to_characters: false,
      enable_custom_model_providers: false,
      enable_computer_use: false,
      enable_memory_v2: false,
    });

    writeFeatureFlags({ enable_user_access_to_agents: true });

    expect(JSON.parse(window.localStorage.getItem("settings") || "{}")).toEqual({
      feature_flags: {
        format: 2,
        flags: {
          enable_user_access_to_agents: true,
        },
      },
    });
  });

  test("ignores flag keys outside the definitions on write", () => {
    const { writeFeatureFlags, readFeatureFlags } = loadFeatureFlagsModule();

    writeFeatureFlags({ totally_unknown_flag: true });

    expect(readFeatureFlags().totally_unknown_flag).toBeUndefined();
    const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
    expect(root.feature_flags.flags.totally_unknown_flag).toBeUndefined();
  });

  test("notifies subscribers with the fully resolved flags object when feature flags change", () => {
    const { subscribeFeatureFlags, writeFeatureFlags } = loadFeatureFlagsModule();
    const listener = jest.fn();
    const unsubscribe = subscribeFeatureFlags(listener);

    writeFeatureFlags({
      enable_user_access_to_agents: true,
      enable_user_access_to_characters: true,
      enable_custom_model_providers: true,
      enable_computer_use: true,
      enable_memory_v2: true,
    });

    expect(listener).toHaveBeenCalledWith({
      enable_user_access_to_agents: true,
      enable_user_access_to_characters: true,
      enable_custom_model_providers: true,
      enable_computer_use: true,
      enable_memory_v2: true,
    });

    unsubscribe();

    writeFeatureFlags({
      enable_user_access_to_agents: false,
      enable_user_access_to_characters: false,
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
