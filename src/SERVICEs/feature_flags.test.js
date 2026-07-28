const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_BUILD_FEATURE_FLAGS = process.env.REACT_APP_BUILD_FEATURE_FLAGS;

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
      enable_app_update_settings: true,
      enable_theme_color_customization: false,
      enable_custom_model_providers: false,
      enable_computer_use: false,
    });
    expect(isFeatureFlagEnabled("enable_user_access_to_agents")).toBe(false);
    expect(isFeatureFlagEnabled("enable_user_access_to_characters")).toBe(false);
    expect(isFeatureFlagEnabled("enable_app_update_settings")).toBe(true);
    expect(isFeatureFlagEnabled("enable_theme_color_customization")).toBe(false);
    expect(isFeatureFlagEnabled("enable_custom_model_providers")).toBe(false);
    expect(isFeatureFlagEnabled("enable_computer_use")).toBe(false);
  });

  test("uses build feature flags as a production gate", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        feature_flags: {
          enable_user_access_to_agents: false,
          enable_user_access_to_characters: false,
        },
      }),
    );

    const { readFeatureFlags } = loadFeatureFlagsModule({
      nodeEnv: "production",
      buildFeatureFlagsEnv: JSON.stringify({
        enable_user_access_to_agents: true,
        enable_user_access_to_characters: true,
        enable_app_update_settings: false,
        enable_theme_color_customization: true,
        enable_custom_model_providers: true,
        enable_computer_use: true,
      }),
    });

    expect(readFeatureFlags()).toEqual({
      enable_user_access_to_agents: true,
      enable_user_access_to_characters: true,
      enable_app_update_settings: false,
      enable_theme_color_customization: true,
      enable_custom_model_providers: true,
      enable_computer_use: true,
    });
  });

  test("persists feature flag updates under settings.feature_flags", () => {
    const { writeFeatureFlags } = loadFeatureFlagsModule();

    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        appearance: {
          theme: "dark_mode",
        },
      }),
    );

    expect(
      writeFeatureFlags({
        enable_user_access_to_agents: true,
        enable_user_access_to_characters: true,
        enable_app_update_settings: false,
        enable_theme_color_customization: true,
        enable_custom_model_providers: true,
        enable_computer_use: true,
      }),
    ).toEqual({
      enable_user_access_to_agents: true,
      enable_user_access_to_characters: true,
      enable_app_update_settings: false,
      enable_theme_color_customization: true,
      enable_custom_model_providers: true,
      enable_computer_use: true,
    });

    expect(JSON.parse(window.localStorage.getItem("settings") || "{}")).toEqual({
      appearance: {
        theme: "dark_mode",
      },
      feature_flags: {
        enable_user_access_to_agents: true,
        enable_user_access_to_characters: true,
        enable_app_update_settings: false,
        enable_theme_color_customization: true,
        enable_custom_model_providers: true,
        enable_computer_use: true,
      },
    });
  });

  test("falls back to defaults when the settings JSON is corrupted", () => {
    const { readFeatureFlags, writeFeatureFlags } = loadFeatureFlagsModule();

    window.localStorage.setItem("settings", "{not valid json");

    expect(readFeatureFlags()).toEqual({
      enable_user_access_to_agents: false,
      enable_user_access_to_characters: false,
      enable_app_update_settings: true,
      enable_theme_color_customization: false,
      enable_custom_model_providers: false,
      enable_computer_use: false,
    });

    writeFeatureFlags({ enable_user_access_to_agents: true });

    expect(JSON.parse(window.localStorage.getItem("settings") || "{}")).toEqual({
      feature_flags: {
        enable_user_access_to_agents: true,
        enable_user_access_to_characters: false,
        enable_app_update_settings: true,
        enable_theme_color_customization: false,
        enable_custom_model_providers: false,
        enable_computer_use: false,
      },
    });
  });

  test("ignores flag keys outside the definitions on write", () => {
    const { writeFeatureFlags, readFeatureFlags } = loadFeatureFlagsModule();

    writeFeatureFlags({ totally_unknown_flag: true });

    expect(readFeatureFlags().totally_unknown_flag).toBeUndefined();
    const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
    expect(root.feature_flags.totally_unknown_flag).toBeUndefined();
  });

  test("notifies subscribers when feature flags change", () => {
    const { subscribeFeatureFlags, writeFeatureFlags } = loadFeatureFlagsModule();
    const listener = jest.fn();
    const unsubscribe = subscribeFeatureFlags(listener);

    writeFeatureFlags({
      enable_user_access_to_agents: true,
      enable_user_access_to_characters: true,
      enable_app_update_settings: false,
      enable_theme_color_customization: true,
      enable_custom_model_providers: true,
      enable_computer_use: true,
    });

    expect(listener).toHaveBeenCalledWith({
      enable_user_access_to_agents: true,
      enable_user_access_to_characters: true,
      enable_app_update_settings: false,
      enable_theme_color_customization: true,
      enable_custom_model_providers: true,
      enable_computer_use: true,
    });

    unsubscribe();

    writeFeatureFlags({
      enable_user_access_to_agents: false,
      enable_user_access_to_characters: false,
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
