import { readNamespace, replaceNamespace } from "./settings_repository";

const FEATURE_FLAGS_NAMESPACE = "feature_flags";
const buildFeatureFlagsEnv = process.env.REACT_APP_BUILD_FEATURE_FLAGS;
const isProductionBuildRuntime = process.env.NODE_ENV === "production";

const readBuildFeatureFlagDefaults = () => {
  if (typeof buildFeatureFlagsEnv !== "string" || !buildFeatureFlagsEnv.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(buildFeatureFlagsEnv);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (_error) {
    return {};
  }
};

export const FEATURE_FLAG_DEFINITIONS = {
  enable_user_access_to_agents: {
    description:
      "Show the Agents tab inside the Agents modal. The side-menu entry is visible whenever this or enable_user_access_to_characters is enabled.",
    defaultValue: false,
  },
  enable_user_access_to_characters: {
    description:
      "Show the Characters tab inside the Agents modal. The side-menu entry is visible whenever this or enable_user_access_to_agents is enabled.",
    defaultValue: false,
  },
  enable_app_update_settings: {
    description:
      "Show the Update page in Settings and allow access to in-app update controls.",
    defaultValue: true,
  },
  enable_theme_color_customization: {
    description:
      "Show Theme colors in Appearance and apply saved semantic color presets/customizations.",
    defaultValue: false,
  },
  enable_custom_model_providers: {
    description:
      "Show Custom Model Providers in Settings and allow custom models in catalogs, selectors, connection tests, and chat requests.",
    defaultValue: false,
  },
  enable_computer_use: {
    description:
      "Ship the Computer toolkit and allow its separate consented user toggle to take effect. Requires an app restart after changing this build flag.",
    defaultValue: false,
  },
  enable_memory_v2: {
    description:
      "Enable Memory V2 admission and its optional Unchain module. This does not add an Agent Builder node.",
    defaultValue: false,
  },
};

const listeners = new Set();
const buildFeatureFlagDefaults = readBuildFeatureFlagDefaults();

const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const resolveFlagDefaultValue = (key, definition, fallbackFlags = {}) =>
  fallbackFlags[key] === true ||
  (fallbackFlags[key] !== false && definition.defaultValue === true);

const normalizeFeatureFlags = (value, fallbackFlags = {}) => {
  const source = isObject(value) ? value : {};
  const next = {};

  Object.entries(FEATURE_FLAG_DEFINITIONS).forEach(([key, definition]) => {
    next[key] =
      source[key] === true ||
      (source[key] !== false &&
        resolveFlagDefaultValue(key, definition, fallbackFlags));
  });

  return next;
};

const emitFeatureFlagsChange = (featureFlags) => {
  listeners.forEach((listener) => {
    try {
      listener(featureFlags);
    } catch (_error) {
      // no-op: listeners should not block emitter
    }
  });
};

export const readFeatureFlags = () => {
  const buildDefaults = normalizeFeatureFlags(buildFeatureFlagDefaults);
  if (isProductionBuildRuntime) {
    return buildDefaults;
  }

  return normalizeFeatureFlags(
    readNamespace(FEATURE_FLAGS_NAMESPACE, {}),
    buildDefaults,
  );
};

export const isFeatureFlagEnabled = (key) => {
  if (!Object.prototype.hasOwnProperty.call(FEATURE_FLAG_DEFINITIONS, key)) {
    return false;
  }

  return readFeatureFlags()[key] === true;
};

export const writeFeatureFlags = (patch = {}) => {
  const current = readFeatureFlags();
  const next = { ...current };

  Object.keys(FEATURE_FLAG_DEFINITIONS).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      next[key] = patch[key] === true;
    }
  });

  // Persist failures stay silent: keep in-memory updates available to
  // current subscribers (mirrors the previous try/catch localStorage write).
  replaceNamespace(FEATURE_FLAGS_NAMESPACE, next).catch(() => {});

  emitFeatureFlagsChange(next);
  return next;
};

export const subscribeFeatureFlags = (listener) => {
  if (typeof listener !== "function") {
    return () => {};
  }

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
