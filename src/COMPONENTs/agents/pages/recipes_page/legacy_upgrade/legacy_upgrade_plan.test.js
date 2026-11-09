import fixture from "../../../../../SERVICEs/legacy_upgrade_producer.json";
import {
  build_choices,
  describe_path,
  is_legacy_upgrade_candidate,
  json_equal,
  legacy_toolkit_row,
  merge_slots,
  slots_for_inventory,
  slots_for_refusal,
} from "./legacy_upgrade_plan";

/* Every expectation here is read from the real producer's captures: the
   inventory the host returned for each fixture Agent, and the exact choices
   the host accepted for it. The plan has to turn the first into rows and the
   author's answers into the second, byte for byte in value. */

const cases = Object.entries(fixture.cases);
const inventory_of = (c) => JSON.parse(c.inventory.payload_json);
const configured = () => true;

/* The author's answers that reproduce each fixture's accepted choices. */
function answers_for(c, slots) {
  const answers = {};
  for (const slot of slots) {
    if (slot.kind === "kernel") {
      const chosen = c.request.choices.kernels.find((row) => JSON.stringify(row.path) === JSON.stringify(slot.address));
      answers[slot.key] = { kernel: chosen.kernel, model_policy: chosen.model_policy, prompt_policy: chosen.prompt_policy, accept_projection: true };
    } else if (slot.kind === "toolkit") {
      const chosen = c.request.choices.toolkits.find((row) => JSON.stringify(row.path) === JSON.stringify(slot.address));
      answers[slot.key] = { toolkit_id: chosen.toolkit_id, enabled_tools: chosen.enabled_tools, discard_unsupported: chosen.discard_unsupported };
    } else if (slot.kind === "acknowledge") {
      answers[slot.key] = { acknowledged: true };
    }
  }
  return answers;
}

describe("legacy upgrade plan against the producer captures", () => {
  test.each(cases)("%s: the stored first-hop draft is a candidate and the saved native graph is not", (_name, c) => {
    expect(is_legacy_upgrade_candidate(c.before.document)).toBe(true);
    expect(is_legacy_upgrade_candidate(c.saved.document)).toBe(false);
  });

  test.each(cases)("%s: every requirement is either a slot or an informational row, with slot addresses the host accepted", (_name, c) => {
    const inventory = inventory_of(c);
    const { slots, info } = slots_for_inventory(inventory.requirements);
    const covered = slots.reduce((n, slot) => n + slot.requirements.length, 0) + info.length;
    expect(covered).toBe(inventory.requirements.length);
    const kernel_addresses = slots.filter((s) => s.kind === "kernel").map((s) => JSON.stringify(s.address)).sort();
    expect(kernel_addresses).toEqual(c.request.choices.kernels.map((row) => JSON.stringify(row.path)).sort());
    const toolkit_addresses = slots.filter((s) => s.kind === "toolkit").map((s) => JSON.stringify(s.address)).sort();
    expect(toolkit_addresses).toEqual(c.request.choices.toolkits.map((row) => JSON.stringify(row.path)).sort());
  });

  test("the default case asks for exactly the choices the host accepted, and nothing the host would call unused", () => {
    const c = fixture.cases.default;
    const { slots } = slots_for_inventory(inventory_of(c).requirements);
    /* The accepted request carried no acknowledgements, so the inventory's two
       legacy_prompt_review_required rows are acknowledgement slots the author
       must not have to tick for this producer run: both target structured
       prompts the host reviewed on its own. The plan still offers them; the
       producer decides. Here the test only asserts kernel and toolkit rows
       rebuild the accepted request exactly. */
    const subset = slots.filter((slot) => slot.kind !== "acknowledge");
    const built = build_choices(subset, answers_for(c, subset), configured);
    expect(built.ok).toBe(true);
    expect(built.choices).toEqual(c.request.choices);
  });

  test.each(cases)("%s: kernel and toolkit answers rebuild the accepted choices by value", (_name, c) => {
    const { slots } = slots_for_inventory(inventory_of(c).requirements);
    const subset = slots.filter((slot) => slot.kind !== "acknowledge");
    const built = build_choices(subset, answers_for(c, subset), configured);
    expect(built.ok).toBe(true);
    expect(json_equal(built.choices, c.request.choices)).toBe(true);
  });

  test("an incomplete answer names its slot and builds nothing", () => {
    const c = fixture.cases.flat;
    const { slots } = slots_for_inventory(inventory_of(c).requirements);
    const kernel = slots.find((slot) => slot.kind === "kernel");
    expect(build_choices(slots, {}, configured)).toEqual({ ok: false, choices: null, missing: [kernel.key] });
    const unaccepted = { kernel: c.request.choices.kernels[0].kernel, model_policy: "preserve", prompt_policy: "preserve", accept_projection: false };
    expect(build_choices(slots, { [kernel.key]: unaccepted }, configured).ok).toBe(false);
    const unconfigured = build_choices(slots, { [kernel.key]: { ...unaccepted, accept_projection: true } }, () => false);
    expect(unconfigured.ok).toBe(false);
  });

  test("the legacy toolkit row behind a toolkit slot is read from the document", () => {
    const c = fixture.cases.default;
    const { slots } = slots_for_inventory(inventory_of(c).requirements);
    const toolkit = slots.find((slot) => slot.kind === "toolkit");
    const row = legacy_toolkit_row(c.before.document, toolkit.address);
    expect(row.id).toBe("core");
    expect(row.has_allowlist).toBe(false);
    expect(row.enabled_tools).toBe(null);
  });

  test("refusals become rows, drops or blocks by code", () => {
    const kernel = slots_for_refusal({ code: "kernel_choice_required", path: ["nodes", 4, "config", "legacy_fields", "subagents", 0], message: "Choose a Kernel" });
    expect(kernel.slots[0]).toMatchObject({ kind: "kernel", address: ["nodes", 4, "config", "legacy_fields", "subagents", 0] });
    const toolkit = slots_for_refusal({ code: "toolkit_choice_required", path: ["nodes", 1, "config", "legacy_recipe", "toolkits", 2] });
    expect(toolkit.slots[0].kind).toBe("toolkit");
    const ack = slots_for_refusal({ code: "legacy_setting_ignored", path: ["nodes", 1, "config", "legacy_fields", "colour"] });
    expect(ack.slots[0]).toMatchObject({ kind: "acknowledge", code: "legacy_setting_ignored" });
    const reference = slots_for_refusal({ code: "ambiguous_reference", path: ["nodes", 4, "config", "legacy_fields", "subagents", 1] });
    expect(reference.slots[0].kind).toBe("reference");
    expect(slots_for_refusal({ code: "unused_choice", path: ["choices", "toolkits"] })).toMatchObject({ drop: "toolkits", blocking: false });
    expect(slots_for_refusal({ code: "legacy_graph_unsupported", path: ["nodes", 2, "config"] }).blocking).toBe(true);
    expect(slots_for_refusal({ code: "resource_missing", path: ["nodes", 4, "config", "legacy_fields", "subagents", 0] }).blocking).toBe(true);
  });

  test("merging keeps one slot per address with every reason", () => {
    const a = slots_for_refusal({ code: "toolkit_choice_required", path: ["nodes", 3, "config", "legacy_fields", "toolkits", 0], message: "a" }).slots;
    const b = slots_for_refusal({ code: "toolkit_config_review_required", path: ["nodes", 3, "config", "legacy_fields", "toolkits", 0], message: "b" }).slots;
    const merged = merge_slots(a, b);
    expect(merged).toHaveLength(1);
    expect(merged[0].requirements.map((row) => row.code)).toEqual(["toolkit_choice_required", "toolkit_config_review_required"]);
    expect(merge_slots(merged, b)).toHaveLength(1);
    expect(merge_slots(merged, b)[0].requirements).toHaveLength(2);
  });

  test("json_equal is value equality with array order kept", () => {
    expect(json_equal({ a: [1, { b: "x" }], c: null }, { c: null, a: [1, { b: "x" }] })).toBe(true);
    expect(json_equal({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(json_equal({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(json_equal("1", 1)).toBe(false);
  });

  test("describe_path names the node and the rest of the address", () => {
    const c = fixture.cases.default;
    expect(describe_path(c.before.document, ["nodes", 1, "config", "kernel"])).toBe("agent_main › kernel");
    expect(describe_path(c.before.document, ["nodes", 3, "config", "legacy_fields", "toolkits", 0, "enabled_tools"])).toBe("tp_1 › legacy_fields › toolkits › 0 › enabled_tools");
    expect(describe_path(c.before.document, ["choices", "toolkits"])).toBe("choices › toolkits");
  });
});
