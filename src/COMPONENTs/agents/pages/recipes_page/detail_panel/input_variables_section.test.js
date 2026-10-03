import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import InputVariablesSection, { binding_sources } from "./input_variables_section";
import { binding_problems } from "../skeleton_io";
import { node_bindings } from "../skeleton_document";

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

const flow = (id, a, b) => ({
  id,
  kind: "flow",
  source_node_id: a,
  source_port_id: "out",
  target_node_id: b,
  target_port_id: "in",
});

const document_with = (inputs) => ({
  schema_version: 1,
  kind: "workflow",
  id: "w",
  name: "W",
  nodes: [
    {
      id: "start",
      type: "start",
      config: {
        execution: {
          outputs: [{ name: "text", source: { kind: "result", path: ["text"] } }],
        },
      },
    },
    {
      id: "mid",
      type: "code",
      config: {
        execution: {
          inputs: [],
          outputs: [{ name: "rows", source: { kind: "result", path: ["rows"] } }],
        },
        code: {},
      },
    },
    { id: "end", type: "end", config: { execution: { inputs, outputs: [] } } },
  ],
  edges: [flow("e1", "start", "mid"), flow("e2", "mid", "end")],
});

const show = (doc, onChange = () => {}, diagnostics = []) => {
  const node = doc.nodes.find((n) => n.id === "end");
  return render(
    <InputVariablesSection
      document={doc}
      node={node}
      diagnostics={diagnostics}
      isDark={false}
      onChange={onChange}
    />,
  );
};

describe("what an input may read", () => {
  test("the sources are what upstream nodes declare they export", () => {
    /* A node that has not run cannot supply a value, and a value no node
     * exports can never arrive — both come from the document. */
    expect(binding_sources(document_with([]), "end")).toEqual([
      { node_id: "mid", node_label: "mid", name: "rows" },
      { node_id: "start", node_label: "start", name: "text" },
    ]);
  });

  test("a node with nothing upstream is offered nothing", () => {
    expect(binding_sources(document_with([]), "start")).toEqual([]);
  });

  test("the section is absent for a node the runtime gives no inputs", () => {
    /* Start reads from the calling context; its execution config has no inputs
     * key at all, so an Input section there would compose a refused document. */
    const doc = document_with([]);
    const { container } = render(
      <InputVariablesSection
        document={doc}
        node={doc.nodes[0]}
        diagnostics={[]}
        isDark={false}
        onChange={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("adding and editing an input", () => {
  test("a new row is a binding the runtime accepts", () => {
    const onChange = jest.fn();
    show(document_with([]), onChange);
    fireEvent.click(screen.getByText("+ Add input"));

    const next = onChange.mock.calls[0][0];
    const bindings = node_bindings(next.nodes.find((n) => n.id === "end"));
    expect(bindings).toHaveLength(1);
    /* It starts on the first real source and the fail policy, rather than on a
     * placeholder the runtime would reject. */
    expect(bindings[0].value).toEqual({ kind: "ref", node_id: "mid", path: ["rows"] });
    expect(bindings[0].missing).toBe("error");
    expect(binding_problems(bindings.map((b) => ({ ...b, name: "topic" })))).toEqual([]);
  });

  test("the row is written into config.execution.inputs, not beside it", () => {
    const onChange = jest.fn();
    show(document_with([]), onChange);
    fireEvent.click(screen.getByText("+ Add input"));
    const node = onChange.mock.calls[0][0].nodes.find((n) => n.id === "end");
    expect(Object.keys(node.config.execution).sort()).toEqual(["inputs", "outputs"]);
    expect(node.config.inputs).toBeUndefined();
  });

  test("removing a row leaves the rest", () => {
    const onChange = jest.fn();
    show(
      document_with([
        { name: "a", value: { kind: "ref", node_id: "start", path: ["text"] }, missing: "error" },
        { name: "b", value: { kind: "ref", node_id: "mid", path: ["rows"] }, missing: "error" },
      ]),
      onChange,
    );
    const row = screen.getByTestId("binding-row-0");
    fireEvent.click(within(row).getByLabelText("Remove a"));
    const bindings = node_bindings(
      onChange.mock.calls[0][0].nodes.find((n) => n.id === "end"),
    );
    expect(bindings.map((b) => b.name)).toEqual(["b"]);
  });

  test("the empty state says what it means", () => {
    show(document_with([]));
    expect(screen.getByText(/reads nothing from the graph/i)).toBeInTheDocument();
  });
});

describe("problems are shown on the row that has them", () => {
  const bad = [
    { name: "a", value: { kind: "ref", node_id: "start", path: ["text"] }, missing: "null", default: 1 },
  ];

  test("the builder's own refusal appears immediately", () => {
    /* No round trip: a default beside the null policy is a refused document and
     * the row says so before anything is saved. */
    show(document_with(bad));
    expect(screen.getByTestId("binding-row-0-problem-0").textContent).toMatch(
      /only allowed for default policy/i,
    );
  });

  test("a preflight diagnostic lands on its row", () => {
    /* The real path the runtime produced for this exact document on
     * 2026-10-03, through validate_skeleton_for_execution + _validate_all. */
    show(document_with(bad), () => {}, [
      {
        code: "unknown_field",
        path: ["document", "nodes", 2, "config", "execution", "inputs", 0, "default"],
        message: "default is only allowed for default policy",
      },
    ]);
    const row = screen.getByTestId("binding-row-0");
    expect(within(row).getAllByText(/only allowed for default policy/i).length).toBe(2);
  });

  test("a diagnostic for another node is not shown here", () => {
    show(document_with([]), () => {}, [
      {
        code: "unknown_field",
        path: ["document", "nodes", 1, "config", "execution", "inputs", 0, "default"],
        message: "belongs to mid",
      },
    ]);
    expect(screen.queryByText(/belongs to mid/i)).not.toBeInTheDocument();
  });
});
