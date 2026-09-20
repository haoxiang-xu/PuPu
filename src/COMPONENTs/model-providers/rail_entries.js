/**
 * rail_entries.js — the list the Model Providers rail renders (#204).
 *
 * One pure builder, so the rail never decides for itself which providers
 * exist. The order is the order the Settings page used to render its
 * sections: native → shipped (from the registry) → Ollama → user-authored
 * custom providers (only while `enable_custom_model_providers` is on) →
 * the "Add provider" entry.
 *
 * `configured` is the B1 status dot:
 *   native / shipped — a credential exists (`providerSecretConfigured`).
 *   ollama           — the service answered (`ollamaReady`, passed in because
 *                      the status is async and owned by the pane's hook).
 *   custom           — enabled AND (auth mode none OR a stored secret).
 *   add_custom       — null: it is an action, not a provider.
 *
 * Adding a shipped provider is a registry entry + preset + icon (#202 AC-08):
 * this file has no per-provider branch, which `rail_entries.test.js` asserts
 * with a registry fixture.
 */

import { NATIVE_PROVIDERS } from "../settings/model_providers/native_providers";
import { SHIPPED_PROVIDERS } from "../../SERVICEs/shipped_provider_registry";
import {
  customProviderKey,
  hasCustomProviderSecret,
  readCustomProviders,
} from "../../SERVICEs/custom_provider_store";
import { providerSecretConfigured } from "../../SERVICEs/provider_secret_status";
import { isFeatureFlagEnabled } from "../../SERVICEs/feature_flags";
import { CUSTOM_MODEL_GROUP_ICON } from "../chat-input/constants";

export const RAIL_KIND = Object.freeze({
  NATIVE: "native",
  SHIPPED: "shipped",
  OLLAMA: "ollama",
  CUSTOM: "custom",
  ADD_CUSTOM: "add_custom",
});

export const OLLAMA_RAIL_ID = "ollama";
export const ADD_CUSTOM_RAIL_ID = "custom:add";

/** Rail id of a user-authored provider — namespaced so it can never collide
 *  with a native id or the Ollama entry. */
export const customRailId = (slug) => `custom:${slug}`;

const isShippedConfigured = (provider) =>
  provider.sites.some((site) =>
    providerSecretConfigured(customProviderKey(site.slug)),
  );

const isCustomConfigured = (def) => {
  if (def.enabled !== true) {
    return false;
  }
  const authMode = def.auth?.mode || "none";
  if (authMode === "none") {
    return true;
  }
  return hasCustomProviderSecret(def.id);
};

/**
 * @param {object} [options]
 * @param {boolean} [options.ollamaReady] — the Ollama service answered.
 * @param {boolean} [options.customEnabled] — override for the feature flag
 *        (defaults to reading `enable_custom_model_providers`).
 * @param {Array} [options.shippedProviders] — registry override for tests.
 * @param {Array} [options.nativeProviders] — native list override for tests.
 * @returns {Array<{id:string, kind:string, title:string, icon:string, configured:boolean|null, provider:object|null}>}
 */
export const buildProviderRailEntries = ({
  ollamaReady = false,
  customEnabled,
  shippedProviders = SHIPPED_PROVIDERS,
  nativeProviders = NATIVE_PROVIDERS,
} = {}) => {
  const entries = [];

  for (const provider of nativeProviders) {
    entries.push({
      id: provider.id,
      kind: RAIL_KIND.NATIVE,
      title: provider.title,
      icon: provider.icon,
      configured: provider.credential_id
        ? providerSecretConfigured(provider.credential_id)
        : false,
      provider,
    });
  }

  for (const provider of shippedProviders) {
    entries.push({
      id: provider.id,
      kind: RAIL_KIND.SHIPPED,
      title: provider.title,
      icon: provider.icon,
      configured: isShippedConfigured(provider),
      provider,
    });
  }

  entries.push({
    id: OLLAMA_RAIL_ID,
    kind: RAIL_KIND.OLLAMA,
    title: "Ollama",
    icon: "ollama",
    configured: ollamaReady === true,
    provider: null,
  });

  const customOn =
    typeof customEnabled === "boolean"
      ? customEnabled
      : isFeatureFlagEnabled("enable_custom_model_providers");
  if (customOn) {
    let defs = [];
    try {
      defs = readCustomProviders();
    } catch (_error) {
      defs = [];
    }
    for (const def of Array.isArray(defs) ? defs : []) {
      if (!def || typeof def.id !== "string" || !def.id) {
        continue;
      }
      entries.push({
        id: customRailId(def.id),
        kind: RAIL_KIND.CUSTOM,
        title:
          typeof def.display_name === "string" && def.display_name
            ? def.display_name
            : def.id,
        icon: CUSTOM_MODEL_GROUP_ICON,
        configured: isCustomConfigured(def),
        provider: def,
      });
    }
    entries.push({
      id: ADD_CUSTOM_RAIL_ID,
      kind: RAIL_KIND.ADD_CUSTOM,
      title: "",
      icon: "add",
      configured: null,
      provider: null,
    });
  }

  return entries;
};

/** True when at least one real provider is usable — the G3 welcome pane
 *  shows only while this is false. */
export const hasConfiguredProvider = (entries) =>
  entries.some((entry) => entry.configured === true);

/** The entry the modal opens on: the first configured provider, else the
 *  first entry. */
export const defaultRailSelection = (entries) => {
  const configured = entries.find((entry) => entry.configured === true);
  return (configured || entries[0] || null)?.id ?? null;
};

export default buildProviderRailEntries;
