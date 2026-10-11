import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import OutputSchemaSection from "./output_schema_section";
import { node_output_schema } from "../skeleton_document";

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

jest.mock("../../../../../BUILTIN_COMPONENTs/input/textfield", () => {
  return function MockTextField({ value, set_value, placeholder }) {
    return (
      <textarea
        data-testid="json-text"
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

const KERNEL = {
  schema_version: 1,
  profile: {
    id: "p",
    provider: "openai",
    model: "gpt-4.1",
    protocol: "openai-responses",
    endpoint: "https://api.openai.com/v1/responses",
    credential_ref: "openai",
    context_window: 128000,
    output_limit: 4096,
    capabilities: { json_schema: true, images: false, files: false },
  },
  prompt: "do the thing",
  max_iterations: 1,
  output_tokens: 1024,
  history: "none",
  overflow: "error",
  json_schema: null,
};

const agent = (json_schema, id = "k") => ({
  id,
  type: "agent",
  config: {
    execution: { inputs: [], outputs: [] },
    kernel: { ...KERNEL, json_schema },
  },
});

const doc = (node) => ({
  schema_version: 1,
  kind: "workflow",
  id: "d",
  name: "D",
  nodes: [node],
  edges: [],
});

function show(node, extra = {}) {
  const onChange = jest.fn();
  const view = render(
    <OutputSchemaSection
      document={doc(node)}
      node={node}
      isDark={false}
      onChange={onChange}
      {...extra}
    />,
  );
  return { onChange, view };
}

/* The schema the section would have written, read back out of the document it
   handed to `onChange` — so the assertions are about the document, never about
   the component's own idea of it. */
const written = (onChange, call = 0) =>
  node_output_schema(onChange.mock.calls[call][0].nodes[0]);

const switches = () => screen.getAllByRole("switch");

describe("off, and turning it on", () => {
  test("an Agent with no schema says what its result is", () => {
    show(agent(null));
    expect(screen.getByTestId("schema-off").textContent).toMatch(
      /replies in prose/i,
    );
    expect(switches()[0].getAttribute("aria-checked")).toBe("false");
  });

  test("turning it on stores an object with no fields, not an empty schema", () => {
    /* `{}` would be refused — the root must declare `type: "object"`. */
    const { onChange } = show(agent(null));
    fireEvent.click(switches()[0]);
    expect(written(onChange)).toEqual({ type: "object", properties: {} });
  });

  test("turning it off stores null, which is what the runtime reads", () => {
    /* Not a missing key and not `{}`: `durable_execution` tests
       `config["json_schema"] is not None` and an empty schema would declare an
       object with no fields instead of no structured output. */
    const { onChange } = show(agent({ type: "object", properties: {} }));
    fireEvent.click(switches()[0]);
    expect(written(onChange)).toBe(null);
  });

  test("the rest of the kernel config is left exactly as it was", () => {
    const { onChange } = show(agent(null));
    fireEvent.click(switches()[0]);
    const kernel = onChange.mock.calls[0][0].nodes[0].config.kernel;
    expect(kernel.profile).toEqual(KERNEL.profile);
    expect(kernel.prompt).toBe("do the thing");
    expect(Object.keys(kernel).sort()).toEqual(Object.keys(KERNEL).sort());
  });
});

describe("an Agent with no model configuration", () => {
  const bare = { id: "k", type: "agent", config: { execution: { inputs: [], outputs: [] } } };

  test("says so instead of offering a schema", () => {
    show(bare);
    expect(screen.getByTestId("schema-no-kernel").textContent).toMatch(
      /model configuration/i,
    );
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });

  test("and writes nothing, rather than inventing a kernel to hold one", () => {
    /* `validate_kernel_config` closes that object to a fixed key set, so
       building one here would mean inventing a profile, an endpoint and a
       credential as a side effect of turning JSON output on. */
    const { onChange } = show(bare);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("the field rows", () => {
  const two = {
    type: "object",
    properties: {
      answer: { type: "string" },
      score: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["answer"],
  };

  test("a row is drawn for each declared field", () => {
    show(agent(two));
    expect(screen.getAllByTestId(/^schema-field-\d+$/)).toHaveLength(2);
  });

  test("each row shows that field's own name and type", () => {
    show(agent(two));
    const first = within(screen.getByTestId("schema-field-0"));
    expect(first.getByPlaceholderText("field name").value).toBe("answer");
    expect(first.getAllByTestId("select")[0].getAttribute("data-value")).toBe("string");
  });

  test("required is read from the root list, not from the property", () => {
    show(agent(two));
    const first = within(screen.getByTestId("schema-field-0"));
    const second = within(screen.getByTestId("schema-field-1"));
    expect(first.getAllByRole("switch")[0].getAttribute("aria-checked")).toBe("true");
    expect(second.getAllByRole("switch")[0].getAttribute("aria-checked")).toBe("false");
  });

  test("renaming a field renames it in the document, and in required with it", () => {
    const { onChange } = show(agent(two));
    const first = within(screen.getByTestId("schema-field-0"));
    fireEvent.change(first.getByPlaceholderText("field name"), {
      target: { value: "reply" },
    });
    const next = written(onChange);
    expect(Object.keys(next.properties)).toEqual(["reply", "score"]);
    expect(next.required).toEqual(["reply"]);
  });

  test("a bound a field already has is shown, and is editable", () => {
    const { onChange } = show(agent(two));
    const second = within(screen.getByTestId("schema-field-1"));
    expect(second.getByDisplayValue("0")).toBeInTheDocument();
    fireEvent.change(second.getByDisplayValue("1"), { target: { value: "10" } });
    expect(written(onChange).properties.score).toEqual({
      type: "number",
      minimum: 0,
      maximum: 10,
    });
  });

  test("clearing a bound removes it rather than storing zero", () => {
    /* Zero is a real bound, so an emptied box cannot mean it. */
    const { onChange } = show(agent(two));
    const second = within(screen.getByTestId("schema-field-1"));
    fireEvent.change(second.getByDisplayValue("1"), { target: { value: "" } });
    expect(written(onChange).properties.score).toEqual({
      type: "number",
      minimum: 0,
    });
  });

  test("a negative minimum is stored, because the wire takes one", () => {
    /* `_require_number` admits any finite JSON number here. Refusing it would
       be the editor being stricter than the runtime, which blocks a legal
       schema just as surely as accepting an illegal one lets a broken one
       through. */
    const { onChange } = show(agent(two));
    const second = within(screen.getByTestId("schema-field-1"));
    fireEvent.change(second.getByDisplayValue("0"), { target: { value: "-1" } });
    expect(written(onChange).properties.score.minimum).toBe(-1);
  });

  test("a fractional minimum is stored too", () => {
    const { onChange } = show(agent(two));
    const second = within(screen.getByTestId("schema-field-1"));
    fireEvent.change(second.getByDisplayValue("0"), { target: { value: "0.5" } });
    expect(written(onChange).properties.score.minimum).toBe(0.5);
  });

  test("a negative length is refused, because that wire takes a count", () => {
    /* `_require_nonnegative_integer` for the four length and item bounds. The
       same number is legal in one box and refused in another, which is why the
       box asks what it is a bound on. */
    const { onChange } = show(
      agent({ type: "object", properties: { a: { type: "string", minLength: 2 } } }),
    );
    const row = within(screen.getByTestId("schema-field-0"));
    fireEvent.change(row.getByDisplayValue("2"), { target: { value: "-1" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  test("a fractional length is refused as well", () => {
    const { onChange } = show(
      agent({ type: "object", properties: { a: { type: "string", minLength: 2 } } }),
    );
    const row = within(screen.getByTestId("schema-field-0"));
    fireEvent.change(row.getByDisplayValue("2"), { target: { value: "1.5" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  test("only the bounds that apply to a type are offered", () => {
    show(agent({ type: "object", properties: { flag: { type: "boolean" } } }));
    const row = within(screen.getByTestId("schema-field-0"));
    expect(row.queryByText("min length")).not.toBeInTheDocument();
    expect(row.queryByText("min")).not.toBeInTheDocument();
  });

  test("an array field says what it is a list of", () => {
    const { onChange } = show(
      agent({ type: "object", properties: { tags: { type: "array", items: { type: "string" } } } }),
    );
    const row = within(screen.getByTestId("schema-field-0"));
    const pickers = row.getAllByTestId("select");
    expect(pickers).toHaveLength(2);
    fireEvent.change(pickers[1], { target: { value: "integer" } });
    expect(written(onChange).properties.tags.items).toEqual({ type: "integer" });
  });

  test("adding a field appends one with no name", () => {
    const { onChange } = show(agent({ type: "object", properties: {} }));
    fireEvent.click(screen.getByText("+ Add field"));
    expect(written(onChange)).toEqual({
      type: "object",
      properties: { "": { type: "string" } },
    });
  });

  test("removing a field takes out that one", () => {
    const { onChange } = show(agent(two));
    fireEvent.click(screen.getByLabelText("Remove answer"));
    expect(Object.keys(written(onChange).properties)).toEqual(["score"]);
    expect("required" in written(onChange)).toBe(false);
  });

  test("a schema with no fields says the reply is still an object", () => {
    show(agent({ type: "object", properties: {} }));
    expect(screen.getByTestId("schema-no-fields").textContent).toMatch(
      /has to be a JSON object/i,
    );
  });
});

describe("closing the list is the other half of the output rows", () => {
  test("open by default, and it says what that means for a row", () => {
    show(agent({ type: "object", properties: { a: { type: "string" } } }));
    expect(screen.getByTestId("schema-closed-caption").textContent).toMatch(
      /may carry fields this list does not name/i,
    );
  });

  test("closing it writes additionalProperties false", () => {
    const { onChange } = show(
      agent({ type: "object", properties: { a: { type: "string" } } }),
    );
    const all = switches();
    fireEvent.click(all[all.length - 1]);
    expect(written(onChange).additionalProperties).toBe(false);
  });

  test("and says that a row may then call a field nonexistent", () => {
    show(agent({
      type: "object",
      properties: { a: { type: "string" } },
      additionalProperties: false,
    }));
    expect(screen.getByTestId("schema-closed-caption").textContent).toMatch(
      /cannot exist/i,
    );
  });

  test("opening it removes the key rather than storing true", () => {
    const { onChange } = show(agent({
      type: "object",
      properties: { a: { type: "string" } },
      additionalProperties: false,
    }));
    const all = switches();
    fireEvent.click(all[all.length - 1]);
    expect("additionalProperties" in written(onChange)).toBe(false);
  });
});

describe("a schema the rows cannot hold", () => {
  const referenced = {
    type: "object",
    $ref: "#/$defs/Payload",
    $defs: { Payload: { type: "object", properties: { score: { type: "number" } } } },
  };

  test("is shown as JSON, with what in it the rows cannot hold", () => {
    show(agent(referenced));
    expect(screen.getByTestId("schema-not-field-shaped").textContent).toMatch(
      /definition/i,
    );
    expect(screen.getByTestId("json-text").value).toContain("$defs");
  });

  test("is not rewritten by being looked at", () => {
    /* The whole reason the rows check themselves: a schema they cannot
       represent must survive being opened. */
    const { onChange } = show(agent(referenced));
    expect(onChange).not.toHaveBeenCalled();
  });

  test("draws no field rows at all", () => {
    show(agent(referenced));
    expect(screen.queryAllByTestId(/^schema-field-\d+$/)).toHaveLength(0);
  });

  test("offers no way back to the rows, because there is none", () => {
    show(agent(referenced));
    expect(screen.queryByText("Edit as fields")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit as JSON")).not.toBeInTheDocument();
  });
});

describe("editing as JSON", () => {
  const simple = { type: "object", properties: { a: { type: "string" } } };

  test("a row-shaped schema can be opened as JSON and brought back", () => {
    show(agent(simple));
    fireEvent.click(screen.getByText("Edit as JSON"));
    expect(screen.getByTestId("json-text").value).toContain('"properties"');
    fireEvent.click(screen.getByText("Edit as fields"));
    expect(screen.getAllByTestId(/^schema-field-\d+$/)).toHaveLength(1);
  });

  test("text that is not JSON yet stores nothing and says so", () => {
    const { onChange } = show(agent(simple));
    fireEvent.click(screen.getByText("Edit as JSON"));
    fireEvent.change(screen.getByTestId("json-text"), { target: { value: '{"type":' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("schema-json-unreadable").textContent).toMatch(
      /not JSON yet/i,
    );
  });

  test("what was typed stays on screen to be finished", () => {
    show(agent(simple));
    fireEvent.click(screen.getByText("Edit as JSON"));
    fireEvent.change(screen.getByTestId("json-text"), { target: { value: '{"type":' } });
    expect(screen.getByTestId("json-text").value).toBe('{"type":');
  });

  test("JSON that parses is stored as it is", () => {
    const { onChange } = show(agent(simple));
    fireEvent.click(screen.getByText("Edit as JSON"));
    fireEvent.change(screen.getByTestId("json-text"), {
      target: { value: '{"type":"object","properties":{"b":{"type":"integer"}}}' },
    });
    expect(written(onChange)).toEqual({
      type: "object",
      properties: { b: { type: "integer" } },
    });
  });

  test("a schema the runtime would refuse is diagnosed here, not at save", () => {
    const stored = [];
    function Live() {
      const [document, setDocument] = React.useState(doc(agent(simple, "a1")));
      return (
        <OutputSchemaSection
          document={document}
          node={document.nodes[0]}
          isDark={false}
          onChange={(next) => {
            stored.push(next);
            setDocument(next);
          }}
        />
      );
    }
    render(<Live />);
    fireEvent.click(screen.getByText("Edit as JSON"));
    fireEvent.change(screen.getByTestId("json-text"), {
      target: { value: '{"type":"object","properties":{"a":{"type":"string"}},"required":"a"}' },
    });
    /* It is stored — a draft may be incomplete, and refusing to hold it would
       lose the author's work — and it is reported. */
    expect(node_output_schema(stored[0].nodes[0]).required).toBe("a");
    expect(screen.getByTestId("schema-problem-0").textContent).toMatch(
      /required must be an array of strings/i,
    );
  });

  test("a reserved field name is reported with the runtime's own reason", () => {
    show(agent({ type: "object", properties: { message: { type: "string" } } }));
    expect(screen.getByTestId("schema-problem-0").textContent).toMatch(
      /reserved/i,
    );
  });
});

describe("the JSON box stays until the author leaves it", () => {
  test("editing a referenced schema into a plain one does not snatch the box away", () => {
    /* The view is chosen by whether the rows can hold the schema, and typing
       changes the schema — so an author editing JSON into something the rows
       happen to hold had the box replaced by field rows under their cursor,
       mid-edit. Typing in it is asking for it. */
    const referenced = {
      type: "object",
      $ref: "#/$defs/P",
      $defs: { P: { type: "object", properties: { a: { type: "string" } } } },
    };
    function Live() {
      const [document, setDocument] = React.useState(doc(agent(referenced, "a1")));
      return (
        <OutputSchemaSection
          document={document}
          node={document.nodes[0]}
          isDark={false}
          onChange={setDocument}
        />
      );
    }
    render(<Live />);
    const typed = '{"type":"object","properties":{"a":{"type":"string"}}}';
    fireEvent.change(screen.getByTestId("json-text"), { target: { value: typed } });
    expect(screen.getByTestId("json-text").value).toBe(typed);
    expect(screen.queryAllByTestId(/^schema-field-\d+$/)).toHaveLength(0);
    /* And the way back is now offered, because the rows can hold it. */
    expect(screen.getByText("Edit as fields")).toBeInTheDocument();
  });
});

describe("the JSON text belongs to one node and one schema", () => {
  /* The same class as a refused path position: text the document does not hold
     has to be discarded the moment it stops being about what is on screen. */
  const simple = { type: "object", properties: { a: { type: "string" } } };

  const panel = (node) => (
    <OutputSchemaSection
      document={doc(node)}
      node={node}
      isDark={false}
      onChange={() => {}}
    />
  );

  test("selecting another node does not carry the half-typed text over", () => {
    const view = render(panel(agent(simple, "a1")));
    fireEvent.click(screen.getByText("Edit as JSON"));
    fireEvent.change(screen.getByTestId("json-text"), { target: { value: '{"half' } });
    expect(screen.getByTestId("json-text").value).toBe('{"half');

    view.rerender(
      panel(agent({ type: "object", properties: { b: { type: "integer" } } }, "a2")),
    );
    expect(screen.queryByTestId("json-text")).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^schema-field-\d+$/)).toHaveLength(1);
  });

  test("the schema being replaced underneath discards the text", () => {
    /* A reload landing, or a conflict resolved the other way. */
    const view = render(panel(agent(simple, "a1")));
    fireEvent.click(screen.getByText("Edit as JSON"));
    fireEvent.change(screen.getByTestId("json-text"), { target: { value: '{"half' } });

    view.rerender(
      panel(agent({ type: "object", properties: { b: { type: "integer" } } }, "a1")),
    );
    expect(screen.getByTestId("json-text").value).toContain('"b"');
  });

  test("a schema that comes back does not bring the text back with it", () => {
    /* The same defect this editor already had one layer down, in the refused
       path position: hiding the text behind a comparison leaves it alive, and
       the canvas keeps a history, so the very same schema object can return.
       It is discarded when it stops applying, not re-judged on every render. */
    const a = agent(simple, "a1");
    const b = agent({ type: "object", properties: { b: { type: "integer" } } }, "a1");
    const view = render(panel(a));
    fireEvent.click(screen.getByText("Edit as JSON"));
    fireEvent.change(screen.getByTestId("json-text"), { target: { value: '{"half' } });

    view.rerender(panel(b));
    view.rerender(panel(a));
    expect(screen.getByTestId("json-text").value).toContain('"a"');
    expect(screen.queryByTestId("schema-json-unreadable")).not.toBeInTheDocument();
  });

  test("the author's own valid edit does not discard what they are typing", () => {
    /* Storing a parsed object re-renders the section with a new schema; the
       text must survive that, or typing would erase itself. */
    function Live() {
      const [document, setDocument] = React.useState(doc(agent(simple, "a1")));
      return (
        <OutputSchemaSection
          document={document}
          node={document.nodes[0]}
          isDark={false}
          onChange={setDocument}
        />
      );
    }
    render(<Live />);
    fireEvent.click(screen.getByText("Edit as JSON"));
    const typed = '{"type":"object","properties":{"c":{"type":"boolean"}}}';
    fireEvent.change(screen.getByTestId("json-text"), { target: { value: typed } });
    expect(screen.getByTestId("json-text").value).toBe(typed);
  });
});

describe("a bound box reports the value it is a bound on", () => {
  /* The third place in this panel to hold text the document does not: a
     refused position, a refused bound, a name another field already has. The
     first two each shipped the same two defects before being fixed, which is
     why the rules now live in one place. */
  const one = (minLength) => ({
    type: "object",
    properties: { a: { type: "string", minLength } },
  });

  const panel = (node) => (
    <OutputSchemaSection
      document={doc(node)}
      node={node}
      isDark={false}
      onChange={() => {}}
    />
  );

  test("a refused bound stays visible, unstored, and says so", () => {
    const { onChange } = show(agent(one(2)));
    const row = within(screen.getByTestId("schema-field-0"));
    fireEvent.change(row.getByDisplayValue("2"), { target: { value: "-1" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(row.getByDisplayValue("-1")).toBeInTheDocument();
    expect(screen.getByTestId("schema-bound-minLength-refused").textContent).toMatch(
      /not stored/i,
    );
  });

  test("the value being replaced underneath discards the refused text", () => {
    const view = render(panel(agent(one(2), "a1")));
    fireEvent.change(
      within(screen.getByTestId("schema-field-0")).getByDisplayValue("2"),
      { target: { value: "-1" } },
    );
    view.rerender(panel(agent(one(5), "a1")));
    const row = within(screen.getByTestId("schema-field-0"));
    expect(row.getByDisplayValue("5")).toBeInTheDocument();
    expect(screen.queryByTestId("schema-bound-minLength-refused")).not.toBeInTheDocument();
  });

  test("a value that comes back does not bring the refused text back", () => {
    const a = agent(one(2), "a1");
    const b = agent(one(5), "a1");
    const view = render(panel(a));
    fireEvent.change(
      within(screen.getByTestId("schema-field-0")).getByDisplayValue("2"),
      { target: { value: "-1" } },
    );
    view.rerender(panel(b));
    view.rerender(panel(a));
    expect(
      within(screen.getByTestId("schema-field-0")).getByDisplayValue("2"),
    ).toBeInTheDocument();
  });

  test("removing the row above does not hand its refused text to the survivor", () => {
    /* Two rows, the survivor's own bound differing: position cannot tell them
       apart once the first is gone, so the row carries an identity. */
    const two = {
      type: "object",
      properties: {
        a: { type: "string", minLength: 3 },
        b: { type: "string", minLength: 7 },
      },
    };
    function Live() {
      const [document, setDocument] = React.useState(doc(agent(two, "a1")));
      return (
        <OutputSchemaSection
          document={document}
          node={document.nodes[0]}
          isDark={false}
          onChange={setDocument}
        />
      );
    }
    render(<Live />);
    fireEvent.change(
      within(screen.getByTestId("schema-field-0")).getByDisplayValue("3"),
      { target: { value: "-1" } },
    );
    fireEvent.click(screen.getByLabelText("Remove a"));
    expect(screen.getAllByTestId(/^schema-field-\d+$/)).toHaveLength(1);
    const row = within(screen.getByTestId("schema-field-0"));
    expect(row.getByDisplayValue("7")).toBeInTheDocument();
    expect(screen.queryByTestId("schema-bound-minLength-refused")).not.toBeInTheDocument();
  });

  test("and does not hand its refused text to the survivor's equal bound", () => {
    /* Same value as well as same position: only the identity separates them. */
    const two = {
      type: "object",
      properties: {
        a: { type: "string", minLength: 3 },
        b: { type: "string", minLength: 3 },
      },
    };
    function Live() {
      const [document, setDocument] = React.useState(doc(agent(two, "a1")));
      return (
        <OutputSchemaSection
          document={document}
          node={document.nodes[0]}
          isDark={false}
          onChange={setDocument}
        />
      );
    }
    render(<Live />);
    fireEvent.change(
      within(screen.getByTestId("schema-field-0")).getAllByDisplayValue("3")[0],
      { target: { value: "-1" } },
    );
    fireEvent.click(screen.getByLabelText("Remove a"));
    const row = within(screen.getByTestId("schema-field-0"));
    expect(row.getByDisplayValue("3")).toBeInTheDocument();
    expect(screen.queryByTestId("schema-bound-minLength-refused")).not.toBeInTheDocument();
  });

  test("correcting it to a usable bound stores exactly that", () => {
    const { onChange } = show(agent(one(2)));
    const row = within(screen.getByTestId("schema-field-0"));
    fireEvent.change(row.getByDisplayValue("2"), { target: { value: "-1" } });
    fireEvent.change(
      within(screen.getByTestId("schema-field-0")).getByDisplayValue("-1"),
      { target: { value: "4" } },
    );
    expect(written(onChange).properties.a.minLength).toBe(4);
  });
});

describe("renaming a field onto a name another field has", () => {
  /* It deleted the other field's whole declaration, moved its required marker
     across, and saved that — reported as Saved, and gone after reopening. A
     JSON object holds one value per key, so the rename is not something the
     document can represent at all. */
  const two = {
    type: "object",
    properties: {
      answer: { type: "string" },
      score: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["answer"],
  };

  test("is not written", () => {
    const { onChange } = show(agent(two));
    const row = within(screen.getByTestId("schema-field-0"));
    fireEvent.change(row.getByDisplayValue("answer"), { target: { value: "score" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  test("keeps both rows, with the other field's declaration intact", () => {
    show(agent(two));
    const row = within(screen.getByTestId("schema-field-0"));
    fireEvent.change(row.getByDisplayValue("answer"), { target: { value: "score" } });
    expect(screen.getAllByTestId(/^schema-field-\d+$/)).toHaveLength(2);
    const other = within(screen.getByTestId("schema-field-1"));
    expect(other.getByDisplayValue("score")).toBeInTheDocument();
    expect(other.getAllByTestId("select")[0].getAttribute("data-value")).toBe("number");
  });

  test("shows what was typed, and says it was not stored", () => {
    show(agent(two));
    const row = within(screen.getByTestId("schema-field-0"));
    fireEvent.change(row.getByDisplayValue("answer"), { target: { value: "score" } });
    expect(screen.getByTestId("schema-field-0").textContent).toMatch(
      /already called score/i,
    );
    expect(
      within(screen.getByTestId("schema-field-0")).getByDisplayValue("score"),
    ).toBeInTheDocument();
  });

  test("a free name still renames, and keeps the required marker on it", () => {
    const { onChange } = show(agent(two));
    const row = within(screen.getByTestId("schema-field-0"));
    fireEvent.change(row.getByDisplayValue("answer"), { target: { value: "reply" } });
    const next = written(onChange);
    expect(Object.keys(next.properties)).toEqual(["reply", "score"]);
    expect(next.required).toEqual(["reply"]);
    expect(next.properties.score).toEqual({ type: "number", minimum: 0, maximum: 1 });
  });

  test("a name taken by nothing but itself is not a collision", () => {
    /* Renaming away and back: the second rename must not see the row's own
       former name as taken by someone else. */
    function Live() {
      const [document, setDocument] = React.useState(doc(agent(two, "a1")));
      return (
        <OutputSchemaSection
          document={document}
          node={document.nodes[0]}
          isDark={false}
          onChange={setDocument}
        />
      );
    }
    render(<Live />);
    const named = (value) =>
      within(screen.getByTestId("schema-field-0")).getByDisplayValue(value);
    fireEvent.change(named("answer"), { target: { value: "x" } });
    fireEvent.change(named("x"), { target: { value: "answer" } });
    expect(named("answer")).toBeInTheDocument();
    expect(screen.queryByTestId("schema-name-taken")).not.toBeInTheDocument();
  });

  test("every row's name is distinct, which is what makes the rows a schema", () => {
    /* `Object.keys` cannot yield two of the same name, so the row list is
       unique by construction — and that is exactly why a colliding rename has
       to be refused before composing rather than reported afterwards: after
       composing there is nothing left to report. */
    show(agent(two));
    const names = screen
      .getAllByPlaceholderText("field name")
      .map((box) => box.value);
    expect(names).toEqual(["answer", "score"]);
    expect(new Set(names).size).toBe(names.length);
  });

  test("a second new field gets a name it can be written under", () => {
    /* Two rows cannot both be unnamed, because a row only exists once it has
       a key — so adding a second one used to do nothing at all. */
    function Live() {
      const [document, setDocument] = React.useState(
        doc(agent({ type: "object", properties: {} }, "a1")),
      );
      return (
        <OutputSchemaSection
          document={document}
          node={document.nodes[0]}
          isDark={false}
          onChange={setDocument}
        />
      );
    }
    render(<Live />);
    fireEvent.click(screen.getByText("+ Add field"));
    fireEvent.click(screen.getByText("+ Add field"));
    expect(screen.getAllByTestId(/^schema-field-\d+$/)).toHaveLength(2);
    fireEvent.click(screen.getByText("+ Add field"));
    const names = screen
      .getAllByPlaceholderText("field name")
      .map((box) => box.value);
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
  });

  test("the first new field is still unnamed, because that name is free", () => {
    const { onChange } = show(agent({ type: "object", properties: {} }));
    fireEvent.click(screen.getByText("+ Add field"));
    expect(Object.keys(written(onChange).properties)).toEqual([""]);
  });

  test("freeing the name by renaming the other field still says nothing was stored", () => {
    /* The collision ends without anything being written, so a message
       conditional on the collision left this box showing a name the document
       does not have and saying nothing about it. */
    function Live() {
      const [document, setDocument] = React.useState(doc(agent(two, "a1")));
      return (
        <OutputSchemaSection
          document={document}
          node={document.nodes[0]}
          isDark={false}
          onChange={setDocument}
        />
      );
    }
    render(<Live />);
    fireEvent.change(
      within(screen.getByTestId("schema-field-0")).getByDisplayValue("answer"),
      { target: { value: "score" } },
    );
    fireEvent.change(
      within(screen.getByTestId("schema-field-1")).getByDisplayValue("score"),
      { target: { value: "rating" } },
    );
    expect(
      within(screen.getByTestId("schema-field-0")).getByDisplayValue("score"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("schema-name-taken").textContent).toMatch(
      /not stored/i,
    );
    expect(screen.getByTestId("schema-name-taken").textContent).toMatch(
      /free now/i,
    );
  });

  test("typing it again then stores it", () => {
    function Live() {
      const [document, setDocument] = React.useState(doc(agent(two, "a1")));
      return (
        <OutputSchemaSection
          document={document}
          node={document.nodes[0]}
          isDark={false}
          onChange={setDocument}
        />
      );
    }
    render(<Live />);
    const first = () => within(screen.getByTestId("schema-field-0"));
    fireEvent.change(first().getByDisplayValue("answer"), { target: { value: "score" } });
    fireEvent.change(
      within(screen.getByTestId("schema-field-1")).getByDisplayValue("score"),
      { target: { value: "rating" } },
    );
    fireEvent.change(first().getByDisplayValue("score"), { target: { value: "scores" } });
    expect(first().getByDisplayValue("scores")).toBeInTheDocument();
    expect(screen.queryByTestId("schema-name-taken")).not.toBeInTheDocument();
  });
});

describe("a field name JavaScript treats specially", () => {
  test("__proto__ can be typed and is stored as a field", () => {
    const { onChange } = show(
      agent({ type: "object", properties: { a: { type: "string" } } }),
    );
    const row = within(screen.getByTestId("schema-field-0"));
    fireEvent.change(row.getByDisplayValue("a"), { target: { value: "__proto__" } });
    const next = written(onChange);
    expect(Object.keys(next.properties)).toEqual(["__proto__"]);
    expect(JSON.parse(JSON.stringify(next)).properties.__proto__).toEqual({
      type: "string",
    });
  });

  test("and the row for it is drawn from the stored schema", () => {
    show(agent(JSON.parse('{"type":"object","properties":{"__proto__":{"type":"string"}}}')));
    expect(screen.getAllByTestId(/^schema-field-\d+$/)).toHaveLength(1);
    expect(
      within(screen.getByTestId("schema-field-0")).getByDisplayValue("__proto__"),
    ).toBeInTheDocument();
  });

  test("a type the rows have no control for does not take the panel down", () => {
    expect(() =>
      show(agent({ type: "object", properties: { a: { type: "__proto__" } } })),
    ).not.toThrow();
    expect(screen.getByTestId("schema-not-field-shaped").textContent).toMatch(/\S/);
  });
});

describe("an Agent that gains its model configuration while open", () => {
  /* Setting the model is how a node gets its kernel, and it happens with this
     panel on screen. Every hook therefore has to run on both sides of that —
     the lint said so and no test did, because none of them flipped it on a
     mounted section. */
  const bare = { id: "k", type: "agent", config: { execution: { inputs: [], outputs: [] } } };

  const panel = (node) => (
    <OutputSchemaSection
      document={doc(node)}
      node={node}
      isDark={false}
      onChange={() => {}}
    />
  );

  test("turns from an explanation into an editor without complaint", () => {
    const warn = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const view = render(panel(bare));
      expect(screen.getByTestId("schema-no-kernel")).toBeInTheDocument();

      view.rerender(panel(agent({ type: "object", properties: { a: { type: "string" } } }, "k")));
      expect(screen.queryByTestId("schema-no-kernel")).not.toBeInTheDocument();
      expect(screen.getAllByTestId(/^schema-field-\d+$/)).toHaveLength(1);

      view.rerender(panel(bare));
      expect(screen.getByTestId("schema-no-kernel")).toBeInTheDocument();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  test("and keeps its field identities across the flip", () => {
    const two = {
      type: "object",
      properties: {
        a: { type: "string", minLength: 3 },
        b: { type: "string", minLength: 7 },
      },
    };
    const view = render(panel(agent(two, "k")));
    fireEvent.change(
      within(screen.getByTestId("schema-field-0")).getByDisplayValue("3"),
      { target: { value: "-1" } },
    );
    view.rerender(panel(bare));
    view.rerender(panel(agent(two, "k")));
    /* Gone, because the section was something else in between. Dropping it is
       never the incorrect direction. */
    expect(
      within(screen.getByTestId("schema-field-0")).getByDisplayValue("3"),
    ).toBeInTheDocument();
  });
});

describe("a bound typed one character at a time", () => {
  /* `0.5` is reached through `0.`, and `0.` read as a number is zero. The box
     stored zero, redrew itself from the document as `0`, and the next
     keystroke landed on `05` — so typing `0.5` wrote `5`, with nothing said.
     A box that rewrites what the author typed into a different legal value is
     the defect the path editor's header is about, one layer down.
   *
   * These type into the live box the way a person does, appending to whatever
   * it is showing. A test that sets the whole value at once never reaches the
   * intermediate spelling and cannot see this. */
  let latest = null;

  function Live({ initial }) {
    const [document, setDocument] = React.useState(doc(agent(initial, "a1")));
    latest = document;
    return (
      <OutputSchemaSection
        document={document}
        node={document.nodes[0]}
        isDark={false}
        onChange={setDocument}
      />
    );
  }

  const stored = () => node_output_schema(latest.nodes[0]).properties.a;
  const box = () =>
    within(screen.getByTestId("schema-field-0")).getAllByPlaceholderText("—")[0];

  const type = (text) =>
    text.split("").forEach((character) => {
      const element = box();
      fireEvent.change(element, { target: { value: element.value + character } });
    });

  beforeEach(() => {
    latest = null;
  });

  test("stores the number that was typed, not what a prefix of it meant", () => {
    render(<Live initial={{ type: "object", properties: { a: { type: "number" } } }} />);
    type("0.5");
    expect(box().value).toBe("0.5");
    expect(stored().minimum).toBe(0.5);
  });

  test("a negative one survives its own minus sign", () => {
    render(<Live initial={{ type: "object", properties: { a: { type: "number" } } }} />);
    type("-1.25");
    expect(box().value).toBe("-1.25");
    expect(stored().minimum).toBe(-1.25);
  });

  test("the box shows the spelling, the document holds the number", () => {
    render(<Live initial={{ type: "object", properties: { a: { type: "number" } } }} />);
    type("0.");
    expect(box().value).toBe("0.");
    expect(stored().minimum).toBe(0);
    expect(screen.queryByTestId("schema-bound-minimum-refused")).not.toBeInTheDocument();
  });

  test("an exponent is not rewritten into what it means", () => {
    /* The author's spelling, kept — `1e2` is a hundred and the document is
       given a hundred, but redrawing the box from the document is the move
       that lost the point in `0.`, so it is not made here either. */
    render(<Live initial={{ type: "object", properties: { a: { type: "number" } } }} />);
    type("1e2");
    expect(box().value).toBe("1e2");
    expect(stored().minimum).toBe(100);
  });

  test("a count box refuses the point and says what the bound still is", () => {
    /* The four length and item bounds take a whole number, so there is no
       spelling of `0.5` they are partway through. The `0` that was typed
       first was stored, and the caption says so rather than claiming the
       whole of it was refused. */
    render(
      <Live initial={{ type: "object", properties: { a: { type: "string" } } }} />,
    );
    const counted = () =>
      within(screen.getByTestId("schema-field-0")).getAllByPlaceholderText("—")[0];
    const type_counted = (text) =>
      text.split("").forEach((character) => {
        const element = counted();
        fireEvent.change(element, { target: { value: element.value + character } });
      });
    type_counted("0.5");
    expect(counted().value).toBe("0.5");
    expect(stored().minLength).toBe(0);
    expect(screen.getByTestId("schema-bound-minLength-refused").textContent).toMatch(
      /not stored/i,
    );
    expect(screen.getByTestId("schema-bound-minLength-refused").textContent).toMatch(
      /still 0/i,
    );
  });

  test("and says there is no bound when there is none", () => {
    render(
      <Live initial={{ type: "object", properties: { a: { type: "string" } } }} />,
    );
    const counted = () =>
      within(screen.getByTestId("schema-field-0")).getAllByPlaceholderText("—")[0];
    fireEvent.change(counted(), { target: { value: "-" } });
    expect(screen.getByTestId("schema-bound-minLength-refused").textContent).toMatch(
      /no min length/i,
    );
    expect(stored().minLength).toBeUndefined();
  });
});

describe("a refused bound belongs to the field it was typed into", () => {
  /* The row keeps its own identity across an edit the editor made. What it
     cannot carry is a field arriving from outside: the document calls a field
     by its name — `properties` is a map — and a row keyed only by position
     went on showing one field's refused text over another field's equal
     bound. */
  const one = (name, minLength) => ({
    type: "object",
    properties: { [name]: { type: "string", minLength } },
  });

  const panel = (node) => (
    <OutputSchemaSection
      document={doc(node)}
      node={node}
      isDark={false}
      onChange={() => {}}
    />
  );

  test("a different field with the same bound does not inherit it", () => {
    const view = render(panel(agent(one("a", 2), "a1")));
    fireEvent.change(
      within(screen.getByTestId("schema-field-0")).getByDisplayValue("2"),
      { target: { value: "-1" } },
    );
    expect(screen.getByTestId("schema-bound-minLength-refused")).toBeInTheDocument();

    view.rerender(panel(agent(one("b", 2), "a1")));
    const row = within(screen.getByTestId("schema-field-0"));
    expect(row.getByDisplayValue("b")).toBeInTheDocument();
    expect(row.getByDisplayValue("2")).toBeInTheDocument();
    expect(screen.queryByTestId("schema-bound-minLength-refused")).not.toBeInTheDocument();
  });

  test("the same field still showing the same bound keeps it", () => {
    /* The other direction: a render that changed nothing the author can see
       must not throw away what they are in the middle of correcting. */
    const view = render(panel(agent(one("a", 2), "a1")));
    fireEvent.change(
      within(screen.getByTestId("schema-field-0")).getByDisplayValue("2"),
      { target: { value: "-1" } },
    );
    view.rerender(panel(agent(one("a", 2), "a1")));
    expect(
      within(screen.getByTestId("schema-field-0")).getByDisplayValue("-1"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("schema-bound-minLength-refused")).toBeInTheDocument();
  });

  test("the list being reordered leaves it on no field at all", () => {
    /* The row's own identity is minted by position, and a name box has to
       keep the caret while it is being typed into, so a row cannot be keyed
       by the name it is holding. The text is therefore held against the field
       it describes and dropped when a different field arrives under it —
       dropped, which is the harmless direction, rather than redrawn over the
       other field's equal bound. */
    const two = (first) => ({
      type: "object",
      properties:
        first === "a"
          ? { a: { type: "string", minLength: 2 }, b: { type: "string", minLength: 9 } }
          : { b: { type: "string", minLength: 9 }, a: { type: "string", minLength: 2 } },
    });
    const view = render(panel(agent(two("a"), "a1")));
    fireEvent.change(
      within(screen.getByTestId("schema-field-0")).getByDisplayValue("2"),
      { target: { value: "-1" } },
    );
    view.rerender(panel(agent(two("b"), "a1")));
    expect(screen.queryByDisplayValue("-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schema-bound-minLength-refused")).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("schema-field-1")).getByDisplayValue("2"),
    ).toBeInTheDocument();
  });
});

describe("a draft deeper than any save would take", () => {
  /* The section is what the author is looking at while they make one, so
     every reader it runs on each render has to answer for a draft rather than
     fall over on it: the admission mirror, the question of whether the rows
     can hold it, the reason they cannot, and the JSON encoding of it. One of
     them was recursive and took the panel down — inside the code that was
     about to explain the problem, which is the third time in this ticket. */
  const nest = (levels) => {
    let node = { type: "string" };
    for (let i = 0; i < levels; i += 1) {
      node = { type: "object", properties: { n: node } };
    }
    return { type: "object", properties: { n: node } };
  };

  test("renders, and says the depth", () => {
    expect(() => show(agent(nest(4000)))).not.toThrow();
    expect(screen.getByTestId("skeleton-output-schema")).toBeInTheDocument();
    expect(screen.getByTestId("schema-problem-0").textContent).toMatch(/depth/i);
  });

  test("and the outputs beside it are still offered", () => {
    /* `agent_result_sources` reads the same draft through the root inventory,
       which is the entry point with no limit check in front of it. */
    expect(() => show(agent(nest(20000)))).not.toThrow();
  });
});
