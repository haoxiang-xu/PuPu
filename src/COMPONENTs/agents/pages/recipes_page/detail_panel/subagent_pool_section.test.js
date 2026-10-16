import React from "react";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import SubagentPoolSection from "./subagent_pool_section";
import { node_subagents } from "../skeleton_document";
import { list_resources } from "../skeleton_resources";

/* The facade is covered in its own suite; here it is the one seam, so the
   panel can be shown a library, an unreachable store and a refusal without a
   bridge. */
jest.mock("../skeleton_resources", () => ({
  is_unavailable: (result) =>
    Boolean(result) && result.ok === false && result.reason === "unavailable",
  list_resources: jest.fn(),
}));

jest.mock("../../../../../BUILTIN_COMPONENTs/select/select", () => {
  return function MockSelect({ options, value, set_value }) {
    return (
      <select
        data-testid="select"
        data-value={value == null ? "" : String(value)}
        value={value || ""}
        onChange={(event) => set_value(event.target.value)}
      >
        {(options || []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  };
});

jest.mock("../../../../../BUILTIN_COMPONENTs/input/input", () => {
  return function MockInput({ value, set_value, placeholder }) {
    return (
      <input
        placeholder={placeholder}
        value={value}
        onChange={(event) => set_value(event.target.value)}
      />
    );
  };
});

jest.mock("../../../../../BUILTIN_COMPONENTs/input/button", () => {
  return function MockButton({ label, ariaLabel, onClick }) {
    return (
      <button type="button" aria-label={ariaLabel} onClick={onClick}>
        {label || ariaLabel || "button"}
      </button>
    );
  };
});

jest.mock("../../../../../BUILTIN_COMPONENTs/input/switch", () => {
  return function MockSwitch({ on, set_on }) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on ? "true" : "false"}
        onClick={() => set_on(!on)}
      >
        switch
      </button>
    );
  };
});

const entry = (over) => ({
  id: "subagent-1",
  name: "Summarizer",
  description: "",
  source: { kind: "agent_ref", agent_id: "res-1" },
  allowed_modes: ["delegate", "worker"],
  output_mode: "summary",
  memory_policy: "ephemeral",
  parallel_safe: true,
  allowed_tools: null,
  disabled_tools: [],
  ...over,
});

const pool = (config) => ({
  id: "pool",
  type: "subagent_pool",
  config,
});

/* The pool is attached to the Agent node it serves, which is not decoration:
   the Kernel configured on the node a pool is attached to is the model its
   legacy entries are converted onto, so a pool attached to nothing is a pool
   whose subagents cannot be built. */
const doc = (node) => ({
  schema_version: 1,
  kind: "agent",
  id: "parent",
  name: "Reviewer",
  nodes: [
    { id: "k", type: "agent", config: { execution: { inputs: [], outputs: [] } } },
    node,
  ],
  edges: [
    {
      id: "k-attach",
      kind: "attach",
      source_node_id: "k",
      source_port_id: "attach_bot",
      target_node_id: node.id,
      target_port_id: "attach_top",
    },
  ],
});

const LIBRARY = [
  { id: "res-1", kind: "agent", name: "Summarizer", archived: false },
  { id: "res-2", kind: "agent", name: "Checker", archived: false },
  { id: "res-flow", kind: "workflow", name: "Nightly flow", archived: false },
  { id: "parent", kind: "agent", name: "Reviewer", archived: false },
  { id: "res-old", kind: "agent", name: "Retired", archived: true },
];

async function show(node, options = {}) {
  list_resources.mockResolvedValue(
    options.library === undefined
      ? { ok: true, data: { resources: LIBRARY } }
      : options.library,
  );
  const onChange = jest.fn();
  const view = render(
    <SubagentPoolSection
      document={doc(node)}
      node={node}
      isDark={false}
      onChange={onChange}
    />,
  );
  /* The library is read in an effect, so let it land before anything is
     asserted about what is offered. */
  await act(async () => {});
  return { onChange, view };
}

/* Opening the picker starts a fresh read, and the list is not offered until
   that read is the current answer — so a test opens it the way a person does,
   by waiting the moment out. */
async function open_picker() {
  await act(async () => {
    fireEvent.click(screen.getByText("+ Add an Agent"));
  });
}

const written = (onChange, call = 0) =>
  node_subagents(onChange.mock.calls[call][0].nodes[1]);

beforeEach(() => {
  list_resources.mockReset();
});

describe("a pool that holds nothing", () => {
  test("says so, and says that it is refused rather than merely unfinished", async () => {
    await show(pool({ subagents: [] }));
    expect(screen.getByTestId("subagent-pool-empty").textContent).toMatch(
      /refused when the Agent runs/i,
    );
  });

  test("and the refusal the runtime would give is shown with it", async () => {
    /* Nothing else tells the author: the format check takes it, the draft
       diagnostics say nothing, and so does the structural gate. */
    await show(pool({ subagents: [] }));
    expect(screen.getByTestId("subagent-pool-problem-0").textContent).toMatch(
      /must contain an Agent/i,
    );
  });

  test("a config with no subagents key at all is a different problem", async () => {
    await show(pool({}));
    expect(screen.getByTestId("subagent-pool-problem-0").textContent).toMatch(
      /required field is missing/i,
    );
  });
});

describe("referencing an Agent from the library", () => {
  test("the entry written out carries every field the wire closes", async () => {
    const { onChange } = await show(pool({ subagents: [] }));
    await open_picker();
    fireEvent.click(screen.getByLabelText("Reference Summarizer"));
    expect(written(onChange)).toEqual([
      {
        id: "subagent-1",
        name: "Summarizer",
        description: "",
        source: { kind: "agent_ref", agent_id: "res-1" },
        allowed_modes: ["delegate", "worker"],
        output_mode: "summary",
        memory_policy: "ephemeral",
        parallel_safe: true,
        allowed_tools: null,
        disabled_tools: [],
      },
    ]);
  });

  test("it references the resource id, never the name", async () => {
    const { onChange } = await show(pool({ subagents: [] }));
    await open_picker();
    fireEvent.click(screen.getByLabelText("Reference Checker"));
    expect(written(onChange)[0].source).toEqual({
      kind: "agent_ref",
      agent_id: "res-2",
    });
  });

  test("a Workflow is not offered by any route, and cannot be picked", async () => {
    /* The negative that matters. A pool holds Agents; a Workflow reaching an
       entry is a definition the store refuses at Run with `wrong_kind`. */
    const { onChange } = await show(pool({ subagents: [] }));
    await open_picker();
    expect(screen.queryByText("Nightly flow")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Reference Nightly flow/)).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("neither is this Agent itself, nor an archived one", async () => {
    await show(pool({ subagents: [] }));
    await open_picker();
    expect(screen.queryByText("Reviewer")).not.toBeInTheDocument();
    expect(screen.queryByText("Retired")).not.toBeInTheDocument();
  });

  test("and the absence is explained rather than left to be noticed", async () => {
    await show(pool({ subagents: [] }));
    await open_picker();
    expect(screen.getByTestId("subagent-picker-withheld").textContent).toMatch(
      /3 other resources are not offered/i,
    );
  });

  test("the same Agent can be referenced twice, under a free name", async () => {
    const { onChange } = await show(pool({ subagents: [entry()] }));
    await open_picker();
    fireEvent.click(screen.getByLabelText("Reference Summarizer"));
    expect(written(onChange).map((row) => row.name)).toEqual([
      "Summarizer",
      "Summarizer 2",
    ]);
    expect(written(onChange).map((row) => row.id)).toEqual([
      "subagent-1",
      "subagent-2",
    ]);
  });

  test("a store this build cannot reach says so instead of looking empty", async () => {
    await show(pool({ subagents: [] }), {
      library: { ok: false, reason: "unavailable", error: { code: "bridge_unavailable" } },
    });
    await open_picker();
    expect(screen.getByTestId("subagent-library-unavailable").textContent).toMatch(
      /not reachable in this build/i,
    );
    expect(screen.queryByTestId("subagent-picker")).not.toBeInTheDocument();
  });

  test("a refusal from the store is not an empty library either", async () => {
    await show(pool({ subagents: [] }), {
      library: {
        ok: false,
        reason: "refused",
        error: { code: "skeleton_store_failed", message: "the store is locked", path: [] },
      },
    });
    await open_picker();
    expect(screen.getByTestId("subagent-library-failed").textContent).toMatch(/locked/);
  });
});

describe("a row manages the entry, never the subagent's contents", () => {
  test("the section says where contents are edited", async () => {
    await show(pool({ subagents: [entry()] }));
    expect(screen.getByTestId("skeleton-subagent-pool").textContent).toMatch(
      /contents are edited by opening its graph/i,
    );
  });

  test("there is no prompt, no model and nothing else of the subagent's own", async () => {
    /* Two selects on the row and no more: what this Agent reads back, and
       what memory the child gets. A model or a prompt box here would be
       editing the subagent itself, which is the one thing this panel does
       not do. */
    await show(pool({ subagents: [entry()] }));
    const row = within(screen.getByTestId("subagent-entry-0"));
    expect(row.getAllByTestId("select")).toHaveLength(2);
    expect(screen.queryByPlaceholderText(/prompt/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/model/i)).not.toBeInTheDocument();
  });

  test("the row says where its Agent comes from, by the source and nothing else", async () => {
    await show(pool({ subagents: [entry()] }));
    expect(screen.getByTestId("subagent-entry-0-source").textContent).toBe(
      "Referenced · Summarizer",
    );
  });

  test("an embedded entry is named as embedded", async () => {
    await show(
      pool({ subagents: [entry({ source: { kind: "embedded", document: {} } })] }),
    );
    expect(screen.getByTestId("subagent-entry-0-source").textContent).toBe("Embedded");
  });

  test("a reference to an Agent that is gone says so", async () => {
    await show(pool({ subagents: [entry({ source: { kind: "agent_ref", agent_id: "res-9" } })] }));
    expect(screen.getByTestId("subagent-entry-0-missing").textContent).toMatch(
      /No Agent with the id res-9/,
    );
  });

  test("a reference is not called missing while the library is unreadable", async () => {
    /* "We could not ask" is not "it is not there", and the row must not
       accuse the document of something the panel does not know. */
    await show(pool({ subagents: [entry({ source: { kind: "agent_ref", agent_id: "res-9" } })] }), {
      library: { ok: false, reason: "unavailable", error: {} },
    });
    expect(screen.queryByTestId("subagent-entry-0-missing")).not.toBeInTheDocument();
  });

  test("the modes are stored in the wire's order, not the order they were clicked", async () => {
    const { onChange } = await show(pool({ subagents: [entry({ allowed_modes: ["worker"] })] }));
    fireEvent.click(screen.getByLabelText("Allow delegate"));
    expect(written(onChange)[0].allowed_modes).toEqual(["delegate", "worker"]);
  });

  test("turning a mode off is allowed, and the last one off is explained", async () => {
    const { onChange } = await show(pool({ subagents: [entry({ allowed_modes: ["delegate"] })] }));
    fireEvent.click(screen.getByLabelText("Stop allowing delegate"));
    expect(written(onChange)[0].allowed_modes).toEqual([]);
  });

  test("a pool whose entry allows nothing says what the runtime would say", async () => {
    await show(pool({ subagents: [entry({ allowed_modes: [] })] }));
    expect(screen.getByTestId("subagent-entry-0-problem-0").textContent).toMatch(
      /allowed_modes must be a non-empty array/i,
    );
  });

  test("what this Agent reads back is stored as the wire's own token", async () => {
    const { onChange } = await show(pool({ subagents: [entry()] }));
    const row = within(screen.getByTestId("subagent-entry-0"));
    fireEvent.change(row.getAllByTestId("select")[0], {
      target: { value: "full_trace" },
    });
    expect(written(onChange)[0].output_mode).toBe("full_trace");
  });

  test("the child's memory policy is stored as its own token", async () => {
    const { onChange } = await show(pool({ subagents: [entry()] }));
    const row = within(screen.getByTestId("subagent-entry-0"));
    fireEvent.change(row.getAllByTestId("select")[1], {
      target: { value: "scoped_persistent" },
    });
    expect(written(onChange)[0].memory_policy).toBe("scoped_persistent");
  });

  test("parallel safety is a boolean, and the sentence changes with it", async () => {
    const { onChange } = await show(pool({ subagents: [entry()] }));
    expect(screen.getByTestId("subagent-entry-0").textContent).toMatch(
      /May run beside other subagents/i,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(written(onChange)[0].parallel_safe).toBe(false);
  });

  test("tool restrictions are shown as stored and not edited here", async () => {
    await show(
      pool({ subagents: [entry({ allowed_tools: ["write", "web_fetch"], disabled_tools: ["shell"] })] }),
    );
    expect(screen.getByTestId("subagent-entry-0-tools").textContent).toBe(
      "Tools: write, web_fetch, except shell",
    );
  });

  test("every tool and no tool are different sentences", async () => {
    await show(pool({ subagents: [entry({ allowed_tools: null })] }));
    expect(screen.getByTestId("subagent-entry-0-tools").textContent).toBe(
      "Tools: every tool",
    );
  });

  test("an entry removed takes only that one out", async () => {
    const { onChange } = await show(
      pool({ subagents: [entry(), entry({ id: "subagent-2", name: "Checker" })] }),
    );
    fireEvent.click(screen.getByLabelText("Remove Summarizer"));
    expect(written(onChange).map((row) => row.name)).toEqual(["Checker"]);
  });
});

describe("two entries cannot share a name", () => {
  /* The document holds one entry per name — the runtime refuses a duplicate
     — so renaming one onto another's name is not a rename it can represent.
     The same rule, and the same implementation, as a schema field's name. */
  const two = [entry(), entry({ id: "subagent-2", name: "Checker" })];

  test("the colliding name is shown, said, and not stored", async () => {
    const { onChange } = await show(pool({ subagents: two }));
    const row = within(screen.getByTestId("subagent-entry-0"));
    fireEvent.change(row.getByDisplayValue("Summarizer"), {
      target: { value: "Checker" },
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("subagent-entry-0-name-taken").textContent).toMatch(
      /Another subagent is already called Checker/,
    );
  });

  test("the other entry's declaration is still there", async () => {
    await show(pool({ subagents: two }));
    fireEvent.change(
      within(screen.getByTestId("subagent-entry-0")).getByDisplayValue("Summarizer"),
      { target: { value: "Checker" } },
    );
    expect(
      within(screen.getByTestId("subagent-entry-1")).getByDisplayValue("Checker"),
    ).toBeInTheDocument();
  });

  test("a free name is stored as it is typed", async () => {
    const { onChange } = await show(pool({ subagents: two }));
    fireEvent.change(
      within(screen.getByTestId("subagent-entry-0")).getByDisplayValue("Summarizer"),
      { target: { value: "Shortener" } },
    );
    expect(written(onChange).map((row) => row.name)).toEqual(["Shortener", "Checker"]);
  });
});

describe("a pool converted from a legacy definition", () => {
  const legacy = pool({
    legacy_fields: {
      subagents: [
        { kind: "recipe_ref", recipe_name: "Summarizer" },
        { kind: "inline", name: "Shortener" },
      ],
    },
  });

  test("its entries are listed as they are stored", async () => {
    await show(legacy);
    expect(screen.getByTestId("subagent-legacy-entry-0").textContent).toBe("Summarizer");
    expect(screen.getByTestId("subagent-legacy-entry-1").textContent).toBe("Shortener");
  });

  test("and nothing offers to edit them, because an edit would lose them", async () => {
    /* The store expands `legacy_fields` only while there is no `subagents`
       key, so one entry added here would stop every legacy entry from being
       converted — at Run, silently. */
    await show(legacy);
    expect(screen.getByTestId("subagent-pool-legacy").textContent).toMatch(
      /subagents would be lost/i,
    );
    expect(screen.queryByText("+ Add an Agent")).not.toBeInTheDocument();
    expect(screen.queryByTestId("subagent-entry-0")).not.toBeInTheDocument();
  });

  test("the wire's rules are not read over it, because it is not that wire", async () => {
    await show(legacy);
    expect(screen.queryByTestId("subagent-pool-problem-0")).not.toBeInTheDocument();
  });
});

describe("a draft can hold a shape no control can show", () => {
  test("an entry that is not an object does not take the panel down", async () => {
    await show(pool({ subagents: ["Summarizer"] }));
    expect(screen.getByTestId("subagent-entry-0-unreadable").textContent).toMatch(
      /not an object/i,
    );
    expect(screen.getByTestId("subagent-entry-0-problem-0")).toBeInTheDocument();
  });

  test("a mode named like a prototype member is shown rather than fatal", async () => {
    /* `MODE_CAPTION[mode]` with a name out of the draft answers
       `Object.prototype` for `__proto__`: truthy, not a string, and rendering
       it as a child takes the panel down inside the sentence that was about
       to explain the mode. */
    await show(pool({ subagents: [entry({ allowed_modes: ["__proto__"] })] }));
    expect(screen.getByTestId("subagent-entry-0")).toBeInTheDocument();
    expect(screen.getByTestId("subagent-entry-0-problem-0").textContent).toMatch(
      /unknown mode/i,
    );
  });

  test("a subagents value that is not a list is reported, not iterated", async () => {
    await show(pool({ subagents: "Summarizer" }));
    expect(screen.getByTestId("subagent-pool-problem-0").textContent).toMatch(
      /must be an array/i,
    );
  });
});

describe("the library is read again on the way into the picker", () => {
  /* Within one sitting it can only change from somewhere else, and both ways
     it goes wrong are worth a request: offering an Agent that was just
     archived, and calling a reference missing when it is not. */
  test("opening the picker asks the store again", async () => {
    await show(pool({ subagents: [] }));
    expect(list_resources).toHaveBeenCalledTimes(1);
    await act(async () => {
      await open_picker();
    });
    expect(list_resources).toHaveBeenCalledTimes(2);
  });

  test("closing it again does not", async () => {
    await show(pool({ subagents: [] }));
    await act(async () => {
      await open_picker();
    });
    fireEvent.click(screen.getByText("Cancel"));
    expect(list_resources).toHaveBeenCalledTimes(2);
  });

  test("an Agent that has since appeared is offered", async () => {
    await show(pool({ subagents: [] }), { library: { ok: true, data: { resources: [] } } });
    await open_picker();
    expect(screen.getByTestId("subagent-picker-empty")).toBeInTheDocument();
    list_resources.mockResolvedValue({ ok: true, data: { resources: LIBRARY } });
    fireEvent.click(screen.getByText("Cancel"));
    await act(async () => {
      await open_picker();
    });
    expect(screen.getByLabelText("Reference Summarizer")).toBeInTheDocument();
  });
});

describe("what an entry does not say is not filled in for it", () => {
  test("an absent tool restriction is not read as every tool", async () => {
    /* `null` is "every tool" and `[]` is "no tool"; an absent key is neither,
       and the runtime refuses the entry for the missing field. */
    const { allowed_tools, ...without } = entry();
    await show(pool({ subagents: [without] }));
    expect(screen.getByTestId("subagent-entry-0-tools").textContent).toBe(
      "Tools: not stated",
    );
    expect(screen.getByTestId("subagent-entry-0-problem-0").textContent).toMatch(
      /required field is missing/i,
    );
  });
});

describe("a control that is not offered says why", () => {
  test("the tools line explains that it is shown rather than edited", async () => {
    /* The runtime accepts any tool name without checking it, so a name typed
       here could restrict nothing and look as though it had. */
    await show(pool({ subagents: [entry()] }));
    expect(screen.getByTestId("subagent-pool-tools-note").textContent).toMatch(
      /not edited here/i,
    );
  });

  test("and is not said about rows that are not there", async () => {
    await show(pool({ subagents: [] }));
    expect(screen.queryByTestId("subagent-pool-tools-note")).not.toBeInTheDocument();
  });
});

describe("a draft the store accepted but no control can show", () => {
  /* Everything below is a shape the real store takes: a pool `config` only
     has to be an object, so every one of these round-trips through a save and
     reopen. The panel's job is to show the diagnostic, not to be the thing
     that falls over before the diagnostic is drawn. */

  test("a tool name that cannot become text does not take the panel down", async () => {
    /* `[{toString: null}].join(", ")` throws "Cannot convert object to
       primitive value" — the panel dying inside the code about to explain the
       problem, which is the shape this ticket keeps paying for. */
    await show(pool({ subagents: [entry({ allowed_tools: [{ toString: null }] })] }));
    expect(screen.getByTestId("subagent-entry-0")).toBeInTheDocument();
    expect(screen.getByTestId("subagent-entry-0-tools").textContent).toMatch(
      /unreadable/i,
    );
    expect(screen.getByTestId("subagent-entry-0-problem-0").textContent).toMatch(
      /non-empty strings/i,
    );
  });

  test("neither does a name that cannot become text", async () => {
    await show(pool({ subagents: [entry({ name: { toString: null } })] }));
    expect(screen.getByTestId("subagent-entry-0")).toBeInTheDocument();
    expect(screen.getByTestId("subagent-entry-0-problem-0").textContent).toMatch(
      /must be a string/i,
    );
  });

  test("nor a description that cannot become text", async () => {
    await show(pool({ subagents: [entry({ description: { toString: null } })] }));
    expect(screen.getByTestId("subagent-entry-0")).toBeInTheDocument();
  });

  test("an entry that is only null can be removed, which is the only way out", async () => {
    /* The row said "remove it and add the Agent again" and then offered no
       way to remove it. A draft the author cannot repair from the page it is
       shown on is a dead end. */
    const { onChange } = await show(pool({ subagents: [null, entry()] }));
    fireEvent.click(screen.getByLabelText("Remove entry 1"));
    expect(written(onChange)).toEqual([entry()]);
  });

  test("and an Agent can still be added beside it", async () => {
    const { onChange } = await show(pool({ subagents: [null] }));
    await open_picker();
    fireEvent.click(screen.getByLabelText("Reference Summarizer"));
    expect(written(onChange)).toHaveLength(2);
    expect(written(onChange)[1].source.agent_id).toBe("res-1");
  });

  test("a broken entry does not stop the one beside it from working", async () => {
    const { onChange } = await show(pool({ subagents: [null, entry()] }));
    fireEvent.change(
      within(screen.getByTestId("subagent-entry-1")).getByDisplayValue("Summarizer"),
      { target: { value: "Shortener" } },
    );
    expect(written(onChange)[1].name).toBe("Shortener");
  });
});

describe("an entry id is unique inside its pool and nowhere else", () => {
  /* Two pools in one Agent, each with its own `sa1`. The panel stays mounted
     across a selection change — it is the same component in the same place —
     so text held against `sa1` alone followed the author from one pool to the
     other and was drawn over the other pool's entry. An identity that is
     unique within a container is not an identity outside it. */
  const two_pools = (first_name, second_name) => ({
    schema_version: 1,
    kind: "agent",
    id: "parent",
    name: "Reviewer",
    nodes: [
      { id: "k", type: "agent", config: { execution: { inputs: [], outputs: [] } } },
      { id: "pool-a", type: "subagent_pool", config: { subagents: [entry({ id: "sa1", name: first_name }), entry({ id: "sa2", name: "Checker" })] } },
      { id: "pool-b", type: "subagent_pool", config: { subagents: [entry({ id: "sa1", name: second_name }), entry({ id: "sa2", name: "Checker" })] } },
    ],
    edges: [],
  });

  const Panel = ({ node_id, first_name, second_name }) => {
    const document = two_pools(first_name, second_name);
    const node = document.nodes.find((candidate) => candidate.id === node_id);
    return (
      <SubagentPoolSection
        document={document}
        node={node}
        isDark={false}
        onChange={() => {}}
      />
    );
  };

  test("held text does not follow the author into another pool", async () => {
    list_resources.mockResolvedValue({ ok: true, data: { resources: LIBRARY } });
    const view = render(<Panel node_id="pool-a" first_name="Summarizer" second_name="Summarizer" />);
    await act(async () => {});
    fireEvent.change(
      within(screen.getByTestId("subagent-entry-0")).getByDisplayValue("Summarizer"),
      { target: { value: "Checker" } },
    );
    expect(screen.getByTestId("subagent-entry-0-name-taken")).toBeInTheDocument();

    view.rerender(<Panel node_id="pool-b" first_name="Summarizer" second_name="Summarizer" />);
    expect(
      within(screen.getByTestId("subagent-entry-0")).getByDisplayValue("Summarizer"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("subagent-entry-0-name-taken")).not.toBeInTheDocument();
  });
});

describe("a late reply from an older read", () => {
  /* The first read hangs; opening the picker starts a second; the second
     answers first and the first answers afterwards. `alive` only knows about
     unmounting, so the stale library replaced the fresh one and offered an
     Agent the newer answer had excluded. */
  test("does not replace a newer library", async () => {
    let settle_first = null;
    list_resources.mockImplementationOnce(
      () => new Promise((resolve) => {
        settle_first = () => resolve({ ok: true, data: { resources: LIBRARY } });
      }),
    );
    const onChange = jest.fn();
    render(
      <SubagentPoolSection
        document={doc(pool({ subagents: [] }))}
        node={pool({ subagents: [] })}
        isDark={false}
        onChange={onChange}
      />,
    );
    list_resources.mockResolvedValue({ ok: true, data: { resources: [] } });
    await act(async () => {
      await open_picker();
    });
    expect(screen.getByTestId("subagent-picker-empty")).toBeInTheDocument();

    await act(async () => {
      settle_first();
    });
    expect(screen.getByTestId("subagent-picker-empty")).toBeInTheDocument();
    expect(screen.queryByLabelText("Reference Summarizer")).not.toBeInTheDocument();
  });
});

describe("a reference the gate would have refused", () => {
  /* The gate was only asked when an entry was being added. An entry that is
     already in the document — hand-written, converted from a legacy
     definition, or saved by another build — gets the same answer, because the
     store will refuse it at Run either way. */
  test("a reference to a known Workflow says which it is", async () => {
    await show(pool({ subagents: [entry({ source: { kind: "agent_ref", agent_id: "res-flow" } })] }));
    expect(screen.getByTestId("subagent-entry-0-refused").textContent).toMatch(
      /Workflow/,
    );
  });

  test("a reference to this Agent itself says so, library or no library", async () => {
    await show(
      pool({ subagents: [entry({ source: { kind: "agent_ref", agent_id: "parent" } })] }),
      { library: { ok: false, reason: "unavailable", error: {} } },
    );
    expect(screen.getByTestId("subagent-entry-0-refused").textContent).toMatch(
      /its own subagent/i,
    );
  });

  test("a reference to an archived Agent says so", async () => {
    await show(pool({ subagents: [entry({ source: { kind: "agent_ref", agent_id: "res-old" } })] }));
    expect(screen.getByTestId("subagent-entry-0-refused").textContent).toMatch(
      /archived/i,
    );
  });

  test("a reference that is fine says nothing", async () => {
    await show(pool({ subagents: [entry()] }));
    expect(screen.queryByTestId("subagent-entry-0-refused")).not.toBeInTheDocument();
  });

  test("and nothing is claimed while the library is unreadable", async () => {
    await show(pool({ subagents: [entry()] }), {
      library: { ok: false, reason: "unavailable", error: {} },
    });
    expect(screen.queryByTestId("subagent-entry-0-refused")).not.toBeInTheDocument();
  });
});

describe("the library is data too", () => {
  /* Its names are columns of the store's own table, but they arrive over IPC
     without their shape being checked, and `${name}` on an object is the same
     throw a stored tool name was. */
  const ODD = [
    { id: "res-1", kind: "agent", name: { toString: null }, archived: false },
  ];

  test("a name that cannot become text does not take the picker down", async () => {
    await show(pool({ subagents: [] }), { library: { ok: true, data: { resources: ODD } } });
    await open_picker();
    expect(screen.getByLabelText("Reference res-1")).toBeInTheDocument();
  });

  test("nor the row that references it", async () => {
    await show(pool({ subagents: [entry()] }), {
      library: { ok: true, data: { resources: ODD } },
    });
    expect(screen.getByTestId("subagent-entry-0-source").textContent).toBe(
      "Referenced · res-1",
    );
  });
});

describe("a legacy entry's own fields were never validated either", () => {
  /* `legacy_fields` is the old node's keys copied verbatim, and nothing has
     ever asked their shapes. A name that is an object is a React child React
     refuses, which would take the panel down on a document the store expands
     happily. */
  test("a name that is not text is named rather than rendered", async () => {
    await show(
      pool({
        legacy_fields: {
          subagents: [
            { kind: "recipe_ref", recipe_name: { toString: null } },
            { kind: "inline" },
            "Summarizer",
          ],
        },
      }),
    );
    expect(screen.getByTestId("subagent-legacy-entry-0").textContent).toMatch(
      /no name/i,
    );
    expect(screen.getByTestId("subagent-legacy-entry-1").textContent).toMatch(
      /no name/i,
    );
    expect(screen.getByTestId("subagent-legacy-entry-2").textContent).toMatch(
      /not an object/i,
    );
  });

  test("a legacy pool whose entries are not a list still draws", async () => {
    await show(pool({ legacy_fields: { subagents: { "0": { kind: "inline" } } } }));
    expect(screen.getByTestId("subagent-pool-legacy")).toBeInTheDocument();
    expect(screen.queryByTestId("subagent-legacy-entry-0")).not.toBeInTheDocument();
  });
});

describe("a mode that cannot become a property key", () => {
  /* The guard was written against `__proto__` and read the table with
     `hasOwnProperty.call(table, key)` — which coerces the key, so the lookup
     itself threw on a value that refuses to be text. Guarding what the table
     answers was not enough; the question had to be admissible too. */
  test("does not take the panel down at the caption lookup", async () => {
    await show(pool({ subagents: [entry({ allowed_modes: [{ toString: null }] })] }));
    expect(screen.getByTestId("subagent-entry-0")).toBeInTheDocument();
    expect(screen.getByTestId("subagent-entry-0-problem-0").textContent).toMatch(
      /unknown mode/i,
    );
  });
});

describe("a draft that already holds duplicates can be repaired a step at a time", () => {
  /* Three entries sharing one id. The boundary refused any list that still
     held a duplicate, so the first repair could never happen: removing one of
     three leaves two, which it also refused. Entry ids have no edit control,
     so removal is the only repair there is — and it was the one blocked. */
  const three = [
    entry({ id: "dup", name: "A" }),
    entry({ id: "dup", name: "B" }),
    entry({ id: "dup", name: "C" }),
  ];

  test("removing one of three writes the remaining two", async () => {
    const { onChange } = await show(pool({ subagents: three }));
    fireEvent.click(screen.getByLabelText("Remove A"));
    expect(written(onChange).map((row) => row.name)).toEqual(["B", "C"]);
  });

  test("and removing again gets down to one", async () => {
    const { onChange } = await show(pool({ subagents: three.slice(0, 2) }));
    fireEvent.click(screen.getByLabelText("Remove B"));
    expect(written(onChange).map((row) => row.name)).toEqual(["A"]);
  });

  test("an unrelated edit beside them is not held back either", async () => {
    const { onChange } = await show(
      pool({ subagents: [...three.slice(0, 2), entry({ id: "sa9", name: "Unique" })] }),
    );
    fireEvent.change(
      within(screen.getByTestId("subagent-entry-2")).getByPlaceholderText(
        "what it is for (optional)",
      ),
      { target: { value: "checks the summary" } },
    );
    expect(written(onChange)[2].description).toBe("checks the summary");
  });

  test("but a collision this edit would create is still refused", async () => {
    /* The point of the boundary: the composer is never handed a collision it
       did not already have. */
    const { onChange } = await show(
      pool({ subagents: [entry({ id: "sa1", name: "A" }), entry({ id: "sa2", name: "B" })] }),
    );
    fireEvent.change(
      within(screen.getByTestId("subagent-entry-0")).getByDisplayValue("A"),
      { target: { value: "B" } },
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("an identity is not two names with a colon between them", () => {
  /* `pool:a` is a legal node id and `a:b` a legal entry id — the real store
     saves and reloads both — so `resource:pool:a:b` is the identity of two
     different things. Held text was drawn over the wrong entry again, one
     layer out from the last time. */
  const document_with = (node_id, entry_id) => ({
    schema_version: 1,
    kind: "agent",
    id: "parent",
    name: "Reviewer",
    nodes: [
      { id: "k", type: "agent", config: { execution: { inputs: [], outputs: [] } } },
      {
        id: node_id,
        type: "subagent_pool",
        config: {
          subagents: [
            entry({ id: entry_id, name: "Summarizer" }),
            entry({ id: `${entry_id}-2`, name: "Checker" }),
          ],
        },
      },
    ],
    edges: [],
  });

  const Panel = ({ node_id, entry_id }) => {
    const document = document_with(node_id, entry_id);
    return (
      <SubagentPoolSection
        document={document}
        node={document.nodes[1]}
        isDark={false}
        onChange={() => {}}
      />
    );
  };

  test("two tuples that concatenate alike are still two identities", async () => {
    list_resources.mockResolvedValue({ ok: true, data: { resources: LIBRARY } });
    const view = render(<Panel node_id="pool:a" entry_id="b" />);
    await act(async () => {});
    fireEvent.change(
      within(screen.getByTestId("subagent-entry-0")).getByDisplayValue("Summarizer"),
      { target: { value: "Checker" } },
    );
    expect(screen.getByTestId("subagent-entry-0-name-taken")).toBeInTheDocument();

    view.rerender(<Panel node_id="pool" entry_id="a:b" />);
    expect(
      within(screen.getByTestId("subagent-entry-0")).getByDisplayValue("Summarizer"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("subagent-entry-0-name-taken")).not.toBeInTheDocument();
  });
});

describe("while a newer library is being read", () => {
  /* Ordering the replies was not enough: the old answer stayed on screen and
     stayed clickable, so an Agent the newer read would exclude could still be
     referenced. An action has to be answered by the read that is current, not
     by the one that has been superseded. */
  test("the old candidates are not offered", async () => {
    let settle = null;
    list_resources.mockResolvedValue({ ok: true, data: { resources: LIBRARY } });
    const onChange = jest.fn();
    const node = pool({ subagents: [] });
    render(
      <SubagentPoolSection
        document={doc(node)}
        node={node}
        isDark={false}
        onChange={onChange}
      />,
    );
    await act(async () => {});

    list_resources.mockImplementationOnce(
      () => new Promise((resolve) => {
        settle = () => resolve({ ok: true, data: { resources: [] } });
      }),
    );
    fireEvent.click(screen.getByText("+ Add an Agent"));
    expect(screen.getByTestId("subagent-library-reading")).toBeInTheDocument();
    expect(screen.queryByLabelText("Reference Summarizer")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      settle();
    });
    expect(screen.getByTestId("subagent-picker-empty")).toBeInTheDocument();
  });
});

describe("a repair cannot deepen a collision either", () => {
  test("a third claim on a name two entries already share is refused", async () => {
    /* A set of colliding values cannot tell a repair that leaves two
       duplicates from an edit that makes a third. The counts can. */
    const { onChange } = await show(
      pool({
        subagents: [
          entry({ id: "sa1", name: "A" }),
          entry({ id: "sa2", name: "A" }),
          entry({ id: "sa3", name: "B" }),
        ],
      }),
    );
    fireEvent.change(
      within(screen.getByTestId("subagent-entry-2")).getByDisplayValue("B"),
      { target: { value: "A" } },
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("subagent-entry-2-name-taken")).toBeInTheDocument();
  });

  test("while removing one of them is still the way out", async () => {
    const { onChange } = await show(
      pool({ subagents: [entry({ id: "sa1", name: "A" }), entry({ id: "sa2", name: "A" })] }),
    );
    fireEvent.click(screen.getAllByLabelText("Remove A")[0]);
    expect(written(onChange)).toHaveLength(1);
  });
});

describe("a read that throws instead of answering", () => {
  test("leaves the picker saying so rather than reading for ever", async () => {
    await show(pool({ subagents: [] }), { library: { ok: true, data: { resources: [] } } });
    list_resources.mockRejectedValueOnce(new Error("the bridge went away"));
    await open_picker();
    expect(screen.queryByTestId("subagent-library-reading")).not.toBeInTheDocument();
    expect(screen.getByTestId("subagent-library-failed").textContent).toMatch(
      /went away/,
    );
  });
});

describe("two entries the document cannot tell apart", () => {
  /* A draft the real store saves: two entries with one id AND one name,
     distinguished only by their descriptions. The document's own identity is
     not an identity here, position is not one once a row is removed, and the
     stored value is not one either — so the only thing left is an identity
     the editor mints and carries across its own edits, which is what
     `mint_identities` is for. The blanket duplicate guard that used to hide
     this is not coming back: a duplicate draft must stay repairable. */
  const twins = [
    entry({ id: "dup", name: "Summarizer", description: "A" }),
    entry({ id: "dup", name: "Summarizer", description: "B" }),
    entry({ id: "sa3", name: "Checker", description: "C" }),
  ];

  function Live({ initial }) {
    const [document, setDocument] = React.useState(doc(pool({ subagents: initial })));
    return (
      <SubagentPoolSection
        document={document}
        node={document.nodes[1]}
        isDark={false}
        onChange={setDocument}
      />
    );
  }

  const live = async (initial) => {
    list_resources.mockResolvedValue({ ok: true, data: { resources: LIBRARY } });
    render(<Live initial={initial} />);
    await act(async () => {});
  };

  const first = () => within(screen.getByTestId("subagent-entry-0"));

  test("a removal does not hand the first row's refused name to the survivor", async () => {
    await live(twins);
    fireEvent.change(first().getByDisplayValue("Summarizer"), {
      target: { value: "Checker" },
    });
    expect(screen.getByTestId("subagent-entry-0-name-taken")).toBeInTheDocument();

    fireEvent.click(screen.getAllByLabelText("Remove Summarizer")[0]);
    expect(screen.getAllByTestId(/^subagent-entry-\d+$/)).toHaveLength(2);
    expect(first().getByDisplayValue("Summarizer")).toBeInTheDocument();
    expect(screen.queryByTestId("subagent-entry-0-name-taken")).not.toBeInTheDocument();
  });

  test("the survivor is the other entry, by its own description", async () => {
    /* The two are the same everywhere the document can be asked, so the
       description is the only witness that the right one is on screen. */
    await live(twins);
    fireEvent.click(screen.getAllByLabelText("Remove Summarizer")[0]);
    expect(first().getByDisplayValue("B")).toBeInTheDocument();
  });

  test("and the row being corrected keeps its text when another is removed", async () => {
    /* The other direction of the same edit: the row holding the text is not
       the one that moved, so it still holds it. */
    await live(twins);
    fireEvent.change(first().getByDisplayValue("Summarizer"), {
      target: { value: "Checker" },
    });
    fireEvent.click(screen.getByLabelText("Remove Checker"));
    expect(first().getByDisplayValue("Checker")).toBeInTheDocument();
    expect(screen.getByTestId("subagent-entry-0-name-taken")).toBeInTheDocument();
  });

  test("adding an Agent below does not disturb the row being corrected", async () => {
    await live(twins);
    fireEvent.change(first().getByDisplayValue("Summarizer"), {
      target: { value: "Checker" },
    });
    await open_picker();
    fireEvent.click(screen.getByLabelText("Reference Summarizer"));
    expect(first().getByDisplayValue("Checker")).toBeInTheDocument();
  });

  test("a refused write leaves the rows exactly as they were", async () => {
    /* `set_entries` can refuse, and the identities must not be told about an
       edit that did not happen — a list whose ids no longer match its entries
       re-mints all of them, which would drop what every row is holding. */
    await live(twins);
    fireEvent.change(first().getByDisplayValue("Summarizer"), {
      target: { value: "Checker" },
    });
    fireEvent.change(
      within(screen.getByTestId("subagent-entry-1")).getByDisplayValue("B"),
      { target: { value: "B2" } },
    );
    expect(first().getByDisplayValue("Checker")).toBeInTheDocument();
    expect(screen.getByTestId("subagent-entry-0-name-taken")).toBeInTheDocument();
  });
});

describe("the other editor's version arriving underneath", () => {
  /* "Take theirs" replaces the document with one that was read back, so every
     object in it is new — but the row count can be the same and, for two
     entries the document cannot tell apart, so can every value the panel
     could compare. The minted identities were carried across it as though the
     editor had made the change itself, and the text held against the first
     row was drawn over the entry that took its place. */
  const twin = (description) =>
    entry({ id: "dup", name: "Summarizer", description });

  /* Three entries, as the witness has them: the two the document cannot tell
     apart, and a third whose name is the one typed over the first — so the
     name really is refused and there really is something held. A fixture
     where nothing is taken makes the box store what was typed, and then the
     test is red for the wrong reason. */
  const version = (first, second) => ({
    schema_version: 1,
    kind: "agent",
    id: "parent",
    name: "Reviewer",
    nodes: [
      { id: "k", type: "agent", config: { execution: { inputs: [], outputs: [] } } },
      {
        id: "pool",
        type: "subagent_pool",
        config: {
          subagents: [
            twin(first),
            twin(second),
            entry({ id: "sa3", name: "Checker", description: "C" }),
          ],
        },
      },
    ],
    edges: [],
  });

  const panel = (document) => (
    <SubagentPoolSection
      document={document}
      node={document.nodes[1]}
      isDark={false}
      onChange={() => {}}
    />
  );

  const first = () => within(screen.getByTestId("subagent-entry-0"));

  const open = async (document) => {
    list_resources.mockResolvedValue({ ok: true, data: { resources: LIBRARY } });
    const view = render(panel(document));
    await act(async () => {});
    return view;
  };

  test("a reorder with the same count does not keep the old row's text", async () => {
    const view = await open(version("A", "B"));
    fireEvent.change(first().getByDisplayValue("Summarizer"), {
      target: { value: "Checker" },
    });
    expect(screen.getByTestId("subagent-entry-0-name-taken")).toBeInTheDocument();

    view.rerender(panel(version("B", "A")));
    expect(first().getByDisplayValue("Summarizer")).toBeInTheDocument();
    expect(first().getByDisplayValue("B")).toBeInTheDocument();
    expect(screen.queryByTestId("subagent-entry-0-name-taken")).not.toBeInTheDocument();
  });

  test("and neither does a version that is identical in every value", async () => {
    /* The panel cannot tell this version from the one it had, and it does not
       have to: a version that arrived from outside is not an edit this editor
       made, so what it was holding against the old rows is void either way. */
    const view = await open(version("A", "B"));
    fireEvent.change(first().getByDisplayValue("Summarizer"), {
      target: { value: "Checker" },
    });
    view.rerender(panel(version("A", "B")));
    expect(first().getByDisplayValue("Summarizer")).toBeInTheDocument();
    expect(screen.queryByTestId("subagent-entry-0-name-taken")).not.toBeInTheDocument();
  });

  test("a render that changed nothing at all still keeps it", async () => {
    /* The other direction: re-rendering with the same document is not a new
       version, and throwing away what the author is typing on every parent
       render would make the box unusable. */
    const document = version("A", "B");
    const view = await open(document);
    fireEvent.change(first().getByDisplayValue("Summarizer"), {
      target: { value: "Checker" },
    });
    view.rerender(panel(document));
    expect(first().getByDisplayValue("Checker")).toBeInTheDocument();
    expect(screen.getByTestId("subagent-entry-0-name-taken")).toBeInTheDocument();
  });
});

describe("converting a legacy pool", () => {
  /* The store has always done this conversion for every run and thrown it
     away, so the settings were preserved where nobody could see them. Making
     it permanent is a write to the stored resource, which is why the panel
     asks rather than does. */
  const legacy = (entries) => pool({ legacy_fields: { subagents: entries } });

  const named = [
    { kind: "recipe_ref", recipe_name: "Summarizer" },
    { kind: "ref", template_name: "Checker" },
  ];

  const show_legacy = async (entries, extra) => {
    list_resources.mockResolvedValue({ ok: true, data: { resources: LIBRARY } });
    const node = legacy(entries);
    const onConvertLegacy = jest.fn();
    render(
      <SubagentPoolSection
        document={doc(node)}
        node={node}
        isDark={false}
        onChange={() => {}}
        onConvertLegacy={onConvertLegacy}
        canConvertLegacy
        {...extra}
      />,
    );
    await act(async () => {});
    return { onConvertLegacy };
  };

  test("entries that name a definition are converted on request", async () => {
    const { onConvertLegacy } = await show_legacy(named);
    fireEvent.click(screen.getByText("Convert to Agent entries"));
    expect(onConvertLegacy).toHaveBeenCalled();
  });

  test("and the notice says what the conversion carries", async () => {
    await show_legacy(named);
    expect(screen.getByTestId("subagent-pool-legacy").textContent).toMatch(
      /tools, delegation modes, memory and parallel safety/i,
    );
  });

  /* An inline entry carries a prompt rather than naming an Agent, so
     converting it means building an Agent — and that needs a model. The
     Kernel configured on this Agent's Agent node is what goes over; the
     rules, and every verdict asserted about them, are measured in
     `legacy_conversion` and its capture. */
  const KERNEL = {
    schema_version: 1,
    profile: {
      id: "openai:gpt-4.1",
      provider: "openai",
      model: "gpt-4.1",
      protocol: "openai-responses",
      endpoint: "https://api.openai.com/v1",
      credential_ref: "openai",
      context_window: 128000,
      output_limit: 4096,
      capabilities: { json_schema: true, images: true, files: true },
    },
    prompt: "You are the parent.",
    max_iterations: 6,
    output_tokens: 2048,
    history: "root",
    overflow: "error",
    json_schema: null,
  };

  const inline = (over) => ({
    kind: "inline",
    name: "Shortener",
    prompt_format: "skeleton",
    template: { prompt: "Be brief." },
    ...over,
  });

  /* The same document the panel is given, with a Kernel on the Agent node the
     pool is attached to. `extra_nodes` sit beside it, and `extra_owners`
     attach the pool to them as well — which is the only way two Kernels can
     both be this pool's. */
  const configured = (
    node,
    kernel = KERNEL,
    extra_nodes = [],
    extra_owners = [],
  ) => {
    const base = doc(node);
    return {
      ...base,
      nodes: [
        { ...base.nodes[0], config: { ...base.nodes[0].config, kernel } },
        ...extra_nodes,
        ...base.nodes.slice(1),
      ],
      edges: [
        ...base.edges,
        ...extra_owners.map((owner, index) => ({
          id: `${owner}-attach-${index}`,
          kind: "attach",
          source_node_id: node.id,
          source_port_id: "attach_top",
          target_node_id: owner,
          target_port_id: "attach_bot",
        })),
      ],
    };
  };

  test("an inline entry is not offered while the owner has no model", async () => {
    /* The Agent node this pool is attached to is the one that decides, so it
       is the one the author is sent to — not "this Agent" in general, which
       in a graph with several Kernel Loops is not an address. */
    const { onConvertLegacy } = await show_legacy([...named, inline()]);
    const notice = screen.getByTestId("subagent-pool-legacy-needs-kernel").textContent;
    expect(notice).toMatch(/attached to k, which has no model configured yet/i);
    expect(notice).toMatch(/choose one there and save/i);
    expect(notice).toMatch(/another node's is not used in its place/i);
    expect(notice).not.toMatch(/no control for/i);
    expect(notice).not.toMatch(/wired up/i);
    expect(screen.queryByText("Convert to Agent entries")).not.toBeInTheDocument();
    expect(onConvertLegacy).not.toHaveBeenCalled();
  });

  test("an inline entry is not offered while the pool is attached to nothing", async () => {
    const node = legacy([inline()]);
    const unattached = { ...configured(node), edges: [] };
    const { onConvertLegacy } = await show_legacy([inline()], {
      document: unattached,
    });
    const notice = screen.getByTestId("subagent-pool-legacy-needs-kernel").textContent;
    expect(notice).toMatch(/not attached to an Agent node/i);
    expect(notice).toMatch(/attach it to this Agent's Agent node and save/i);
    expect(screen.queryByText("Convert to Agent entries")).not.toBeInTheDocument();
    expect(onConvertLegacy).not.toHaveBeenCalled();
  });

  test("with a model chosen it is offered, and says what it will build", async () => {
    const node = legacy([...named, inline()]);
    const { onConvertLegacy } = await show_legacy([...named, inline()], {
      document: configured(node),
    });
    const notice = screen.getByTestId("subagent-pool-legacy-kernel-chosen").textContent;
    expect(notice).toMatch(/converting builds an Agent for each — on openai:gpt-4\.1/i);
    /* The one thing it deliberately does not carry, said rather than left to
       be discovered: the runtime copies the supplied Kernel verbatim. */
    expect(notice).toMatch(/JSON output schema does not/i);
    fireEvent.click(screen.getByText("Convert to Agent entries"));
    expect(onConvertLegacy).toHaveBeenCalled();
    expect(
      screen.queryByTestId("subagent-pool-legacy-needs-kernel"),
    ).not.toBeInTheDocument();
  });

  test("an entry that declares another model is named, not silently moved", async () => {
    /* The runtime compares the two and writes nothing if they differ, so the
       panel answers the comparison instead of letting a refused write do it. */
    const entries = [inline({ template: { prompt: "Be brief.", model: "anthropic:claude-x" } })];
    const node = legacy(entries);
    const { onConvertLegacy } = await show_legacy(entries, {
      document: configured(node),
    });
    const notice = screen.getByTestId("subagent-pool-legacy-needs-kernel").textContent;
    expect(notice).toMatch(/Shortener declares anthropic:claude-x/);
    expect(notice).toMatch(/this pool is built on openai:gpt-4\.1/);
    expect(notice).toMatch(/does not move a subagent onto a different model/i);
    expect(screen.queryByText("Convert to Agent entries")).not.toBeInTheDocument();
    expect(onConvertLegacy).not.toHaveBeenCalled();
  });

  test("an entry stored in the other legacy format declares one too", async () => {
    /* Which legacy prompt format an entry was stored in is not something the
       author chose or can see, and the store now converts both through the
       same template IR — so a declared model constrains the conversion the
       same way in either. The panel stating otherwise would be offering to
       build this subagent on a model it does not declare. */
    const entries = [
      inline({
        prompt_format: "soul",
        template: { prompt: "Be brief.", model: "anthropic:claude-x" },
      }),
    ];
    const node = legacy(entries);
    const { onConvertLegacy } = await show_legacy(entries, {
      document: configured(node),
    });
    const notice = screen.getByTestId("subagent-pool-legacy-needs-kernel").textContent;
    expect(notice).toMatch(/Shortener declares anthropic:claude-x/);
    expect(notice).toMatch(/does not move a subagent onto a different model/i);
    expect(screen.queryByText("Convert to Agent entries")).not.toBeInTheDocument();
    expect(onConvertLegacy).not.toHaveBeenCalled();
  });

  test("a model name with nothing visible in it is still readable", async () => {
    /* A byte order mark survives the runtime's own strip, so the entry really
       does declare a different model — and a message that printed it raw
       would read as `gpt-4.1 is not openai:gpt-4.1`. */
    const entries = [inline({ template: { prompt: "Be brief.", model: "\ufeffgpt-4.1" } })];
    const node = legacy(entries);
    await show_legacy(entries, { document: configured(node) });
    expect(
      screen.getByTestId("subagent-pool-legacy-needs-kernel").textContent,
    ).toMatch(/declares \\ufeffgpt-4\.1/);
  });

  const other_kernel = {
    ...KERNEL,
    profile: {
      ...KERNEL.profile,
      id: "x",
      provider: "anthropic",
      model: "claude-x",
      protocol: "anthropic",
      endpoint: "https://api.anthropic.com",
    },
  };

  test("two owners of one pool that disagree are named rather than chosen between", async () => {
    /* Two Kernel Loops are only this pool's problem when the pool is attached
       to both of them: the subagents it builds are built once. */
    const entries = [inline()];
    const node = legacy(entries);
    const other = { id: "k2", type: "agent", config: { kernel: other_kernel } };
    await show_legacy(entries, {
      document: configured(node, KERNEL, [other], ["k2"]),
    });
    const notice = screen.getByTestId("subagent-pool-legacy-needs-kernel").textContent;
    expect(notice).toMatch(/attached to more than one Agent node/i);
    expect(notice).toMatch(/\(k, k2\)/);
    expect(notice).toMatch(/not inherited and need not match/i);
    expect(screen.queryByText("Convert to Agent entries")).not.toBeInTheDocument();
  });

  test("a second Kernel Loop the pool is not attached to is not its business", async () => {
    const entries = [inline()];
    const node = legacy(entries);
    const other = { id: "k2", type: "agent", config: { kernel: other_kernel } };
    const { onConvertLegacy } = await show_legacy(entries, {
      document: configured(node, KERNEL, [other]),
    });
    const notice = screen.getByTestId("subagent-pool-legacy-kernel-chosen").textContent;
    expect(notice).toMatch(/on openai:gpt-4\.1, the model configured on the Agent node this pool is attached to \(k\)/);
    fireEvent.click(screen.getByText("Convert to Agent entries"));
    expect(onConvertLegacy).toHaveBeenCalled();
  });

  test("a Kernel the runtime would refuse is named by its own field", async () => {
    const entries = [inline()];
    const node = legacy(entries);
    await show_legacy(entries, {
      document: configured(node, { ...KERNEL, history: "all" }),
    });
    const notice = screen.getByTestId("subagent-pool-legacy-needs-kernel").textContent;
    /* The runtime's own address for it, which is the node's Kernel rather
       than a request field the author never filled in. */
    expect(notice).toMatch(
      /unknown_variant at document\.nodes\[0\]\.config\.kernel\.history/,
    );
    expect(notice).toMatch(/The model configured on k is not one/);
    expect(notice).toMatch(/nothing would be written/i);
    expect(screen.queryByText("Convert to Agent entries")).not.toBeInTheDocument();
  });

  test("a draft with unsaved work is told to save first", async () => {
    /* The conversion rewrites the stored resource and moves its token on,
       which would leave unsaved work unable to save. */
    await show_legacy(named, { canConvertLegacy: false });
    expect(screen.getByTestId("subagent-pool-legacy-save-first").textContent).toMatch(
      /save this draft first/i,
    );
    expect(screen.queryByText("Convert to Agent entries")).not.toBeInTheDocument();
  });

  test("a panel with no resource session says so instead of offering it", async () => {
    await show_legacy(named, { onConvertLegacy: undefined });
    expect(screen.getByTestId("subagent-pool-legacy-unreachable").textContent).toMatch(
      /cannot reach/i,
    );
    expect(screen.queryByText("Convert to Agent entries")).not.toBeInTheDocument();
  });

  test("the legacy entries are still only listed, never edited", async () => {
    await show_legacy(named);
    expect(screen.getByTestId("subagent-legacy-entry-0").textContent).toBe("Summarizer");
    expect(screen.getByTestId("subagent-legacy-entry-1").textContent).toBe("Checker");
    expect(screen.queryByTestId("subagent-entry-0")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("name")).not.toBeInTheDocument();
  });

  test("once converted, the ordinary editor takes over", async () => {
    list_resources.mockResolvedValue({ ok: true, data: { resources: LIBRARY } });
    const before = legacy(named);
    const panel = (node) => (
      <SubagentPoolSection
        document={doc(node)}
        node={node}
        isDark={false}
        onChange={() => {}}
        onConvertLegacy={() => {}}
        canConvertLegacy
      />
    );
    const view = render(panel(before));
    await act(async () => {});
    expect(screen.getByTestId("subagent-pool-legacy")).toBeInTheDocument();

    view.rerender(panel(pool({ subagents: [entry()] })));
    expect(screen.queryByTestId("subagent-pool-legacy")).not.toBeInTheDocument();
    expect(screen.getByTestId("subagent-entry-0")).toBeInTheDocument();
    expect(screen.getByText("+ Add an Agent")).toBeInTheDocument();
  });
});

describe("the conversion covers the whole Agent, so the button has to as well", () => {
  /* `convert_legacy_pools` expands every legacy pool in the document. A
     button that asked only about the pool it is drawn on offered a conversion
     that the store would refuse because of a pool somewhere else. */
  /* Both pools attached to the one configured Agent node, which is the shape
     a migrated Agent with two pools actually has — and the only shape in
     which the other pool's problem is about its entries rather than about
     its attachment. */
  const two_pools = (other_entries) => ({
    schema_version: 1,
    kind: "agent",
    id: "parent",
    name: "Reviewer",
    nodes: [
      {
        id: "k",
        type: "agent",
        config: {
          execution: { inputs: [], outputs: [] },
          kernel: {
            schema_version: 1,
            profile: {
              id: "openai:gpt-4.1",
              provider: "openai",
              model: "gpt-4.1",
              protocol: "openai-responses",
              endpoint: "https://api.openai.com/v1",
              credential_ref: "openai",
              context_window: 128000,
              output_limit: 4096,
              capabilities: { json_schema: true, images: true, files: true },
            },
            prompt: "You are the parent.",
            max_iterations: 6,
            output_tokens: 2048,
            history: "root",
            overflow: "error",
            json_schema: null,
          },
        },
      },
      {
        id: "pool-a",
        type: "subagent_pool",
        config: { legacy_fields: { subagents: [{ kind: "recipe_ref", recipe_name: "Summarizer" }] } },
      },
      {
        id: "pool-b",
        type: "subagent_pool",
        config: { legacy_fields: { subagents: other_entries } },
      },
    ],
    edges: ["pool-a", "pool-b"].map((pool_id) => ({
      id: `${pool_id}-attach`,
      kind: "attach",
      source_node_id: "k",
      source_port_id: "attach_bot",
      target_node_id: pool_id,
      target_port_id: "attach_top",
    })),
  });

  const open_first = async (other_entries) => {
    list_resources.mockResolvedValue({ ok: true, data: { resources: LIBRARY } });
    const document = two_pools(other_entries);
    const onConvertLegacy = jest.fn();
    render(
      <SubagentPoolSection
        document={document}
        node={document.nodes[1]}
        isDark={false}
        onChange={() => {}}
        onConvertLegacy={onConvertLegacy}
        canConvertLegacy
      />,
    );
    await act(async () => {});
    return { onConvertLegacy };
  };

  test("an entry in another pool the store would refuse withholds the button here too", async () => {
    const { onConvertLegacy } = await open_first([
      {
        kind: "inline",
        name: "Shortener",
        prompt_format: "soul",
        template: { prompt: "Be brief", model: "anthropic:claude-x" },
      },
    ]);
    expect(screen.queryByText("Convert to Agent entries")).not.toBeInTheDocument();
    expect(onConvertLegacy).not.toHaveBeenCalled();
    const notice = screen.getByTestId("subagent-pool-legacy-needs-kernel").textContent;
    expect(notice).toMatch(/the pool pool-b is built on openai:gpt-4\.1/);
    expect(notice).toMatch(/one write covering every pool in this Agent/i);
  });

  test("and the notice says the conversion is for every pool in this Agent", async () => {
    await open_first([{ kind: "ref", template_name: "Checker" }]);
    expect(screen.getByText("Convert to Agent entries")).toBeInTheDocument();
    expect(screen.getByTestId("subagent-pool-legacy").textContent).toMatch(
      /every Subagent Pool in this Agent/i,
    );
  });
});

describe("while the conversion is in flight", () => {
  /* The session refuses a second one, which also makes `canConvertLegacy`
     false — and the reason it is false matters: "save this draft first" would
     be a sentence about a state the author is not in. */
  test("it says it is converting rather than telling the author to save", async () => {
    list_resources.mockResolvedValue({ ok: true, data: { resources: LIBRARY } });
    const node = pool({ legacy_fields: { subagents: [{ kind: "recipe_ref", recipe_name: "Summarizer" }] } });
    render(
      <SubagentPoolSection
        document={doc(node)}
        node={node}
        isDark={false}
        onChange={() => {}}
        onConvertLegacy={() => {}}
        canConvertLegacy={false}
        convertingLegacy
      />,
    );
    await act(async () => {});
    expect(screen.getByTestId("subagent-pool-legacy-converting").textContent).toMatch(
      /converting/i,
    );
    expect(screen.queryByTestId("subagent-pool-legacy-save-first")).not.toBeInTheDocument();
    expect(screen.queryByText("Convert to Agent entries")).not.toBeInTheDocument();
  });
});


describe("a pool that arrives from the store", () => {
  /* The other three controls in this panel that hold unstored text needed the
     document they were typed into added to their identity. This one did not,
     and that is worth a test rather than a claim: the entry rows are keyed by
     `useListIdentities`, which reminds its ids for any list this editor did
     not announce it was writing — a reload, a conflict resolved the other
     way, the other version taken — and a reminded row takes its name box with
     it. Were that mechanism dropped, this would be the test that noticed. */
  const two = [entry(), entry({ id: "subagent-2", name: "Checker" })];

  const panel = (node, onChange) => (
    <SubagentPoolSection
      document={doc(node)}
      node={node}
      isDark={false}
      onChange={onChange}
    />
  );

  test("a refused name is discarded when their version holds the same entries", async () => {
    list_resources.mockResolvedValue({ ok: true, data: { resources: LIBRARY } });
    const onChange = jest.fn();
    const mine = pool({ subagents: two });
    const view = render(panel(mine, onChange));
    await act(async () => {});

    const row = within(screen.getByTestId("subagent-entry-0"));
    fireEvent.change(row.getByDisplayValue("Summarizer"), {
      target: { value: "Checker" },
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("subagent-entry-0-name-taken")).toBeInTheDocument();

    /* Their version: the same two entries, as a list this editor never wrote. */
    await act(async () => {
      view.rerender(panel(pool({ subagents: two.map((item) => ({ ...item })) }), onChange));
    });

    expect(
      within(screen.getByTestId("subagent-entry-0")).getByDisplayValue("Summarizer"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("subagent-entry-0-name-taken"),
    ).not.toBeInTheDocument();
  });
});
