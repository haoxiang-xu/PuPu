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
    expect(screen.getByTestId("select")).toBeInTheDocument();
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
