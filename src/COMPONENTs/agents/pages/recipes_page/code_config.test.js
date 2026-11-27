import {
  CODE_DEFAULTS,
  CODE_LIMITS,
  STARTER_CODE,
  code_with_defaults,
  starter_code,
  with_code_defaults,
  CODE_SETTING_KEYS,
  code_problems,
  code_result_roots,
  code_settings,
  code_source_text,
  limit_from_text,
  profile_label,
  source_path_problem,
  with_code_settings,
} from "./code_config";
import capture from "./code_capture.json";

/* The Code node's configuration (#357), as the fixed runtime defines it
 * (`code_runtime.admit_code_config`, measured on the pinned wheel —
 * code_capture.json, code-01/out/code-store-capture.json):
 *
 *   config.code  CLOSED {source:{kind:"file", path}, environment_profile_id,
 *                timeout_ms, max_result_bytes, max_log_bytes, result_schema,
 *                artifacts?} — no error policy, no inline source.
 *
 * The store saves every shape below and reports nothing; preflight is where
 * the runtime refuses, so the editor states the problems itself. */

const row = (id) => capture.rows.find((entry) => entry.case === id);
const complete = row("complete").config.code;
const ref = (name, node_id, field) => ({ name, value: { kind: "ref", node_id, path: [field] }, missing: "error" });
const node = (code, inputs = []) => ({ id: "score", type: "code", config: { execution: { inputs, outputs: [] }, ...(code === undefined ? {} : { code }) } });
const doc = (...nodes) => ({ schema_version: 1, kind: "agent", id: "a", name: "A", nodes: [{ id: "start", type: "start", config: { execution: { outputs: [] } } }, ...nodes], edges: [] });
const PROFILES = capture.profiles.list_after;

describe("the fixture is the real producer's answer", () => {
  test("every stored shape saved and round-tripped; only preflight refused", () => {
    expect(capture.rows.length).toBeGreaterThan(20);
    capture.rows.forEach((entry) => {
      expect(entry.saved).toBe(true);
      expect(entry.roundtrip_equal).toBe(true);
      expect(entry.diagnostics).toEqual([]);
    });
  });

  test("the keys the runtime admits are exactly the ones this editor writes", () => {
    expect(Object.keys(complete).sort()).toEqual([...CODE_SETTING_KEYS].filter((key) => key !== "artifacts").sort());
    expect(row("complete-artifacts").preflight.ok).toBe(true);
    expect(row("unknown-code-key-on-error").preflight).toMatchObject({ ok: false, code: "unknown_field", path: ["document", "nodes", 1, "config", "code", "on_error"] });
    expect(row("source-inline").preflight).toMatchObject({ ok: false, code: "invalid_shape" });
    expect(row("missing-limits").preflight).toMatchObject({ ok: false, code: "missing_field" });
  });

  test("the limits are the runtime's", () => {
    expect(CODE_LIMITS.timeout_ms).toEqual({ min: 1, max: 86400000 });
    expect(CODE_LIMITS.max_result_bytes).toEqual({ min: 1, max: 8 * 1024 * 1024 });
    expect(CODE_LIMITS.max_log_bytes).toEqual({ min: 1, max: 8 * 1024 * 1024 });
    expect(row("timeout-over").preflight.code).toBe("invalid_value");
    expect(row("result-bytes-over").preflight.code).toBe("invalid_value");
    expect(row("log-bytes-zero").preflight.code).toBe("invalid_value");
  });
});

describe("reading and writing the code settings", () => {
  test("absent until written; written whole, other config kept", () => {
    expect(code_settings(node(undefined))).toBeNull();
    expect(code_settings({ id: "x", type: "code", config: { code: "text" } })).toBeNull();
    const written = with_code_settings(doc(node(undefined, [ref("diff", "start", "message")])), "score", complete);
    expect(written.nodes[1].config).toStrictEqual({ execution: { inputs: [ref("diff", "start", "message")], outputs: [] }, code: complete });
    expect(Object.keys(written.nodes[1].config.code)).toEqual(Object.keys(complete));
  });

  test("refuses to write anywhere but one Code node", () => {
    const twice = doc(node(undefined), node(undefined));
    expect(with_code_settings(twice, "score", complete)).toBe(twice);
    const tool = doc({ id: "score", type: "tool_call", config: { execution: { inputs: [], outputs: [] } } });
    expect(with_code_settings(tool, "score", complete)).toBe(tool);
    const original = doc(node(undefined));
    expect(with_code_settings(original, "score", "not an object")).toBe(original);
  });
});

describe("what the panel says is wrong, against the runtime's refusals", () => {
  /* Cases the runtime decides on something this editor cannot see or never
     emits: the profile list (checked separately), the result side (the output
     rows' business), keys outside `code`, an absolute path (said sooner,
     below), and `30000.0` — refused as a float on the wire, but JSON hands
     this editor `30000` and it only ever writes integers. */
  /* `missing-limits` is refused because the draft was stored without them;
     every save now writes the defaults first (`with_code_defaults`), so it
     cannot reach the store that way — checked below. */
  const PREFLIGHT_ONLY = new Set(["seed", "missing-limits", "profile-missing", "profile-venv", "schema-open", "output-root-undeclared", "output-error-root", "extra-config-key", "source-absolute", "timeout-float"]);

  test("a case preflight refuses inside config.code is a problem here, before any round trip", () => {
    const verdicts = capture.rows
      .filter((entry) => !PREFLIGHT_ONLY.has(entry.case))
      .map((entry) => ({
        case: entry.case,
        runtime_refuses: !entry.preflight.ok,
        panel_complains: code_problems(node(entry.config.code), PROFILES).length > 0,
      }));
    expect(verdicts.length).toBeGreaterThan(10);
    expect(verdicts.filter((verdict) => verdict.runtime_refuses !== verdict.panel_complains)).toEqual([]);
  });

  test("a seed passes preflight but cannot run: the panel says what is missing (G8)", () => {
    expect(row("seed").preflight.ok).toBe(true);
    const problems = code_problems(node(undefined), PROFILES);
    expect(problems.map((problem) => problem.code)).toEqual(["source_missing"]);
  });

  test("a profile the store does not list is a problem; an unknown list is not", () => {
    expect(row("profile-missing").preflight).toMatchObject({ ok: false, code: "profile_missing" });
    expect(code_problems(node(row("profile-missing").config.code), PROFILES).map((problem) => problem.code)).toEqual(["profile_unknown"]);
    expect(code_problems(node(row("profile-missing").config.code), null)).toEqual([]);
    const unavailable = PROFILES.map((profile) => (profile.id === "builtin" ? { ...profile, available: false } : profile));
    expect(code_problems(node(complete), unavailable).map((problem) => problem.code)).toEqual(["profile_unavailable"]);
  });

  test("an unknown key is named; an unset limit is its default, not a problem, and a save writes it", () => {
    expect(code_problems(node(row("unknown-code-key-on-error").config.code), PROFILES)).toEqual([
      expect.objectContaining({ code: "unknown_setting", setting: "on_error" }),
    ]);
    const missing = row("missing-limits").config.code;
    expect(code_problems(node(missing), PROFILES)).toEqual([]);
    /* What the save sends has the same keys as the complete row the store
       admitted and preflight accepted. */
    expect(Object.keys(code_with_defaults(missing)).sort()).toEqual(Object.keys(complete).sort());
  });

  test("the source is one normalized relative file path (FileCodeSourceResolver's lexical rules)", () => {
    expect(source_path_problem("tools/score.py")).toBeNull();
    expect(source_path_problem("")).toMatch(/Name the file/);
    expect(source_path_problem("/tmp/score.py")).toMatch(/relative/);
    expect(source_path_problem("../score.py")).toMatch(/\.\./);
    expect(source_path_problem("tools//score.py")).toMatch(/empty/);
    expect(source_path_problem("./score.py")).toMatch(/\./);
    expect(source_path_problem("a\u0000b")).toMatch(/NUL/);
    expect(source_path_problem(5)).toMatch(/text/);
    /* The runtime admits an absolute path at preflight and fails only when it
       runs; saying so here is saying something true sooner. */
    expect(row("source-absolute").preflight.ok).toBe(true);
    expect(code_problems(node(row("source-absolute").config.code), PROFILES).map((problem) => problem.code)).toEqual(["source_invalid"]);
    expect(code_problems(node(row("source-inline").config.code), PROFILES).map((problem) => problem.code)).toEqual(["source_invalid"]);
  });

  test("a stored schema of another shape is named, never coerced", () => {
    expect(code_problems(node(row("schema-not-dict").config.code), PROFILES).map((problem) => problem.code)).toEqual(["schema_invalid"]);
    expect(code_problems(node(row("schema-not-object-type").config.code), PROFILES).map((problem) => problem.code)).toEqual(["schema_invalid"]);
    expect(code_problems(node({ ...complete, result_schema: { type: "object", properties: { x: { type: "integer" } }, additionalProperties: false, __proto__: null } }), PROFILES)).toEqual([]);
  });
});

describe("what the result declares", () => {
  test("the schema's root fields, closed when it closes them", () => {
    expect(code_result_roots(node(complete))).toEqual({ known: true, roots: ["rows", "summary"], closed: true, reason: null });
    expect(code_result_roots(node(row("schema-open").config.code))).toMatchObject({ known: true, roots: ["rows"], closed: false });
    expect(code_result_roots(node(row("schema-open").config.code)).reason).toMatch(/does not close/);
  });

  test("without a schema, or with one the editor cannot read, nothing is claimed", () => {
    expect(code_result_roots(node(undefined))).toMatchObject({ known: false, roots: [], closed: false });
    expect(code_result_roots(node(undefined)).reason).toMatch(/Result/);
    expect(code_result_roots(node(row("schema-not-dict").config.code))).toMatchObject({ known: false, closed: false });
  });

  test("error metadata is not a result field: the runtime keeps it beside the result", () => {
    /* `durable_execution.py:253` unwraps `{result, error, logs, …}`; what a
       mapping names is inside `result`, so `error` is only ever an author's
       own declared field. Preflight does not look here (output-error-root
       passes); the closed roots say it sooner. */
    expect(row("output-error-root").preflight.ok).toBe(true);
    expect(code_result_roots(node(complete)).roots).not.toContain("error");
  });
});

describe("the source text seam (G1)", () => {
  test("a file source has no text here, and says where it is read from", () => {
    const answer = code_source_text(node(complete));
    expect(answer).toEqual({ available: false, managed: false, text: null, path: "tools/score.py", reason: expect.stringMatching(/workspace/) });
    expect(code_source_text(node(undefined))).toEqual({ available: false, managed: false, text: null, path: null, reason: expect.any(String) });
    expect(code_source_text(node({ ...complete, source: { kind: "file", path: { toString: null } } })).path).toBeNull();
  });
});

describe("texts the controls read", () => {
  test("a whole number inside the limit, or the reason", () => {
    expect(limit_from_text("30", { min: 1, max: 86400 })).toEqual({ ok: true, value: 30 });
    expect(limit_from_text(" 30 ", { min: 1, max: 86400 })).toEqual({ ok: true, value: 30 });
    expect(limit_from_text("0", { min: 1, max: 86400 }).ok).toBe(false);
    expect(limit_from_text("86401", { min: 1, max: 86400 }).ok).toBe(false);
    expect(limit_from_text("1.5", { min: 1, max: 86400 }).ok).toBe(false);
    expect(limit_from_text("", { min: 1, max: 86400 }).ok).toBe(false);
    expect(limit_from_text("1e3", { min: 1, max: 86400 }).ok).toBe(false);
  });

  test("a profile is labelled by what the store lists, never by a version it did not send", () => {
    expect(profile_label(PROFILES[0])).toBe("builtin · built-in Python");
    const venv = { ...PROFILES[1], executable: "/Users/someone/.venvs/pupu-tools/bin/python" };
    expect(profile_label(venv)).toBe("pupu-tools · python");
    expect(profile_label({ ...venv, available: false })).toBe("pupu-tools · python (unavailable)");
    expect(profile_label({ id: { toString: null } })).toBe("(unreadable profile)");
  });
});

/* R-357-04a: presence is a key test, not a value test. `own` answers with the
   stored value, so a stored null / false / 0 / "" read as "absent" — and a
   malformed value was then reported as missing, or not at all. */
describe("a stored falsy value is present, and named for what it is", () => {
  test.each([null, false, 0, ""])("artifacts %j is reported as unreadable, not ignored", (value) => {
    expect(code_problems(node({ ...complete, artifacts: value }), PROFILES).map((problem) => problem.code)).toEqual(["artifacts_invalid"]);
  });

  test.each([null, false, 0, ""])("timeout_ms %j is an invalid limit, not a missing one", (value) => {
    const problems = code_problems(node({ ...complete, timeout_ms: value }), PROFILES);
    expect(problems.map((problem) => [problem.code, problem.setting])).toEqual([["limit_invalid", "timeout_ms"]]);
  });

  test.each([null, false, 0, ""])("source %j is an invalid source, not a missing one", (value) => {
    expect(code_problems(node({ ...complete, source: value }), PROFILES).map((problem) => problem.code)).toEqual(["source_invalid"]);
  });

  test.each([null, false, 0, ""])("environment_profile_id %j is an invalid id, not a missing one", (value) => {
    expect(code_problems(node({ ...complete, environment_profile_id: value }), PROFILES).map((problem) => problem.code)).toEqual(["profile_invalid"]);
  });

  test.each([null, false, 0, ""])("result_schema %j is an invalid schema, not a missing one", (value) => {
    expect(code_problems(node({ ...complete, result_schema: value }), PROFILES).map((problem) => problem.code)).toEqual(["schema_invalid"]);
  });
});

describe("unset Python and limits are their defaults", () => {
  test("the defaults are the built-in Python, 30 s, 1 MiB and 1 MiB", () => {
    expect(CODE_DEFAULTS).toEqual({ environment_profile_id: "builtin", timeout_ms: 30000, max_result_bytes: 1048576, max_log_bytes: 1048576 });
  });
  test("only what is unset is filled; a stored value — whatever it is — is kept", () => {
    expect(code_with_defaults({ timeout_ms: 1000 })).toStrictEqual({ ...CODE_DEFAULTS, timeout_ms: 1000 });
    expect(code_with_defaults(undefined)).toStrictEqual({ ...CODE_DEFAULTS });
    const odd = { environment_profile_id: "pupu-tools", timeout_ms: 0, max_result_bytes: null, max_log_bytes: "x" };
    expect(code_with_defaults(odd)).toBe(odd);
    expect(code_with_defaults("not settings")).toBe("not settings");
  });
  test("one walk fills every Code node the resource owns, embedded ones included, and nothing else", () => {
    const child = { schema_version: 1, kind: "agent", id: "child", nodes: [{ id: "inner", type: "code", config: { execution: {}, code: { timeout_ms: 5 } } }], edges: [] };
    const document = { schema_version: 1, kind: "agent", id: "d", nodes: [
      { id: "a", type: "code", config: { execution: {} } },
      { id: "b", type: "agent", config: { kernel: {} } },
      { id: "p", type: "subagent_pool", config: { subagents: [{ id: "s", source: { kind: "embedded", document: child } }] } },
    ], edges: [] };
    const before = JSON.stringify(document);
    const next = with_code_defaults(document);
    expect(JSON.stringify(document)).toBe(before);
    expect(next.nodes[0].config.code).toStrictEqual({ ...CODE_DEFAULTS });
    expect(next.nodes[1]).toBe(document.nodes[1]);
    expect(next.nodes[2].config.subagents[0].source.document.nodes[0].config.code).toStrictEqual({ ...CODE_DEFAULTS, timeout_ms: 5 });
    /* Nothing missing: the very same document. */
    expect(with_code_defaults(next)).toBe(next);
  });
  test("a new node's starter is usable: text kept under its digest, the field it returns declared", () => {
    const { code, sources } = starter_code();
    const [sha] = Object.keys(sources);
    expect(sources[sha]).toBe(STARTER_CODE);
    expect(code.source).toEqual({ kind: "file", path: `__pupu_code__/sha256/${sha}.py` });
    expect(code.result_schema).toEqual({ type: "object", properties: {}, additionalProperties: false });
    expect(STARTER_CODE).toContain("return dict(input)");
    expect(code_problems({ id: "n", type: "code", config: { execution: {}, code } }, PROFILES, sources)).toEqual([]);
  });
});
