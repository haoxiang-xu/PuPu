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
