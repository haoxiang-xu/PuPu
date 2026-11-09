import fixture from "../../../../../SERVICEs/legacy_upgrade_producer.json";
import { OBSERVATIONS, PHASES, createLegacyUpgradeController } from "./legacy_upgrade_controller";
import { slots_for_inventory } from "./legacy_upgrade_plan";

/* The sitting, driven by the real producer's captures through a fake of the
   facade: inventory, preview and apply answer with what the host actually
   answered for that request, or refuse with the host's actual refusal. Every
   rule BC-473-006/007 names is exercised against those bytes. */

const flat = fixture.cases.flat;
const inventory_payload = (c) => JSON.parse(c.inventory.payload_json);
const preview_payload = (c) => JSON.parse(c.preview.payload_json);
const applied_payload = (c) => JSON.parse(c.applied.payload_json);
const manifest = fixture.capabilities.runtime_manifest.manifest_digest;

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

function services_for(c, overrides = {}) {
  const calls = { capabilities: [], inspect: [], preview: [], apply: [], read: [] };
  const base = {
    capabilities: async () => fixture.capabilities,
    inspect: async (request) => ({ response: c.inventory, payload: inventory_payload(c) }),
    preview: async (request) => ({ response: c.preview, payload: preview_payload(c) }),
    apply: async (request) => ({ response: c.applied, payload: applied_payload(c) }),
    read: async () => ({ ok: true, data: c.saved }),
    configured: () => true,
  };
  const services = { configured: base.configured };
  for (const name of ["capabilities", "inspect", "preview", "apply", "read"]) {
    services[name] = (...args) => { calls[name].push(args[0]); return (overrides[name] || base[name])(...args); };
  }
  return { services, calls };
}

const resource_of = (c) => ({ id: c.before.id, edit_token: c.before.edit_token, document: c.before.document, name: c.before.name });

async function open_and_answer(c, overrides) {
  const { services, calls } = services_for(c, overrides);
  const controller = createLegacyUpgradeController(services);
  await controller.open(resource_of(c));
  const state = controller.current();
  for (const slot of state.slots) {
    if (slot.kind === "kernel") {
      const chosen = c.request.choices.kernels.find((row) => JSON.stringify(row.path) === JSON.stringify(slot.address));
      controller.answer(slot.key, { kernel: chosen.kernel, model_policy: chosen.model_policy, prompt_policy: chosen.prompt_policy, accept_projection: true });
    } else if (slot.kind === "toolkit") {
      const chosen = c.request.choices.toolkits.find((row) => JSON.stringify(row.path) === JSON.stringify(slot.address));
      controller.answer(slot.key, { toolkit_id: chosen.toolkit_id, enabled_tools: chosen.enabled_tools, discard_unsupported: chosen.discard_unsupported });
    }
  }
  return { controller, calls };
}

describe("legacy upgrade controller", () => {
  test("flat: inventory, preview and apply send exactly the producer's accepted requests, in order", async () => {
    const { controller, calls } = await open_and_answer(flat);
    expect(controller.current().phase).toBe(PHASES.READY);
    expect(calls.inspect[0]).toEqual({ resource_id: flat.before.id, schema: "pupu.skeleton-legacy-upgrade.request.v1", expected_edit_token: flat.before.edit_token, expected_runtime_manifest_digest: manifest });
    await controller.preview();
    expect(controller.current().phase).toBe(PHASES.PREVIEWED);
    expect(calls.preview[0]).toEqual(flat.request);
    expect(controller.current().preview.projection_digest).toBe(flat.preview.projection_digest);
    await controller.apply();
    const state = controller.current();
    expect(state.phase).toBe(PHASES.ACKNOWLEDGED);
    expect(calls.apply[0]).toEqual(flat.apply_request);
    expect(state.apply.saved.edit_token).toBe(flat.saved.edit_token);
    expect(state.apply.saved.document).toEqual(flat.saved.document);
    expect(calls.apply).toHaveLength(1);
  });

  test("a changed answer discards the preview and disables apply until a new preview", async () => {
    const { controller, calls } = await open_and_answer(flat);
    await controller.preview();
    const kernel = controller.current().slots.find((slot) => slot.kind === "kernel");
    const before = controller.current().answers[kernel.key];
    controller.answer(kernel.key, { ...before, prompt_policy: "replace" });
    expect(controller.current().phase).toBe(PHASES.READY);
    expect(controller.current().preview).toBe(null);
    await controller.apply();
    expect(calls.apply).toHaveLength(0);
    expect(controller.current().phase).toBe(PHASES.READY);
  });

  test("a preview that answers after the author changed a choice is refused ownership", async () => {
    const gate = deferred();
    const { controller, calls } = await open_and_answer(flat, { preview: () => gate.promise });
    const pending = controller.preview();
    expect(controller.current().phase).toBe(PHASES.PREVIEWING);
    const kernel = controller.current().slots.find((slot) => slot.kind === "kernel");
    controller.answer(kernel.key, { ...controller.current().answers[kernel.key], model_policy: "replace" });
    gate.resolve({ response: flat.preview, payload: preview_payload(flat) });
    await pending;
    expect(controller.current().phase).toBe(PHASES.READY);
    expect(controller.current().preview).toBe(null);
    expect(calls.preview).toHaveLength(1);
  });

  test("closing voids an outstanding preview; nothing lands after it", async () => {
    const gate = deferred();
    const { controller } = await open_and_answer(flat, { preview: () => gate.promise });
    const pending = controller.preview();
    controller.close();
    gate.resolve({ response: flat.preview, payload: preview_payload(flat) });
    await pending;
    expect(controller.current().phase).toBe(PHASES.CLOSED);
    expect(controller.current().preview).toBe(null);
  });

  test("a stale-token refusal at apply is prewrite_refused: answers stay, nothing is retried, a reread restarts at the stored token", async () => {
    const refusal = Object.assign(new Error("Draft changed since it was read"), { code: "edit_conflict", path: ["expected_edit_token"], status: 409 });
    Object.defineProperty(refusal, "legacyUpgrade", { value: Object.freeze({ operation: "apply", resource_id: flat.before.id, expected_edit_token: flat.before.edit_token, expected_runtime_manifest_digest: manifest, expected_projection_digest: flat.preview.projection_digest, outcome: "prewrite_refused" }) });
    const { controller, calls } = await open_and_answer(flat, { apply: async () => { throw refusal; }, read: async () => ({ ok: true, data: { ...flat.before, edit_token: "edit-2-newer" } }) });
    await controller.preview();
    const answers = controller.current().answers;
    await controller.apply();
    const state = controller.current();
    expect(state.phase).toBe(PHASES.PREWRITE_REFUSED);
    expect(state.apply.outcome).toBe("prewrite_refused");
    expect(state.apply.refusal.code).toBe("edit_conflict");
    expect(state.answers).toEqual(answers);
    expect(calls.apply).toHaveLength(1);
    await controller.reinspect();
    expect(calls.read).toHaveLength(1);
    expect(controller.current().phase).toBe(PHASES.READY);
    expect(controller.current().resource.edit_token).toBe("edit-2-newer");
    expect(controller.current().answers).toEqual(answers);
    expect(controller.current().preview).toBe(null);
  });

  test("a stale preview refusal keeps the answers and asks for a new preview", async () => {
    const refusal = Object.assign(new Error("preview again"), { code: "upgrade_preview_stale", path: ["expected_projection_digest"], status: 409 });
    Object.defineProperty(refusal, "legacyUpgrade", { value: Object.freeze({ operation: "apply", outcome: "prewrite_refused" }) });
    const { controller } = await open_and_answer(flat, { apply: async () => { throw refusal; } });
    await controller.preview();
    await controller.apply();
    expect(controller.current().phase).toBe(PHASES.READY);
    expect(controller.current().preview).toBe(null);
    expect(controller.current().problems[0]).toMatchObject({ code: "upgrade_preview_stale", blocking: false });
  });

  test("a timeout is unconfirmed: no retry, the sent request is kept, and one deliberate read is classified honestly", async () => {
    const timeout = Object.assign(new Error("Legacy Agent upgrade result is unconfirmed"), { code: "legacy_upgrade_timeout", path: [], status: null });
    Object.defineProperty(timeout, "legacyUpgrade", { value: Object.freeze({ operation: "apply", outcome: "unconfirmed" }) });
    let read = async () => ({ ok: true, data: flat.before });
    const { controller, calls } = await open_and_answer(flat, { apply: async () => { throw timeout; }, read: (id) => read(id) });
    await controller.preview();
    await controller.apply();
    let state = controller.current();
    expect(state.phase).toBe(PHASES.UNCONFIRMED);
    expect(state.apply.outcome).toBe("unconfirmed");
    expect(state.apply.request).toEqual(flat.apply_request);
    /* Answers are frozen while the outcome is unknown. */
    const kernel = state.slots.find((slot) => slot.kind === "kernel");
    controller.answer(kernel.key, { ...state.answers[kernel.key], model_policy: "replace" });
    expect(controller.current().phase).toBe(PHASES.UNCONFIRMED);
    await controller.apply();
    expect(calls.apply).toHaveLength(1);
    await controller.read_resource();
    expect(controller.current().observation.kind).toBe(OBSERVATIONS.COMMIT_NOT_OBSERVED);
    read = async () => ({ ok: true, data: flat.saved });
    await controller.read_resource();
    expect(controller.current().observation.kind).toBe(OBSERVATIONS.MATCHING);
    read = async () => ({ ok: true, data: { ...flat.saved, document: { ...flat.saved.document, name: "someone else" } } });
    await controller.read_resource();
    expect(controller.current().observation.kind).toBe(OBSERVATIONS.CONFLICTING);
    read = async () => ({ ok: false, reason: "unavailable", error: { code: "bridge_unavailable" } });
    await controller.read_resource();
    expect(controller.current().observation.kind).toBe(OBSERVATIONS.UNAVAILABLE);
    expect(calls.apply).toHaveLength(1);
  });

  test("a success whose saved document differs from the reviewed preview is not presented as success", async () => {
    const { controller } = await open_and_answer(flat, { apply: async () => ({ response: flat.applied, payload: { ...applied_payload(flat), document: { ...applied_payload(flat).document, name: "drifted" } } }) });
    await controller.preview();
    await controller.apply();
    expect(controller.current().phase).toBe(PHASES.UNCONFIRMED);
    expect(controller.current().apply.refusal.code).toBe("applied_document_mismatch");
  });

  test("a preview refusal naming a Kernel becomes a row at that address; an unused choice drops that category", async () => {
    let refuse = Object.assign(new Error("Choose a Kernel for this legacy Agent"), { code: "kernel_choice_required", path: ["nodes", 4, "config", "legacy_fields", "subagents", 0], status: 400 });
    const { controller } = await open_and_answer(flat, { preview: async () => { throw refuse; } });
    await controller.preview();
    let state = controller.current();
    expect(state.phase).toBe(PHASES.READY);
    expect(state.slots.some((slot) => slot.kind === "kernel" && JSON.stringify(slot.address) === JSON.stringify(["nodes", 4, "config", "legacy_fields", "subagents", 0]))).toBe(true);
    expect(state.problems[0]).toMatchObject({ code: "kernel_choice_required", blocking: false });
    expect(controller.choices().ok).toBe(false);
    refuse = Object.assign(new Error("unused"), { code: "unused_choice", path: ["choices", "kernels"], status: 400 });
    const inline = state.slots.find((slot) => slot.kind === "kernel" && slot.address.length > 2);
    controller.answer(inline.key, { kernel: flat.request.choices.kernels[0].kernel, model_policy: "preserve", prompt_policy: "preserve", accept_projection: true });
    await controller.preview();
    state = controller.current();
    expect(Object.keys(state.answers).filter((key) => key.startsWith("kernel:"))).toHaveLength(0);
    expect(state.problems[0]).toMatchObject({ code: "unused_choice", blocking: false });
  });

  test("a host without capabilities or an inventory refusal is unavailable, not guessed", async () => {
    const a = createLegacyUpgradeController(services_for(flat, { capabilities: async () => { throw Object.assign(new Error("no bridge"), { code: "bridge_unavailable" }); } }).services);
    await a.open(resource_of(flat));
    expect(a.current().phase).toBe(PHASES.UNAVAILABLE);
    const b = createLegacyUpgradeController(services_for(flat, { inspect: async () => { throw Object.assign(new Error("already"), { code: "legacy_upgrade_already_applied", status: 409 }); } }).services);
    await b.open(resource_of(flat));
    expect(b.current().phase).toBe(PHASES.PREWRITE_REFUSED);
    expect(b.current().error.code).toBe("legacy_upgrade_already_applied");
  });

  test("a native draft needs no decision", async () => {
    const native = { ...inventory_payload(flat), state: "native_draft", requirements: [] };
    const { services } = services_for(flat, { inspect: async () => ({ response: flat.inventory, payload: native }) });
    const controller = createLegacyUpgradeController(services);
    await controller.open(resource_of(flat));
    expect(controller.current().phase).toBe(PHASES.READY);
    expect(controller.current().slots).toEqual([]);
  });

  test("the default case rebuilds its slots from the inventory the controller stored", async () => {
    const c = fixture.cases.default;
    const { controller } = await open_and_answer(c);
    expect(controller.current().slots.map((slot) => slot.kind).sort()).toEqual(slots_for_inventory(inventory_payload(c).requirements).slots.map((slot) => slot.kind).sort());
    /* The two prompt-review acknowledgements the inventory listed are not in
       the producer's accepted request, so for this capture they stay missing
       until the author ticks them; the host's own answer decides whether an
       acknowledgement was needed. */
    expect(controller.choices().missing.every((key) => key.startsWith("ack:"))).toBe(true);
  });
});
