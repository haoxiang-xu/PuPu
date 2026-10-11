import React from "react";
import { render, screen } from "@testing-library/react";
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
