/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  platform_presentation                                                         */
/*                                                                                */
/*  Which operating system the UI presents itself as (#256). Normally the host   */
/*  preload reports (`window.osInfo.platform`); in a development Electron build  */
/*  the developer may override it from Settings → Developer so the macOS /       */
/*  Windows / Linux chrome can be inspected on one machine. The override is a    */
/*  key of the `dev` settings namespace and is read ONLY when                     */
/*  `process.env.NODE_ENV !== "production"` — a production bundle compiles that  */
/*  check to a constant, so no persisted record can ever change a shipped build. */
/*  Every platform-conditional surface reads the presentation through this file  */
/*  (or the `usePresentationPlatform` hook), never `window.osInfo` directly.      */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

import {
  readNamespace,
  replaceNamespace,
  subscribeSettings,
} from "./settings_repository";

const DEV_NAMESPACE = "dev";
const OVERRIDE_KEY = "platform_override";

export const HOST_PLATFORMS = Object.freeze(["darwin", "win32", "linux"]);
const KNOWN = new Set(HOST_PLATFORMS);

const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

/** What the host really is: preload's report, else "web". */
export const getHostPlatform = () => {
  if (typeof window === "undefined") return "web";
  if (window.osInfo && typeof window.osInfo.platform === "string") {
    return window.osInfo.platform;
  }
  if (window.runtime && typeof window.runtime.platform === "string") {
    return window.runtime.platform;
  }
  return "web";
};

/** Development Electron only. Production follows the real platform, always. */
export const isPlatformOverrideAllowed = () => {
  if (process.env.NODE_ENV === "production") return false;
  if (typeof window === "undefined") return false;
  return window.runtime?.isElectron === true;
};

/** The persisted override, or null when absent or not a known platform. */
export const readPlatformOverride = () => {
  const dev = readNamespace(DEV_NAMESPACE, {});
  const value = isObject(dev) ? dev[OVERRIDE_KEY] : undefined;
  return KNOWN.has(value) ? value : null;
};

/**
 * Persist an override (`darwin | win32 | linux`) or clear it with null /
 * anything unknown. The rest of the dev namespace is kept as is.
 */
export const writePlatformOverride = (platform) => {
  const dev = readNamespace(DEV_NAMESPACE, {});
  const next = { ...(isObject(dev) ? dev : {}) };
  if (KNOWN.has(platform)) next[OVERRIDE_KEY] = platform;
  else delete next[OVERRIDE_KEY];
  const persistence = replaceNamespace(DEV_NAMESPACE, next);
  if (persistence && typeof persistence.catch === "function") {
    persistence.catch(() => {});
  }
  return KNOWN.has(platform) ? platform : null;
};

/** The platform the UI presents: the override when allowed, else the host. */
export const getPresentationPlatform = () => {
  if (isPlatformOverrideAllowed()) {
    const override = readPlatformOverride();
    if (override) return override;
  }
  return getHostPlatform();
};

/**
 * What main should be told (BC-256): the override while it is allowed, else
 * null so the native chrome follows the host.
 */
export const readAppliedPlatformOverride = () =>
  isPlatformOverrideAllowed() ? readPlatformOverride() : null;

/** Listener receives the presentation after each write of the dev namespace. */
export const subscribePresentationPlatform = (listener) => {
  if (typeof listener !== "function") return () => {};
  return subscribeSettings(({ namespace }) => {
    if (namespace !== DEV_NAMESPACE) return;
    listener(getPresentationPlatform());
  });
};
