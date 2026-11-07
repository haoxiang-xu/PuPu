import capture from "./hooks_enable_order_capture.json";
import capabilityCapture from "../../../../SERVICEs/skeleton_hook_capabilities_capture.json";
import {
  code_point_compare,
  hook_entry_problems,
  hook_runs,
  hook_scope_entries,
  hooks_list,
  kernel_hook_order,
  move_hook,
  scope_duplicate_ids,
  with_hook_enabled,
} from "./hooks_pool_config";

/* #357 Hook on/off and run order. Every expected order is the fixed pair's
 * own (hooks_enable_order_capture.json: attached_hooks and SkeletonHookRuntime
 * admission on the documents the real v2 store saved and reopened). */

const copy = (value) => JSON.parse(JSON.stringify(value));
const row = (name) => copy(capture.rows.find((item) => item.case === name));
const stored = (name) => row(`${name}_get`).reply.resource.document;
const READY = { status: "ready", contract: capabilityCapture.hook_entry };
const ids = (document, agent = "kernel") => kernel_hook_order(document, agent).map((item) => item.id);
const pool = (document, id = "hooks") => hooks_list(document.nodes.find((node) => node.id === id));
/* The run's order for a document: enabled entries of every attached pool, by
   (order, id) — the producer's attached_hooks, as measured. */
const runtime = (name) => row(`${name}_run_order`).reply.kernel || [];

describe("which hooks run", () => {
  test.each(["enabled_missing", "enabled_false", "enabled_true", "all_disabled", "siblings_same_order", "siblings_attach_reversed", "scope_dup_disabled"])(
    "%s: the panel's run order is the runtime's", (name) => {
      expect(ids(stored(name))).toEqual(runtime(name));
    });

  test("a missing setting runs, false does not, true does", () => {
    expect(hook_runs({ id: "a" })).toBe(true);
    expect(hook_runs({ id: "a", enabled: false })).toBe(false);
    expect(hook_runs({ id: "a", enabled: true })).toBe(true);
    /* A malformed value is not off; the runtime refuses it at preflight. */
    expect(hook_runs({ id: "a", enabled: "yes" })).toBe(true);
  });

  test("an id shared with an off hook in a sibling pool is not a run-time duplicate; two on hooks are", () => {
    expect([...scope_duplicate_ids(stored("scope_dup_disabled"), "hooks")]).toEqual([]);
    expect(row("scope_dup_disabled_hook_admission").reply).toEqual({ kernel: ["same"] });
    expect([...scope_duplicate_ids(stored("scope_dup_enabled"), "hooks")]).toEqual(["same"]);
    expect(row("scope_dup_enabled_hook_admission").refusal.code).toBe("duplicate_name");
  });

  test("the same id twice in one pool is refused even when one is off", () => {
    const document = stored("pool_dup_disabled");
    const entries = pool(document);
    expect(hook_entry_problems(entries[1], { siblings: entries, capability: READY }).map((p) => p.code)).toContain("id_duplicate");
    expect(row("pool_dup_disabled_preflight").refusal.code).toBe("duplicate_name");
  });
});

describe("the on/off setting", () => {
  test("with the contract, a boolean is fine and anything else is shown as wrong, raw", () => {
    const entry = pool(stored("enabled_false"))[0];
    expect(hook_entry_problems(entry, { siblings: [entry], capability: READY })).toEqual([]);
    for (const name of ["enabled_string", "enabled_null"]) {
      const bad = pool(stored(name))[0];
      const problems = hook_entry_problems(bad, { siblings: [bad], capability: READY });
      expect(problems.map((p) => p.code)).toEqual(["enabled_invalid"]);
      expect(problems[0].message).toContain(JSON.stringify(bad.enabled));
      expect(row(`${name}_preflight`).refusal.path.slice(-1)).toEqual(["enabled"]);
    }
  });

  test("without the contract nothing is guessed: a stored value is unconfirmed, not unknown and not fine", () => {
    const entry = pool(stored("enabled_false"))[0];
    for (const capability of [undefined, { status: "loading" }, { status: "unavailable", reason: "skeleton_hook_enable_unavailable" }]) {
      const codes = hook_entry_problems(entry, { siblings: [entry], capability }).map((p) => p.code);
      expect(codes).toEqual(["enabled_unconfirmed"]);
    }
    const plain = pool(stored("enabled_missing"))[0];
    expect(hook_entry_problems(plain, { siblings: [plain] })).toEqual([]);
  });

  test("turning one hook off writes only its enabled, and on writes true; nothing else moves", () => {
    const before = stored("enabled_missing");
    const off = with_hook_enabled(before, "hooks", 0, false);
    expect(pool(off)[0]).toEqual({ ...pool(before)[0], enabled: false });
    expect(pool(off)[1]).toBe(pool(before)[1]);
    expect(off.nodes.filter((node) => node.id !== "hooks")).toEqual(before.nodes.filter((node) => node.id !== "hooks"));
    expect(canonical(pool(off))).toEqual(canonical(pool(stored("enabled_false"))));
    const on = with_hook_enabled(off, "hooks", 0, true);
    expect(pool(on)[0].enabled).toBe(true);
    expect(with_hook_enabled(before, "hooks", 0, "yes")).toBe(before);
    expect(with_hook_enabled(before, "hooks", 9, false)).toBe(before);
  });
});

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

describe("moving a hook in the run order writes its order", () => {
  /* Scope on kernel, all entries (on and off), by (order, id):
     d0(more) e1(hooks) a5-off(hooks) b5(more) c5(hooks) */
  const siblings = () => stored("siblings_same_order");
  const scope = (document) => hook_scope_entries(document, "kernel").map((item) => `${item.id}${item.runs ? "" : "-off"}`);

  test("the scope lists every attached pool's hooks, on and off, by (order, id)", () => {
    expect(scope(siblings())).toEqual(["d", "e", "a-off", "b", "c"]);
    expect(scope(stored("siblings_attach_reversed"))).toEqual(["d", "e", "a-off", "b", "c"]);
  });

  const changed = (before, after) => pool(after).filter((entry, at) => entry !== pool(before)[at]).map((entry) => `${entry.id}:${entry.order}`);

  test("one order changes when one fits: e to the end", () => {
    const before = siblings();
    const e = pool(before).findIndex((entry) => entry.id === "e");
    const result = move_hook(before, "hooks", "kernel", e, 4);
    expect(result.ok).toBe(true);
    expect(scope(result.document)).toEqual(["d", "a-off", "b", "c", "e"]);
    expect(changed(before, result.document)).toEqual(["e:5"]);
    expect(pool(result.document, "more")).toBe(pool(before, "more"));
  });

  test("e between b and c: no order alone fits (e sorts after c at 5), so c is moved on too", () => {
    const before = siblings();
    const e = pool(before).findIndex((entry) => entry.id === "e");
    const result = move_hook(before, "hooks", "kernel", e, 3);
    expect(result.ok).toBe(true);
    expect(scope(result.document)).toEqual(["d", "a-off", "b", "e", "c"]);
    expect(changed(before, result.document)).toEqual(["c:6", "e:5"]);
    expect(pool(result.document, "more")).toBe(pool(before, "more"));
  });

  test("same orders: this pool's hooks are renumbered as little as needed; a sibling pool is never written", () => {
    const before = siblings();
    /* d (another pool) is at order 0; e sorts after d at 0, and no order is
       below 0, so e cannot go first without writing d. */
    const e = pool(before).findIndex((entry) => entry.id === "e");
    const refused = move_hook(before, "hooks", "kernel", e, 0);
    expect(refused.ok).toBe(false);
    expect(refused.document).toBe(before);
    expect(refused.problem.code).toBe("order_does_not_fit");
    /* c sorts before d at order 0, so c can. */
    const c = pool(before).findIndex((entry) => entry.id === "c");
    const first = move_hook(before, "hooks", "kernel", c, 0);
    expect(first.ok).toBe(true);
    expect(scope(first.document)).toEqual(["c", "d", "e", "a-off", "b"]);
    /* c right after d: every hook of this pool after it moves on as needed. */
    const after_d = move_hook(before, "hooks", "kernel", c, 1);
    expect(after_d.ok).toBe(true);
    expect(scope(after_d.document)).toEqual(["d", "c", "e", "a-off", "b"]);
    expect(pool(after_d.document, "more")).toBe(pool(before, "more"));
    for (const entry of pool(after_d.document)) expect(Number.isSafeInteger(entry.order) && entry.order >= 0 && entry.order <= 1000000).toBe(true);
  });

  test("an off hook moves too, and what runs keeps the runtime's rule", () => {
    const before = siblings();
    const a = pool(before).findIndex((entry) => entry.id === "a");
    const result = move_hook(before, "hooks", "kernel", a, 4);
    expect(result.ok).toBe(true);
    expect(scope(result.document)).toEqual(["d", "e", "b", "c", "a-off"]);
    expect(ids(result.document)).toEqual(["d", "e", "b", "c"]);
  });

  test("not moving is not a write", () => {
    const before = siblings();
    const e = pool(before).findIndex((entry) => entry.id === "e");
    expect(move_hook(before, "hooks", "kernel", e, 1).document).toBe(before);
  });

  test("a hook without a usable id or order is not moved", () => {
    const before = siblings();
    const bad = copy(before);
    pool(bad)[0].order = 1.5;
    const result = move_hook(bad, "hooks", "kernel", 0, 0);
    expect(result.ok).toBe(false);
    expect(result.document).toBe(bad);
  });
});

/* R-HUI-02: ids are ordered as the runtime orders them — by Unicode code point
   (hooks_unicode_order_capture.json: the new fixed pair's attached_hooks and
   admission on documents the real store saved, reopened and preflighted). */
describe("R-HUI-02: ids in code-point order, as the runtime", () => {
  // eslint-disable-next-line global-require
  const unicode = require("./hooks_unicode_order_capture.json");
  const cases = unicode.rows.map((item) => [item.case, item]);

  test.each(cases)("%s: the panel's order is the runtime's", (_name, item) => {
    expect(item.preflight_ok).toBe(true);
    expect(item.run_order).toEqual(item.admission);
    expect(kernel_hook_order(item.document, "kernel").map((entry) => entry.id)).toEqual(item.run_order);
  });

  test("code-point comparison, not UTF-16 units and not locale", () => {
    expect(code_point_compare("", "\u{1F600}")).toBe(-1);
    expect(code_point_compare("￿", "\u{10000}")).toBe(-1);
    expect(code_point_compare("\u{1F600}", "\u{1F601}")).toBe(-1);
    expect(code_point_compare("a", "ab")).toBe(-1);
    expect(code_point_compare("ab", "a")).toBe(1);
    expect(code_point_compare("\u{1F600}", "\u{1F600}")).toBe(0);
    /* UTF-16 `<` says the opposite for the first two. */
    expect("\u{1F600}" < "").toBe(true);
  });

  test("moving U+E000 to the end takes effect, and writes only its order", () => {
    const item = unicode.rows.find((entry) => entry.case === "private_use_vs_emoji");
    const before = item.document;
    const index = pool(before).findIndex((entry) => entry.id === "");
    const result = move_hook(before, "hooks", "kernel", index, 1);
    expect(result.ok).toBe(true);
    expect(result.document).not.toBe(before);
    expect(kernel_hook_order(result.document, "kernel").map((entry) => entry.id)).toEqual(["\u{1F600}", ""]);
    expect(pool(result.document).map((entry) => entry.id)).toEqual(pool(before).map((entry) => entry.id));
    expect(pool(result.document)[index]).toEqual({ ...pool(before)[index], order: 1 });
    const other = 1 - index;
    expect(pool(result.document)[other]).toBe(pool(before)[other]);
  });

  test("the emoji between U+E000 and z keeps every id as stored", () => {
    const item = unicode.rows.find((entry) => entry.case === "mixed_orders");
    const before = item.document;
    const index = pool(before).findIndex((entry) => entry.id === "\u{1F600}");
    const result = move_hook(before, "hooks", "kernel", index, 0);
    expect(result.ok).toBe(true);
    expect(kernel_hook_order(result.document, "kernel").map((entry) => entry.id)).toEqual(["\u{1F600}", "", "z"]);
    expect(pool(result.document).map((entry) => entry.id)).toEqual(pool(before).map((entry) => entry.id));
  });
});

/* R-HUI-01: a place in the run is 0 … (number of other hooks); anything else,
   such as a drop on the hook itself, writes nothing. */
describe("R-HUI-01: only a real place is a move", () => {
  test.each([[-1], [1.5], [3], [Number.NaN], [undefined]])("position %p is refused and nothing is written", (position) => {
    const before = stored("enabled_missing");
    const result = move_hook(before, "hooks", "kernel", 1, position);
    expect(result.ok).toBe(false);
    expect(result.document).toBe(before);
    expect(result.problem.code).toBe("not_a_place");
  });

  test("the ends are places", () => {
    const before = stored("enabled_missing");
    expect(kernel_hook_order(move_hook(before, "hooks", "kernel", 1, 0).document, "kernel").map((entry) => entry.id)).toEqual(["audit", "guard"]);
    expect(move_hook(before, "hooks", "kernel", 1, 1).document).toBe(before);
  });
});

/* R-HUI-02 in the renumbering path: a sibling pool's hook must be compared by
   code point too. Constructed from the producer's own saved document (its
   pinned Workflow and Kernel kept): this pool holds U+E000 and U+1F600 at
   order 1, a second attached pool holds U+E001 at order 1. Putting U+1F600
   between U+E000 and U+E001 needs this pool's orders lowered; the runtime's
   order of the result is checked by the replay (07-unicode-sibling). */
describe("R-HUI-02: renumbering against a sibling pool", () => {
  // eslint-disable-next-line global-require
  const unicode = require("./hooks_unicode_order_capture.json");
  const fs = require("fs");
  const base = () => {
    const document = copy(unicode.rows.find((entry) => entry.case === "private_use_vs_emoji").document);
    const hooks = document.nodes.find((node) => node.id === "hooks").config.hooks;
    const template = hooks[0];
    document.id = "agent-unicode-siblings";
    document.name = "agent-unicode-siblings";
    document.nodes.find((node) => node.id === "hooks").config.hooks = [
      { ...template, id: "", order: 1 }, { ...template, id: "\u{1F600}", order: 1 }];
    document.nodes.push({ id: "more", type: "hooks_pool", config: { hooks: [{ ...template, id: "", order: 1 }] } });
    document.edges.push({ id: "attach-more", kind: "attach", source_node_id: "kernel", source_port_id: "attach_bot", target_node_id: "more", target_port_id: "attach_top" });
    return document;
  };

  test("U+1F600 goes between U+E000 and U+E001; only this pool's orders are written", () => {
    const before = base();
    expect(kernel_hook_order(before, "kernel").map((entry) => entry.id)).toEqual(["", "", "\u{1F600}"]);
    const result = move_hook(before, "hooks", "kernel", 1, 1);
    expect(result.ok).toBe(true);
    expect(kernel_hook_order(result.document, "kernel").map((entry) => entry.id)).toEqual(["", "\u{1F600}", ""]);
    expect(pool(result.document).map((entry) => [entry.id, entry.order])).toEqual([["", 0], ["\u{1F600}", 0]]);
    expect(pool(result.document, "more")).toBe(pool(before, "more"));
    if (process.env.HOOKS_UI_PAYLOAD_DIR) {
      fs.writeFileSync(`${process.env.HOOKS_UI_PAYLOAD_DIR}/07-unicode-sibling.json`, JSON.stringify({
        base_document: before, workflow_document: unicode.workflow_version.version.document,
        edit: { schema: "pupu.skeleton-edit.v2", document: result.document, expected_edit_token: null, managed_sources: [] },
        ui_run_order: kernel_hook_order(result.document, "kernel").map((entry) => entry.id) }, null, 2) + "\n");
    }
  });

  test("U+E000 to the end of the producer's own document, for the replay", () => {
    const before = copy(unicode.rows.find((entry) => entry.case === "private_use_vs_emoji").document);
    const index = pool(before).findIndex((entry) => entry.id === "");
    const result = move_hook(before, "hooks", "kernel", index, 1);
    expect(result.ok).toBe(true);
    if (process.env.HOOKS_UI_PAYLOAD_DIR) {
      fs.writeFileSync(`${process.env.HOOKS_UI_PAYLOAD_DIR}/06-unicode-move-end.json`, JSON.stringify({
        base_document: before, workflow_document: unicode.workflow_version.version.document,
        edit: { schema: "pupu.skeleton-edit.v2", document: result.document, expected_edit_token: null, managed_sources: [] },
        ui_run_order: kernel_hook_order(result.document, "kernel").map((entry) => entry.id) }, null, 2) + "\n");
    }
  });
});
