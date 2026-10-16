import {
  CONVERSION_KERNEL_ABSENT,
  CONVERSION_KERNEL_AMBIGUOUS,
  CONVERSION_KERNEL_REFUSED,
  CONVERSION_MODEL_MISMATCH,
  conversion_kernel,
  inline_pool_entries,
  legacy_conversion_plan,
  legacy_entry_declared_model,
  legacy_entry_label,
  legacy_preflight_kernel,
  migrated_agent_nodes,
  profile_holds_model,
} from "./legacy_conversion";
import {
  CAPTURED_EMBEDDED_KERNEL,
  CAPTURED_INLINE_DECLARED_MODEL,
  CAPTURED_INLINE_MODEL_MATCHES,
  CAPTURED_INLINE_PRESERVED_POLICY,
} from "./legacy_conversion_capture";

/* The Kernel a legacy inline subagent is built on.
 *
 * Every verdict asserted here was measured on the fixed installation pair and
 * frozen in `legacy_conversion_capture`; nothing in this file states a rule
 * the runtime was not asked for. */

const PROFILE = {
  id: "openai:gpt-4.1",
  provider: "openai",
  model: "gpt-4.1",
  protocol: "openai-responses",
  endpoint: "https://api.openai.com/v1",
  credential_ref: "openai",
  context_window: 128000,
  output_limit: 4096,
  capabilities: { json_schema: true, images: true, files: true },
};

const kernel = ({ profile, ...rest } = {}) => ({
  schema_version: 1,
  profile: { ...PROFILE, ...(profile || {}) },
  prompt: "You are the parent.",
  max_iterations: 6,
  output_tokens: 2048,
  history: "root",
  overflow: "error",
  json_schema: null,
  ...rest,
});

const inline_entry = (template, prompt_format = "skeleton") => ({
  kind: "inline",
  name: "Shortener",
  prompt_format,
  template,
});

const agent_node = (id, config) => ({ id, type: "agent", config });

const pool_node = (id, entries) => ({
  id,
  type: "subagent_pool",
  config: { legacy_fields: { subagents: entries } },
});

const document_of = (nodes) => ({
  schema_version: 1,
  kind: "agent",
  id: "res-1",
  name: "Reviewer",
  nodes,
  edges: [],
});

/* A migrated Agent, which is what a legacy pool always sits in: its own agent
   node carries `legacy_recipe`, which is also what makes preflight ask for a
   Kernel. */
const migrated = (agent_config, pools = []) =>
  document_of([
    { id: "start", type: "start", config: {} },
    agent_node("a1", { legacy_recipe: { name: "Reviewer" }, ...agent_config }),
    ...pools,
    { id: "end", type: "end", config: {} },
  ]);

describe("the model a legacy inline entry declares", () => {
  it("is kept by both legacy formats, as each of them was asked", () => {
    expect(CAPTURED_INLINE_DECLARED_MODEL.length).toBeGreaterThan(0);
    CAPTURED_INLINE_DECLARED_MODEL.forEach((row) => {
      const declared = legacy_entry_declared_model(
        inline_entry(row.template, row.prompt_format),
      );
      /* The capture states what the store answered, not what the mirror
         reads, so the comparison is composed here: against the profile the
         entry declares, and against a different one. */
      expect(profile_holds_model(declared, row.against_declared)).toBe(
        row.accepted_against_declared,
      );
      expect(profile_holds_model(declared, row.against_other)).toBe(
        row.accepted_against_other,
      );
    });
    /* What the repair changed. A soul-format entry's declared model used to
       be dropped before the runtime saw it, so every profile was accepted;
       now the store converts both formats through the same template IR and
       refuses the one the entry does not declare. */
    const enforced = CAPTURED_INLINE_DECLARED_MODEL.filter(
      (row) => row.prompt_format === "soul" && !row.accepted_against_other,
    );
    expect(enforced.length).toBeGreaterThan(0);
    enforced.forEach((row) => {
      expect(
        legacy_entry_declared_model(inline_entry(row.template, "soul")),
      ).not.toBeNull();
    });
  });

  it("is nothing at all when the entry cannot state one", () => {
    expect(legacy_entry_declared_model(null)).toBeNull();
    expect(legacy_entry_declared_model("inline")).toBeNull();
    expect(legacy_entry_declared_model({ kind: "inline" })).toBeNull();
    expect(
      legacy_entry_declared_model(inline_entry("not an object")),
    ).toBeNull();
    expect(legacy_entry_declared_model(inline_entry({ model: 7 }))).toBeNull();
    expect(legacy_entry_declared_model(inline_entry({ model: null }))).toBeNull();
    expect(
      legacy_entry_declared_model(inline_entry({ model: "gpt-4.1" }, "recipe")),
    ).toBeNull();
    /* A soul entry is only taken as one when its template carries the prompt
       the conversion is to use; without it the store answers `invalid_shape`
       about the entry and never reaches the model. */
    expect(
      legacy_entry_declared_model(inline_entry({ model: "gpt-4.1" }, "soul")),
    ).toBeNull();
    expect(
      legacy_entry_declared_model(
        inline_entry({ prompt: "Be brief.", model: "gpt-4.1" }, "soul"),
      ),
    ).toBe("gpt-4.1");
  });
});

describe("which profile the declared model is", () => {
  it("agrees with the runtime on every captured pair", () => {
    expect(CAPTURED_INLINE_MODEL_MATCHES.length).toBeGreaterThan(0);
    CAPTURED_INLINE_MODEL_MATCHES.forEach((row) => {
      const declared = legacy_entry_declared_model(inline_entry(row.template));
      expect(
        profile_holds_model(declared, {
          provider: row.provider,
          model: row.model,
        }),
      ).toBe(row.accepted);
      /* Accepted means the Agent the store built runs on the profile it was
         handed, which is the other half of the answer: a conversion that was
         admitted onto a different model would be worse than a refused one. */
      if (row.accepted) expect(row.carried_model).toBe(row.model);
    });
  });

  it("refuses what the runtime refuses, and the other way round", () => {
    /* Both directions, because a mirror that is only permissive and a mirror
       that is only strict are both wrong in their own way: one offers a write
       that is refused, the other withholds one that would have worked. */
    const accepted = CAPTURED_INLINE_MODEL_MATCHES.filter((row) => row.accepted);
    const refused = CAPTURED_INLINE_MODEL_MATCHES.filter((row) => !row.accepted);
    expect(accepted.length).toBeGreaterThan(0);
    expect(refused.length).toBeGreaterThan(0);
  });

  it("is not trim(), and the corpus holds the cases that prove it", () => {
    /* The same two character sets as the endpoint rule. `trim()` here is not
       a near-miss: it is wrong in both directions on five of these rows. */
    const trim_declared = (template) => {
      const model = template.model;
      if (typeof model !== "string") return null;
      const trimmed = model.trim();
      return trimmed === "" ? null : trimmed;
    };
    const trim_verdict = (row) => {
      const declared = trim_declared(row.template);
      if (declared === null) return true;
      const value = declared.trim();
      const at = value.indexOf(":");
      if (at === -1) return value === row.model;
      return (
        value.slice(0, at) === row.provider && value.slice(at + 1) === row.model
      );
    };
    const flipped = CAPTURED_INLINE_MODEL_MATCHES.filter(
      (row) => trim_verdict(row) !== row.accepted,
    );
    expect(flipped.length).toBeGreaterThan(0);
    /* Permissive: `trim()` strips the byte order mark the runtime keeps, so
       it would offer a conversion the runtime refuses. */
    expect(
      flipped.filter((row) => trim_verdict(row) === true).length,
    ).toBeGreaterThan(0);
    /* Strict: `trim()` keeps the C1 controls and the NEL that the runtime
       strips, so it would withhold a conversion that would have worked. */
    expect(
      flipped.filter((row) => trim_verdict(row) === false).length,
    ).toBeGreaterThan(0);
    /* Named by their escapes, because the whole point of these five is that
       they cannot be seen. */
    const escaped = (text) =>
      text.replace(
        /[^\x20-\x7e]/g,
        (character) =>
          `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
      );
    expect(
      [...new Set(flipped.map((row) => escaped(row.template.model)))].sort(),
    ).toEqual([
      "\\u001fgpt-4.1",
      "\\u0085gpt-4.1",
      "\\ufeffgpt-4.1",
      "gpt-4.1\\u001f",
      "gpt-4.1\\ufeff",
    ]);
  });

  it("splits on the first colon only, as the runtime does", () => {
    const ollama = { provider: "ollama", model: "llama3:8b" };
    expect(profile_holds_model("ollama:llama3:8b", ollama)).toBe(true);
    /* Bare, the same name is read as provider `llama3` and model `8b`. */
    expect(profile_holds_model("llama3:8b", ollama)).toBe(false);
    expect(profile_holds_model(null, ollama)).toBe(true);
    expect(profile_holds_model("gpt-4.1", null)).toBe(false);
  });
});

describe("what the conversion hands over", () => {
  it("drops the two fields that are not the subagent's", () => {
    const handed = conversion_kernel(CAPTURED_EMBEDDED_KERNEL.supplied);
    expect(handed.prompt).toBe("");
    expect(handed.json_schema).toBeNull();
    /* Everything else is the author's choice and goes over unchanged. */
    expect(handed.profile).toEqual(CAPTURED_EMBEDDED_KERNEL.supplied.profile);
    expect(handed.max_iterations).toBe(
      CAPTURED_EMBEDDED_KERNEL.supplied.max_iterations,
    );
    expect(handed.output_tokens).toBe(
      CAPTURED_EMBEDDED_KERNEL.supplied.output_tokens,
    );
    expect(handed.history).toBe(CAPTURED_EMBEDDED_KERNEL.supplied.history);
    expect(handed.overflow).toBe(CAPTURED_EMBEDDED_KERNEL.supplied.overflow);
  });

  it("drops them because the runtime carries them over verbatim", () => {
    /* The measurement that makes the projection a decision rather than a
       preference: the supplied schema arrives in the built subagent, so one
       left in would be this Agent's output contract imposed on every Agent
       the conversion builds. The prompt is the one field the runtime does
       replace. */
    expect(CAPTURED_EMBEDDED_KERNEL.carried.json_schema).toEqual(
      CAPTURED_EMBEDDED_KERNEL.supplied.json_schema,
    );
    expect(CAPTURED_EMBEDDED_KERNEL.supplied.json_schema).not.toBeNull();
    expect(CAPTURED_EMBEDDED_KERNEL.carried.prompt).toBe(
      CAPTURED_EMBEDDED_KERNEL.legacy_prompt,
    );
    expect(CAPTURED_EMBEDDED_KERNEL.carried.prompt).not.toBe(
      CAPTURED_EMBEDDED_KERNEL.supplied.prompt,
    );
    expect(CAPTURED_EMBEDDED_KERNEL.carried.output_tokens).toBe(
      CAPTURED_EMBEDDED_KERNEL.supplied.output_tokens,
    );
    expect(CAPTURED_EMBEDDED_KERNEL.carried.history).toBe(
      CAPTURED_EMBEDDED_KERNEL.supplied.history,
    );
  });

  it("keeps the policy the panel says it keeps, in both formats", () => {
    /* The panel's two statements — that converting keeps the tools,
       delegation modes, memory and parallel safety each subagent already
       declared — are measured here rather than asserted about the panel's
       own words. `allowed_tools: []` is in the corpus on purpose: the default
       is `null`, which is unrestricted, so a lost restriction would be a
       widened one. */
    const claimed = [
      "allowed_tools",
      "allowed_modes",
      "memory_policy",
      "parallel_safe",
      "output_mode",
    ];
    expect(CAPTURED_INLINE_PRESERVED_POLICY.length).toBe(2);
    CAPTURED_INLINE_PRESERVED_POLICY.forEach((row) => {
      claimed.forEach((key) => {
        expect(row.stored[key]).toEqual(row.declared[key]);
      });
      expect(row.declared.allowed_tools).toEqual([]);
      expect(row.disabled_tools).toEqual(["write"]);
      /* And its own prompt, which is the other half of what the panel
         promises an entry brings with it. */
      expect(row.carried_prompt).toBe("Be brief.");
      /* Not the description: the template IR the store converts through
         carries the policy fields and the model, and the entry's description
         comes from its name. Neither statement names descriptions. */
      expect(row.stored.description).toBe("");
      expect(row.declared.description).not.toBe("");
    });
    expect(
      CAPTURED_INLINE_PRESERVED_POLICY.map((row) => row.prompt_format).sort(),
    ).toEqual(["skeleton", "soul"]);
  });
});

describe("the plan a legacy pool conversion is given", () => {
  it("needs no Kernel when nothing has to be built", () => {
    const plan = legacy_conversion_plan(
      migrated({}, [pool_node("pool", [{ kind: "recipe_ref", recipe_name: "S" }])]),
    );
    expect(plan.required).toBe(false);
    expect(plan.kernel).toBeNull();
    expect(plan.refusal).toBeNull();
  });

  it("hands over the Kernel the author configured, projected", () => {
    const configured = kernel({
      json_schema: {
        type: "object",
        properties: { a: { type: "string" } },
        required: ["a"],
        additionalProperties: false,
      },
    });
    const plan = legacy_conversion_plan(
      migrated({ kernel: configured }, [
        pool_node("pool", [inline_entry({ prompt: "Be brief." })]),
      ]),
    );
    expect(plan.refusal).toBeNull();
    expect(plan.required).toBe(true);
    expect(plan.pools).toEqual(["pool"]);
    expect(plan.kernel).toEqual({ ...configured, prompt: "", json_schema: null });
    expect(plan.chosen).toBe("openai:gpt-4.1");
  });

  it("will not guess a model when none is configured", () => {
    const plan = legacy_conversion_plan(
      migrated({}, [pool_node("pool", [inline_entry({ prompt: "Be brief." })])]),
    );
    expect(plan.required).toBe(true);
    expect(plan.kernel).toBeNull();
    expect(plan.refusal.code).toBe(CONVERSION_KERNEL_ABSENT);
  });

  it("will not pick between two Kernel Loops that disagree", () => {
    const document = document_of([
      agent_node("a1", {
        legacy_recipe: { name: "R" },
        kernel: kernel(),
      }),
      agent_node("a2", {
        kernel: kernel({ profile: { id: "x", provider: "anthropic", model: "claude-x", protocol: "anthropic", endpoint: "https://api.anthropic.com" } }),
      }),
      pool_node("pool", [inline_entry({ prompt: "Be brief." })]),
    ]);
    const plan = legacy_conversion_plan(document);
    expect(plan.refusal.code).toBe(CONVERSION_KERNEL_AMBIGUOUS);
    expect(plan.refusal.nodes).toEqual(["a1", "a2"]);
    expect(plan.kernel).toBeNull();
  });

  it("is not confused by two identical Kernels written differently", () => {
    const first = kernel();
    const second = {
      json_schema: null,
      overflow: "error",
      history: "root",
      output_tokens: 2048,
      max_iterations: 6,
      prompt: "You are the parent.",
      profile: {
        capabilities: { files: true, images: true, json_schema: true },
        output_limit: 4096,
        context_window: 128000,
        credential_ref: "openai",
        endpoint: "https://api.openai.com/v1",
        protocol: "openai-responses",
        model: "gpt-4.1",
        provider: "openai",
        id: "openai:gpt-4.1",
      },
      schema_version: 1,
    };
    const plan = legacy_conversion_plan(
      document_of([
        agent_node("a1", { legacy_recipe: { name: "R" }, kernel: first }),
        agent_node("a2", { kernel: second }),
        pool_node("pool", [inline_entry({ prompt: "Be brief." })]),
      ]),
    );
    expect(plan.refusal).toBeNull();
    expect(plan.kernel.profile.model).toBe("gpt-4.1");
  });

  it("says so when the configured Kernel is not one the runtime would take", () => {
    const plan = legacy_conversion_plan(
      migrated({ kernel: kernel({ temperature: 0.5 }) }, [
        pool_node("pool", [inline_entry({ prompt: "Be brief." })]),
      ]),
    );
    expect(plan.refusal.code).toBe(CONVERSION_KERNEL_REFUSED);
    expect(plan.refusal.problem.code).toBe("unknown_field");
    /* The store reports a faulty supplied Kernel under `legacy_kernel`, and
       so does this, so the address the author is given is the runtime's. */
    expect(plan.refusal.problem.where).toBe("legacy_kernel.temperature");
    expect(plan.kernel).toBeNull();
  });

  it("refuses to move a subagent onto a different model", () => {
    const plan = legacy_conversion_plan(
      migrated({ kernel: kernel() }, [
        pool_node("pool", [
          inline_entry({ prompt: "Be brief.", model: "anthropic:claude-x" }),
          inline_entry({ prompt: "Also brief." }),
        ]),
      ]),
    );
    expect(plan.refusal.code).toBe(CONVERSION_MODEL_MISMATCH);
    expect(plan.refusal.chosen).toBe("openai:gpt-4.1");
    expect(plan.refusal.entries).toEqual([
      { pool_id: "pool", index: 0, name: "Shortener", declared: "anthropic:claude-x" },
    ]);
    expect(plan.kernel).toBeNull();
  });

  it("offers it when the entry declares the model it is being given", () => {
    const plan = legacy_conversion_plan(
      migrated({ kernel: kernel() }, [
        pool_node("pool", [
          inline_entry({ prompt: "Be brief.", model: "openai:gpt-4.1" }),
          inline_entry({ prompt: "Bare.", model: "gpt-4.1" }),
          /* Soul format, declaring the same model: both formats are
             converted through the same template IR now, so this is read and
             compared exactly like the two above. */
          inline_entry({ prompt: "Soul.", model: "openai:gpt-4.1" }, "soul"),
          inline_entry({ prompt: "Declares nothing." }, "soul"),
        ]),
      ]),
    );
    expect(plan.refusal).toBeNull();
    expect(plan.entries.map((entry) => entry.declared)).toEqual([
      "openai:gpt-4.1",
      "gpt-4.1",
      "openai:gpt-4.1",
      null,
    ]);
  });

  it("refuses a soul-format entry that declares another model too", () => {
    /* The entry's prompt format is not the author's business and never
       appears on screen; a conversion that moved this subagent onto another
       model because of it would be the editor's doing, not the runtime's. */
    const plan = legacy_conversion_plan(
      migrated({ kernel: kernel() }, [
        pool_node("pool", [
          inline_entry({ prompt: "Soul.", model: "anthropic:claude-x" }, "soul"),
        ]),
      ]),
    );
    expect(plan.refusal.code).toBe(CONVERSION_MODEL_MISMATCH);
    expect(plan.refusal.entries).toEqual([
      { pool_id: "pool", index: 0, name: "Shortener", declared: "anthropic:claude-x" },
    ]);
    expect(plan.kernel).toBeNull();
  });

  it("asks about every pool in the Agent, not the one in hand", () => {
    const plan = legacy_conversion_plan(
      migrated({ kernel: kernel() }, [
        pool_node("here", [{ kind: "recipe_ref", recipe_name: "S" }]),
        pool_node("elsewhere", [inline_entry({ prompt: "Be brief." })]),
      ]),
    );
    expect(plan.required).toBe(true);
    expect(plan.pools).toEqual(["elsewhere"]);
    expect(plan.entries.map((entry) => entry.pool_id)).toEqual(["elsewhere"]);
    expect(inline_pool_entries(null)).toEqual([]);
  });
});

describe("what preflight is handed", () => {
  it("is nothing for an Agent with no legacy data", () => {
    const modern = document_of([
      agent_node("a1", { kernel: kernel() }),
      pool_node("pool", [{ kind: "recipe_ref", recipe_name: "S" }]),
    ]);
    /* The pool is legacy but holds no inline entry, and no agent node is
       migrated, so the store asks for nothing and neither does this. */
    expect(migrated_agent_nodes(modern)).toEqual([]);
    expect(legacy_preflight_kernel(modern)).toBeNull();
  });

  it("is the Kernel as configured for a migrated Agent", () => {
    const configured = kernel({
      json_schema: {
        type: "object",
        properties: { a: { type: "string" } },
        required: ["a"],
        additionalProperties: false,
      },
    });
    const document = migrated({ kernel: configured });
    expect(migrated_agent_nodes(document)).toEqual(["a1"]);
    /* Not projected. The Kernel goes over as a fallback for whatever has
       none of its own — a node here, or a node of a legacy Agent this one
       references, which is not visible from the renderer — and a node that
       has one keeps it. Dropping a field here would drop it from whatever
       takes the fallback. */
    expect(legacy_preflight_kernel(document)).toEqual(configured);
  });

  it("is nothing when two Kernel Loops disagree, and that is not a refusal", () => {
    /* Measured: a fully configured migrated graph is checked with no
       fallback at all — each node runs on its own Kernel, prompt and
       iteration limit, even when the two name different models. So two
       Kernel Loops that differ no longer stop the check being made. They are
       only a reason there is no single Kernel to hand over, and in a graph
       like this one nothing asks for it. */
    const other = kernel({
      profile: {
        id: "x",
        provider: "anthropic",
        model: "claude-x",
        protocol: "anthropic",
        endpoint: "https://api.anthropic.com/v1/messages",
      },
    });
    const document = document_of([
      agent_node("a1", { legacy_recipe: { name: "R" }, kernel: kernel() }),
      agent_node("a2", { kernel: other }),
    ]);
    expect(migrated_agent_nodes(document)).toEqual(["a1"]);
    expect(legacy_preflight_kernel(document)).toBeNull();
  });

  it("is nothing when the migrated Agent has no Kernel yet", () => {
    expect(legacy_preflight_kernel(migrated({}))).toBeNull();
  });

  it("is the Kernel when only a pool entry needs one", () => {
    /* An inline entry has no Kernel of its own and never will: it is built
       from its legacy data when the check runs, so a configured Agent node
       does not excuse the fallback. Measured — a configured root holding one
       and checked without a Kernel is `legacy_profile_required` at the
       entry's own path, not at `legacy_kernel`. */
    const document = document_of([
      agent_node("a1", { kernel: kernel() }),
      pool_node("pool", [inline_entry({ prompt: "Be brief." })]),
    ]);
    expect(migrated_agent_nodes(document)).toEqual([]);
    expect(legacy_preflight_kernel(document).profile.model).toBe("gpt-4.1");
  });

  it("counts a migrated Agent by what its node holds", () => {
    expect(
      migrated_agent_nodes(
        document_of([agent_node("a1", { legacy_template: { model: null } })]),
      ),
    ).toEqual(["a1"]);
    expect(migrated_agent_nodes(document_of([agent_node("a1", {})]))).toEqual([]);
    expect(migrated_agent_nodes(null)).toEqual([]);
  });
});

describe("what a legacy entry is called", () => {
  it("is what it states, and otherwise what it is", () => {
    expect(legacy_entry_label({ recipe_name: "S" })).toBe("S");
    expect(legacy_entry_label({ template_name: "T" })).toBe("T");
    expect(legacy_entry_label({ kind: "inline", name: "I" })).toBe("I");
    expect(legacy_entry_label({ kind: "inline" })).toBe("an entry with no name");
    expect(legacy_entry_label({ name: { text: "x" } })).toBe(
      "an entry with no name",
    );
    expect(legacy_entry_label(null)).toBe("an entry that is not an object");
  });
});
