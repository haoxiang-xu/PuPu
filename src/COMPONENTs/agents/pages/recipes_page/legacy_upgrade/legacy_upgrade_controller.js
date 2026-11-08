/* The upgrade conversation with the host, as one sitting (#473 CP2, BC-473-006/007).
 *
 * Every request is numbered and owned: the resource it was about, the token
 * the author read, and the generation of the form when it left. An answer is
 * accepted only if all three still hold, so a preview that returns after the
 * author changed a choice, closed the form or opened another Agent lands
 * nowhere. Apply sends exactly the frozen choices and projection digest of the
 * preview the author looked at — never the live form. A failed apply is one of
 * two things and nothing else: a refusal the host proved was before any write
 * (`prewrite_refused`, read from the facade's local metadata), or
 * `unconfirmed`, which is reported as unknown and is never retried, replaced
 * or reread into a success on the author's behalf. */

import {
  REQUEST_SCHEMA,
  build_choices,
  clone,
  json_equal,
  merge_slots,
  slots_for_inventory,
  slots_for_refusal,
} from "./legacy_upgrade_plan";

export const PHASES = Object.freeze({
  CLOSED: "closed",
  LOADING: "loading",
  READY: "ready",
  NATIVE: "native_draft",
  PREVIEWING: "previewing",
  PREVIEWED: "previewed",
  APPLYING: "applying",
  ACKNOWLEDGED: "acknowledged",
  PREWRITE_REFUSED: "prewrite_refused",
  UNCONFIRMED: "unconfirmed",
  READING: "reading",
  UNAVAILABLE: "unavailable",
});

/* After an unconfirmed apply, what one deliberate read of the same resource
   showed. None of these is a receipt for the apply that timed out. */
export const OBSERVATIONS = Object.freeze({
  COMMIT_NOT_OBSERVED: "commit_not_observed",
  MATCHING: "matching_resource_observed",
  CONFLICTING: "conflicting_resource_observed",
  UNAVAILABLE: "unavailable",
});

const is_object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

export function empty_state() {
  return {
    phase: PHASES.CLOSED,
    resource: null,
    manifest_digest: null,
    inventory: null,
    info: [],
    slots: [],
    answers: {},
    generation: 0,
    preview: null,
    problems: [],
    apply: null,
    observation: null,
    error: null,
  };
}

function refusal_of(error) {
  if (!is_object(error)) return { code: "unknown", path: [], message: String(error || "The host did not answer") };
  return {
    code: typeof error.code === "string" ? error.code : "unknown",
    path: Array.isArray(error.path) ? [...error.path] : [],
    message: typeof error.message === "string" ? error.message : "",
    status: Number.isInteger(error.status) ? error.status : null,
  };
}

/* `services` is the one seam: `capabilities()`, `inspect(request)`,
 * `preview(request)`, `apply(request)` return the facade's `{response,
 * payload}` or throw its error; `read(resource_id)` returns `{ok, data}` the
 * way the resource adapter does; `configured(kernel)` says whether a Kernel
 * answer is complete. */
export function createLegacyUpgradeController(services) {
  let state = empty_state();
  let ticket = 0;
  const listeners = new Set();
  const notify = () => { for (const listener of listeners) listener(state); };
  const set = (patch) => { state = { ...state, ...patch }; notify(); return state; };
  const current = () => state;
  const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
  const configured = typeof services.configured === "function" ? services.configured : () => true;

  const owns = (mine, resource, generation) =>
    ticket === mine && state.resource && resource && state.resource.id === resource.id
    && state.resource.edit_token === resource.edit_token && (generation === undefined || state.generation === generation);

  const request_for = (resource, extra = {}) => ({
    resource_id: resource.id,
    schema: REQUEST_SCHEMA,
    expected_edit_token: resource.edit_token,
    expected_runtime_manifest_digest: state.manifest_digest,
    ...extra,
  });

  /* Opening is a read-only inventory of the resource as the author has it:
     id, token and document. The runtime manifest is read first because every
     request names it, and a host whose manifest cannot be read is unavailable
     rather than guessed. */
  async function open(resource, { keep_answers = false } = {}) {
    const mine = ++ticket;
    const answers = keep_answers ? state.answers : {};
    set({ ...empty_state(), phase: PHASES.LOADING, resource: { id: resource.id, edit_token: resource.edit_token, document: clone(resource.document), name: resource.name || "" }, answers, generation: state.generation + 1 });
    let capabilities;
    try { capabilities = await services.capabilities(); } catch (error) {
      if (ticket !== mine) return state;
      return set({ phase: PHASES.UNAVAILABLE, error: refusal_of(error) });
    }
    if (ticket !== mine) return state;
    const digest = capabilities && capabilities.runtime_manifest && capabilities.runtime_manifest.manifest_digest;
    if (typeof digest !== "string") return set({ phase: PHASES.UNAVAILABLE, error: { code: "capabilities_unreadable", path: [], message: "The host did not name its runtime." } });
    set({ manifest_digest: digest });
    let result;
    try { result = await services.inspect(request_for(state.resource)); } catch (error) {
      if (!owns(mine, resource)) return state;
      const refusal = refusal_of(error);
      return set({ phase: refusal.code === "legacy_upgrade_already_applied" || refusal.code === "edit_conflict" ? PHASES.PREWRITE_REFUSED : PHASES.UNAVAILABLE, error: refusal });
    }
    if (!owns(mine, resource)) return state;
    const payload = result && result.payload;
    const { slots, info } = slots_for_inventory(payload && payload.requirements);
    return set({
      phase: payload && payload.state === "native_draft" ? PHASES.NATIVE : PHASES.READY,
      inventory: payload || null,
      slots,
      info,
      preview: null,
      problems: [],
      apply: null,
      observation: null,
      error: null,
    });
  }

  /* Any change of any answer is a new generation: the preview on screen was
     about choices that no longer exist, so it goes, and an apply that was
     enabled by it is not. An unconfirmed apply freezes the form instead — the
     host may still be writing what the author sent. */
  function answer(key, value) {
    if (![PHASES.READY, PHASES.PREVIEWING, PHASES.PREVIEWED, PHASES.PREWRITE_REFUSED].includes(state.phase)) return state;
    if (!state.slots.some((slot) => slot.key === key)) return state;
    ticket += 1;
    const answers = { ...state.answers, [key]: clone(value) };
    return set({ answers, generation: state.generation + 1, preview: null, problems: [], phase: PHASES.READY, apply: null, error: null });
  }

  function choices() {
    return build_choices(state.slots, state.answers, configured);
  }

  async function preview() {
    if (![PHASES.READY, PHASES.PREVIEWED].includes(state.phase)) return state;
    const built = choices();
    if (!built.ok) return state;
    const mine = ++ticket;
    const resource = state.resource;
    const generation = state.generation;
    const frozen = clone(built.choices);
    set({ phase: PHASES.PREVIEWING, preview: null, problems: [], apply: null, error: null });
    let result;
    try { result = await services.preview(request_for(resource, { choices: clone(frozen) })); } catch (error) {
      if (!owns(mine, resource, generation)) return state;
      return set({ phase: PHASES.READY, ...absorb_refusal(error) });
    }
    if (!owns(mine, resource, generation)) return state;
    const payload = result.payload;
    return set({
      phase: PHASES.PREVIEWED,
      preview: { generation, choices: frozen, response: result.response, payload, projection_digest: result.response.projection_digest },
      problems: [],
    });
  }

  /* A refusal is read into the form: new rows for what it asks, dropped
     answers for what it says is unused, and the host's own words either way. */
  function absorb_refusal(error) {
    const refusal = refusal_of(error);
    const read = slots_for_refusal(refusal);
    const patch = { problems: [{ ...refusal, blocking: read.blocking }] };
    if (read.slots.length > 0) patch.slots = merge_slots(state.slots, read.slots);
    if (read.drop) {
      const keep = {};
      for (const [key, value] of Object.entries(state.answers)) {
        const slot = state.slots.find((item) => item.key === key);
        const category = slot ? { kernel: "kernels", toolkit: "toolkits", reference: "references", acknowledge: "acknowledged" }[slot.kind] : null;
        if (slot && (read.drop === "all" || category !== read.drop)) keep[key] = value;
      }
      patch.answers = keep;
      patch.generation = state.generation + 1;
    }
    return patch;
  }

  /* Exactly the reviewed preview: its frozen choices and its projection
     digest, against the token the inventory was read at. */
  async function apply() {
    if (state.phase !== PHASES.PREVIEWED || !state.preview || state.preview.generation !== state.generation) return state;
    const mine = ++ticket;
    const resource = state.resource;
    const generation = state.generation;
    const reviewed = state.preview;
    const request = request_for(resource, { choices: clone(reviewed.choices), expected_projection_digest: reviewed.projection_digest });
    set({ phase: PHASES.APPLYING, apply: { request: clone(request), outcome: "submitting" }, error: null });
    let result;
    try { result = await services.apply(request); } catch (error) {
      if (!owns(mine, resource, generation)) return state;
      const refusal = refusal_of(error);
      const meta = is_object(error) && is_object(error.legacyUpgrade) ? error.legacyUpgrade : null;
      const outcome = meta && meta.outcome === "prewrite_refused" ? "prewrite_refused" : "unconfirmed";
      if (outcome === "prewrite_refused") {
        /* Proven not written. The author's choices stay; what changes is only
           what the code says: a stale preview asks for a new preview, a stale
           token asks for a fresh inventory, an already-upgraded resource is
           done without this sitting. */
        const patch = refusal.code === "upgrade_preview_stale" || refusal.code === "legacy_dependency_upgrade_required"
          ? { phase: PHASES.READY, preview: null, problems: [{ ...refusal, blocking: refusal.code !== "upgrade_preview_stale" }] }
          : { phase: PHASES.PREWRITE_REFUSED, preview: null, problems: [] };
        return set({ ...patch, apply: { request: clone(request), outcome, refusal, metadata: { ...meta } }, error: refusal });
      }
      return set({ phase: PHASES.UNCONFIRMED, apply: { request: clone(request), outcome, refusal, metadata: meta ? { ...meta } : null }, observation: null, error: refusal });
    }
    if (!owns(mine, resource, generation)) return state;
    const saved = result.payload;
    /* The validated success already proved identity and a changed token; the
       document the host says it saved must be the one the author reviewed,
       by value. A mismatch is not a success to present. */
    if (!json_equal(saved.document, reviewed.payload.document)) {
      return set({ phase: PHASES.UNCONFIRMED, apply: { request: clone(request), outcome: "unconfirmed", refusal: { code: "applied_document_mismatch", path: ["document"], message: "The host saved a document that is not the reviewed preview." }, metadata: null }, observation: null, error: null });
    }
    return set({ phase: PHASES.ACKNOWLEDGED, apply: { request: clone(request), outcome: "acknowledged", saved, response: result.response }, error: null });
  }

  /* One deliberate read of the same resource, after an unconfirmed apply.
     The old token still there means the commit was not observed at this
     read, not that it will never happen. The reviewed document at a new token
     is a matching resource — not proof this invocation wrote it. Anything
     else is a conflicting resource and the author's inputs stay as they are. */
  async function read_resource() {
    if (state.phase !== PHASES.UNCONFIRMED) return state;
    const mine = ++ticket;
    const resource = state.resource;
    const reviewed = state.preview;
    set({ phase: PHASES.READING });
    const result = await services.read(resource.id);
    if (ticket !== mine || !state.resource || state.resource.id !== resource.id) return state;
    let observation;
    if (!result || !result.ok) observation = { kind: OBSERVATIONS.UNAVAILABLE, error: result && result.error ? refusal_of(result.error) : null };
    else {
      const data = result.data || {};
      if (data.edit_token === resource.edit_token) observation = { kind: OBSERVATIONS.COMMIT_NOT_OBSERVED, edit_token: data.edit_token };
      else if (reviewed && json_equal(data.document, reviewed.payload.document)) observation = { kind: OBSERVATIONS.MATCHING, edit_token: data.edit_token };
      else observation = { kind: OBSERVATIONS.CONFLICTING, edit_token: data.edit_token };
    }
    return set({ phase: PHASES.UNCONFIRMED, observation });
  }

  /* Starting over at the token the store has now, keeping what the author
     already decided. Used after a stale-token refusal, and after an
     unconfirmed apply whose read showed the old token. */
  async function reinspect() {
    const resource = state.resource;
    if (!resource) return state;
    const mine = ++ticket;
    const result = await services.read(resource.id);
    if (ticket !== mine) return state;
    if (!result || !result.ok) return set({ phase: PHASES.UNAVAILABLE, error: result && result.error ? refusal_of(result.error) : { code: "read_failed", path: [], message: "The resource could not be read." } });
    return open({ id: result.data.id, edit_token: result.data.edit_token, document: result.data.document, name: result.data.name }, { keep_answers: true });
  }

  function close() {
    ticket += 1;
    state = empty_state();
    notify();
    return state;
  }

  return { subscribe, current, open, answer, choices, preview, apply, read_resource, reinspect, close };
}
