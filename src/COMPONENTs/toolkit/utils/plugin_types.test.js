import { isMcpSourced, typesFor } from "./plugin_types";

const withCommands = { commands: [{ name: "/plan" }] };
const without = { commands: [] };

test("an MCP server is mcp", () => {
  expect(typesFor("mcp", without)).toEqual(["mcp"]);
  expect(typesFor("mcp_registry", without)).toEqual(["mcp"]);
});

test("a builtin that ships a command is a toolkit and a skill", () => {
  expect(typesFor("builtin", withCommands)).toEqual(["toolkit", "skill"]);
});

test("an MCP server that ships a command is mcp and a skill", () => {
  expect(typesFor("mcp", withCommands)).toEqual(["mcp", "skill"]);
});

test("an installed skill pack is a skill, never a toolkit", () => {
  expect(typesFor("skillpack", withCommands)).toEqual(["skill"]);
});

test("a presentation without a command list is not a skill", () => {
  expect(typesFor("builtin", {})).toEqual(["toolkit"]);
});

test("isMcpSourced reads the source prefix", () => {
  expect(isMcpSourced("mcp")).toBe(true);
  expect(isMcpSourced("mcp_registry")).toBe(true);
  expect(isMcpSourced("builtin")).toBe(false);
  expect(isMcpSourced(null)).toBe(false);
});
