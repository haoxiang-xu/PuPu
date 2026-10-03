import { DEFAULT_SKILL_PACK_ICON, displayIconForToolkit } from "./skill_pack_store_install";
import { DEFAULT_MCP_ICON } from "../../../SERVICEs/mcp_toolkit_store";

test("a pack with no artwork falls back to the same grey glyph plate an MCP server does", () => {
  expect(DEFAULT_SKILL_PACK_ICON.name).toBe("command");
  expect(DEFAULT_SKILL_PACK_ICON.color).toBe(DEFAULT_MCP_ICON.color);
  expect(DEFAULT_SKILL_PACK_ICON.backgroundColor).toBe(DEFAULT_MCP_ICON.backgroundColor);
});

describe("displayIconForToolkit", () => {
  // What the sidecar sends for an installed pack that ships no artwork
  // (unchain_runtime/server/skill_packs.py DEFAULT_SKILL_PACK_ICON).
  const SIDECAR_DEFAULT = { type: "builtin", name: "command", color: "#7c8cf8", backgroundColor: "#eef0fe" };

  test("an installed pack without artwork keeps the grey glyph it had before install", () => {
    expect(displayIconForToolkit({ source: "skillpack", toolkitIcon: SIDECAR_DEFAULT })).toBe(DEFAULT_SKILL_PACK_ICON);
    expect(displayIconForToolkit({ source: "skillpack" })).toBe(DEFAULT_SKILL_PACK_ICON);
  });

  test("a pack that ships real artwork keeps it", () => {
    const artwork = { type: "file", content: "PHN2Zy8+", mimeType: "image/svg+xml" };
    expect(displayIconForToolkit({ source: "skillpack", toolkitIcon: artwork })).toBe(artwork);
  });

  test("anything that is not a pack is left exactly as the catalog sent it", () => {
    expect(displayIconForToolkit({ source: "builtin", toolkitIcon: SIDECAR_DEFAULT })).toBe(SIDECAR_DEFAULT);
    expect(displayIconForToolkit({ source: "mcp", toolkitIcon: undefined })).toBeUndefined();
  });
});
