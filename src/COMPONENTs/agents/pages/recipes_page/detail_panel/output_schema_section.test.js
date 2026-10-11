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
