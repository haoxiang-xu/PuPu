import fs from "fs";
import path from "path";
import { node_identity } from "./node_identity";

/* Node icons are one flat colour now: no gradient in the identity table, and
   none drawn by the canvas nodes. */
const TYPES = ["start", "end", "agent", "toolkit_pool", "subagent_pool", "if_else", "switch_case",
  "tool_call", "skill_read", "code", "hooks_pool", "workflow_call"];

test.each(TYPES)("the %s identity is a flat colour", (type) => {
  const identity = node_identity({ id: "n", type, config: {} });
  expect(identity).not.toBeNull();
  expect(identity.gradient).toMatch(/^#[0-9a-f]{6}$/i);
});

test("no canvas node draws a gradient icon", () => {
  const dir = path.join(__dirname, "..", "nodes");
  const offenders = fs.readdirSync(dir)
    .filter((name) => name.endsWith(".js") && !name.endsWith(".test.js"))
    .filter((name) => /linear-gradient\(/.test(fs.readFileSync(path.join(dir, name), "utf8")));
  expect(offenders).toEqual([]);
});

/* The canvas node is the source of truth: the panel header (node_identity)
   must draw the same glyph in the same colour for every type. */
const CANVAS = {
  start: "start_node.js", end: "end_node.js", agent: "agent_node.js",
  toolkit_pool: "tool_pool_node.js", subagent_pool: "subagent_pool_node.js",
  tool_call: "tool_call_node.js", skill_read: "skill_read_node.js", code: "code_node.js",
  hooks_pool: "hooks_pool_node.js", workflow_call: "workflow_call_node.js",
};
test.each(Object.entries(CANVAS))("the %s panel icon is the canvas node's glyph and colour", (type, file) => {
  const source = fs.readFileSync(path.join(__dirname, "..", "nodes", file), "utf8");
  const identity = node_identity({ id: "n", type, config: {} });
  expect(source).toContain(`src="${identity.icon}"`);
  expect(source.toLowerCase()).toContain(`background: "${identity.gradient.toLowerCase()}"`);
});
test.each([["if_else", "branch"], ["switch_case", "switch_node"]])("the %s panel icon is the branch node's", (type, glyph) => {
  const source = fs.readFileSync(path.join(__dirname, "..", "nodes", "branch_node.js"), "utf8");
  const identity = node_identity({ id: "n", type, config: {} });
  expect(identity.icon).toBe(glyph);
  expect(source).toContain(`${type}: { icon: "${glyph}"`);
  expect(source.toLowerCase()).toContain(`background: "${identity.gradient.toLowerCase()}"`);
});
