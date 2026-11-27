import capture from "./hook_tool_set_capture.json";
import toolSetCapabilityCapture from "../../../../SERVICEs/skeleton_hook_tool_set_capabilities_capture.json";
import { hook_entry_problems, hooks_list, tool_matcher_kind, tool_name_ok, tool_set_problems } from "./hooks_pool_config";

/* #357 Hook tool sets: every expectation is the fixed pair's own answer
 * (hook_tool_set_capture.json: the v2 store saved, reopened and preflighted
 * each shape on wheel 447fe170). */

const row = (name) => capture.rows.find((item) => item.case === name);
const entryOf = (name) => hooks_list(row(`${name}_get`).reply.resource.document.nodes.find((node) => node.id === "hooks"))[0];
const READY = { status: "ready", contract: toolSetCapabilityCapture.tool_matcher };
const tool_codes = (entry, toolSetCapability) =>
  hook_entry_problems(entry, { siblings: [entry], toolSetCapability }).map((p) => p.code).filter((code) => code.startsWith("tool"));
const preflight_ok = (name) => Boolean(row(`${name}_preflight`).reply && row(`${name}_preflight`).reply.preflight.ok);

test("the capability the panel reads is the producer's own answer", () => {
  expect(row("tool_set_capabilities").reply).toEqual(toolSetCapabilityCapture);
});

test.each([
  ["every", []], ["single", []], ["single_not_in_library", []], ["set", []], ["set_order", []], ["set_one", []],
  ["set_not_in_library", []], ["set_disabled", []], ["set_bom", []], ["single_bom", []],
  ["set_empty", ["tool_set_empty"]], ["set_duplicate", ["tool_set_duplicate"]], ["set_blank", ["tool_set_member_invalid"]],
  ["set_python_space", ["tool_set_member_invalid"]], ["set_number", ["tool_set_member_invalid"]], ["set_nested", ["tool_set_member_invalid"]],
  ["single_python_space", ["tool_invalid"]], ["tool_object", ["tool_invalid"]], ["tool_number", ["tool_invalid"]],
])("%s: the panel says %j exactly when preflight refuses it", (name, expected) => {
  expect(tool_codes(entryOf(name), READY)).toEqual(expected);
  expect(preflight_ok(name)).toBe(expected.length === 0);
  const refusal = row(`${name}_preflight`).refusal;
  expect(refusal ? refusal.path.slice(0, 7) : null).toEqual(expected.length ? ["document", "nodes", 3, "config", "hooks", 0, "tool_name"] : null);
});

test("a stored order and every stored name are kept as they are", () => {
  expect(entryOf("set_order").tool_name).toEqual(["write", "read"]);
  expect(entryOf("set_not_in_library").tool_name).toEqual(["read", "legacy_tool"]);
});

test("blank is Python's: \\x1c and \\x85 are blank, \\ufeff is a name", () => {
  expect(tool_name_ok("\x1c")).toBe(false);
  expect(tool_name_ok("\x85")).toBe(false);
  expect(tool_name_ok("  ")).toBe(false);
  expect(tool_name_ok("﻿")).toBe(true);
  expect(tool_name_ok(" read ")).toBe(true);
  expect(tool_name_ok(5)).toBe(false);
  /* JavaScript's trim() says the opposite for both. */
  expect("\x1c".trim() !== "").toBe(true);
  expect("﻿".trim()).toBe("");
});

test("without the contract a stored set is unconfirmed, never judged either way", () => {
  for (const capability of [undefined, { status: "loading" }, { status: "unavailable", reason: "skeleton_hook_tool_set_unavailable" }]) {
    expect(tool_codes(entryOf("set"), capability)).toEqual(["tool_set_unconfirmed"]);
    expect(tool_codes(entryOf("set_empty"), capability)).toEqual(["tool_set_unconfirmed"]);
  }
  expect(tool_codes(entryOf("single"), undefined)).toEqual([]);
  expect(tool_codes(entryOf("every"), undefined)).toEqual([]);
});

test("what a stored tool_name is", () => {
  expect(["every", "single", "set", "set_empty", "tool_object", "tool_number"].map((name) => tool_matcher_kind(entryOf(name))))
    .toEqual(["every", "one", "set", "set", "other", "other"]);
  expect(tool_matcher_kind({})).toBeNull();
  expect(tool_set_problems("read")).toEqual([]);
});

test("the runtime matches exact names only", () => {
  expect(row("set_matches").reply).toEqual({ read: true, write: true, Read: false, " read": false, "read ": false, legacy_tool: false, "﻿": false, edit: false });
  expect(row("set_not_in_library_matches").reply.legacy_tool).toBe(true);
});
