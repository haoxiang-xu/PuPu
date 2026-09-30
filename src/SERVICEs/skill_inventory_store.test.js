// skill_inventory_store — renderer-side cache of `GET /skills/inventory`
// (schema `pupu.skill_inventory.v1`, ticket #291 P4). A malformed/partial
// response must never blank out a previously good command set or revision,
// so every validation-failure path here must leave state untouched.
//
// Ticket #291 P5 audit fix: admission is now CLOSED end to end — exactly the
// four top-level keys, a revision matching the real sha256 digest shape, and
// every skills[]/diagnostics[] entry with EXACTLY its CLOSED fields (an
// extra key rejects the whole payload, not just that entry).

const {
  applySkillInventory,
  getLastSkillInventoryRevision,
  getSkillInventorySkills,
  _resetSkillInventoryForTest,
} = require("./skill_inventory_store");

// A valid-shape sha256 digest (64 lowercase hex chars) — the backend's real
// revisions look like this; a bare "sha256:abc" string is no longer valid.
const REV_GOOD = `sha256:${"a".repeat(64)}`;
const REV_FIRST = `sha256:${"1".repeat(64)}`;
const REV_SECOND = `sha256:${"2".repeat(64)}`;
const REV_EMPTY = `sha256:${"0".repeat(64)}`;

const makeEntry = (overrides = {}) => ({
  id: "skillpack.demo::skill-a",
  name: "skill-a",
  description: "desc",
  source: "skillpack",
  source_id: "skillpack.demo",
  aliases: [],
  model_invocable: true,
  user_invocable: true,
  reserved: false,
  ...overrides,
});

const makeDiagnostic = (overrides = {}) => ({
  kind: "shadowed",
  name: "skill-a",
  source: "toolkit",
  source_id: "notion",
  message: "shadowed by a higher-precedence entry",
  ...overrides,
});

const makePayload = (overrides = {}) => ({
  schema: "pupu.skill_inventory.v1",
  revision: REV_GOOD,
  skills: [makeEntry()],
  diagnostics: [],
  ...overrides,
});

describe("skill_inventory_store", () => {
  beforeEach(() => {
    _resetSkillInventoryForTest();
  });

  test("initial state: empty revision and skills", () => {
    expect(getLastSkillInventoryRevision()).toBe("");
    expect(getSkillInventorySkills()).toEqual([]);
  });

  test("applies a valid payload and returns true", () => {
    const applied = applySkillInventory(makePayload(), {
      workspaceRoot: "/tmp/project",
      includeUserDirs: true,
    });

    expect(applied).toBe(true);
    expect(getLastSkillInventoryRevision()).toBe(REV_GOOD);
    expect(getSkillInventorySkills()).toEqual([makeEntry()]);
  });

  test("an empty skills array is a valid payload", () => {
    const applied = applySkillInventory(
      makePayload({ revision: REV_EMPTY, skills: [] }),
    );
    expect(applied).toBe(true);
    expect(getLastSkillInventoryRevision()).toBe(REV_EMPTY);
    expect(getSkillInventorySkills()).toEqual([]);
  });

  test("a payload with diagnostics entries is valid", () => {
    const applied = applySkillInventory(
      makePayload({ diagnostics: [makeDiagnostic(), makeDiagnostic({ name: "skill-b" })] }),
    );
    expect(applied).toBe(true);
  });

  test("defaults context: workspaceRoot '' and includeUserDirs true when omitted", () => {
    const applied = applySkillInventory(makePayload());
    expect(applied).toBe(true);
  });

  describe("rejects and leaves state untouched", () => {
    const primeState = () => {
      applySkillInventory(makePayload({ revision: REV_GOOD }));
      expect(getLastSkillInventoryRevision()).toBe(REV_GOOD);
    };

    test("non-object payload", () => {
      primeState();
      expect(applySkillInventory(null)).toBe(false);
      expect(applySkillInventory(undefined)).toBe(false);
      expect(applySkillInventory("garbage")).toBe(false);
      expect(applySkillInventory(42)).toBe(false);
      expect(applySkillInventory([])).toBe(false);
      expect(getLastSkillInventoryRevision()).toBe(REV_GOOD);
    });

    test("wrong schema", () => {
      primeState();
      expect(
        applySkillInventory(makePayload({ schema: "pupu.skill_inventory.v2" })),
      ).toBe(false);
      expect(getLastSkillInventoryRevision()).toBe(REV_GOOD);
    });

    test("missing/non-string revision", () => {
      primeState();
      expect(applySkillInventory(makePayload({ revision: undefined }))).toBe(
        false,
      );
      expect(applySkillInventory(makePayload({ revision: 123 }))).toBe(false);
      expect(getLastSkillInventoryRevision()).toBe(REV_GOOD);
    });

    test("a revision that does not match the sha256:<64 hex> shape", () => {
      primeState();
      // legacy/loose formats that used to pass when only typeof was checked
      expect(applySkillInventory(makePayload({ revision: "sha256:abc" }))).toBe(
        false,
      );
      expect(applySkillInventory(makePayload({ revision: "anything" }))).toBe(
        false,
      );
      expect(applySkillInventory(makePayload({ revision: "" }))).toBe(false);
      // right length, wrong charset (uppercase hex is not accepted)
      expect(
        applySkillInventory(makePayload({ revision: `sha256:${"A".repeat(64)}` })),
      ).toBe(false);
      // one character short
      expect(
        applySkillInventory(makePayload({ revision: `sha256:${"a".repeat(63)}` })),
      ).toBe(false);
      expect(getLastSkillInventoryRevision()).toBe(REV_GOOD);
    });

    test("skills is not an array", () => {
      primeState();
      expect(applySkillInventory(makePayload({ skills: "not-an-array" }))).toBe(
        false,
      );
      expect(getLastSkillInventoryRevision()).toBe(REV_GOOD);
    });

    test("a skills[] entry missing a CLOSED field", () => {
      primeState();
      const { id, ...missingId } = makeEntry();
      expect(applySkillInventory(makePayload({ skills: [missingId] }))).toBe(
        false,
      );
      expect(getLastSkillInventoryRevision()).toBe(REV_GOOD);
      expect(getSkillInventorySkills()).toEqual([makeEntry()]);
    });

    test("a skills[] entry with an extra/unknown field", () => {
      primeState();
      expect(
        applySkillInventory(
          makePayload({ skills: [{ ...makeEntry(), extra: "nope" }] }),
        ),
      ).toBe(false);
      expect(getLastSkillInventoryRevision()).toBe(REV_GOOD);
    });

    test("a skills[] entry with a wrong-typed field", () => {
      primeState();
      expect(
        applySkillInventory(
          makePayload({ skills: [makeEntry({ user_invocable: "true" })] }),
        ),
      ).toBe(false);
      expect(
        applySkillInventory(
          makePayload({ skills: [makeEntry({ aliases: "not-an-array" })] }),
        ),
      ).toBe(false);
      expect(
        applySkillInventory(
          makePayload({ skills: [makeEntry({ aliases: [1, 2] })] }),
        ),
      ).toBe(false);
      expect(getLastSkillInventoryRevision()).toBe(REV_GOOD);
    });

    test("diagnostics is not an array", () => {
      primeState();
      expect(
        applySkillInventory(makePayload({ diagnostics: "not-an-array" })),
      ).toBe(false);
      expect(getLastSkillInventoryRevision()).toBe(REV_GOOD);
    });

    test("a diagnostics[] entry missing a CLOSED field", () => {
      primeState();
      const { message, ...missingMessage } = makeDiagnostic();
      expect(
        applySkillInventory(makePayload({ diagnostics: [missingMessage] })),
      ).toBe(false);
      expect(getLastSkillInventoryRevision()).toBe(REV_GOOD);
    });

    test("a diagnostics[] entry with an extra/unknown field", () => {
      primeState();
      expect(
        applySkillInventory(
          makePayload({ diagnostics: [{ ...makeDiagnostic(), extra: "nope" }] }),
        ),
      ).toBe(false);
      expect(getLastSkillInventoryRevision()).toBe(REV_GOOD);
    });

    test("a diagnostics[] entry with a wrong-typed field", () => {
      primeState();
      expect(
        applySkillInventory(
          makePayload({ diagnostics: [makeDiagnostic({ kind: 123 })] }),
        ),
      ).toBe(false);
      expect(getLastSkillInventoryRevision()).toBe(REV_GOOD);
    });

    test("a top-level unknown key rejects the whole payload, even alongside otherwise-valid fields", () => {
      primeState();
      // exact repro from the audit: {schema, revision: "anything", skills: [],
      // unknown: "x"} — both the loose revision AND the unknown key should
      // sink it (either alone already would).
      expect(
        applySkillInventory({
          schema: "pupu.skill_inventory.v1",
          revision: "anything",
          skills: [],
          unknown: "x",
        }),
      ).toBe(false);
      expect(getLastSkillInventoryRevision()).toBe(REV_GOOD);
    });

    test("a top-level unknown key rejects an otherwise well-formed payload", () => {
      primeState();
      expect(
        applySkillInventory({ ...makePayload(), extra: "nope" }),
      ).toBe(false);
      expect(getLastSkillInventoryRevision()).toBe(REV_GOOD);
    });

    test("a missing top-level key (diagnostics) rejects the payload", () => {
      primeState();
      const { diagnostics, ...withoutDiagnostics } = makePayload();
      expect(applySkillInventory(withoutDiagnostics)).toBe(false);
      expect(getLastSkillInventoryRevision()).toBe(REV_GOOD);
    });
  });

  test("a later valid payload replaces the earlier one (including workspace/settings context)", () => {
    applySkillInventory(makePayload({ revision: REV_FIRST }), {
      workspaceRoot: "/tmp/a",
      includeUserDirs: true,
    });
    applySkillInventory(
      makePayload({ revision: REV_SECOND, skills: [makeEntry({ name: "b" })] }),
      { workspaceRoot: "/tmp/b", includeUserDirs: false },
    );

    expect(getLastSkillInventoryRevision()).toBe(REV_SECOND);
    expect(getSkillInventorySkills()).toEqual([makeEntry({ name: "b" })]);
  });

  test("_resetSkillInventoryForTest restores the initial state", () => {
    applySkillInventory(makePayload());
    expect(getLastSkillInventoryRevision()).not.toBe("");

    _resetSkillInventoryForTest();

    expect(getLastSkillInventoryRevision()).toBe("");
    expect(getSkillInventorySkills()).toEqual([]);
  });
});
