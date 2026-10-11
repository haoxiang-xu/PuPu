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

const doc = (node) => ({
  schema_version: 1,
  kind: "agent",
  id: "parent",
  name: "Reviewer",
  nodes: [
    { id: "k", type: "agent", config: { execution: { inputs: [], outputs: [] } } },
    node,
  ],
  edges: [],
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
    fireEvent.click(screen.getByText("+ Add an Agent"));
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
    fireEvent.click(screen.getByText("+ Add an Agent"));
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
    fireEvent.click(screen.getByText("+ Add an Agent"));
    expect(screen.queryByText("Nightly flow")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Reference Nightly flow/)).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("neither is this Agent itself, nor an archived one", async () => {
    await show(pool({ subagents: [] }));
    fireEvent.click(screen.getByText("+ Add an Agent"));
    expect(screen.queryByText("Reviewer")).not.toBeInTheDocument();
    expect(screen.queryByText("Retired")).not.toBeInTheDocument();
  });

  test("and the absence is explained rather than left to be noticed", async () => {
    await show(pool({ subagents: [] }));
    fireEvent.click(screen.getByText("+ Add an Agent"));
    expect(screen.getByTestId("subagent-picker-withheld").textContent).toMatch(
      /3 other resources are not offered/i,
    );
  });

  test("the same Agent can be referenced twice, under a free name", async () => {
    const { onChange } = await show(pool({ subagents: [entry()] }));
    fireEvent.click(screen.getByText("+ Add an Agent"));
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
    fireEvent.click(screen.getByText("+ Add an Agent"));
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
    fireEvent.click(screen.getByText("+ Add an Agent"));
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
      fireEvent.click(screen.getByText("+ Add an Agent"));
    });
    expect(list_resources).toHaveBeenCalledTimes(2);
  });

  test("closing it again does not", async () => {
    await show(pool({ subagents: [] }));
    await act(async () => {
      fireEvent.click(screen.getByText("+ Add an Agent"));
    });
    fireEvent.click(screen.getByText("Cancel"));
    expect(list_resources).toHaveBeenCalledTimes(2);
  });

  test("an Agent that has since appeared is offered", async () => {
    await show(pool({ subagents: [] }), { library: { ok: true, data: { resources: [] } } });
    fireEvent.click(screen.getByText("+ Add an Agent"));
    expect(screen.getByTestId("subagent-picker-empty")).toBeInTheDocument();
    list_resources.mockResolvedValue({ ok: true, data: { resources: LIBRARY } });
    fireEvent.click(screen.getByText("Cancel"));
    await act(async () => {
      fireEvent.click(screen.getByText("+ Add an Agent"));
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
