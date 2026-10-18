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
} from "./skeleton_chat_selection";
import {
  CAPTURED_RENDERER_PAYLOAD,
  ID_ROWS,
  SELECTION_CAPTURE_IDENTITY,
  SELECTION_ROWS,
} from "./skeleton_chat_selection_capture";

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
