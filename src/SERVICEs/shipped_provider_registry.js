/**
 * shipped_provider_registry.js — the list of model providers PuPu ships as
 * first-class sections (issue #202).
 *
 * A "shipped" provider is a preset definition that lives in the app bundle and
 * is resolved at runtime. It is NOT a native provider:
 *
 *   - native   (openai / anthropic / gemini / ollama) — its own storage key, its
 *              own catalog entry, its own ModelIO inside unchain.
 *   - shipped  (deepseek / kimi / kimi-cn)            — travels the custom
 *              provider transport: addressed "custom.<slug>:<model>", sent as
 *              options.custom_provider, revalidated by the Flask
 *              parse_custom_provider. What makes it first class is that the
 *              definition comes from the app instead of from user storage, and
 *              that enable_custom_model_providers does not gate it.
 *   - user     (anything the user authored)           — gated by that flag.
 *
 * Adding another shipped provider is a registry entry here, a preset definition
 * in custom_provider_presets.json and an icon in icon_manifest.js. No new
 * component and no new flag branch — `shipped_provider_registry.test.js` asserts
 * the registry/preset pairing so an entry can never ship without its definition.
 *
 * Layering: SERVICEs only. This module must not import from COMPONENTs, and it
 * must not import custom_provider_store — the store imports the registry, never
 * the other way round.
 */

import presetsData from "./custom_provider_presets.json";

/**
 * Normalize the presets file into an array of export envelopes. The file is an
 * array today; a single envelope is still accepted so the format can shrink
 * back without touching callers.
 */
export const readPresetEnvelopes = () => {
  if (Array.isArray(presetsData)) {
    return presetsData.filter((e) => e && e.provider);
  }
  if (presetsData && presetsData.provider) {
    return [presetsData];
  }
  return [];
};

/**
 * The shipped providers, in the order their sections appear in Settings.
 *
 * - `id`          registry id; also the section's identity in tests.
 * - `title`       section title. Brand name, not translated.
 * - `icon`        icon_manifest key.
 * - `placeholder` empty-state placeholder for the key field.
 * - `sites`       one entry per preset slug. A provider with two sites (Kimi)
 *                 renders a Platform select; a single-site provider renders no
 *                 switcher at all. `labelKey` is the human half of the option
 *                 label — the host half is derived from the preset's base_url,
 *                 so a changed endpoint never leaves a stale label behind.
 */
export const SHIPPED_PROVIDERS = Object.freeze([
  Object.freeze({
    id: "deepseek",
    title: "DeepSeek",
    icon: "deepseek",
    placeholder: "sk-...",
    sites: Object.freeze([Object.freeze({ slug: "deepseek" })]),
  }),
  Object.freeze({
    id: "kimi",
    title: "Kimi",
    icon: "kimi",
    placeholder: "sk-...",
    sites: Object.freeze([
      Object.freeze({ slug: "kimi", labelKey: "model_providers.site_global" }),
      Object.freeze({ slug: "kimi-cn", labelKey: "model_providers.site_china" }),
    ]),
  }),
]);

const SHIPPED_SLUGS = Object.freeze(
  SHIPPED_PROVIDERS.reduce((acc, provider) => {
    provider.sites.forEach((site) => acc.push(site.slug));
    return acc;
  }, []),
);

const SHIPPED_SLUG_SET = new Set(SHIPPED_SLUGS);

/** Every preset slug PuPu ships as a first-class section. */
export const listShippedSlugs = () => [...SHIPPED_SLUGS];

/**
 * True when this slug belongs to a shipped provider. The one predicate every
 * flag branch, storage filter and slug-collision check asks.
 */
export const isShippedSlug = (slug) =>
  typeof slug === "string" && SHIPPED_SLUG_SET.has(slug.trim());

/** The registry entry owning this slug, or null. */
export const findShippedProviderBySlug = (slug) => {
  const cleaned = typeof slug === "string" ? slug.trim() : "";
  if (!cleaned) {
    return null;
  }
  return (
    SHIPPED_PROVIDERS.find((provider) =>
      provider.sites.some((site) => site.slug === cleaned),
    ) || null
  );
};

/** The site entry for a slug, or null. */
export const findShippedSite = (slug) => {
  const cleaned = typeof slug === "string" ? slug.trim() : "";
  if (!cleaned) {
    return null;
  }
  const provider = findShippedProviderBySlug(cleaned);
  return provider
    ? provider.sites.find((site) => site.slug === cleaned) || null
    : null;
};

/** The bundled preset envelope for a shipped slug, or null. */
export const readShippedPresetEnvelope = (slug) => {
  const cleaned = typeof slug === "string" ? slug.trim() : "";
  if (!cleaned || !SHIPPED_SLUG_SET.has(cleaned)) {
    return null;
  }
  return (
    readPresetEnvelopes().find((e) => e?.provider?.id === cleaned) || null
  );
};

/**
 * Hostname of a slug's bundled base_url ("api.moonshot.ai"), else the slug.
 * Used for the host half of a Platform option label.
 */
export const shippedSiteHost = (slug) => {
  const cleaned = typeof slug === "string" ? slug.trim() : "";
  const envelope = readShippedPresetEnvelope(cleaned);
  const baseUrl = envelope?.provider?.base_url;
  if (typeof baseUrl === "string" && baseUrl) {
    try {
      return new URL(baseUrl).hostname;
    } catch (_error) {
      // fall through to the slug
    }
  }
  return cleaned;
};
