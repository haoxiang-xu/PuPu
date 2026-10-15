import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import OutputVariablesSection, {
  output_surface_problems,
} from "./output_variables_section";
import { node_output_mappings, output_source_kinds_for } from "../skeleton_document";

jest.mock("../../../../../BUILTIN_COMPONENTs/select/select", () => {
  return function MockSelect({ options, value, set_value }) {
    return (
      <select
        data-testid="select"
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
  return function MockButton({ label, ariaLabel, onClick, disabled }) {
    return (
      <button type="button" aria-label={ariaLabel} disabled={disabled} onClick={onClick}>
        {label || ariaLabel || "button"}
      </button>
    );
  };
});

function node(type, { inputs = [], outputs = [] } = {}) {
  const execution = { inputs, outputs };
  if (type === "start") delete execution.inputs;
  return { id: "n", type, config: { execution } };
}

function doc(n) {
  return { schema_version: 1, kind: "workflow", id: "d", name: "D", nodes: [n], edges: [] };
}

function show(n, extra = {}) {
  const onChange = jest.fn();
  render(
    <OutputVariablesSection
      document={doc(n)}
      node={n}
      isDark={false}
      onChange={onChange}
      {...extra}
    />,
  );
  return onChange;
}

const mapping = (name, kind, path = []) => ({ name, source: { kind, path } });

describe("which nodes have outputs at all", () => {
  /* Taken from the runtime's own per-type key sets, not from what looks
   * plausible: a branch selects an outlet and a pool attaches. */
  test.each(["start", "end", "agent", "code", "tool_call", "skill_read", "workflow_call"])(
    "%s declares outputs",
    (type) => {
      show(node(type));
      expect(screen.getByText("Output Variables")).toBeInTheDocument();
    },
  );

  test.each(["if_else", "switch_case", "toolkit_pool", "subagent_pool", "hooks_pool"])(
    "%s has no outputs section",
    (type) => {
      show(node(type));
      expect(screen.queryByText("Output Variables")).not.toBeInTheDocument();
    },
  );
});

describe("which side a row may read from", () => {
  /* A Start's inputs are the empty object and an End's result is, so offering
   * the other side would be offering a value that can never arrive. */
  test("a Start reads from its result only, and says why", () => {
    expect(output_source_kinds_for("start")).toEqual(["result"]);
    show(node("start", { outputs: [mapping("text", "result", ["text"])] }));
    expect(screen.queryByTestId("select")).not.toBeInTheDocument();
    expect(screen.getByTestId("output-row-0-fixed-kind").textContent).toMatch(
      /what the run was called with/i,
    );
  });

  test("an End reads from its inputs only, and says why", () => {
    expect(output_source_kinds_for("end")).toEqual(["input"]);
    show(
      node("end", {
        inputs: [{ name: "answer", value: {}, missing: "error" }],
        outputs: [mapping("answer", "input", ["answer"])],
      }),
    );
    expect(screen.getByTestId("output-row-0-fixed-kind").textContent).toMatch(
      /can only export what it was given/i,
    );
  });

  test("a node that runs has both sides", () => {
    expect(output_source_kinds_for("agent")).toEqual(["input", "result"]);
    show(node("agent", { outputs: [mapping("a", "result", [])] }));
    /* Two pickers now: the side, then the result root an Agent declares. */
    expect(screen.getAllByTestId("select")).toHaveLength(2);
  });

  test("a type with no outputs offers no sides", () => {
    expect(output_source_kinds_for("if_else")).toEqual([]);
    expect(output_source_kinds_for("subagent_pool")).toEqual([]);
  });
});

describe("adding a row", () => {
  test("a new row on a running node starts on the input side it can satisfy", () => {
    const onChange = show(
      node("agent", { inputs: [{ name: "question", value: {}, missing: "error" }] }),
    );
    fireEvent.click(screen.getByText("+ Add output"));
    expect(node_output_mappings(onChange.mock.calls[0][0].nodes[0])).toEqual([
      { name: "", source: { kind: "input", path: ["question"] } },
    ]);
  });

  test("a new row is never born already refused", () => {
    /* Seeding `path: ["question"]` rather than `[]` matters because the first
       step has to name a declared input; an empty seed would render a picker
       showing the first name while the document said otherwise. */
    const onChange = show(
      node("agent", { inputs: [{ name: "question", value: {}, missing: "error" }] }),
    );
    fireEvent.click(screen.getByText("+ Add output"));
    const next = onChange.mock.calls[0][0].nodes[0];
    expect(output_surface_problems(next, node_output_mappings(next))).toEqual([]);
  });

  test("a new row on a Start is on the result side", () => {
    const onChange = show(node("start"));
    fireEvent.click(screen.getByText("+ Add output"));
    expect(node_output_mappings(onChange.mock.calls[0][0].nodes[0])).toEqual([
      { name: "", source: { kind: "result", path: [] } },
    ]);
  });

  test("a new row on a node with no inputs yet does not invent one", () => {
    const onChange = show(node("agent"));
    fireEvent.click(screen.getByText("+ Add output"));
    expect(node_output_mappings(onChange.mock.calls[0][0].nodes[0])).toEqual([
      { name: "", source: { kind: "input", path: [] } },
    ]);
  });

  test("a node with no rows says what that means downstream", () => {
    show(node("agent"));
    expect(screen.getByText(/nothing downstream can read from it/i)).toBeInTheDocument();
  });
});

describe("editing and removing rows", () => {
  test("renaming writes back to the document, not to the node in place", () => {
    const n = node("agent", { outputs: [mapping("a", "result", [])] });
    const onChange = show(n);
    fireEvent.change(screen.getByPlaceholderText("name"), { target: { value: "answer" } });
    expect(onChange.mock.calls[0][0].nodes[0].config.execution.outputs[0].name).toBe("answer");
    expect(n.config.execution.outputs[0].name).toBe("a");
  });

  test("removing a row takes out that one", () => {
    const onChange = show(
      node("agent", {
        outputs: [mapping("a", "result", []), mapping("b", "result", [])],
      }),
    );
    fireEvent.click(screen.getByLabelText("Remove a"));
    expect(node_output_mappings(onChange.mock.calls[0][0].nodes[0]).map((m) => m.name)).toEqual(["b"]);
  });

  test("rows are not reordered by editing one", () => {
    const onChange = show(
      node("agent", {
        outputs: [mapping("a", "result", []), mapping("b", "result", [])],
      }),
    );
    const rows = screen.getAllByTestId(/^output-row-\d+$/);
    fireEvent.change(within(rows[1]).getByPlaceholderText("name"), {
      target: { value: "bb" },
    });
    expect(node_output_mappings(onChange.mock.calls[0][0].nodes[0]).map((m) => m.name)).toEqual(["a", "bb"]);
  });
});

describe("what a row says is wrong with it", () => {
  test("a duplicated name is named on the second row", () => {
    show(node("agent", { outputs: [mapping("a", "result", []), mapping("a", "result", [])] }));
    expect(screen.queryByTestId("output-row-0-problem-0")).not.toBeInTheDocument();
    expect(screen.getByTestId("output-row-1-problem-0").textContent).toMatch(/duplicated/i);
  });

  test("an empty name is named", () => {
    show(node("agent", { outputs: [mapping("", "result", [])] }));
    expect(screen.getByTestId("output-row-0-problem-0").textContent).toMatch(/non-empty/i);
  });

  test("an input-side path opening on an undeclared input is named", () => {
    /* `StaticIOSurfaces.output_problem` refuses this at Run and Publish, so
       the row has to be able to say it — a loaded draft can carry it even
       though the picker will not compose it. */
    show(
      node("agent", {
        inputs: [{ name: "question", value: {}, missing: "error" }],
        outputs: [mapping("a", "input", ["answer"])],
      }),
    );
    expect(screen.getByTestId("output-row-0-problem-0").textContent).toMatch(
      /no input named "answer"/i,
    );
  });

  test("an End row on the result side is named", () => {
    show(node("end", { inputs: [], outputs: [mapping("a", "result", [])] }));
    expect(screen.getByTestId("output-row-0-problem-0").textContent).toMatch(
      /can only export what it was given/i,
    );
  });

  test("a store diagnostic for a row is shown on that row", () => {
    show(node("agent", { outputs: [mapping("a", "result", []), mapping("b", "result", [])] }), {
      rowDiagnostics: { 1: [{ code: "missing_value", message: "from the store" }] },
    });
    expect(screen.queryByTestId("output-row-0-problem-0")).not.toBeInTheDocument();
    expect(screen.getByTestId("output-row-1-problem-0").textContent).toBe("from the store");
  });
});

describe("output_surface_problems mirrors the runtime and nothing more", () => {
  test("an empty input-side path names nothing, so it is not refused", () => {
    /* `output_problem` short-circuits on an empty path: the whole inputs
       object is exported. Flagging it would be stricter than the runtime. */
    const n = node("agent", { inputs: [], outputs: [mapping("a", "input", [])] });
    expect(output_surface_problems(n, node_output_mappings(n))).toEqual([]);
  });

  test("a result-side path is never statically refused", () => {
    const n = node("agent", { outputs: [mapping("a", "result", ["whatever", 3])] });
    expect(output_surface_problems(n, node_output_mappings(n))).toEqual([]);
  });

  test("a deeper step past a declared input is not refused", () => {
    const n = node("agent", {
      inputs: [{ name: "q", value: {}, missing: "error" }],
      outputs: [mapping("a", "input", ["q", "nested", 0])],
    });
    expect(output_surface_problems(n, node_output_mappings(n))).toEqual([]);
  });

  test("an integer first step on the input side cannot name an input", () => {
    const n = node("agent", {
      inputs: [{ name: "q", value: {}, missing: "error" }],
      outputs: [mapping("a", "input", [0])],
    });
    expect(output_surface_problems(n, node_output_mappings(n))).toHaveLength(1);
  });

  test("a row whose source is not an object is left to the wire check", () => {
    const n = node("agent", { outputs: [{ name: "a", source: "nope" }] });
    expect(() => output_surface_problems(n, node_output_mappings(n))).not.toThrow();
    expect(output_surface_problems(n, node_output_mappings(n))).toEqual([]);
  });

  test("an End row with no kind at all is left to the wire check", () => {
    /* `unknown_variant` already says it; saying "not a result" too would be
       two messages for one defect. */
    const n = node("end", { outputs: [{ name: "a", source: { path: [] } }] });
    expect(output_surface_problems(n, node_output_mappings(n))).toEqual([]);
  });
});

describe("a malformed first step must not be coerced into a message", () => {
  /* The store keeps `path: [{toString: null}]` and returns `invalid_path` for
   * it. Composing "no input named ${first}" converts it to a string, and the
   * conversion throws before any diagnostic can be shown — the row's own
   * editability guard never runs, because the section crashes first.
   *
   * This is the same defect as the earlier `ref` path residual, in a new
   * place: an unvalidated segment reached a template literal. */
  const hostile = [
    ["an object with toString nulled", { toString: null }],
    ["an object with toString throwing", { toString() { throw new Error("no"); } }],
    ["an object with valueOf nulled", { toString: null, valueOf: null }],
    ["a symbol-like object", Object.create(null)],
  ];

  test.each(hostile)("%s does not throw while composing problems", (_label, segment) => {
    const n = node("agent", {
      inputs: [{ name: "q", value: {}, missing: "error" }],
      outputs: [{ name: "a", source: { kind: "input", path: [segment] } }],
    });
    expect(() => output_surface_problems(n, node_output_mappings(n))).not.toThrow();
  });

  test.each(hostile)("%s does not throw while rendering the section", (_label, segment) => {
    expect(() =>
      show(
        node("agent", {
          inputs: [{ name: "q", value: {}, missing: "error" }],
          outputs: [{ name: "a", source: { kind: "input", path: [segment] } }],
        }),
      ),
    ).not.toThrow();
  });

  test("the row is shown as unreadable, which is what the path validator says", () => {
    show(
      node("agent", {
        inputs: [{ name: "q", value: {}, missing: "error" }],
        outputs: [{ name: "a", source: { kind: "input", path: [{ toString: null }] } }],
      }),
    );
    expect(screen.getByTestId("output-row-0-unreadable")).toBeInTheDocument();
  });

  test("the undeclared-input message is left to a segment that can be named", () => {
    /* A usable segment still gets the specific message. */
    const n = node("agent", {
      inputs: [{ name: "q", value: {}, missing: "error" }],
      outputs: [{ name: "a", source: { kind: "input", path: ["answer"] } }],
    });
    expect(output_surface_problems(n, node_output_mappings(n))[0].message).toMatch(
      /no input named "answer"/,
    );
  });

  test("an unusable segment is reported by the wire check alone", () => {
    /* `invalid_path` already says it. A second message about a name would be
       two complaints for one defect, and would need the coercion to say it. */
    const n = node("agent", {
      inputs: [{ name: "q", value: {}, missing: "error" }],
      outputs: [{ name: "a", source: { kind: "input", path: [{ toString: null }] } }],
    });
    expect(output_surface_problems(n, node_output_mappings(n))).toEqual([]);
  });
});

describe("a result root the producer does not have", () => {
  /* The static validator never looks at the result side, so these drew no
   * diagnostic at all and failed only once the node ran. */
  test("an Agent is told which name is wrong", () => {
    show(node("agent", { outputs: [mapping("a", "result", ["typo"])] }));
    expect(screen.getByTestId("output-row-0-problem-0").textContent).toBe(
      'An Agent produces no result named "typo".',
    );
  });

  test.each([
    ["agent", "message"],
    ["agent", "context"],
    ["tool_call", "result"],
    ["tool_call", "ok"],
    ["tool_call", "error"],
    ["skill_read", "content"],
    ["skill_read", "name"],
  ])("%s accepts %s", (type, root) => {
    show(node(type, { outputs: [mapping("a", "result", [root])] }));
    expect(screen.queryByTestId("output-row-0-problem-0")).not.toBeInTheDocument();
  });

  test("a Skill Read's stripped metadata is not a choice", () => {
    /* `_skeleton_skill` exists on the raw result and is removed before
       publication, so mapping it reads nothing. */
    show(node("skill_read", { outputs: [mapping("a", "result", ["_skeleton_skill"])] }));
    expect(screen.getByTestId("output-row-0-problem-0").textContent).toMatch(
      /no result named "_skeleton_skill"/,
    );
  });

  test("the whole result is never refused", () => {
    show(node("agent", { outputs: [mapping("a", "result", [])] }));
    expect(screen.queryByTestId("output-row-0-problem-0")).not.toBeInTheDocument();
  });

  test("a Code node's result is not second-guessed", () => {
    show(node("code", { outputs: [mapping("a", "result", ["anything"])] }));
    expect(screen.queryByTestId("output-row-0-problem-0")).not.toBeInTheDocument();
    expect(screen.getByTestId("output-row-0-result-unknown").textContent).toMatch(
      /whatever its own source returns/i,
    );
  });

  test("a called Workflow's result is not second-guessed, and says why", () => {
    show(node("workflow_call", { outputs: [mapping("a", "result", ["whatever"])] }));
    expect(screen.queryByTestId("output-row-0-problem-0")).not.toBeInTheDocument();
    expect(screen.getByTestId("output-row-0-result-unknown").textContent).toMatch(
      /declared in its own document/i,
    );
  });

  test("a Start's result is not second-guessed, and says why", () => {
    show(node("start", { outputs: [mapping("text", "result", ["text"])] }));
    expect(screen.queryByTestId("output-row-0-problem-0")).not.toBeInTheDocument();
    expect(screen.getByTestId("output-row-0-result-unknown").textContent).toMatch(
      /called from different places/i,
    );
  });

  test("an Agent with a loaded output schema offers its fields too", () => {
    const n = {
      id: "n",
      type: "agent",
      config: {
        execution: { inputs: [], outputs: [mapping("a", "result", ["score"])] },
        kernel: { json_schema: { type: "object", properties: { score: { type: "number" } } } },
      },
    };
    show(n);
    expect(screen.queryByTestId("output-row-0-problem-0")).not.toBeInTheDocument();
  });

  test("an Agent with no output schema does not offer schema fields", () => {
    show(node("agent", { outputs: [mapping("a", "result", ["score"])] }));
    expect(screen.getByTestId("output-row-0-problem-0").textContent).toMatch(
      /no result named "score"/,
    );
  });

  test("a list position cannot name a field of a result object", () => {
    show(node("agent", { outputs: [mapping("a", "result", [0])] }));
    expect(screen.getByTestId("output-row-0-problem-0").textContent).toMatch(
      /list position cannot name a field/i,
    );
  });

  test("a hostile first segment on the result side is left to the path check", () => {
    expect(() =>
      show(node("agent", { outputs: [mapping("a", "result", [{ toString: null }])] })),
    ).not.toThrow();
    expect(screen.getByTestId("output-row-0-unreadable")).toBeInTheDocument();
  });
});


describe("a document that arrives from the store", () => {
  /* The last of the four controls that hold text the document does not: a
     refused path position. The row identity is what the steps belong to, and
     a replacement from the store is part of it — the comment there used to
     say the stored value would catch this, and it does not, because their
     version can hold the same mapping with the same position. */
  /* An input-side path: its first step names a declared input and is picked
     from a list, so the one typed step below it is the refusable one. */
  const node_with = (position) =>
    node("agent", {
      inputs: [{ name: "question", value: {}, missing: "error" }],
      outputs: [mapping("out", "input", ["question", position])],
    });
  const panel = (position, revision) => {
    const n = node_with(position);
    return (
      <OutputVariablesSection
        document={doc(n)}
        node={n}
        revision={revision}
        isDark={false}
        onChange={() => {}}
      />
    );
  };

  test("a refused position is discarded even when the same position comes back", () => {
    const view = render(panel(7, 1));
    const box = screen.getByDisplayValue("7");
    fireEvent.change(box, { target: { value: "-1" } });
    expect(screen.getByTestId("output-row-0-step-0-refused")).toBeInTheDocument();

    view.rerender(panel(7, 2));

    expect(screen.getByDisplayValue("7")).toBeInTheDocument();
    expect(
      screen.queryByTestId("output-row-0-step-0-refused"),
    ).not.toBeInTheDocument();
  });

  test("the author's own edit keeps what is being typed", () => {
    const view = render(panel(7, 1));
    fireEvent.change(screen.getByDisplayValue("7"), { target: { value: "-1" } });
    view.rerender(panel(7, 1));
    expect(screen.getByDisplayValue("-1")).toBeInTheDocument();
    expect(screen.getByTestId("output-row-0-step-0-refused")).toBeInTheDocument();
  });
});
