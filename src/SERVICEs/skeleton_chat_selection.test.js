/* The producer side of the chat selection, checked against the consumer.
 *
 * Every answer asserted here was measured: `skeleton_chat_selection_capture.js`
 * is the installed runtime's own `prepare_skeleton_chat_selection` answering
 * about the object the real chat page sent (captured by
 * `use_chat_stream.skeleton_selection.test.js`) and about each id spelling, one
 * at a time, on the pinned pair.
 *
 * The point of asking both sides the same inputs is that a mirror which merely
 * resembles the rule is worth nothing. So the id reader is compared to the
 * server's verdict in BOTH directions: nothing it accepts may be refused for
 * its spelling, and nothing it refuses may be accepted.
 */
import {
  SKELETON_CHAT_SELECTION_SCHEMA,
  SKELETON_AGENT_MISSING_REASON,
  SKELETON_AGENT_RUNS_SAVED_DEFINITION,
  skeleton_agent_id,
  skeleton_agent_option_for,
  skeleton_agent_options,
  skeleton_selection_payload,
  skeleton_selection_reason,
  skeleton_selection_resource_id,
} from "./skeleton_chat_selection";
import {
  CAPTURED_RENDERER_PAYLOAD,
  ID_ROWS,
  SELECTION_CAPTURE_IDENTITY,
  SELECTION_ROWS,
} from "./skeleton_chat_selection_capture";
import {
  ADMISSION_ROWS,
  CAPTURED_NO_MODEL_PAYLOAD,
  CAPTURED_STALE_PILL_PAYLOAD,
  DISPATCH_ROWS,
  NO_MODEL_CAPTURE_IDENTITY,
} from "./skeleton_chat_no_model_capture";

const row = (name) => SELECTION_ROWS.find((item) => item.case === name);

describe("the selection the chat sends", () => {
  test("the capture is the pinned pair answering about the page's own payload", () => {
    expect(SELECTION_CAPTURE_IDENTITY.wheel_sha256).toBe(
      SELECTION_CAPTURE_IDENTITY.wheel_sha256_expected,
    );
    expect(SELECTION_CAPTURE_IDENTITY.sidecar_sha256).toBe(
      SELECTION_CAPTURE_IDENTITY.sidecar_sha256_expected,
    );
    expect(SELECTION_CAPTURE_IDENTITY.manifest_digest).toBe(
      SELECTION_CAPTURE_IDENTITY.manifest_digest_expected,
    );
    expect(CAPTURED_RENDERER_PAYLOAD.captured_from).toBe(
      "startStreamV2 bridge argument (renderer side of the IPC hop)",
    );
  });

  test("what the page sent is what this module builds, and the server admits it", () => {
    const sent = CAPTURED_RENDERER_PAYLOAD.options.skeleton_selection;
    expect(skeleton_selection_payload(sent.resource_id)).toEqual(sent);
    expect(sent.schema).toBe(SKELETON_CHAT_SELECTION_SCHEMA);
    expect(CAPTURED_RENDERER_PAYLOAD.options.recipe_name_present).toBe(false);
    /* Admitted, and admitted again for a second message with the same id. */
    expect(row("renderer_payload").admitted).toBe(true);
    expect(row("renderer_payload_twice").admitted).toBe(true);
    expect(row("renderer_payload_twice").frozen.definition_digest).toBe(
      row("renderer_payload").frozen.definition_digest,
    );
    /* The server froze the material itself: a digest and an edit token this
       renderer never assembled. */
    expect(row("renderer_payload").frozen.resource_id).toBe(sent.resource_id);
    expect(row("renderer_payload").frozen.definition_digest).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(row("renderer_payload").frozen.edit_token_present).toBe(true);
  });

  test("the object is closed: a key more or a key less is refused", () => {
    expect([row("extra_field").refused.code, row("extra_field").refused.path]).toEqual([
      "unknown_field",
      ["options", "skeleton_selection"],
    ]);
    expect(row("missing_field").refused.code).toBe("invalid_shape");
    expect(row("other_schema").refused.code).toBe("unsupported_version");
    /* And sending the preflight result instead of an id — the projection this
       renderer deliberately does not build — is refused as the extra keys it
       is. */
    expect(row("projected_preflight").refused.code).toBe("unknown_field");
  });

  test("one identity per request: a Recipe name beside it is refused", () => {
    expect(row("legacy_name_beside_it").refused.code).toBe("invalid_shape");
    /* An EMPTY name is accepted by the contract, and the renderer omits the
       key altogether — both are "no legacy selection", and this records which
       one the producer actually does. */
    expect(row("empty_legacy_name_beside_it").admitted).toBe(true);
    expect(CAPTURED_RENDERER_PAYLOAD.options.recipe_name_present).toBe(false);
  });

  test("the resource has to be an available Agent, and the server says why", () => {
    expect(row("workflow_kind").refused.code).toBe("wrong_kind");
    expect(row("archived_resource").refused.code).toBe("resource_archived");
    expect(row("missing_resource").refused.code).toBe("resource_missing");
    /* A real Agent that cannot run is refused at its own fault, not as a
       selection error. */
    expect(row("preflight_refuses").refused.code).toBe("end_count");
  });

  test("an ordinary chat is not routed into this path at all", () => {
    /* No key, no selection: `prepare_skeleton_chat_selection` returns nothing
       and the legacy Recipe path is untouched. */
    expect(row("no_selection_key").admitted).toBe(false);
    expect(row("no_selection_key").refused).toBeNull();
    expect(row("default_only").admitted).toBe(false);
    expect(row("default_only").refused).toBeNull();
    /* Which is why the producer omits the key rather than sending an empty
       one. */
    expect(skeleton_selection_payload("")).toBeNull();
    expect(skeleton_selection_payload(null)).toBeNull();
    expect(skeleton_selection_payload(undefined)).toBeNull();
  });
});

describe("the id spelling, against the server's own verdict", () => {
  const spelling_refused = (entry) =>
    Boolean(entry.refused) &&
    ["invalid_value", "invalid_type"].includes(entry.refused.code);

  test("every candidate was asked of the server", () => {
    expect(ID_ROWS.length).toBeGreaterThanOrEqual(28);
  });

  test("nothing this reader accepts is refused for its spelling", () => {
    ID_ROWS.forEach((entry) => {
      if (!skeleton_agent_id(entry.id)) return;
      expect([entry.id, spelling_refused(entry)]).toEqual([entry.id, false]);
    });
  });

  test("nothing this reader refuses is accepted by the server", () => {
    ID_ROWS.forEach((entry) => {
      if (skeleton_agent_id(entry.id)) return;
      expect([entry.id, spelling_refused(entry)]).toEqual([entry.id, true]);
    });
  });

  test("the cases a lookalike would get wrong, named", () => {
    /* `_` IS in the charset and `/` is not; a leading punctuation character is
       refused although the same character is legal inside; the limit is 200
       characters and 201 is not; whitespace at either end is not trimmed into
       validity; and a zero-width space is not a letter. Each of these is a
       frozen server answer, not a reading of the regex. */
    const verdict = (id) => {
      const entry = ID_ROWS.find((item) => item.id === id);
      expect(entry).toBeTruthy();
      return spelling_refused(entry) ? "refused" : "ok";
    };
    expect(["a_b", verdict("a_b"), skeleton_agent_id("a_b")]).toEqual([
      "a_b", "ok", "a_b",
    ]);
    expect(["a/b", verdict("a/b"), skeleton_agent_id("a/b")]).toEqual([
      "a/b", "refused", "",
    ]);
    expect(["_a", verdict("_a"), skeleton_agent_id("_a")]).toEqual([
      "_a", "refused", "",
    ]);
    expect(["a ", verdict("a "), skeleton_agent_id("a ")]).toEqual([
      "a ", "refused", "",
    ]);
    expect([verdict("a".repeat(200)), verdict("a".repeat(201))]).toEqual([
      "ok", "refused",
    ]);
    expect([verdict("a​b"), skeleton_agent_id("a​b")]).toEqual([
      "refused", "",
    ]);
    /* And the one that is a real resource id but a loaded word in JavaScript:
       the server refuses `__proto__` and accepts `constructor`, which is why
       nothing here indexes a plain object by an id. */
    expect([verdict("__proto__"), skeleton_agent_id("__proto__")]).toEqual([
      "refused", "",
    ]);
    expect([verdict("constructor"), skeleton_agent_id("constructor")]).toEqual([
      "ok", "constructor",
    ]);
  });

  test("a non-string is not an id", () => {
    [null, undefined, 1, {}, [], true, { toString: () => "a" }].forEach(
      (value) => expect(skeleton_agent_id(value)).toBe(""),
    );
  });
});

describe("which stored resources may be offered as a chat Agent", () => {
  const RESOURCES = [
    { id: "agent-1", kind: "agent", name: "Reviewer", archived: false },
    { id: "wf-1", kind: "workflow", name: "Nightly", archived: false },
    { id: "retired", kind: "agent", name: "Retired", archived: true },
    { id: "unknown-kind", kind: "recipe", name: "Odd", archived: false },
    { id: "no kind at all", name: "Nameless", archived: false },
  ];

  test("declared Agents that are not archived, by id", () => {
    expect(skeleton_agent_options(RESOURCES)).toEqual([
      { id: "agent-1", name: "Reviewer" },
    ]);
    /* The kinds left out are exactly the ones the server refuses: a Workflow
       is `wrong_kind` and an archived record is `resource_archived`. */
    expect(row("workflow_kind").refused.code).toBe("wrong_kind");
    expect(row("archived_resource").refused.code).toBe("resource_archived");
  });

  test("a row whose id the server would refuse is not offered", () => {
    expect(
      skeleton_agent_options([
        { id: "a b", kind: "agent", name: "Spaced", archived: false },
        { id: "", kind: "agent", name: "Empty", archived: false },
        { id: "__proto__", kind: "agent", name: "Loaded", archived: false },
      ]),
    ).toEqual([]);
  });

  test("the name is a label, never the identity", () => {
    /* Two Agents may carry one name, and a legacy Recipe may carry it too.
       Both are offered, separately, and each is addressed by its own id. */
    const twins = skeleton_agent_options([
      { id: "a1", kind: "agent", name: "Reviewer", archived: false },
      { id: "a2", kind: "agent", name: "Reviewer", archived: false },
    ]);
    expect(twins).toEqual([
      { id: "a1", name: "Reviewer" },
      { id: "a2", name: "Reviewer" },
    ]);
    expect(skeleton_selection_payload("a2").resource_id).toBe("a2");
    /* A nameless row falls back to its id rather than to an empty label. */
    expect(
      skeleton_agent_options([{ id: "a3", kind: "agent", archived: false }]),
    ).toEqual([{ id: "a3", name: "a3" }]);
  });

  test("one entry per id, and junk in the list is not a crash", () => {
    expect(
      skeleton_agent_options([
        { id: "a1", kind: "agent", name: "One", archived: false },
        { id: "a1", kind: "agent", name: "One again", archived: false },
        null,
        "a1",
        42,
      ]),
    ).toEqual([{ id: "a1", name: "One" }]);
    expect(skeleton_agent_options(null)).toEqual([]);
    expect(skeleton_agent_options({ id: "a1" })).toEqual([]);
  });

  test("a chat's own id is looked up in the list, not assumed to be in it", () => {
    const options = [{ id: "a1", name: "One" }];
    expect(skeleton_agent_option_for(options, "a1")).toEqual({
      id: "a1",
      name: "One",
    });
    /* Gone from the list is not the same as "run the default": the caller gets
       null and says so. */
    expect(skeleton_agent_option_for(options, "a2")).toBeNull();
    expect(skeleton_agent_option_for(options, "")).toBeNull();
    expect(skeleton_agent_option_for(null, "a1")).toBeNull();
    expect(SKELETON_AGENT_MISSING_REASON).toMatch(/not available/i);
    expect(SKELETON_AGENT_RUNS_SAVED_DEFINITION).toMatch(/saved definition/i);
  });
});

describe("what the chat says when a selection is refused", () => {
  test("every refusal the capture holds has a sentence or keeps the server's", () => {
    const refused = SELECTION_ROWS.filter((item) => item.refused);
    expect(refused.length).toBeGreaterThan(8);
    refused.forEach((item) => {
      /* The server's own message is shown when this module has nothing more
         specific — never an empty string, and never a silent fallback. */
      const mine = skeleton_selection_reason(item.refused.code);
      expect(
        [item.case, Boolean(mine) || Boolean(item.refused.message)],
      ).toEqual([item.case, true]);
    });
  });

  test("the codes the selection owns are worded here", () => {
    ["wrong_kind", "resource_missing", "skeleton_chat_admission_failed",
     "skeleton_chat_execution_unavailable", "skeleton_active_context_required",
     "unsupported_version"].forEach((code) =>
      expect(skeleton_selection_reason(code).length).toBeGreaterThan(10),
    );
    /* Anything else keeps the server's sentence, which is more specific than
       a category of ours would be. */
    expect(skeleton_selection_reason("end_count")).toBe("");
    expect(skeleton_selection_reason("")).toBe("");
    expect(skeleton_selection_reason(null)).toBe("");
    /* Not a prototype lookup: a code named like an inherited member answers
       nothing, rather than a function. */
    expect(skeleton_selection_reason("toString")).toBe("");
    expect(skeleton_selection_reason("constructor")).toBe("");
  });
});

/* ── The premise of lifting the composer's model requirement ───────────────
   The renderer now lets a chat that runs a stored Agent send with no model
   chosen in the composer. That is only correct if the request it then sends
   is one the host accepts, and if the host decides the model from the
   resource rather than from the pill. Both were measured on the pinned pair
   with the page's own payload; this is that answer, frozen. */
describe("a request sent with no model chosen in the composer", () => {
  const admission = (name) =>
    ADMISSION_ROWS.find((item) => item.case === name);

  test("the capture is the pinned pair answering about the page's own payload", () => {
    expect(NO_MODEL_CAPTURE_IDENTITY.wheel_sha256).toBe(
      NO_MODEL_CAPTURE_IDENTITY.wheel_sha256_expected,
    );
    expect(NO_MODEL_CAPTURE_IDENTITY.sidecar_sha256).toBe(
      NO_MODEL_CAPTURE_IDENTITY.sidecar_sha256_expected,
    );
    expect(NO_MODEL_CAPTURE_IDENTITY.manifest_digest).toBe(
      NO_MODEL_CAPTURE_IDENTITY.manifest_digest_expected,
    );
    expect(NO_MODEL_CAPTURE_IDENTITY.captured_payload).toMatch(
      /renderer-payload-no-model\.json$/,
    );
  });

  test("the captured payload really is the one with no model chosen", () => {
    /* Otherwise the rows below would be about some other request: this is
       what the composer sends when its catalog is empty — the placeholder in
       `modelId`, no `model` key, and no Recipe name. */
    const options = CAPTURED_NO_MODEL_PAYLOAD.payload.options;
    expect(options.modelId).toBe("unchain-unset");
    expect("model" in options).toBe(false);
    expect("recipe_name" in options).toBe(false);
    expect(options.skeleton_selection).toEqual({
      schema: SKELETON_CHAT_SELECTION_SCHEMA,
      kind: "resource",
      resource_id: options.skeleton_selection.resource_id,
    });
    expect(skeleton_agent_id(options.skeleton_selection.resource_id)).toBe(
      options.skeleton_selection.resource_id,
    );
  });

  test("the host admitted that whole body, and the pill changed nothing in it", () => {
    const sent = admission("captured_no_model_payload");
    const withPill = admission("same_payload_with_a_pill_model");
    expect(sent.admitted).toBe(true);
    expect(withPill.admitted).toBe(true);
    /* The same frozen material either way: what runs is the resource's saved
       definition, and the composer's model is not part of it. */
    expect(withPill.frozen).toEqual(sent.frozen);
  });

  test("a pill naming a deleted custom provider is admitted the same way", () => {
    /* The residual: the renderer used to refuse to send this at all, because
       the facade completes the composer model's custom provider and that
       provider is gone. The host's answer about the body that now goes out is
       measured, not assumed — and it is the same admitted selection, with the
       stale choice still travelling as the composer's own field. */
    const options = CAPTURED_STALE_PILL_PAYLOAD.payload.options;
    expect(options.modelId).toBe("custom.removed-composer-provider:old-model");
    expect("custom_provider" in options).toBe(false);
    expect("recipe_name" in options).toBe(false);
    const sent = admission("captured_stale_custom_pill_payload");
    expect(sent.admitted).toBe(true);
    expect(sent.frozen.resource_id).toBe(
      options.skeleton_selection.resource_id,
    );
    /* And with no selection that same body is simply not this path's
       business — the composer's model is then all there is, which is why the
       block still belongs to every other chat. */
    expect(
      admission("stale_custom_pill_without_selection").admitted,
    ).toBe(false);
    expect(admission("stale_custom_pill_without_selection").refused).toBeNull();
  });

  test("nothing else about that body was waved through", () => {
    expect(admission("no_model_beside_a_recipe_name").refused.code).toBe(
      "invalid_shape",
    );
    /* And a chat with no selection is not routed into this path at all,
       model or no model. */
    expect(admission("no_model_and_no_selection").admitted).toBe(false);
    expect(admission("no_model_and_no_selection").refused).toBeNull();
  });

  test("the run stops on Skeleton preconditions, never on a missing model", () => {
    /* The branch order is the thing: `stream_chat_events` routes a selection
       into the Skeleton path before it resolves any chat model or recipe. Two
       environments were recorded, neither with an active Context V2 host, so
       both stop — and what they stop on is what matters. */
    expect(DISPATCH_ROWS.length).toBe(2);
    const stops = DISPATCH_ROWS.flatMap((row) => row.stops);
    expect(stops.length).toBe(4);
    stops.forEach((stop) => {
      expect(stop.raised).not.toBeNull();
      expect(stop.events).toEqual([]);
      expect(stop.raised.code).not.toMatch(/model/i);
      expect(stop.raised.message).not.toMatch(/model/i);
    });
    /* The exact codes, so a future change of answer is a red test and not a
       quietly weaker claim. The seeded resource gets as far as the host's own
       environment preconditions; an id the store does not have is refused by
       resolution, which is the control that these runs really reached the
       Skeleton path. */
    expect(
      DISPATCH_ROWS.map((row) => [
        row.options_model_fields.modelId,
        row.options_model_fields.model_present,
        row.stops.map((stop) => stop.raised.code),
      ]),
    ).toEqual([
      [
        "unchain-unset",
        false,
        ["session_execution_guard_unavailable", "resource_missing"],
      ],
      ["unchain-unset", false, ["workspace_unavailable", "resource_missing"]],
    ]);
  });
});

/* ── Reading the selection back out of a request ───────────────────────────
   `api.unchain` has to know whether THIS request runs a stored Agent, because
   its custom-provider completion is about the composer's model and refuses to
   send when that provider is gone. The reader it uses is deliberately strict:
   it recognizes only what the server itself would admit on shape grounds, so a
   malformed `skeleton_selection` cannot switch a composer-side block off.
   Checked against the capture, which is the server's own verdict per row. */
describe("the selection a request carries", () => {
  /* The refusals that are about the selection's SHAPE — the ones the reader
     has to agree with. The others (`wrong_kind`, `resource_archived`,
     `resource_missing`, `end_count`) are about the resource behind a
     well-formed selection: the request does run a stored Agent, and the server
     is the one that says no. */
  const SHAPE_REFUSALS = new Set([
    "unknown_field",
    "invalid_shape",
    "unsupported_version",
    "invalid_value",
  ]);

  test("every captured row agrees with the server on shape", () => {
    expect(SELECTION_ROWS.length).toBeGreaterThan(10);
    const disagreements = SELECTION_ROWS.filter((item) => {
      const refusedForShape = Boolean(
        item.refused && SHAPE_REFUSALS.has(item.refused.code),
      );
      const hasSelection = Object.prototype.hasOwnProperty.call(
        item.options,
        "skeleton_selection",
      );
      const recognized = Boolean(skeleton_selection_resource_id(item.options));
      return recognized !== (hasSelection && !refusedForShape);
    });
    expect(disagreements.map((item) => item.case)).toEqual([]);
  });

  test("the page's own payload is recognized, and nothing near it is", () => {
    expect(
      skeleton_selection_resource_id(CAPTURED_RENDERER_PAYLOAD.options),
    ).toBe(CAPTURED_RENDERER_PAYLOAD.options.skeleton_selection.resource_id);
    expect(skeleton_selection_resource_id(row("extra_field").options)).toBe("");
    expect(skeleton_selection_resource_id(row("missing_field").options)).toBe("");
    expect(skeleton_selection_resource_id(row("other_schema").options)).toBe("");
    expect(skeleton_selection_resource_id(row("untrimmed_id").options)).toBe("");
    expect(
      skeleton_selection_resource_id(row("projected_preflight").options),
    ).toBe("");
    /* A non-empty Recipe name beside it is `invalid_shape` on the server, so
       this is not a request it would run either. An empty one is nothing. */
    expect(
      skeleton_selection_resource_id(row("legacy_name_beside_it").options),
    ).toBe("");
    expect(
      skeleton_selection_resource_id(
        row("empty_legacy_name_beside_it").options,
      ),
    ).toBe(
      row("empty_legacy_name_beside_it").options.skeleton_selection.resource_id,
    );
  });

  test("a well-formed selection for a resource the store refuses is still a selection", () => {
    /* The point of the distinction: these requests DO run a stored Agent, so
       the composer's provider is still not their business — the server refuses
       them for their own reason. */
    ["workflow_kind", "archived_resource", "missing_resource", "preflight_refuses"].forEach(
      (name) => {
        expect(skeleton_selection_resource_id(row(name).options)).toBe(
          row(name).options.skeleton_selection.resource_id,
        );
      },
    );
  });

  test("nothing at all is not a selection", () => {
    expect(skeleton_selection_resource_id(row("no_selection_key").options)).toBe("");
    expect(skeleton_selection_resource_id(row("default_only").options)).toBe("");
    [null, undefined, "", 0, [], { skeleton_selection: null }, { skeleton_selection: [] },
      { skeleton_selection: "research.agent:v2" }].forEach((value) => {
      expect(skeleton_selection_resource_id(value)).toBe("");
    });
  });
});
