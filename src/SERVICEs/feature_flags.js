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
    defaultValue: true,
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

// Sparse persistence format (see writeFeatureFlags below): the storage
// namespace only ever holds the keys a user has explicitly toggled, wrapped
// in a versioned envelope so unversioned (pre-sparse) full snapshots can be
// told apart and discarded on read. "format"/"flags" cannot collide with any
// FEATURE_FLAG_DEFINITIONS key (all of which are "enable_*").
const FEATURE_FLAGS_FORMAT_VERSION = 2;

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

// Reads the persisted namespace and returns only the keys a user has
// explicitly chosen (true or false), dropping anything else — including a
// whole unversioned legacy snapshot, which is indistinguishable from a
// user's real choices and is therefore discarded wholesale rather than
// migrated key-by-key.
const readStoredSparseFlags = () => {
  const raw = readNamespace(FEATURE_FLAGS_NAMESPACE, undefined);
  const isSparseRecord =
    isObject(raw) &&
    raw.format === FEATURE_FLAGS_FORMAT_VERSION &&
    isObject(raw.flags);
  if (!isSparseRecord) {
    return {};
  }

  const sparse = {};
  Object.keys(FEATURE_FLAG_DEFINITIONS).forEach((key) => {
    if (raw.flags[key] === true || raw.flags[key] === false) {
      sparse[key] = raw.flags[key];
    }
  });
  return sparse;
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

  return normalizeFeatureFlags(readStoredSparseFlags(), buildDefaults);
};

export const isFeatureFlagEnabled = (key) => {
  if (!Object.prototype.hasOwnProperty.call(FEATURE_FLAG_DEFINITIONS, key)) {
    return false;
  }

  return readFeatureFlags()[key] === true;
};

export const writeFeatureFlags = (patch = {}) => {
  // Production ignores storage on read (see readFeatureFlags above), so the
  // merge base there is the empty set — unset keys resolve straight from
  // build defaults, exactly like the pre-sparse implementation, whose
  // "current" was already `readFeatureFlags()` (buildDefaults only) in that
  // runtime. Development merges on top of whatever is already stored.
  const baseSparse = isProductionBuildRuntime ? {} : readStoredSparseFlags();
  const nextSparse = { ...baseSparse };

  Object.keys(FEATURE_FLAG_DEFINITIONS).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      nextSparse[key] = patch[key] === true;
    }
  });

  // Persist failures stay silent: keep in-memory updates available to
  // current subscribers (mirrors the previous try/catch localStorage write).
  replaceNamespace(FEATURE_FLAGS_NAMESPACE, {
    format: FEATURE_FLAGS_FORMAT_VERSION,
    flags: nextSparse,
  }).catch(() => {});

  const buildDefaults = normalizeFeatureFlags(buildFeatureFlagDefaults);
  const resolved = normalizeFeatureFlags(nextSparse, buildDefaults);
  emitFeatureFlagsChange(resolved);
  return resolved;
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
