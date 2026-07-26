// Phase 4 (S3) — provider secret existence + injection-authority signals.
// Drives the REAL bridge (window.settingsStorageAPI bootstrap) and the REAL
// legacy adapter (localStorage["settings"]) so the SQL-OR-legacy four-quadrant
// logic and the secretStorageStatus gate are exercised end to end.
//
// Red line: these helpers must expose existence + authority booleans ONLY and
// never a secret value.

import {
  providerSecretConfigured,
  secretInjectionAuthoritative,
} from "./provider_secret_status";
import { resetSessionBootstrapSnapshotForTests } from "./bridges/settings_storage_bridge";

const SETTINGS_KEY = "settings";

// A bootstrap snapshot exposing the S3 fields. All four REQUIRED_METHODS are
// present so the bridge treats window.settingsStorageAPI as available.
const installBootstrap = ({ secretStorageStatus, configuredCredentials } = {}) => {
  window.settingsStorageAPI = {
    bootstrap: () => ({
      available: true,
      degraded: false,
      namespaces: {},
      revisions: {},
      ...(secretStorageStatus !== undefined ? { secretStorageStatus } : {}),
      ...(configuredCredentials !== undefined ? { configuredCredentials } : {}),
    }),
    migrateLegacy: () => Promise.resolve({ status: "complete" }),
    setNamespace: () => Promise.resolve({ ok: true }),
    deleteNamespace: () => Promise.resolve({ ok: true }),
  };
};

const seedLegacy = (modelProviders) => {
  window.localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ model_providers: modelProviders }),
  );
};

beforeEach(() => {
  window.localStorage.clear();
  resetSessionBootstrapSnapshotForTests();
});

afterEach(() => {
  delete window.settingsStorageAPI;
  window.localStorage.clear();
  resetSessionBootstrapSnapshotForTests();
});

// ---------------------------------------------------------------------------
// providerSecretConfigured — SQL-OR-legacy four quadrants
// ---------------------------------------------------------------------------

describe("providerSecretConfigured", () => {
  test("only SQL configured → true", () => {
    installBootstrap({ configuredCredentials: ["openai"] });
    expect(providerSecretConfigured("openai")).toBe(true);
  });

  test("only legacy configured → true (dual-keep transition window)", () => {
    installBootstrap({ configuredCredentials: [] });
    seedLegacy({ openai_api_key: "sk-legacy-openai" });
    expect(providerSecretConfigured("openai")).toBe(true);
  });

  test("both SQL and legacy configured → true", () => {
    installBootstrap({ configuredCredentials: ["anthropic"] });
    seedLegacy({ anthropic_api_key: "sk-legacy-anthropic" });
    expect(providerSecretConfigured("anthropic")).toBe(true);
  });

  test("neither configured → false", () => {
    installBootstrap({ configuredCredentials: [] });
    seedLegacy({});
    expect(providerSecretConfigured("openai")).toBe(false);
    expect(providerSecretConfigured("anthropic")).toBe(false);
  });

  test("empty-string legacy secret does not count as configured", () => {
    installBootstrap({ configuredCredentials: [] });
    seedLegacy({ openai_api_key: "" });
    expect(providerSecretConfigured("openai")).toBe(false);
  });

  test("custom.<slug>: SQL identity path", () => {
    installBootstrap({ configuredCredentials: ["custom.hyperspace"] });
    expect(providerSecretConfigured("custom.hyperspace")).toBe(true);
    expect(providerSecretConfigured("custom.other")).toBe(false);
  });

  test("custom.<slug>: legacy custom_provider_secrets path", () => {
    installBootstrap({ configuredCredentials: [] });
    seedLegacy({ custom_provider_secrets: { hyperspace: "hs-key" } });
    expect(providerSecretConfigured("custom.hyperspace")).toBe(true);
    // A slug present-but-empty is not configured.
    seedLegacy({ custom_provider_secrets: { hyperspace: "" } });
    expect(providerSecretConfigured("custom.hyperspace")).toBe(false);
    // The bare "custom." prefix with no slug is never configured.
    expect(providerSecretConfigured("custom.")).toBe(false);
  });

  test("works with no bridge at all (legacy-only environment)", () => {
    // No window.settingsStorageAPI: SQL list is [] and the legacy read decides.
    seedLegacy({ openai_api_key: "sk-only-legacy" });
    expect(providerSecretConfigured("openai")).toBe(true);
    expect(providerSecretConfigured("anthropic")).toBe(false);
  });

  test("rejects invalid ids", () => {
    installBootstrap({ configuredCredentials: ["openai"] });
    expect(providerSecretConfigured("")).toBe(false);
    expect(providerSecretConfigured(null)).toBe(false);
    expect(providerSecretConfigured(42)).toBe(false);
    expect(providerSecretConfigured(undefined)).toBe(false);
  });

  test("returns a boolean, never the secret value", () => {
    installBootstrap({ configuredCredentials: [] });
    seedLegacy({ openai_api_key: "sk-value-guard" });
    const result = providerSecretConfigured("openai");
    expect(typeof result).toBe("boolean");
    expect(result).toBe(true);
    expect(result).not.toBe("sk-value-guard");
  });
});

// ---------------------------------------------------------------------------
// secretInjectionAuthoritative — gated by secretStorageStatus AND SQL identity
// ---------------------------------------------------------------------------

describe("secretInjectionAuthoritative", () => {
  test("available + SQL-configured → true", () => {
    installBootstrap({
      secretStorageStatus: "available",
      configuredCredentials: ["openai"],
    });
    expect(secretInjectionAuthoritative("openai")).toBe(true);
  });

  test("available but only legacy (not in SQL) → false (legacy is not authoritative)", () => {
    installBootstrap({
      secretStorageStatus: "available",
      configuredCredentials: [],
    });
    seedLegacy({ openai_api_key: "sk-legacy-only" });
    expect(secretInjectionAuthoritative("openai")).toBe(false);
    // ...but it IS still considered configured (legacy path stays usable).
    expect(providerSecretConfigured("openai")).toBe(true);
  });

  test("unavailable secret storage → false even when SQL-configured (degraded fallback)", () => {
    installBootstrap({
      secretStorageStatus: "unavailable",
      configuredCredentials: ["openai"],
    });
    expect(secretInjectionAuthoritative("openai")).toBe(false);
  });

  test("missing secretStorageStatus is fail-closed → false", () => {
    installBootstrap({ configuredCredentials: ["openai"] });
    expect(secretInjectionAuthoritative("openai")).toBe(false);
  });

  test("degraded / missing bridge → false", () => {
    // No bridge installed at all.
    seedLegacy({ openai_api_key: "sk-x" });
    expect(secretInjectionAuthoritative("openai")).toBe(false);
  });

  test("custom.<slug> authority follows the same gate", () => {
    installBootstrap({
      secretStorageStatus: "available",
      configuredCredentials: ["custom.hyperspace"],
    });
    expect(secretInjectionAuthoritative("custom.hyperspace")).toBe(true);
    expect(secretInjectionAuthoritative("custom.absent")).toBe(false);
  });

  test("rejects invalid ids", () => {
    installBootstrap({
      secretStorageStatus: "available",
      configuredCredentials: ["openai"],
    });
    expect(secretInjectionAuthoritative("")).toBe(false);
    expect(secretInjectionAuthoritative(null)).toBe(false);
    expect(secretInjectionAuthoritative(42)).toBe(false);
  });
});
