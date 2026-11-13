import React from "react";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import SubagentPoolSection, { SUBAGENT_STRIP } from "./subagent_pool_section";
import { node_subagents } from "../skeleton_document";
import { list_resources } from "../skeleton_resources";
import { emitSkeletonLibraryRefresh } from "../../../../../SERVICEs/skeleton_library_refresh";

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
  return function MockButton({ label, ariaLabel, onClick, prefix_icon, title }) {
    return (
      <button type="button" aria-label={ariaLabel} onClick={onClick} data-prefix-icon={prefix_icon} data-label={label} title={title}>
        {label || ariaLabel || "button"}
      </button>
    );
  };
});

jest.mock("../../../../../BUILTIN_COMPONENTs/input/switch", () => {
  const MockSwitch = function MockSwitch({ on, set_on }) {
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
  return { __esModule: true, default: MockSwitch, SemiSwitch: MockSwitch };
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
      onEntryIdRepaired={options.onEntryIdRepaired}
      onOpenSubagent={options.onOpenSubagent}
    />,
  );
  /* The library is read in an effect, so let it land before anything is
     asserted about what is offered. */
  await act(async () => {});
  return { onChange, view };
}

/* The library is always in view and is read again when the store announces
   a change; a test that needs a fresh read announces one the way a save does,
   and waits the moment out. */
async function reread_library() {
  await act(async () => {
    emitSkeletonLibraryRefresh({ reason: "resource_saved" });
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
    expect(screen.queryByText("Nightly flow")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Reference Nightly flow/)).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("neither is this Agent itself, nor an archived one", async () => {
    await show(pool({ subagents: [] }));
    expect(screen.queryByText("Reviewer")).not.toBeInTheDocument();
    expect(screen.queryByText("Retired")).not.toBeInTheDocument();
  });

  test("and the absence is explained rather than left to be noticed", async () => {
    await show(pool({ subagents: [] }));
    expect(screen.getByTestId("subagent-picker-withheld").textContent).toMatch(
      /3 other resources are not offered/i,
    );
  });

  test("the same Agent can be referenced twice, under a free name", async () => {
    const { onChange } = await show(pool({ subagents: [entry()] }));
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
    expect(screen.getByTestId("subagent-library-unavailable").textContent).toMatch(
      /library is not reachable/i,
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
    expect(screen.getByTestId("subagent-library-failed").textContent).toMatch(/locked/);
  });
});

describe("a row manages the entry, never the subagent's contents", () => {
  test("the section says where contents are edited", async () => {
    await show(pool({ subagents: [entry()] }));
    /* The caption is the panel's standard Block; what it is for sits behind
       its info button. */
    const help = screen.getByRole("button", { name: /^Subagents · / });
    await act(async () => { fireEvent.mouseEnter(help.parentElement); });
    expect((await screen.findByTestId("subagent-pool-title")).title).toMatch(
      /contents are edited by opening its graph/i,
    );
  });

  test("there is no prompt, no model and nothing else of the subagent's own", async () => {
    /* Two choices on the row and no more: what this Agent reads back — three
       segments — and whether the child keeps a memory of its own — one
       switch. A model or a prompt box here would be editing the subagent
       itself, which is the one thing this panel does not do. */
    await show(pool({ subagents: [entry()] }));
    const row = within(screen.getByTestId("subagent-entry-0"));
    expect(row.queryAllByTestId("select")).toHaveLength(0);
    for (const label of ["Summary", "Last message", "Full trace", "Own memory"]) {
      expect(row.getByText(label)).toBeInTheDocument();
    }
    expect(row.queryByText("None")).toBeNull();
    expect(row.queryByText("Own scope")).toBeNull();
    expect(screen.queryByPlaceholderText(/prompt/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/model/i)).not.toBeInTheDocument();
  });

  test("the row says where its Agent comes from, by the source and nothing else", async () => {
    await show(pool({ subagents: [entry()] }));
    /* The entry is already called Summarizer, so the source does not
       repeat the referenced Agent's name. */
    expect(screen.getByTestId("subagent-entry-0-source").textContent).toBe(
      "Referenced",
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
    fireEvent.click(row.getByText("Full trace"));
    expect(written(onChange)[0].output_mode).toBe("full_trace");
  });

  test("the child's memory policy is stored as its own token", async () => {
    const { onChange } = await show(pool({ subagents: [entry()] }));
    fireEvent.click(screen.getByTestId("subagent-entry-0-toggle"));
    const memory = screen.getByTestId("subagent-entry-0-memory");
    expect(memory).toHaveAttribute("role", "switch");
    expect(memory).toHaveAttribute("aria-label", "Own memory");
    expect(memory).toHaveAttribute("aria-checked", "false");
    fireEvent.click(within(memory).getByRole("switch"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(written(onChange)[0].memory_policy).toBe("scoped_persistent");
  });

  test("own memory switches back to no memory, by click and by keyboard", async () => {
    const { onChange } = await show(pool({ subagents: [entry({ memory_policy: "scoped_persistent" })] }));
    fireEvent.click(screen.getByTestId("subagent-entry-0-toggle"));
    const memory = screen.getByTestId("subagent-entry-0-memory");
    expect(memory).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(memory).getByRole("switch"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(written(onChange)[0].memory_policy).toBe("ephemeral");
    fireEvent.keyDown(memory, { key: " " });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(written(onChange, 1)[0].memory_policy).toBe("ephemeral");
    /* An assistive click lands on the switch itself, and writes once. */
    fireEvent.click(memory);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  test("off is no memory, and an unknown policy is not called own memory", async () => {
    const { onChange } = await show(pool({ subagents: [entry({ memory_policy: "nonsense" })] }));
    const memory = screen.getByTestId("subagent-entry-0-memory");
    expect(memory).toHaveAttribute("aria-checked", "false");
    fireEvent.keyDown(memory, { key: "Enter" });
    expect(written(onChange)[0].memory_policy).toBe("scoped_persistent");
  });

  test("parallel safety is a boolean, on the same switch row as Own memory", async () => {
    const { onChange } = await show(pool({ subagents: [entry()] }));
    fireEvent.click(screen.getByTestId("subagent-entry-0-toggle"));
    const row = screen.getByTestId("subagent-entry-0-parallel");
    /* the row itself is the switch, like Own memory: checked, labelled,
       reachable by keyboard */
    expect(row).toHaveAttribute("role", "switch");
    expect(row).toHaveAttribute("aria-checked", "true");
    expect(row).toHaveAttribute("tabindex", "0");
    fireEvent.click(within(row).getByRole("switch"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(written(onChange)[0].parallel_safe).toBe(false);
  });

  test("the parallel switch answers the keyboard, and an assistive click writes once", async () => {
    const { onChange } = await show(pool({ subagents: [entry()] }));
    const row = screen.getByTestId("subagent-entry-0-parallel");
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(written(onChange)[0].parallel_safe).toBe(false);
    fireEvent.click(row);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  test("tool restrictions are shown as stored and not edited here", async () => {
    await show(
      pool({ subagents: [entry({ allowed_tools: ["write", "web_fetch"], disabled_tools: ["shell"] })] }),
    );
    expect(screen.getByTestId("subagent-entry-0-tools").textContent).toBe(
      "write, web_fetch, except shell",
    );
  });

  test("every tool is the default and is not restated; no tool is said", async () => {
    const { view } = await show(pool({ subagents: [entry({ allowed_tools: null })] }));
    expect(screen.queryByTestId("subagent-entry-0-tools")).not.toBeInTheDocument();
    view.unmount();
    await show(pool({ subagents: [entry({ allowed_tools: [] })] }));
    expect(screen.getByTestId("subagent-entry-0-tools").textContent).toBe("no tool");
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
    expect(screen.queryByText("New embedded Agent")).not.toBeInTheDocument();
    expect(screen.queryByTestId("process-section-subagent-library")).not.toBeInTheDocument();
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

describe("the library is always in view, and read again when the store changes", () => {
  /* Within one sitting it can only change from somewhere else, and both ways
     it goes wrong are worth a request: offering an Agent that was just
     archived, and calling a reference missing when it is not. */
  test("the add button sits under the subagents, and the library below is shown without any click", async () => {
    await show(pool({ subagents: [entry()] }));
    const library = screen.getByTestId("process-section-subagent-library");
    expect(library).toHaveAttribute("aria-label", "Agent library");
    expect(screen.queryByText("+ Add an Agent")).not.toBeInTheDocument();
    /* New embedded Agent belongs to the Subagents section, after the last
       subagent, not to the library. */
    const pool_block = screen.getByTestId("process-section-subagents");
    const create = within(pool_block).getByRole("button", { name: "New embedded Agent" });
    expect(within(library).queryByRole("button", { name: "New embedded Agent" })).toBeNull();
    const last_entry = screen.getByTestId("subagent-entry-0-region");
    expect(last_entry.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(library).getByLabelText("Reference Summarizer")).toBeInTheDocument();
    expect(within(library).getByTestId("subagent-picker")).toBeInTheDocument();
    /* Below the pool, not inside it. */
    const pool_section = screen.getByTestId("process-section-subagents");
    expect(pool_section.contains(library)).toBe(false);
    expect(pool_section.compareDocumentPosition(library) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("the panel reads it once on mount, and again when the store announces a change", async () => {
    await show(pool({ subagents: [] }));
    expect(list_resources).toHaveBeenCalledTimes(1);
    await reread_library();
    expect(list_resources).toHaveBeenCalledTimes(2);
  });

  test("an unmounted panel stops listening", async () => {
    const { view } = await show(pool({ subagents: [] }));
    view.unmount();
    await reread_library();
    expect(list_resources).toHaveBeenCalledTimes(1);
  });

  test("an Agent that has since appeared is offered", async () => {
    await show(pool({ subagents: [] }), { library: { ok: true, data: { resources: [] } } });
    expect(screen.getByTestId("subagent-picker-empty")).toBeInTheDocument();
    list_resources.mockResolvedValue({ ok: true, data: { resources: LIBRARY } });
    await reread_library();
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
      "not stated",
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
    await show(pool({ subagents: [entry({ allowed_tools: ["write"] })] }));
    expect(screen.getByTestId("subagent-entry-0-tools").title).toMatch(
      /not edited here/i,
    );
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
      await reread_library();
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
    act(() => { emitSkeletonLibraryRefresh({ reason: "resource_saved" }); });
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
    await reread_library();
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
      /not reachable/i,
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
    /* the add control reads just "Add"; what it adds is its accessible name */
    expect(screen.getByRole("button", { name: "New embedded Agent" })).toHaveTextContent("Add");
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

describe("opening a subagent's own graph from the panel", () => {
  /* The panel manages entries and never edits a subagent's contents: a
     subagent is a complete Agent graph, and a graph is edited on the canvas.
     So the row offers to open it, and nothing more. */
  const open = jest.fn();

  async function show_with(node, options = {}) {
    list_resources.mockResolvedValue(
      options.library === undefined
        ? { ok: true, data: { resources: LIBRARY } }
        : options.library,
    );
    const view = render(
      <SubagentPoolSection
        document={doc(node)}
        node={node}
        isDark={false}
        onChange={jest.fn()}
        onOpenSubagent={open}
        embedded={options.embedded}
        onConvertLegacy={options.onConvertLegacy}
        canConvertLegacy={options.canConvertLegacy}
      />,
    );
    await act(async () => {});
    return view;
  }

  beforeEach(() => open.mockReset());

  test("a referenced row opens it, naming the pool, the entry and its place", async () => {
    await show_with(pool({ subagents: [entry()] }));
    fireEvent.click(screen.getByLabelText("Open Summarizer"));
    expect(open).toHaveBeenCalledWith({
      pool_node_id: "pool",
      entry_id: "subagent-1",
      /* An entry id is unique in a pool the store will run, and a draft it
         accepts can hold two entries with one id — so the row says which row
         it is as well as what it is called. */
      entry_index: 0,
      reason: null,
    });
  });

  test("the second of two rows one id apart asks for its own place", async () => {
    await show_with(
      pool({
        subagents: [
          entry({ name: "First" }),
          entry({ name: "Second" }),
        ],
      }),
    );
    fireEvent.click(screen.getByLabelText("Open Second"));
    expect(open.mock.calls[0][0]).toMatchObject({
      entry_id: "subagent-1",
      entry_index: 1,
    });
  });

  test("an embedded row opens too — it is a graph, wherever it is stored", async () => {
    await show_with(
      pool({
        subagents: [
          entry({
            id: "emb",
            name: "Shortener",
            source: { kind: "embedded", document: { schema_version: 1, kind: "agent", id: "inner", name: "Shortener", nodes: [], edges: [] } },
          }),
        ],
      }),
    );
    fireEvent.click(screen.getByLabelText("Open Shortener"));
    expect(open.mock.calls[0][0].entry_id).toBe("emb");
  });

  test("a source the store would refuse offers nothing to open", async () => {
    await show_with(pool({ subagents: [entry({ source: { kind: "graph" } })] }));
    expect(screen.queryByLabelText("Open Summarizer")).toBeNull();
  });

  test("neither does a row whose Agent is a Workflow, or is this Agent itself", async () => {
    await show_with(
      pool({
        subagents: [
          entry({ source: { kind: "agent_ref", agent_id: "res-flow" } }),
          entry({ id: "self", name: "Itself", source: { kind: "agent_ref", agent_id: "parent" } }),
        ],
      }),
    );
    expect(screen.queryByLabelText("Open Summarizer")).toBeNull();
    expect(screen.queryByLabelText("Open Itself")).toBeNull();
  });

  test("nor one whose Agent is no longer in the library", async () => {
    await show_with(pool({ subagents: [entry({ source: { kind: "agent_ref", agent_id: "gone" } })] }));
    expect(screen.getByTestId("subagent-entry-0-missing")).toBeInTheDocument();
    expect(screen.queryByLabelText("Open Summarizer")).toBeNull();
  });

  test("without a page to ask, no row offers it", async () => {
    await show(pool({ subagents: [entry()] }));
    expect(screen.queryByLabelText("Open Summarizer")).toBeNull();
  });

  test("a legacy pool inside an embedded graph says where converting is done", async () => {
    await show_with(
      pool({
        legacy_fields: {
          subagents: [{ kind: "recipe_ref", recipe_name: "Summarizer" }],
        },
      }),
      { embedded: true, onConvertLegacy: jest.fn(), canConvertLegacy: true },
    );
    expect(screen.getByTestId("subagent-pool-legacy-embedded").textContent).toMatch(
      /done from the Agent that owns this graph/,
    );
    expect(screen.queryByText("Convert to Agent entries")).toBeNull();
  });
});

describe("two entries the pool cannot tell apart by id", () => {
  /* The store runs a pool whose entry ids are unique and saves a draft whose
     ids collide — `skeleton_entry_id_capture`: `duplicate_name` at the second
     entry's `id`, and the draft itself round-trips. Until now the only repair
     this panel offered was removing one of them, which for an embedded entry
     is an Agent's graph gone. */

  const embedded_child = (id, name) => ({
    schema_version: 1,
    kind: "agent",
    id,
    name,
    nodes: [
      { id: "start", type: "start", config: {} },
      { id: "agent", type: "agent", config: { kernel: { prompt: "p" } } },
      { id: "end", type: "end", config: {} },
    ],
    edges: [],
  });

  const duplicated = () =>
    pool({
      subagents: [
        entry({
          id: "dup",
          name: "First",
          description: "the first one",
          source: { kind: "embedded", document: embedded_child("child-first", "First") },
        }),
        entry({
          id: "dup",
          name: "Second",
          /* Something the store would refuse, kept: the repair is one field. */
          memory_policy: "nonsense",
          source: {
            kind: "embedded",
            document: embedded_child("child-second", "Second"),
          },
        }),
      ],
    });

  test("both rows say so, and offer an id of their own", async () => {
    await show(duplicated());
    [0, 1].forEach((index) => {
      const row = screen.getByTestId(`subagent-entry-${index}-shared-id`);
      expect(row.textContent).toMatch(/uses the id dup/);
      expect(row.textContent).toMatch(/neither of them runs/i);
    });
    expect(screen.getByLabelText("Give First an id of its own")).toBeTruthy();
    expect(screen.getByLabelText("Give Second an id of its own")).toBeTruthy();
    /* And the refusal the store would give is still reported where it is. */
    expect(
      screen.getByTestId("subagent-entry-1-problem-0").textContent,
    ).toMatch(/subagent id is duplicated/i);
  });

  test("a pool whose ids are its own offers nothing of the kind", async () => {
    await show(pool({ subagents: [entry(), entry({ id: "subagent-2", name: "Checker", source: { kind: "agent_ref", agent_id: "res-2" } })] }));
    expect(screen.queryByTestId("subagent-entry-0-shared-id")).toBeNull();
    expect(screen.queryByTestId("subagent-entry-1-shared-id")).toBeNull();
  });

  test("a shared NAME is not this repair", async () => {
    /* Names have a box and a diagnostic of their own; this is about ids. */
    await show(
      pool({
        subagents: [
          entry({ id: "a", name: "Same" }),
          entry({ id: "b", name: "Same", source: { kind: "agent_ref", agent_id: "res-2" } }),
        ],
      }),
    );
    expect(screen.queryByTestId("subagent-entry-0-shared-id")).toBeNull();
  });

  test("repairing one row writes one field and keeps the rest of the entry", async () => {
    const onEntryIdRepaired = jest.fn();
    const node = duplicated();
    const { onChange } = await show(node, { onEntryIdRepaired });
    const before = node_subagents(node);
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Give Second an id of its own"));
    });
    const next = written(onChange);
    /* The repaired row: a free id, and otherwise the same entry. */
    expect(next[1].id).toBe("subagent-1");
    expect({ ...next[1], id: before[1].id }).toEqual(before[1]);
    /* Including the whole embedded graph, by identity — nothing was rebuilt
       around it — and the value the store refuses, which is not this
       repair's business. */
    expect(next[1].source.document).toBe(before[1].source.document);
    expect(next[1].memory_policy).toBe("nonsense");
    expect(next[1].description).toBe(before[1].description);
    /* The other row is the object it was. */
    expect(next[0]).toBe(before[0]);
    /* It is an ordinary edit: one document reported, and no save of its own. */
    expect(onChange).toHaveBeenCalledTimes(1);
    /* And the page is told which row changed, with the document this write
       produced, so the drawings can follow. */
    expect(onEntryIdRepaired).toHaveBeenCalledTimes(1);
    const report = onEntryIdRepaired.mock.calls[0][0];
    expect({
      pool_node_id: report.pool_node_id,
      entry_index: report.entry_index,
      previous_id: report.previous_id,
      next_id: report.next_id,
    }).toEqual({
      pool_node_id: "pool",
      entry_index: 1,
      previous_id: "dup",
      next_id: "subagent-1",
    });
    expect(node_subagents(report.document.nodes[1])).toEqual(next);
  });

  test("repairing the first row is the same offer, and leaves the second alone", async () => {
    const node = duplicated();
    const { onChange } = await show(node);
    const before = node_subagents(node);
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Give First an id of its own"));
    });
    const next = written(onChange);
    expect([next[0].id, next[1].id]).toEqual(["subagent-1", "dup"]);
    expect(next[1]).toBe(before[1]);
  });

  test("the id it writes is free even where the obvious one is taken", async () => {
    const { onChange } = await show(
      pool({
        subagents: [
          entry({ id: "dup", name: "First" }),
          entry({ id: "dup", name: "Second", source: { kind: "agent_ref", agent_id: "res-2" } }),
          entry({ id: "subagent-1", name: "Third", source: { kind: "agent_ref", agent_id: "res-2" } }),
        ],
      }),
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Give Second an id of its own"));
    });
    expect(written(onChange)[1].id).toBe("subagent-2");
  });

  test("three rows under one id are repaired one at a time", async () => {
    /* The guard that used to block this is about claims, not about whether
       duplicates remain: repairing one of three leaves two, and that write
       is allowed. */
    const { onChange } = await show(
      pool({
        subagents: [
          entry({ id: "dup", name: "A" }),
          entry({ id: "dup", name: "B", source: { kind: "agent_ref", agent_id: "res-2" } }),
          entry({ id: "dup", name: "C", source: { kind: "agent_ref", agent_id: "res-2" } }),
        ],
      }),
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Give C an id of its own"));
    });
    const next = written(onChange);
    expect(next.map((item) => item.id)).toEqual(["dup", "dup", "subagent-1"]);
  });

  test("text the name box is holding survives this row's own id repair", async () => {
    /* The author types a name the pool already has: the guard refuses to
       store it, keeps it on screen and says so. Repairing the SAME row's id
       then threw that text away and took the message with it, because held
       text was held against the entry's id — which in this pool does not name
       a row at all, since two entries share one. */
    const node = duplicated();
    const { onChange } = await show(node);
    const boxes = screen.getAllByPlaceholderText("name");
    fireEvent.change(boxes[1], { target: { value: "First" } });
    expect(boxes[1].value).toBe("First");
    expect(screen.getByTestId("subagent-entry-1-name-taken").textContent).toMatch(
      /already called First/,
    );
    /* Nothing was stored for it: the name is still Second in the document. */
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Give Second an id of its own"));
    });
    /* The typing and the refusal are both still there, on the same row. */
    expect(screen.getAllByPlaceholderText("name")[1].value).toBe("First");
    expect(screen.getByTestId("subagent-entry-1-name-taken").textContent).toMatch(
      /already called First/,
    );
    /* And the write was the id, not the name. */
    const next = written(onChange);
    expect([next[1].id, next[1].name]).toEqual(["subagent-1", "Second"]);
  });

  test("but a list arriving from somewhere else still drops it", async () => {
    /* The protection that must not be lost: an external replacement is not
       the editor's own edit, so the identities are re-minted and text typed
       against the old row dies. */
    const node = duplicated();
    const { view } = await show(node);
    fireEvent.change(screen.getAllByPlaceholderText("name")[1], {
      target: { value: "First" },
    });
    expect(screen.getByTestId("subagent-entry-1-name-taken")).toBeTruthy();
    const replaced = pool({
      subagents: node_subagents(node).map((item) => ({ ...item })),
    });
    await act(async () => {
      view.rerender(
        <SubagentPoolSection
          document={doc(replaced)}
          node={replaced}
          isDark={false}
          onChange={() => {}}
        />,
      );
    });
    expect(screen.getAllByPlaceholderText("name")[1].value).toBe("Second");
    expect(screen.queryByTestId("subagent-entry-1-name-taken")).toBeNull();
  });

  test("an entry that is not an object offers removal and nothing else", async () => {
    await show(pool({ subagents: [null, entry({ id: "dup" })] }));
    expect(screen.getByTestId("subagent-entry-0-unreadable")).toBeTruthy();
    expect(screen.queryByTestId("subagent-entry-0-shared-id")).toBeNull();
  });
});

describe("the pool reads as a roster", () => {
  const two = () =>
    pool({
      subagents: [
        entry({ description: "shortens long text" }),
        entry({ id: "subagent-2", name: "Checker" }),
      ],
    });
  const open = (index) =>
    screen.getByTestId(`subagent-entry-${index}-toggle`).getAttribute("aria-expanded");

  test("several entries start folded, each strip carrying only its name", async () => {
    await show(two());
    expect(open(0)).toBe("false");
    expect(open(1)).toBe("false");
    expect(screen.getByTestId("subagent-entry-0-toggle").textContent).toBe("Summarizer");
    expect(screen.getByTestId("subagent-entry-1-toggle").textContent).toBe("Checker");
    expect(screen.queryByText("No description yet")).toBeNull();
    expect(screen.getByTestId("subagent-entry-0-body")).toHaveAttribute("aria-hidden", "true");
  });

  test("one opens at a time, and opening writes nothing", async () => {
    const { onChange } = await show(two());
    fireEvent.click(screen.getByTestId("subagent-entry-0-toggle"));
    expect(open(0)).toBe("true");
    fireEvent.click(screen.getByTestId("subagent-entry-1-name"));
    expect(open(0)).toBe("false");
    expect(open(1)).toBe("true");
    fireEvent.click(screen.getByTestId("subagent-entry-1-toggle"));
    expect(open(1)).toBe("false");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("a pool of one starts folded too", async () => {
    await show(pool({ subagents: [entry()] }));
    expect(open(0)).toBe("false");
    expect(screen.getByTestId("subagent-entry-0-body")).toHaveAttribute("aria-hidden", "true");
  });

  test("a folded row with something wrong counts it, and still starts folded", async () => {
    await show(
      pool({
        subagents: [
          entry(),
          entry({ id: "subagent-2", name: "Checker", allowed_modes: [] }),
          entry({ id: "subagent-3", name: "Third", allowed_modes: [] }),
        ],
      }),
    );
    expect(open(0)).toBe("false");
    expect(open(1)).toBe("false");
    expect(open(2)).toBe("false");
    /* The strip counts it; what it is is said in the body. */
    expect(screen.getByTestId("process-problems-subagent-entry-2").textContent).toBe("1");
    expect(screen.queryByTestId("process-problems-subagent-entry-0")).toBeNull();
    expect(screen.getByTestId("subagent-entry-2-strip").textContent).not.toMatch(/allowed_modes/);
  });

  test("an added Agent opens, and the picker can be searched", async () => {
    const { onChange } = await show(two());
    fireEvent.change(screen.getByPlaceholderText("Search Agents…"), { target: { value: "zzz" } });
    expect(screen.getByTestId("subagent-picker-no-match")).toBeInTheDocument();
    expect(screen.queryByLabelText("Reference Summarizer")).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Search Agents…"), { target: { value: "summ" } });
    fireEvent.click(screen.getByLabelText("Reference Summarizer"));
    expect(written(onChange)).toHaveLength(3);
  });
});

describe("each subagent is its own block, folded like a Toolkit row", () => {
  const two = () =>
    pool({
      subagents: [
        entry({ description: "shortens long text" }),
        entry({ id: "subagent-2", name: "Checker" }),
      ],
    });

  test("one surface per subagent, each holding only its own entry", async () => {
    await show(two());
    const first = screen.getByTestId("subagent-entry-0-region");
    const second = screen.getByTestId("subagent-entry-1-region");
    expect(first).not.toBe(second);
    expect(within(first).getByTestId("subagent-entry-0")).toBeInTheDocument();
    expect(within(first).queryByTestId("subagent-entry-1")).toBeNull();
    expect(within(second).getByTestId("subagent-entry-1")).toBeInTheDocument();
    expect(first.contains(second)).toBe(false);
  });

  test("the folded strip carries the fold arrow and the way out, as a Toolkit row does", async () => {
    const { onChange } = await show(two());
    const strip = within(screen.getByTestId("subagent-entry-1-strip"));
    expect(strip.getByTestId("subagent-entry-1-toggle")).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("subagent-entry-1-body")).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(strip.getByLabelText("Remove Checker"));
    expect(written(onChange)).toHaveLength(1);
  });

  test("the strip holds the avatar, the name, the fold arrow, Open as an icon and the way out — and nothing else", async () => {
    const onOpenSubagent = jest.fn();
    await show(
      pool({
        subagents: [
          entry({ description: "shortens long text" }),
          entry({ id: "subagent-2", name: "Checker", source: { kind: "agent_ref", agent_id: "res-2" } }),
        ],
      }),
      { onOpenSubagent },
    );
    const assert_strip = () => {
      const strip = screen.getByTestId("subagent-entry-0-strip");
      const toggle = screen.getByTestId("subagent-entry-0-toggle");
      /* Avatar, name and arrow are the toggle; no description, no modes. */
      expect(toggle.textContent).toBe("Summarizer");
      expect(within(toggle).getByTestId("subagent-entry-0-icon")).toBeInTheDocument();
      expect(strip.textContent).not.toMatch(/shortens long text|Delegate|Worker|No description/i);
      expect(screen.queryByTestId("subagent-entry-0-modes")).toBeNull();
      const buttons = Array.from(strip.children).filter((child) => child !== toggle);
      expect(buttons).toHaveLength(2);
      const [openButton, removeButton] = buttons;
      expect(openButton).toHaveAttribute("aria-label", "Open Summarizer");
      expect(openButton).toHaveAttribute("data-prefix-icon", "external_link");
      expect(openButton).toHaveAttribute("title", "Open");
      expect(openButton.getAttribute("data-label")).toBeNull();
      expect(removeButton).toHaveAttribute("aria-label", "Remove Summarizer");
      expect(removeButton).toHaveAttribute("data-prefix-icon", "close");
      return openButton;
    };
    expect(screen.getByTestId("subagent-entry-0-toggle")).toHaveAttribute("aria-expanded", "false");
    assert_strip();
    fireEvent.click(screen.getByTestId("subagent-entry-0-toggle"));
    expect(screen.getByTestId("subagent-entry-0-toggle")).toHaveAttribute("aria-expanded", "true");
    /* Open, the strip is the same strip. */
    fireEvent.click(assert_strip());
    expect(onOpenSubagent).toHaveBeenCalledTimes(1);
    expect(onOpenSubagent.mock.calls[0][0]).toMatchObject({ pool_node_id: "pool", entry_index: 0 });
  });

  test("a folded entry with problems shows only their count beside its name", async () => {
    await show(
      pool({
        subagents: [
          entry({ allowed_modes: [] }),
          entry({ id: "subagent-2", name: "Checker", allowed_modes: [] }),
        ],
      }),
    );
    const strip = screen.getByTestId("subagent-entry-1-strip");
    const badge = within(strip).getByTestId("process-problems-subagent-entry-1");
    expect(badge.textContent).toBe("1");
    expect(screen.getByTestId("subagent-entry-1-toggle").textContent).toBe("Checker1");
  });

  test("when to call it is the panel's own multi-line field, and still writes", async () => {
    const { onChange } = await show(pool({ subagents: [entry()] }));
    const field = screen.getByTestId("subagent-entry-0-description");
    const box = within(field).getByLabelText("When to call it · the calling Agent reads this");
    expect(box.tagName).toBe("TEXTAREA");
    /* TextField, not a bare textarea: the textarea sits absolutely inside the
       field's own sized box, and that box carries the panel's fill. */
    expect(box.style.position).toBe("absolute");
    expect(field.querySelectorAll("textarea")).toHaveLength(1);
    /* And it is wired to the app's own overlay scrollbar, not the native one. */
    expect(box).toHaveAttribute("data-sb-wall", "4");
    expect(box).toHaveAttribute("placeholder", "what it is for (optional)");
    fireEvent.change(box, { target: { value: "checks the summary" } });
    expect(written(onChange)[0].description).toBe("checks the summary");
  });

  test("an added Agent opens with the caret in its when-to-call-it field", async () => {
    /* The page takes the written document in the same tick, as the real
       owner of the draft does. */
    list_resources.mockResolvedValue({ ok: true, data: { resources: LIBRARY } });
    function Host() {
      const [current, setCurrent] = React.useState(() => doc(pool({ subagents: [entry()] })));
      return <SubagentPoolSection document={current} node={current.nodes[1]} isDark={false} onChange={setCurrent} />;
    }
    render(<Host />);
    await act(async () => {});
    fireEvent.click(screen.getByLabelText("Reference Checker"));
    await act(async () => {});
    expect(screen.getByTestId("subagent-entry-1-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(
      within(screen.getByTestId("subagent-entry-1-description")).getByRole("textbox"),
    ).toHaveFocus();
  });

  test("the icon sits as far from the strip's top, bottom and left edges", async () => {
    await show(two());
    expect(SUBAGENT_STRIP).toEqual({ height: 36, avatar: 22, inset: 7 });
    const strip = screen.getByTestId("subagent-entry-0-strip");
    const icon = screen.getByTestId("subagent-entry-0-icon");
    const height = parseFloat(strip.style.height);
    const size = parseFloat(icon.style.width);
    expect(parseFloat(icon.style.height)).toBe(size);
    expect(strip.style.boxSizing).toBe("border-box");
    expect(parseFloat(strip.style.paddingLeft)).toBe((height - size) / 2);
    expect((height - size) / 2).toBe(7);
    expect(icon.style.background).not.toMatch(/gradient/);
  });
});
