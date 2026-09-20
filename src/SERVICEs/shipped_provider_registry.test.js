import {
  SHIPPED_PROVIDERS,
  findShippedProviderBySlug,
  findShippedSite,
  isShippedSlug,
  listShippedSlugs,
  readPresetEnvelopes,
  readShippedPresetEnvelope,
  shippedSiteHost,
} from "./shipped_provider_registry";
import { normalizeCustomProvider } from "./custom_provider_store";

describe("shipped provider registry", () => {
  /* AC-08. The registry's whole promise is that a further shipped provider
     costs an entry, a preset and an icon. This is the half of that promise the
     registry itself owes: an entry can never ship without a usable definition
     behind it. */
  test("every registry site has a bundled preset that normalizes", () => {
    const slugs = listShippedSlugs();
    expect(slugs.length).toBeGreaterThan(0);

    slugs.forEach((slug) => {
      const envelope = readShippedPresetEnvelope(slug);
      expect(envelope).not.toBeNull();

      const normalized = normalizeCustomProvider(envelope);
      expect(normalized.ok).toBe(true);
      expect(normalized.provider.id).toBe(slug);
      expect(normalized.provider.models.length).toBeGreaterThan(0);
    });
  });

  test("registry entries declare a title, an icon and at least one site", () => {
    SHIPPED_PROVIDERS.forEach((provider) => {
      expect(typeof provider.title).toBe("string");
      expect(provider.title.length).toBeGreaterThan(0);
      expect(typeof provider.icon).toBe("string");
      expect(provider.icon.length).toBeGreaterThan(0);
      expect(provider.sites.length).toBeGreaterThan(0);
    });
  });

  test("slugs are unique across the whole registry", () => {
    const slugs = listShippedSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test("isShippedSlug recognises shipped slugs and nothing else", () => {
    expect(isShippedSlug("deepseek")).toBe(true);
    expect(isShippedSlug("kimi")).toBe(true);
    expect(isShippedSlug("kimi-cn")).toBe(true);
    expect(isShippedSlug(" deepseek ")).toBe(true);

    expect(isShippedSlug("sap-hyperspace")).toBe(false);
    expect(isShippedSlug("openai")).toBe(false);
    expect(isShippedSlug("")).toBe(false);
    expect(isShippedSlug(null)).toBe(false);
    expect(isShippedSlug(undefined)).toBe(false);
    expect(isShippedSlug(42)).toBe(false);
  });

  test("finds the owning provider and site for a slug", () => {
    expect(findShippedProviderBySlug("kimi-cn").id).toBe("kimi");
    expect(findShippedSite("kimi-cn").labelKey).toBe(
      "model_providers.site_china",
    );
    expect(findShippedProviderBySlug("nope")).toBeNull();
    expect(findShippedSite("nope")).toBeNull();
  });

  /* The host half of a Platform option label is derived, never authored, so a
     changed endpoint in the preset can never leave a stale label behind. */
  test("derives the site host from the bundled base_url", () => {
    expect(shippedSiteHost("kimi")).toBe("api.moonshot.ai");
    expect(shippedSiteHost("kimi-cn")).toBe("api.moonshot.cn");
    expect(shippedSiteHost("deepseek")).toBe("api.deepseek.com");
  });

  test("an unknown slug has no envelope and falls back to itself as a host", () => {
    expect(readShippedPresetEnvelope("sap-hyperspace")).toBeNull();
    expect(shippedSiteHost("not-a-provider")).toBe("not-a-provider");
  });

  test("readPresetEnvelopes returns every bundled envelope, shipped or not", () => {
    const ids = readPresetEnvelopes().map((e) => e.provider.id);
    expect(ids).toEqual(expect.arrayContaining(listShippedSlugs()));
    // The picker-only showcase preset is bundled too and must stay readable.
    expect(ids).toContain("sap-hyperspace");
  });
});
