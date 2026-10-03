import { DEFAULT_SKILL_PACK_ICON } from "./skill_pack_store_install";
import { DEFAULT_MCP_ICON } from "../../../SERVICEs/mcp_toolkit_store";

test("a pack with no artwork falls back to the same grey glyph plate an MCP server does", () => {
  expect(DEFAULT_SKILL_PACK_ICON.name).toBe("command");
  expect(DEFAULT_SKILL_PACK_ICON.color).toBe(DEFAULT_MCP_ICON.color);
  expect(DEFAULT_SKILL_PACK_ICON.backgroundColor).toBe(DEFAULT_MCP_ICON.backgroundColor);
});
