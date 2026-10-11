import React from "react";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import DetailPanel from "./detail_panel";

const cfg = { theme: {}, onThemeMode: "light_mode" };

const legacy_recipe = {
  name: "R",
  nodes: [
    { id: "start", type: "start", outputs: [{ name: "text", type: "string" }] },
    { id: "a1", type: "agent", override: { model: "", prompt: "" }, outputs: [] },
    { id: "end", type: "end" },
  ],
  edges: [],
};

const flow = (id, a, b) => ({
  id,
  kind: "flow",
  source_node_id: a,
  source_port_id: "out",
  target_node_id: b,
  target_port_id: "in",
});

const skeleton_document = {
  schema_version: 1,
  kind: "workflow",
  id: "w",
  name: "W",
  nodes: [
    {
      id: "start",
      type: "start",
      config: {
        execution: { outputs: [{ name: "text", source: { kind: "result", path: ["text"] } }] },
      },
    },
    { id: "end", type: "end", config: { execution: { inputs: [], outputs: [] } } },
  ],
  edges: [flow("e1", "start", "end")],
};

const show = (props) =>
  render(
    <ConfigContext.Provider value={cfg}>
      <DetailPanel
        recipe={legacy_recipe}
        selectedNodeId="end"
        onChange={() => {}}
        onChangeSilent={() => {}}
        {...props}
      />
    </ConfigContext.Provider>,
  );

describe("a legacy recipe is left exactly as it was", () => {
  test("no Skeleton section appears without a document", () => {
    /* The two models are not merged here: a recipe has no node config, and the
     * migration between them is not this ticket's. */
    show({});
    expect(screen.queryByText("Input Variables")).not.toBeInTheDocument();
  });

  test("a document without a writer is still inert", () => {
    /* Rendering an editor whose edits go nowhere would look like a save that
     * silently did nothing. */
    show({ document: skeleton_document });
    expect(screen.queryByText("Input Variables")).not.toBeInTheDocument();
  });
});

describe("a Skeleton node gets its IO sections", () => {
  test("the Input Variables section renders for a node that takes inputs", () => {
    show({ document: skeleton_document, onDocumentChange: () => {} });
    expect(screen.getByText("Input Variables")).toBeInTheDocument();
  });

  test("a node the document does not have falls back to the legacy panels", () => {
    show({
      document: { ...skeleton_document, nodes: [skeleton_document.nodes[0]] },
      onDocumentChange: () => {},
    });
    expect(screen.queryByText("Input Variables")).not.toBeInTheDocument();
  });

  test("a structural diagnostic is shown where no row can carry it", () => {
    /* `diagnose` answers about graph structure, and its paths stop at the node.
     * A panel that only placed row problems would render nothing for this. */
    show({
      document: skeleton_document,
      onDocumentChange: () => {},
      diagnostics: [
        {
          code: "flow_output_required",
          path: ["document", "nodes", 1],
          message: "execution node requires flow output",
        },
      ],
    });
    expect(screen.getByTestId("skeleton-diagnostics-notice")).toBeInTheDocument();
    expect(screen.getByTestId("skeleton-diagnostic-0").textContent).toMatch(
      /requires flow output/i,
    );
  });

  test("the notice says the draft is saved, because an incomplete one may be", () => {
    show({
      document: skeleton_document,
      onDocumentChange: () => {},
      diagnostics: [
        { code: "end_count", path: ["document", "nodes", 1], message: "needs one end" },
      ],
    });
    expect(screen.getByTestId("skeleton-diagnostics-notice").textContent).toMatch(
      /saved, with/i,
    );
  });

  test("nothing is drawn when the draft has no problems", () => {
    show({ document: skeleton_document, onDocumentChange: () => {}, diagnostics: [] });
    expect(screen.queryByTestId("skeleton-diagnostics-notice")).not.toBeInTheDocument();
  });
});

describe("R2 — every diagnostic has a visible outlet", () => {
  /* The shapes the real store returns, which used to vanish because the notice
   * filtered by the selected node before anything could catch them. */
  const real = [
    { code: "end_count", path: ["document", "nodes"], message: "graph requires exactly one end node" },
    { code: "flow_source_port", path: ["document", "edges", 0, "source_port_id"], message: "flow source port is invalid" },
    { code: "something_new", path: ["document", "sidecar"], message: "a path this build does not know" },
    { code: "invalid_value", path: ["document", "nodes", 1, "config", "execution", "inputs", 9, "value"], message: "a row that is not rendered" },
    { code: "unknown_field", path: ["document", "nodes", 0, "config", "execution", "outputs", 0, "name"], message: "belongs to start" },
  ];

  const withDiagnostics = () =>
    show({ document: skeleton_document, onDocumentChange: () => {}, diagnostics: real });

  test("a graph-level problem is shown", () => {
    withDiagnostics();
    expect(screen.getByText(/graph requires exactly one end node/i)).toBeInTheDocument();
  });

  test("an edge problem is shown, and says which edge", () => {
    withDiagnostics();
    expect(screen.getByText(/flow source port is invalid/i)).toBeInTheDocument();
    expect(screen.getByTestId("skeleton-elsewhere-notice").textContent).toMatch(/Edge e1/);
  });

  test("a path this build does not know is shown rather than dropped", () => {
    withDiagnostics();
    expect(screen.getByText(/a path this build does not know/i)).toBeInTheDocument();
  });

  test("a claimed row that is not rendered is shown on the node", () => {
    withDiagnostics();
    expect(screen.getByTestId("skeleton-diagnostics-notice").textContent).toMatch(
      /a row that is not rendered/i,
    );
  });

  test("another node's problem is shown under that node's name", () => {
    withDiagnostics();
    const elsewhere = screen.getByTestId("skeleton-elsewhere-notice");
    expect(elsewhere.textContent).toMatch(/belongs to start/i);
    expect(elsewhere.textContent).toMatch(/Node start/);
  });

  test("nothing is dropped: every message reaches the panel", () => {
    const { container } = withDiagnostics();
    real.forEach((item) => {
      expect(container.textContent).toContain(item.message);
    });
  });

  test("a clean draft still draws neither notice", () => {
    show({ document: skeleton_document, onDocumentChange: () => {}, diagnostics: [] });
    expect(screen.queryByTestId("skeleton-diagnostics-notice")).not.toBeInTheDocument();
    expect(screen.queryByTestId("skeleton-elsewhere-notice")).not.toBeInTheDocument();
  });
});

describe("the Output Variables section in the panel", () => {
  const two_outputs = {
    ...skeleton_document,
    nodes: [
      skeleton_document.nodes[0],
      {
        id: "end",
        type: "end",
        config: {
          execution: {
            inputs: [
              {
                name: "answer",
                value: { kind: "ref", node_id: "start", path: ["text"] },
                missing: "error",
              },
            ],
            outputs: [
              { name: "first", source: { kind: "input", path: ["answer"] } },
              { name: "second", source: { kind: "input", path: ["answer"] } },
            ],
          },
        },
      },
    ],
    edges: skeleton_document.edges,
  };

  test("inputs are above outputs, in every panel", () => {
    /* A node is read downwards, and a wire's two halves are always found in
       the same place. */
    show({ document: two_outputs, onDocumentChange: () => {}, selectedNodeId: "end" });
    const panel = screen.getByTestId("recipe-detail-panel");
    const text = panel.textContent;
    expect(text.indexOf("Input Variables")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Output Variables")).toBeGreaterThan(
      text.indexOf("Input Variables"),
    );
  });

  test("a row is drawn for each mapping", () => {
    show({ document: two_outputs, onDocumentChange: () => {}, selectedNodeId: "end" });
    expect(screen.getAllByTestId(/^output-row-\d+$/)).toHaveLength(2);
  });

  test("a store diagnostic for an output row reaches that row", () => {
    /* This is what the zero row count used to prevent: the diagnostic existed,
       the panel routed it nowhere, and it was reported in no place at all. */
    show({
      document: two_outputs,
      onDocumentChange: () => {},
      selectedNodeId: "end",
      diagnostics: [
        {
          code: "missing_value",
          path: ["document", "nodes", 1, "config", "execution", "outputs", 1, "source", "path", 0],
          message: "captured by the second output row",
        },
      ],
    });
    expect(screen.getByTestId("output-row-1-problem-0").textContent).toBe(
      "captured by the second output row",
    );
  });

  test("a diagnostic for an output row that does not exist is still reported", () => {
    show({
      document: two_outputs,
      onDocumentChange: () => {},
      selectedNodeId: "end",
      diagnostics: [
        {
          code: "missing_value",
          path: ["document", "nodes", 1, "config", "execution", "outputs", 9, "source"],
          message: "past the last row",
        },
      ],
    });
    expect(screen.queryByTestId("output-row-1-problem-0")).not.toBeInTheDocument();
    expect(screen.getByTestId("recipe-detail-panel").textContent).toContain(
      "past the last row",
    );
  });

  test("a section-level refusal is reported even though no row carries it", () => {
    /* A branch's whole outputs key is refused — `unknown_field` at the section
       — and the section is not rendered at all, so only the notice can say it. */
    show({
      document: {
        ...skeleton_document,
        nodes: [
          skeleton_document.nodes[0],
          {
            id: "end",
            type: "end",
            config: { execution: { inputs: [], outputs: [] } },
          },
        ],
      },
      onDocumentChange: () => {},
      selectedNodeId: "end",
      diagnostics: [
        {
          code: "unknown_field",
          path: ["document", "nodes", 1, "config", "execution", "outputs"],
          message: "node does not support this IO section",
        },
      ],
    });
    expect(screen.getByTestId("recipe-detail-panel").textContent).toContain(
      "node does not support this IO section",
    );
  });

  test("a Start shows its outputs and no inputs", () => {
    /* A Start reads from the calling context, so it has no inputs key at all;
       addressed by testid because the legacy Start panel heads its own section
       with the same words. */
    show({ document: skeleton_document, onDocumentChange: () => {}, selectedNodeId: "start" });
    expect(screen.getByTestId("skeleton-output-variables")).toBeInTheDocument();
    expect(screen.queryByTestId("skeleton-input-variables")).not.toBeInTheDocument();
  });

  test("a Skeleton page draws one outputs section, not two", () => {
    /* The legacy Start panel's section carries `node.outputs` from the old
       recipe format, which is a different shape entirely. They never render
       together because a Skeleton page has no recipe — this is what says so. */
    show({
      recipe: undefined,
      document: skeleton_document,
      onDocumentChange: () => {},
      selectedNodeId: "start",
    });
    expect(screen.getAllByText("Output Variables")).toHaveLength(1);
    expect(screen.getByTestId("skeleton-output-variables")).toBeInTheDocument();
  });

  test("a legacy recipe page draws the legacy section and none of mine", () => {
    show({ selectedNodeId: "start" });
    expect(screen.getAllByText("Output Variables")).toHaveLength(1);
    expect(screen.queryByTestId("skeleton-output-variables")).not.toBeInTheDocument();
  });
});

describe("UI-L1 — refused text belongs to one node, one row, one step", () => {
  /* A refused position stays on screen so it can be corrected. It stays in
     local state, because the document deliberately does not hold it — and
     local state in a list is keyed by position, which is not identity. Select
     another node, or remove the row above, and the same key carries a
     different value: the field then showed `-1` while the document held `2`.
     Nothing was written wrongly; the editor misreported what was stored, which
     is the half an author acts on. */
  const end_with = (id, index) => ({
    id,
    type: "end",
    config: {
      execution: {
        inputs: [
          {
            name: "q",
            value: { kind: "ref", node_id: "start", path: ["text"] },
            missing: "error",
          },
        ],
        outputs: [{ name: "out", source: { kind: "input", path: ["q", index] } }],
      },
    },
  });

  const two_ends = {
    ...skeleton_document,
    nodes: [skeleton_document.nodes[0], end_with("endA", 0), end_with("endB", 2)],
    edges: [flow("e1", "start", "endA")],
  };

  const position_box = (row) =>
    within(screen.getByTestId(`output-row-${row}`)).getByPlaceholderText("0");

  test("selecting another node shows that node's stored position", () => {
    const view = render(
      <ConfigContext.Provider value={cfg}>
        <DetailPanel
          recipe={legacy_recipe}
          document={two_ends}
          selectedNodeId="endA"
          onChange={() => {}}
          onChangeSilent={() => {}}
          onDocumentChange={() => {}}
        />
      </ConfigContext.Provider>,
    );
    fireEvent.change(position_box(0), { target: { value: "-1" } });
    expect(position_box(0).value).toBe("-1");

    view.rerender(
      <ConfigContext.Provider value={cfg}>
        <DetailPanel
          recipe={legacy_recipe}
          document={two_ends}
          selectedNodeId="endB"
          onChange={() => {}}
          onChangeSilent={() => {}}
          onDocumentChange={() => {}}
        />
      </ConfigContext.Provider>,
    );
    expect(position_box(0).value).toBe("2");
    expect(screen.queryByTestId("output-row-0-step-0-refused")).not.toBeInTheDocument();
  });

  test("removing a row shows the surviving row's own stored position", () => {
    const node = {
      id: "end",
      type: "end",
      config: {
        execution: {
          inputs: [
            {
              name: "q",
              value: { kind: "ref", node_id: "start", path: ["text"] },
              missing: "error",
            },
          ],
          outputs: [
            { name: "first", source: { kind: "input", path: ["q", 0] } },
            { name: "second", source: { kind: "input", path: ["q", 2] } },
          ],
        },
      },
    };
    const start = {
      ...skeleton_document,
      nodes: [skeleton_document.nodes[0], node],
      edges: [flow("e1", "start", "end")],
    };

    function Live() {
      const [doc, setDoc] = React.useState(start);
      return (
        <ConfigContext.Provider value={cfg}>
          <DetailPanel
            recipe={legacy_recipe}
            document={doc}
            selectedNodeId="end"
            onChange={() => {}}
            onChangeSilent={() => {}}
            onDocumentChange={setDoc}
          />
        </ConfigContext.Provider>
      );
    }

    render(<Live />);
    fireEvent.change(position_box(0), { target: { value: "-1" } });
    expect(position_box(0).value).toBe("-1");

    fireEvent.click(screen.getByLabelText("Remove first"));
    expect(screen.getAllByTestId(/^output-row-\d+$/)).toHaveLength(1);
    expect(position_box(0).value).toBe("2");
    expect(screen.queryByTestId("output-row-0-step-0-refused")).not.toBeInTheDocument();
  });

  test("another row holding the same position does not inherit the text", () => {
    /* Comparing the stored value catches a survivor that differs. It cannot
       catch one that happens to agree — and then the box is describing a
       mapping the text was never typed into, which is the whole defect. So
       the row says who it is as well. */
    const node = {
      id: "end",
      type: "end",
      config: {
        execution: {
          inputs: [
            {
              name: "q",
              value: { kind: "ref", node_id: "start", path: ["text"] },
              missing: "error",
            },
          ],
          outputs: [
            { name: "first", source: { kind: "input", path: ["q", 0] } },
            { name: "second", source: { kind: "input", path: ["q", 0] } },
          ],
        },
      },
    };
    const start = {
      ...skeleton_document,
      nodes: [skeleton_document.nodes[0], node],
      edges: [flow("e1", "start", "end")],
    };

    function Live() {
      const [doc, setDoc] = React.useState(start);
      return (
        <ConfigContext.Provider value={cfg}>
          <DetailPanel
            recipe={legacy_recipe}
            document={doc}
            selectedNodeId="end"
            onChange={() => {}}
            onChangeSilent={() => {}}
            onDocumentChange={setDoc}
          />
        </ConfigContext.Provider>
      );
    }

    render(<Live />);
    fireEvent.change(position_box(0), { target: { value: "-1" } });
    fireEvent.click(screen.getByLabelText("Remove first"));
    expect(screen.getAllByTestId(/^output-row-\d+$/)).toHaveLength(1);
    expect(position_box(0).value).toBe("0");
    expect(screen.queryByTestId("output-row-0-step-0-refused")).not.toBeInTheDocument();
  });

  test("another node holding the same position does not inherit it either", () => {
    const same = {
      ...skeleton_document,
      nodes: [skeleton_document.nodes[0], end_with("endA", 0), end_with("endB", 0)],
      edges: [flow("e1", "start", "endA")],
    };
    const panel = (selected) => (
      <ConfigContext.Provider value={cfg}>
        <DetailPanel
          recipe={legacy_recipe}
          document={same}
          selectedNodeId={selected}
          onChange={() => {}}
          onChangeSilent={() => {}}
          onDocumentChange={() => {}}
        />
      </ConfigContext.Provider>
    );
    const view = render(panel("endA"));
    fireEvent.change(position_box(0), { target: { value: "-1" } });
    view.rerender(panel("endB"));
    expect(position_box(0).value).toBe("0");
    expect(screen.queryByTestId("output-row-0-step-0-refused")).not.toBeInTheDocument();
  });

  test("the refusal survives what does not change the step", () => {
    /* Dropping it on any render at all would be the opposite defect: the
       author would lose what they were correcting the moment anything else on
       the panel moved. */
    const view = render(
      <ConfigContext.Provider value={cfg}>
        <DetailPanel
          recipe={legacy_recipe}
          document={two_ends}
          selectedNodeId="endA"
          onChange={() => {}}
          onChangeSilent={() => {}}
          onDocumentChange={() => {}}
          diagnostics={[]}
        />
      </ConfigContext.Provider>,
    );
    fireEvent.change(position_box(0), { target: { value: "-1" } });
    view.rerender(
      <ConfigContext.Provider value={cfg}>
        <DetailPanel
          recipe={legacy_recipe}
          document={two_ends}
          selectedNodeId="endA"
          onChange={() => {}}
          onChangeSilent={() => {}}
          onDocumentChange={() => {}}
          diagnostics={[
            { code: "end_count", path: ["document", "nodes"], message: "needs one end" },
          ]}
        />
      </ConfigContext.Provider>,
    );
    expect(position_box(0).value).toBe("-1");
    expect(screen.getByTestId("output-row-0-step-0-refused")).toBeInTheDocument();
  });
});

describe("R-SCHEMA — a schema's own fields, through the real controls", () => {
  /* The real Select, the real Input, the real section. The earlier round read
     a schema's direct `properties` and treated that list as exhaustive; these
     schemas declare their fields the other three ways the runtime admits, and
     `skeleton_result_schema_capture` records the real pipeline publishing each
     one. */
  const kernel = (json_schema) => ({
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
    json_schema,
  });

  const with_schema = (json_schema, path) => ({
    ...skeleton_document,
    nodes: [
      skeleton_document.nodes[0],
      {
        id: "kernel",
        type: "agent",
        config: {
          execution: {
            inputs: [],
            outputs: [{ name: "out", source: { kind: "result", path } }],
          },
          kernel: kernel(json_schema),
        },
      },
      skeleton_document.nodes[1],
    ],
    edges: [flow("e1", "start", "kernel"), flow("e2", "kernel", "end")],
  });

  const open_agent = (json_schema, path) =>
    show({
      document: with_schema(json_schema, path),
      onDocumentChange: () => {},
      selectedNodeId: "kernel",
    });

  const row_text = () => screen.getByTestId("output-row-0").textContent;

  test("a field declared through a root $ref is not called nonexistent", () => {
    open_agent(
      {
        type: "object",
        $ref: "#/$defs/Payload",
        $defs: {
          Payload: { type: "object", properties: { score: { type: "number" } } },
        },
      },
      ["score"],
    );
    expect(row_text()).not.toMatch(/produces no result named/i);
  });

  test("a field declared through anyOf is not called nonexistent", () => {
    open_agent(
      {
        type: "object",
        anyOf: [
          { type: "object", properties: { score: { type: "number" } } },
          { type: "object", properties: { label: { type: "string" } } },
        ],
      },
      ["label"],
    );
    expect(row_text()).not.toMatch(/produces no result named/i);
  });

  test("a field whose name is the empty string is not called nonexistent", () => {
    open_agent({ type: "object", properties: { "": { type: "string" } } }, [""]);
    expect(row_text()).not.toMatch(/produces no result named/i);
  });

  test("a field an open schema permits but does not name is not called nonexistent", () => {
    open_agent(
      {
        type: "object",
        properties: { answer: { type: "string" } },
        additionalProperties: true,
      },
      ["extra"],
    );
    expect(row_text()).not.toMatch(/produces no result named/i);
    expect(row_text()).toMatch(/does not close its own field list/i);
  });

  test("an open schema's unlisted field stays editable rather than frozen", () => {
    open_agent(
      { type: "object", properties: { answer: { type: "string" } } },
      ["extra"],
    );
    const row = within(screen.getByTestId("output-row-0"));
    expect(row.getByPlaceholderText("field").value).toBe("extra");
  });

  test("a schema that does close its list still refuses a name it cannot hold", () => {
    /* The repair is not a retreat: where the runtime really does bound the
       keys, the diagnostic that round three added has to survive. */
    open_agent(
      {
        type: "object",
        properties: { answer: { type: "string" } },
        additionalProperties: false,
      },
      ["typo"],
    );
    expect(row_text()).toMatch(/produces no result named "typo"/i);
  });

  test("an Agent with no schema at all is still closed on its two built-ins", () => {
    open_agent(null, ["typo"]);
    expect(row_text()).toMatch(/produces no result named "typo"/i);
  });
});

describe("the JSON Output section, and the two halves it joins", () => {
  const kernel = (json_schema) => ({
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
    json_schema,
  });

  const with_agent = (json_schema, outputs) => ({
    ...skeleton_document,
    nodes: [
      skeleton_document.nodes[0],
      {
        id: "kernel",
        type: "agent",
        config: {
          execution: { inputs: [], outputs: outputs || [] },
          kernel: kernel(json_schema),
        },
      },
      skeleton_document.nodes[1],
    ],
    edges: [flow("e1", "start", "kernel"), flow("e2", "kernel", "end")],
  });

  const open_agent = (json_schema, outputs) =>
    show({
      document: with_agent(json_schema, outputs),
      onDocumentChange: () => {},
      selectedNodeId: "kernel",
    });

  test("it is read downwards: given, produced, passed on", () => {
    open_agent(null);
    const text = screen.getByTestId("recipe-detail-panel").textContent;
    expect(text.indexOf("Input Variables")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("JSON Output")).toBeGreaterThan(text.indexOf("Input Variables"));
    expect(text.indexOf("Output Variables")).toBeGreaterThan(text.indexOf("JSON Output"));
  });

  test("only an Agent has one, because only an Agent has a kernel", () => {
    show({ document: skeleton_document, onDocumentChange: () => {}, selectedNodeId: "end" });
    expect(screen.queryByTestId("skeleton-output-schema")).not.toBeInTheDocument();
  });

  test("a declared field becomes a source the output rows offer", () => {
    /* The point of the section. Without it the author could only reach these
       by typing the name and hoping. */
    open_agent(
      { type: "object", properties: { score: { type: "number" } } },
      [{ name: "out", source: { kind: "result", path: ["score"] } }],
    );
    const row = screen.getByTestId("output-row-0");
    expect(row.textContent).not.toMatch(/produces no result named/i);
    expect(screen.getByTestId("skeleton-output-schema")).toBeInTheDocument();
  });

  test("closing the field list is what lets a row refuse a name", () => {
    open_agent(
      {
        type: "object",
        properties: { score: { type: "number" } },
        additionalProperties: false,
      },
      [{ name: "out", source: { kind: "result", path: ["typo"] } }],
    );
    expect(screen.getByTestId("output-row-0").textContent).toMatch(
      /produces no result named "typo"/i,
    );
  });

  test("leaving it open means a row refuses nothing", () => {
    open_agent(
      { type: "object", properties: { score: { type: "number" } } },
      [{ name: "out", source: { kind: "result", path: ["typo"] } }],
    );
    expect(screen.getByTestId("output-row-0").textContent).not.toMatch(
      /produces no result named/i,
    );
  });

  test("a schema the rows cannot hold is shown rather than rebuilt", () => {
    open_agent({
      type: "object",
      anyOf: [
        { type: "object", properties: { a: { type: "string" } } },
        { type: "object", properties: { b: { type: "string" } } },
      ],
    });
    expect(screen.getByTestId("schema-not-field-shaped").textContent).toMatch(
      /alternative shapes/i,
    );
  });
});

describe("the panel survives a draft no save would take", () => {
  /* The whole panel, both sections, one render. A schema is composed inside
     it, so it can be as deep as it has been typed — and the sections read it
     for different things: admission, whether the rows hold it, and what its
     root declares for the outputs beside it. That last reader had no limit
     check in front of it and was written recursive, so the panel stopped
     rendering rather than reporting the depth. */
  const kernel = (json_schema) => ({
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
    json_schema,
  });

  const nest = (levels) => {
    let node = { type: "string" };
    for (let i = 0; i < levels; i += 1) {
      node = { type: "object", properties: { n: node } };
    }
    return { type: "object", properties: { n: node } };
  };

  const open_deep = (levels) =>
    show({
      document: {
        ...skeleton_document,
        nodes: [
          skeleton_document.nodes[0],
          {
            id: "kernel",
            type: "agent",
            config: {
              execution: {
                inputs: [],
                outputs: [{ name: "out", source: { kind: "result", path: ["n"] } }],
              },
              kernel: kernel(nest(levels)),
            },
          },
          skeleton_document.nodes[1],
        ],
        edges: [flow("e1", "start", "kernel"), flow("e2", "kernel", "end")],
      },
      onDocumentChange: () => {},
      selectedNodeId: "kernel",
    });

  test("it renders and says the depth instead of going down", () => {
    expect(() => open_deep(4000)).not.toThrow();
    expect(screen.getByTestId("skeleton-output-schema").textContent).toMatch(
      /depth/i,
    );
    expect(screen.getByTestId("output-row-0")).toBeInTheDocument();
  });

  test("and the output row reading into it is not called wrong", () => {
    /* The field really is declared at the root, so nothing may say it is
       not — the inventory has to answer for this draft, not give up on it. */
    open_deep(4000);
    expect(screen.getByTestId("output-row-0").textContent).not.toMatch(
      /produces no result named/i,
    );
  });
});

describe("a Subagent Pool node in the panel", () => {
  /* A pool attaches to a Kernel rather than running in the flow, so it has no
     execution IO at all — the shared sections render nothing for it, and what
     it does carry gets its own section. */
  const with_pool = (config) => ({
    ...skeleton_document,
    nodes: [
      skeleton_document.nodes[0],
      { id: "k", type: "agent", config: { execution: { inputs: [], outputs: [] } } },
      { id: "pool", type: "subagent_pool", config },
      skeleton_document.nodes[1],
    ],
    edges: [
      flow("e1", "start", "k"),
      flow("e2", "k", "end"),
      {
        id: "a1",
        kind: "attach",
        source_node_id: "pool",
        source_port_id: "attach_top",
        target_node_id: "k",
        target_port_id: "attach_bot",
      },
    ],
  });

  const open_pool = async (config) => {
    const view = show({
      document: with_pool(config),
      onDocumentChange: () => {},
      selectedNodeId: "pool",
    });
    /* The Agent library is read in an effect. There is no bridge in this
       build, so it settles as unavailable; letting it land keeps the state
       update inside the test. */
    await act(async () => {});
    return view;
  };

  test("gets the Subagent Pool section", async () => {
    await open_pool({ subagents: [] });
    expect(screen.getByTestId("skeleton-subagent-pool")).toBeInTheDocument();
  });

  test("and not the Input or Output Variables sections", async () => {
    await open_pool({ subagents: [] });
    expect(screen.queryByTestId("skeleton-input-variables")).not.toBeInTheDocument();
    expect(screen.queryByTestId("skeleton-output-variables")).not.toBeInTheDocument();
  });

  test("an Agent node does not get the pool section", async () => {
    show({
      document: with_pool({ subagents: [] }),
      onDocumentChange: () => {},
      selectedNodeId: "k",
    });
    await act(async () => {});
    expect(screen.queryByTestId("skeleton-subagent-pool")).not.toBeInTheDocument();
  });

  test("the pool says what the runtime would refuse about it", async () => {
    await open_pool({ subagents: [] });
    expect(screen.getByTestId("subagent-pool-problem-0").textContent).toMatch(
      /must contain an Agent/i,
    );
  });
});
