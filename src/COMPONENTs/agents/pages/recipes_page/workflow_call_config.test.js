import {
  call_input_layout,
  callee_interface,
  pinned_reference,
  remove_call_input,
  with_call_input,
  with_workflow_reference,
  workflow_call_problems,
  workflow_call_result_roots,
} from "./workflow_call_config";
import { result_roots_for } from "./skeleton_result_roots";
import { admit_version_aggregate, PROTOCOL_ERROR } from "./managed_code_sources";
import { forget_workflow_versions, remember_workflow_version, request_workflow_version } from "./workflow_versions";
import { api } from "../../../../SERVICEs/api";
import capture from "./workflow_call_capture.json";

/* Every store answer is the real producer's (workflow_call_capture.json). */
jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const copy = (value) => JSON.parse(JSON.stringify(value));
const row = (name) => {
  const found = capture.rows.find((item) => item.case === name);
  if (!found) throw new Error(`no captured row ${name}`);
  return copy(found);
};
const version = (name) => admit_version_aggregate(row(name).reply).version;
const caller = (name) => row(`caller_${name}_get`).reply.resource.document;
const call_node = (document) => document.nodes.find((node) => node.id === "call");
const REV1 = capture.rev1;
const REV2 = capture.rev2;

beforeEach(() => {
  forget_workflow_versions();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
});

describe("a published revision is admitted whole, as the host answers it", () => {
  test.each(["wf_publish_1", "wf_publish_again_unchanged", "wf_publish_2", "wf_version_1", "wf_version_1_after_2", "wf_version_2"])("%s", (name) => {
    const admitted = admit_version_aggregate(row(name).reply);
    expect(admitted.ok).toBe(true);
    expect(Object.keys(admitted.version).sort()).toEqual(["definition_digest", "dependencies", "document", "ordinal", "revision_id", "workflow_id"]);
  });

  test("the host's measured facts this editor relies on", () => {
    /* Publishing an unchanged draft answers the revision it already has. */
    expect(row("wf_publish_again_unchanged").reply).toEqual(row("wf_publish_1").reply);
    /* A revision is the same bytes after the draft changed and was published again. */
    expect(row("wf_version_1_after_2").reply).toEqual(row("wf_version_1").reply);
    expect(row("wf_publish_2").reply).toEqual(row("wf_version_2").reply);
    /* Revisions are counted, not listed. */
    const listed = row("list_active").reply.find((item) => item.id === "wf-summarize");
    expect(listed.published_revisions).toBe(2);
    expect(Object.keys(listed)).not.toContain("revisions");
  });

  const mutations = [
    ["a resource reply in place of a version", (r) => ({ ...r, schema: "pupu.skeleton-resource.v2" })],
    ["an extra key on the revision", (r) => { r.version.extra = 1; }],
    ["a revision of an Agent", (r) => { r.version.document.kind = "agent"; }],
    ["a revision whose document names another Workflow", (r) => { r.version.document.id = "wf-other"; }],
    ["an ordinal that is not a positive integer", (r) => { r.version.ordinal = 0; }],
    ["a malformed definition digest", (r) => { r.version.definition_digest = "x"; }],
    ["dependencies that are not a list", (r) => { r.version.dependencies = {}; }],
    ["a manifest of another schema", (r) => { r.sources_manifest.schema = "x"; }],
  ];
  test.each(mutations)("refused: %s", (_name, mutate) => {
    const reply = row("wf_version_1").reply;
    const changed = mutate(reply) || reply;
    expect(admit_version_aggregate(changed)).toEqual({ ok: false, error: { code: PROTOCOL_ERROR, path: [], message: expect.any(String) } });
  });
});

describe("what the called Workflow takes and gives, read from its own revision", () => {
  test("its Start's result keys, with the outputs that read them; its End's exports", () => {
    expect(callee_interface(version("wf_version_1").document)).toEqual({
      readable: true,
      inputs: [{ key: "message", read_as: ["text"] }, { key: "limit", read_as: ["n"] }],
      whole: false,
      outputs: ["summary", "count"],
    });
    expect(callee_interface(version("wf_version_2").document).outputs).toEqual(["summary", "count", "echo"]);
  });

  test("the run agrees: the child fails without a key its Start reads, and ignores an extra one", () => {
    expect(row("run_full").reply.outputs).toEqual({ summary: "hi", count: 3 });
    expect(row("run_extra_key").reply.outputs).toEqual({ summary: "hi", count: 3 });
    expect(row("run_missing_limit").refusal.code).toBe("missing_value");
    expect(row("run_wrong_names").refusal.code).toBe("missing_value");
  });

  test("a whole-input read and an unreadable document are said, not guessed", () => {
    const document = version("wf_version_1").document;
    document.nodes[0].config.execution.outputs.push({ name: "all", source: { kind: "result", path: [] } });
    expect(callee_interface(document).whole).toBe(true);
    expect(callee_interface({ nodes: [] })).toEqual({ readable: false, inputs: [], whole: false, outputs: [] });
  });
});

describe("the reference and the rows", () => {
  test("only the runtime's exact shape is a pin", () => {
    expect(pinned_reference(call_node(caller("complete")))).toEqual({ workflow_id: "wf-summarize", revision_id: REV1 });
    ["seed", "workflow_no_revision", "workflow_extra_key", "workflow_empty_id"].forEach((name) => {
      expect(pinned_reference(call_node(caller(name)))).toBeNull();
    });
  });

  test("pinning writes config.workflow of exactly that node and nothing else", () => {
    const document = caller("seed");
    const next = with_workflow_reference(document, "call", { workflow_id: "wf-summarize", revision_id: REV2 });
    expect(call_node(next).config).toEqual({ ...call_node(document).config, workflow: { workflow_id: "wf-summarize", revision_id: REV2 } });
    expect(next.nodes.filter((node) => node.id !== "call")).toEqual(document.nodes.filter((node) => node.id !== "call"));
    expect(with_workflow_reference(document, "kernel", { workflow_id: "x", revision_id: "y" })).toBe(document);
  });

  test("rows follow the callee's keys; rows it does not read are kept apart", () => {
    const shape = callee_interface(version("wf_version_1").document);
    const layout = call_input_layout(shape, call_node(caller("inputs_wrong_names")).config.execution.inputs);
    expect(layout.rows.map((item) => [item.name, item.binding])).toEqual([["message", null], ["limit", null]]);
    expect(layout.extras.map((item) => item.binding.name)).toEqual(["text", "n"]);
  });

  test("a new row lands in the callee's order; an unread name is never created, only removed", () => {
    const document = caller("inputs_missing_one");
    const order = ["message", "limit"];
    const binding = { name: "limit", value: { kind: "literal", value: 3 }, missing: "error" };
    const next = with_call_input(document, "call", "limit", binding, order);
    expect(call_node(next).config.execution.inputs.map((item) => item.name)).toEqual(["message", "limit"]);
    expect(with_call_input(document, "call", "other", { ...binding, name: "other" }, order)).toBe(document);
    const extra = caller("inputs_extra");
    expect(call_node(remove_call_input(extra, "call", 2)).config.execution.inputs.map((item) => item.name)).toEqual(["message", "limit"]);
  });
});

describe("what preflight does not check, said by the panel", () => {
  test("preflight passes a call whose inputs and outputs do not match the revision", () => {
    ["inputs_missing_one", "inputs_wrong_names", "output_undeclared_root", "output_rev2_root_on_rev1"].forEach((name) => {
      expect(row(`caller_${name}_preflight`).reply.preflight.ok).toBe(true);
    });
  });

  test("the panel names each mismatch once the revision has been read", () => {
    remember_workflow_version(version("wf_version_1"));
    const codes = (name) => workflow_call_problems(call_node(caller(name))).map((problem) => problem.code);
    expect(codes("complete")).toEqual([]);
    expect(codes("inputs_missing_one")).toEqual(["input_missing"]);
    expect(codes("inputs_wrong_names")).toEqual(["input_missing", "input_missing"]);
    expect(codes("inputs_extra")).toEqual([]);
    expect(codes("output_undeclared_root")).toEqual(["output_undeclared"]);
    expect(codes("output_rev2_root_on_rev1")).toEqual(["output_undeclared"]);
  });

  test("what preflight does refuse is said too, before Run", () => {
    expect(row("caller_seed_preflight").refusal.code).toBe("missing_field");
    expect(workflow_call_problems(call_node(caller("seed"))).map((p) => p.code)).toEqual(["workflow_missing"]);
    ["workflow_no_revision", "workflow_extra_key", "workflow_empty_id"].forEach((name) => {
      expect(row(`caller_${name}_preflight`).refusal).toBeDefined();
      expect(workflow_call_problems(call_node(caller(name))).map((p) => p.code)).toEqual(["workflow_invalid"]);
    });
    expect(row("caller_on_error_key_preflight").refusal.code).toBe("unknown_field");
    expect(workflow_call_problems(call_node(caller("on_error_key"))).map((p) => p.code)).toEqual(["unknown_setting"]);
  });

  test("a pinned id nobody published is named once the host has said so", async () => {
    const missing = row("wf_version_missing").refusal;
    api.unchain.getManagedSkeletonWorkflowVersion = jest.fn().mockRejectedValue(Object.assign(new Error(missing.message), missing));
    await request_workflow_version("wf-summarize", "rev-9-0000000000000000");
    expect(row("caller_revision_missing_preflight").refusal.code).toBe("resource_missing");
    expect(workflow_call_problems(call_node(caller("revision_missing"))).map((p) => p.code)).toEqual(["revision_missing"]);
  });
});

describe("the Output Variables pick from the revision's End", () => {
  test("unknown until the revision is read, then closed to its exports", () => {
    const node = call_node(caller("complete"));
    expect(result_roots_for(node)).toMatchObject({ known: false, roots: [] });
    remember_workflow_version(version("wf_version_1"));
    expect(result_roots_for(node)).toEqual({ known: true, roots: ["summary", "count"], closed: true, reason: null });
    expect(workflow_call_result_roots(call_node(caller("complete_rev2")))).toMatchObject({ known: false });
  });
});

describe("revisions are read through v2 only, and kept once admitted", () => {
  test("a graph-only host cannot answer; nothing falls back to the v1 read", async () => {
    api.unchain.getSkeletonWorkflowVersion = jest.fn();
    const answer = await request_workflow_version("wf-summarize", REV1);
    expect(answer.status).toBe("unavailable");
    expect(api.unchain.getSkeletonWorkflowVersion).not.toHaveBeenCalled();
  });

  test("an admitted revision is asked once; a refused one is asked again", async () => {
    api.unchain.getManagedSkeletonWorkflowVersion = jest.fn().mockResolvedValue(row("wf_version_1").reply);
    await request_workflow_version("wf-summarize", REV1);
    await request_workflow_version("wf-summarize", REV1);
    expect(api.unchain.getManagedSkeletonWorkflowVersion).toHaveBeenCalledTimes(1);
    expect(api.unchain.getManagedSkeletonWorkflowVersion).toHaveBeenCalledWith("wf-summarize", REV1);
  });

  test("an answer about another revision than the one asked is not kept as it", async () => {
    api.unchain.getManagedSkeletonWorkflowVersion = jest.fn().mockResolvedValue(row("wf_version_2").reply);
    const answer = await request_workflow_version("wf-summarize", REV1);
    expect(answer).toMatchObject({ status: "refused", error: { code: "identity_mismatch" } });
  });
});
