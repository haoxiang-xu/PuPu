import { SOURCE_CONFIG, STORE_CATEGORY_CONFIG, TRUST_CONFIG } from "./constants";
import { MCP_STORE_CATEGORIES } from "../../SERVICEs/mcp_toolkit_store";

describe("toolkit constants", () => {
  test("SOURCE_CONFIG has an mcp entry", () => {
    expect(SOURCE_CONFIG.mcp).toBeDefined();
    expect(SOURCE_CONFIG.mcp.color).toBe("#8b5cf6");
    expect(SOURCE_CONFIG.mcp.labelKey).toBe("toolkit.source_mcp");
  });

  test("existing source entries are untouched", () => {
    expect(SOURCE_CONFIG.builtin).toBeDefined();
    expect(SOURCE_CONFIG.local).toBeDefined();
    expect(SOURCE_CONFIG.plugin).toBeDefined();
  });

  test("STORE_CATEGORY_CONFIG keys exactly match the service categories", () => {
    const keys = STORE_CATEGORY_CONFIG.map((category) => category.key);
    expect(keys).toEqual(MCP_STORE_CATEGORIES);
    for (const category of STORE_CATEGORY_CONFIG) {
      expect(typeof category.icon).toBe("string");
      expect(category.labelKey).toMatch(/^toolkit\.store_category_/);
    }
  });

  test("TRUST_CONFIG covers verified, community and needs_review", () => {
    expect(TRUST_CONFIG.verified.labelKey).toBe("toolkit.trust_verified");
    expect(TRUST_CONFIG.community.labelKey).toBe("toolkit.trust_community");
    expect(TRUST_CONFIG.needs_review.labelKey).toBe(
      "toolkit.trust_needs_review",
    );
  });
});
