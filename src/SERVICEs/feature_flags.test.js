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

  test("reads the agent modal flag as disabled by default in development", () => {
    const { readFeatureFlags, isFeatureFlagEnabled } = loadFeatureFlagsModule();

    expect(readFeatureFlags()).toEqual({
      enable_user_access_to_agent_modal: false,
      enable_app_update_settings: true,
    });
    expect(isFeatureFlagEnabled("enable_user_access_to_agent_modal")).toBe(
      false,
    );
    expect(isFeatureFlagEnabled("enable_app_update_settings")).toBe(true);
  });

  test("uses build feature flags as a production gate", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        feature_flags: {
          enable_user_access_to_agent_modal: false,
        },
      }),
    );

    const { readFeatureFlags } = loadFeatureFlagsModule({
      nodeEnv: "production",
      buildFeatureFlagsEnv: JSON.stringify({
        enable_user_access_to_agent_modal: true,
        enable_app_update_settings: false,
      }),
    });

    expect(readFeatureFlags()).toEqual({
      enable_user_access_to_agent_modal: true,
      enable_app_update_settings: false,
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
        enable_user_access_to_agent_modal: true,
        enable_app_update_settings: false,
      }),
    ).toEqual({
      enable_user_access_to_agent_modal: true,
      enable_app_update_settings: false,
    });

    expect(JSON.parse(window.localStorage.getItem("settings") || "{}")).toEqual({
      appearance: {
        theme: "dark_mode",
      },
      feature_flags: {
        enable_user_access_to_agent_modal: true,
        enable_app_update_settings: false,
      },
    });
  });

  test("notifies subscribers when feature flags change", () => {
    const { subscribeFeatureFlags, writeFeatureFlags } = loadFeatureFlagsModule();
    const listener = jest.fn();
    const unsubscribe = subscribeFeatureFlags(listener);

    writeFeatureFlags({
      enable_user_access_to_agent_modal: true,
      enable_app_update_settings: false,
    });

    expect(listener).toHaveBeenCalledWith({
      enable_user_access_to_agent_modal: true,
      enable_app_update_settings: false,
    });

    unsubscribe();

    writeFeatureFlags({
      enable_user_access_to_agent_modal: false,
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
