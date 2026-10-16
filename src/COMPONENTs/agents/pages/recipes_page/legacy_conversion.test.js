import {
  CONVERSION_KERNEL_ABSENT,
  CONVERSION_KERNEL_AMBIGUOUS,
  CONVERSION_KERNEL_REFUSED,
  CONVERSION_MODEL_MISMATCH,
  CONVERSION_OWNER_REQUIRED,
  inline_pool_entries,
  legacy_conversion_plan,
  legacy_entry_declared_model,
  legacy_entry_label,
  plan_for_pool,
  pool_child_kernel,
  pool_owner_nodes,
  profile_holds_model,
} from "./legacy_conversion";
import { kernel_where } from "./kernel_config";
import {
  CAPTURED_CHILD_KERNEL,
  CAPTURED_INLINE_DECLARED_MODEL,
  CAPTURED_INLINE_MODEL_MATCHES,
  CAPTURED_INLINE_PRESERVED_POLICY,
  CAPTURED_POOL_OWNER_ADMISSION,
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

const OTHER_PROFILE = {
  id: "anthropic:claude-x",
  provider: "anthropic",
  model: "claude-x",
  protocol: "anthropic",
  endpoint: "https://api.anthropic.com/v1/messages",
  credential_ref: "anthropic",
};

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

/* A pool is attached to the Agent node whose subagents it holds, and the
   runtime reads the edge in either direction. */
const attach = (pool_id, owner_id, flipped = false) => ({
  id: `${pool_id}-${owner_id}`,
  kind: "attach",
  source_node_id: flipped ? owner_id : pool_id,
  source_port_id: flipped ? "attach_bot" : "attach_top",
  target_node_id: flipped ? pool_id : owner_id,
  target_port_id: flipped ? "attach_top" : "attach_bot",
});

const document_of = (nodes, edges = []) => ({
  schema_version: 1,
  kind: "agent",
  id: "res-1",
  name: "Reviewer",
  nodes,
  edges,
});

/* A migrated Agent, which is what a legacy pool always sits in: its own agent
   node carries `legacy_recipe`, and the pool it came with is attached to that
   node — which is where the model its subagents are built on is configured. */
const migrated = (agent_config, pools = []) =>
  document_of(
    [
      { id: "start", type: "start", config: {} },
      agent_node("a1", { legacy_recipe: { name: "Reviewer" }, ...agent_config }),
      ...pools,
      { id: "end", type: "end", config: {} },
    ],
    pools.map((pool) => attach(pool.id, "a1")),
  );

const node_index_of = (document, node_id) =>
  document.nodes.findIndex((node) => node.id === node_id);

describe("the model a legacy inline entry declares", () => {
  it("is kept by both legacy formats, as each of them was asked", () => {
    expect(CAPTURED_INLINE_DECLARED_MODEL.length).toBeGreaterThan(0);
    CAPTURED_INLINE_DECLARED_MODEL.forEach((row) => {
      const declared = legacy_entry_declared_model(
        inline_entry(row.template, row.prompt_format),
      );
      /* The capture states what the store answered, not what the mirror
         reads, so the comparison is composed here: against the profile the
         entry declares and against a different one. */
      expect(profile_holds_model(declared, row.against_declared)).toBe(
        row.accepted_against_declared,
      );
      expect(profile_holds_model(declared, row.against_other)).toBe(
        row.accepted_against_other,
      );
    });
    /* A soul-format entry's model is enforced too: the store converts both
       formats through the same template IR. */
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
      /* Accepted means the Agent the store built runs on its pool owner's
         profile, which is the other half of the answer: a conversion that was
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
    expect(refused.every((row) => row.code === "identity_mismatch")).toBe(true);
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

describe("which Agent nodes a pool is attached to", () => {
  it("reads the attach edge in either direction, and counts a node once", () => {
    const document = document_of(
      [
        agent_node("left", { kernel: kernel() }),
        agent_node("right", { kernel: kernel() }),
        pool_node("pool", [inline_entry({ prompt: "Be brief." })]),
        { id: "tools", type: "toolkit_pool", config: {} },
      ],
      [
        attach("pool", "left"),
        attach("pool", "right", true),
        { ...attach("pool", "left"), id: "again" },
        /* Not an owner: a toolkit pool is not an Agent node, and a flow edge
           is not an attachment. */
        { ...attach("pool", "tools"), id: "tools-attach" },
        { ...attach("pool", "right"), id: "flowed", kind: "flow" },
      ],
    );
    expect(pool_owner_nodes(document, "pool").map(({ node }) => node.id)).toEqual([
      "left",
      "right",
    ]);
    /* In document order with its index, because the index is part of the
       address the runtime reports a faulty Kernel at. */
    expect(pool_owner_nodes(document, "pool").map(({ index }) => index)).toEqual([
      0, 1,
    ]);
    expect(pool_owner_nodes(document, "missing")).toEqual([]);
    expect(pool_owner_nodes(null, "pool")).toEqual([]);
  });
});

describe("which Kernel a pool's children are built on", () => {
  it("answers every captured case the way the store answered it", () => {
    expect(CAPTURED_POOL_OWNER_ADMISSION.length).toBeGreaterThan(0);
    /* The one place this mirror is deliberately the stricter side. The store
       will build a child on a Kernel the CALLER supplies when the pool's own
       owner has none — this editor supplies none, by the decision in the
       module header, so that branch is not reachable from here and the honest
       answer is the owner that is unconfigured. Counted rather than waved
       through: two rows in this corpus were answered out of the supplied
       Kernel, and if a regeneration adds a third it has to be looked at. The
       hook's own suite is what proves nothing is sent. */
    let stood_in = 0;
    CAPTURED_POOL_OWNER_ADMISSION.forEach((row) => {
      const plan = legacy_conversion_plan(row.document);
      if (
        row.request_fallback &&
        plan.refusal !== null &&
        plan.refusal.code === CONVERSION_KERNEL_ABSENT &&
        (row.accepted || kernel_where(row.path).startsWith("legacy_kernel"))
      ) {
        stood_in += 1;
        return;
      }
      if (row.accepted) {
        expect(plan.refusal).toBeNull();
        /* Each pool on its own owner's model, which for the two-pool row is
           two providers in one write. */
        const models = row.per_pool
          ? row.per_pool
          : { pool: row.child_profile.model };
        Object.entries(models).forEach(([pool_id, model]) => {
          expect(plan_for_pool(plan, pool_id).chosen.split(":")[1]).toBe(model);
        });
        return;
      }
      expect(plan.refusal).not.toBeNull();
      const where = kernel_where(row.path);
      if (plan.refusal.code === CONVERSION_KERNEL_REFUSED) {
        /* The runtime's own code and address for a Kernel it will not take,
           including the schema fault it reports under `json_schema`. */
        expect(plan.refusal.problem.code).toBe(row.code);
        expect(plan.refusal.problem.where).toBe(where);
        return;
      }
      expect(plan.refusal.code).toBe(row.code);
      if (plan.refusal.where) {
        expect(plan.refusal.where).toBe(where);
        return;
      }
      /* The rest are reported at an entry inside the pool — the store blames
         the entry it could not build, this names the pool it is in. */
      expect(row.path.slice(0, 3)).toEqual([
        "document",
        "nodes",
        node_index_of(row.document, plan.refusal.pool_id),
      ]);
    });
    expect(stood_in).toBe(2);
  });

  it("holds all four refusals and both sides of the write", () => {
    /* A corpus that lost a case would still pass the loop above. */
    const codes = new Set(
      CAPTURED_POOL_OWNER_ADMISSION.filter((row) => !row.accepted).map(
        (row) => row.code,
      ),
    );
    expect(codes).toContain(CONVERSION_OWNER_REQUIRED);
    expect(codes).toContain(CONVERSION_KERNEL_ABSENT);
    expect(codes).toContain(CONVERSION_KERNEL_AMBIGUOUS);
    expect(codes).toContain(CONVERSION_MODEL_MISMATCH);
    expect(
      CAPTURED_POOL_OWNER_ADMISSION.filter((row) => row.accepted).length,
    ).toBeGreaterThan(0);
    /* Nothing was written for any refusal, which is what makes a refusal here
       something the panel may state before the write rather than after. */
    expect(
      CAPTURED_POOL_OWNER_ADMISSION.every(
        (row) => row.accepted || row.unwritten === true,
      ),
    ).toBe(true);
  });

  it("compares two owners on what a child would be built from", () => {
    /* Measured: owners differing in their own prompt or output schema are one
       Kernel to a child, because the runtime clears both before building it.
       Owners differing in anything else are not. */
    const shared = (second) =>
      pool_child_kernel(
        document_of(
          [
            agent_node("left", { kernel: kernel() }),
            agent_node("right", { kernel: second }),
            pool_node("pool", [inline_entry({ prompt: "Be brief." })]),
          ],
          [attach("pool", "left"), attach("pool", "right", true)],
        ),
        "pool",
      );
    expect(
      shared(
        kernel({
          prompt: "A different parent prompt",
          json_schema: { type: "object", properties: { x: { type: "string" } } },
        }),
      ).refusal,
    ).toBeNull();
    expect(shared(kernel({ output_tokens: 999 })).refusal.code).toBe(
      CONVERSION_KERNEL_AMBIGUOUS,
    );
    expect(
      shared(kernel({ profile: { credential_ref: "other.secret" } })).refusal
        .nodes,
    ).toEqual(["left", "right"]);
  });

  it("tells an unconfigured owner from one the runtime refuses", () => {
    const pool = [pool_node("pool", [inline_entry({ prompt: "Be brief." })])];
    const absent = pool_child_kernel(migrated({}, pool), "pool");
    expect(absent.refusal.code).toBe(CONVERSION_KERNEL_ABSENT);
    expect(absent.refusal.node_id).toBe("a1");
    /* `kernel: null` is a Kernel, and it is one the runtime will not take. A
       node with no `kernel` key at all has not been configured, which is the
       author's to answer rather than a fault to report. */
    const stated = pool_child_kernel(migrated({ kernel: null }, pool), "pool");
    expect(stated.refusal.code).toBe(CONVERSION_KERNEL_REFUSED);
    expect(stated.refusal.problem.code).toBe("invalid_type");
    expect(stated.refusal.problem.where).toBe("document.nodes[1].config.kernel");
  });
});

describe("what the child is built on", () => {
  it("is the owner's Kernel with the two fields the runtime clears", () => {
    const { owner, child } = CAPTURED_CHILD_KERNEL;
    /* By value, not by written order: the child came back out of the store,
       which writes its JSON with the keys sorted. */
    const written = (value) =>
      Array.isArray(value)
        ? `[${value.map(written).join(",")}]`
        : value && typeof value === "object"
          ? `{${Object.keys(value)
              .sort()
              .map((key) => `${key}:${written(value[key])}`)
              .join(",")}}`
          : JSON.stringify(value);
    const differs = Object.keys({ ...owner, ...child }).filter(
      (key) => written(owner[key]) !== written(child[key]),
    );
    expect(differs.sort()).toEqual(["json_schema", "prompt"]);
    /* The child's prompt is the entry's own, and its schema is nothing —
       neither is a value this editor supplied. */
    expect(child.prompt).toBe(CAPTURED_CHILD_KERNEL.legacy_prompt);
    expect(child.json_schema).toBeNull();
    expect(owner.json_schema).not.toBeNull();
  });

  it("leaves the owner's own Kernel alone, and both entry points agree", () => {
    expect(CAPTURED_CHILD_KERNEL.owner_after).toEqual(
      CAPTURED_CHILD_KERNEL.owner,
    );
    /* Which is why nothing is projected here: `preflight` and
       `convert_legacy_pools` build the identical child from the same
       document, so an editor that pre-projected would be the only thing
       making them differ. */
    expect(CAPTURED_CHILD_KERNEL.preflight_child_is_the_same).toBe(true);
  });

  it("is what the plan names, without handing anything over", () => {
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
    expect(plan_for_pool(plan, "pool").chosen).toBe("openai:gpt-4.1");
    expect(plan_for_pool(plan, "pool").owners).toEqual(["a1"]);
    /* No Kernel on the plan at all: there is nothing for the caller to send,
       and a field here would be the beginning of sending it. */
    expect("kernel" in plan).toBe(false);
  });
});

describe("what a converted entry keeps", () => {
  it("keeps the policy the panel says it keeps, in both formats", () => {
    /* The panel's two statements — that converting keeps the tools,
       delegation modes, memory and parallel safety each subagent already
       declared, and that their prompts come with them — measured rather than
       asserted about the panel's own words. `allowed_tools: []` is in the
       corpus on purpose: the default is `null`, which means unrestricted, so
       a lost restriction would be a widened one. */
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
      expect(row.carried_prompt).toBe("Child instructions");
      /* And the description, verbatim — the padding it was stored with is
         still there, and the Agent the conversion builds carries the same
         text. Neither statement mentions descriptions; this is recorded
         because it used to be dropped. */
      expect(row.stored.description).toBe(row.declared.description);
      expect(row.child_description).toBe(row.declared.description);
      expect(row.declared.description).not.toBe(row.declared.description.trim());
    });
    expect(
      CAPTURED_INLINE_PRESERVED_POLICY.map((row) => row.prompt_format).sort(),
    ).toEqual(["skeleton", "soul"]);
  });
});

describe("the plan a legacy pool conversion is given", () => {
  it("needs no model when nothing has to be built", () => {
    const plan = legacy_conversion_plan(
      migrated({}, [pool_node("pool", [{ kind: "recipe_ref", recipe_name: "S" }])]),
    );
    expect(plan.required).toBe(false);
    expect(plan.refusal).toBeNull();
    expect(plan_for_pool(plan, "pool")).toBeNull();
  });

  it("will not guess a model when the pool's owner has none", () => {
    const plan = legacy_conversion_plan(
      migrated({}, [pool_node("pool", [inline_entry({ prompt: "Be brief." })])]),
    );
    expect(plan.required).toBe(true);
    expect(plan.refusal.code).toBe(CONVERSION_KERNEL_ABSENT);
    expect(plan.refusal.pool_id).toBe("pool");
  });

  it("will not take a configured node the pool is not attached to", () => {
    /* The store refuses exactly this, so the panel does not offer it: an
       Agent node configured elsewhere in the graph is not this pool's. */
    const plan = legacy_conversion_plan(
      document_of(
        [
          agent_node("a1", { legacy_recipe: { name: "R" } }),
          agent_node("a2", { kernel: kernel() }),
          pool_node("pool", [inline_entry({ prompt: "Be brief." })]),
        ],
        [attach("pool", "a1")],
      ),
    );
    expect(plan.refusal.code).toBe(CONVERSION_KERNEL_ABSENT);
    expect(plan.refusal.node_id).toBe("a1");
  });

  it("says so when the pool is attached to nothing", () => {
    const plan = legacy_conversion_plan(
      document_of([
        agent_node("a1", { legacy_recipe: { name: "R" }, kernel: kernel() }),
        pool_node("pool", [inline_entry({ prompt: "Be brief." })]),
      ]),
    );
    expect(plan.refusal.code).toBe(CONVERSION_OWNER_REQUIRED);
    expect(plan.refusal.where).toBe("document.nodes[1].config");
  });

  it("says so when the configured Kernel is not one the runtime would take", () => {
    const plan = legacy_conversion_plan(
      migrated({ kernel: kernel({ temperature: 0.5 }) }, [
        pool_node("pool", [inline_entry({ prompt: "Be brief." })]),
      ]),
    );
    expect(plan.refusal.code).toBe(CONVERSION_KERNEL_REFUSED);
    expect(plan.refusal.problem.code).toBe("unknown_field");
    /* The address is the node's own Kernel, which is where the author fixes
       it and where the store reports it. */
    expect(plan.refusal.problem.where).toBe(
      "document.nodes[1].config.kernel.temperature",
    );
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
    expect(plan.refusal.entries[0].declared).toBe("anthropic:claude-x");
  });

  it("offers it when each entry declares the model its own pool is built on", () => {
    const plan = legacy_conversion_plan(
      document_of(
        [
          agent_node("left", { legacy_recipe: { name: "R" }, kernel: kernel() }),
          agent_node("right", { kernel: kernel({ profile: OTHER_PROFILE }) }),
          pool_node("here", [
            inline_entry({ prompt: "Be brief.", model: "openai:gpt-4.1" }),
            inline_entry({ prompt: "Bare.", model: "gpt-4.1" }),
            inline_entry({ prompt: "Soul.", model: "openai:gpt-4.1" }, "soul"),
          ]),
          pool_node("there", [
            inline_entry({ prompt: "Other.", model: "anthropic:claude-x" }),
          ]),
        ],
        [attach("here", "left"), attach("there", "right", true)],
      ),
    );
    expect(plan.refusal).toBeNull();
    expect(plan.pools).toEqual(["here", "there"]);
    /* Two pools, two models, one write — which is why the model is named per
       pool and not once for the Agent. */
    expect(plan_for_pool(plan, "here").chosen).toBe("openai:gpt-4.1");
    expect(plan_for_pool(plan, "there").chosen).toBe("anthropic:claude-x");
  });

  it("refuses the whole write for a pool that is not the one in hand", () => {
    /* `convert_legacy_pools` expands every legacy pool in the resource, so a
       pool whose owner is unconfigured withholds the button from a pool whose
       owner is fine — and the panel has to be able to name which. */
    const plan = legacy_conversion_plan(
      document_of(
        [
          agent_node("left", { legacy_recipe: { name: "R" }, kernel: kernel() }),
          agent_node("right", {}),
          pool_node("here", [inline_entry({ prompt: "Be brief." })]),
          pool_node("there", [inline_entry({ prompt: "Other." })]),
        ],
        [attach("here", "left"), attach("there", "right")],
      ),
    );
    expect(plan.refusal.code).toBe(CONVERSION_KERNEL_ABSENT);
    expect(plan.refusal.pool_id).toBe("there");
    /* The pool in hand still answers for itself, which is what lets the panel
       say "this one is ready, that one is not". */
    expect(plan_for_pool(plan, "here").refusal).toBeNull();
    expect(plan_for_pool(plan, "here").chosen).toBe("openai:gpt-4.1");
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

  it("answers for a pool nobody asked about with nothing at all", () => {
    const plan = legacy_conversion_plan(
      migrated({ kernel: kernel() }, [
        pool_node("pool", [inline_entry({ prompt: "Be brief." })]),
      ]),
    );
    expect(plan_for_pool(plan, "__proto__")).toBeNull();
    expect(plan_for_pool(plan, "absent")).toBeNull();
    expect(plan_for_pool(null, "pool")).toBeNull();
    expect(plan_for_pool({ by_pool: { pool: "forged" } }, "pool")).toBeNull();
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
