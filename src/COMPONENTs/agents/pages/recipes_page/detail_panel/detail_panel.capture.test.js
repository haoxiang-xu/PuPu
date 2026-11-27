import React from "react";
import { render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import DetailPanel from "./detail_panel";
import {
  CAPTURED_DIAGNOSTICS,
  CAPTURED_DRAFT,
  CAPTURED_OUTPUT_MAPPING_PROBLEM,
} from "../skeleton_diagnostics_capture";

/* The repaired panel against real store output rather than an invented shape.
 * One draft, wrong four ways at once: the graph, a node, a binding row's
 * field, and the inside of a binding row's unreadable value. */

const cfg = { theme: {}, onThemeMode: "light_mode" };

const show = (nodeId) =>
  render(
    <ConfigContext.Provider value={cfg}>
      <DetailPanel
        recipe={{ name: "R", nodes: CAPTURED_DRAFT.nodes, edges: [] }}
        selectedNodeId={nodeId}
        onChange={() => {}}
        onChangeSilent={() => {}}
        document={CAPTURED_DRAFT}
        diagnostics={CAPTURED_DIAGNOSTICS}
        onDocumentChange={() => {}}
      />
    </ConfigContext.Provider>,
  );

describe("the repaired panel against real store output", () => {
  test("the fixture really does carry all four depths", () => {
    const depths = CAPTURED_DIAGNOSTICS.map((d) => d.path.length);
    expect(CAPTURED_DIAGNOSTICS).toHaveLength(4);
    expect(Math.min(...depths)).toBe(2);
    expect(Math.max(...depths)).toBeGreaterThanOrEqual(8);
  });

  test("R1 — the malformed first_present row renders rather than throwing", () => {
    expect(() => show("a1")).not.toThrow();
    expect(screen.getByTestId("binding-row-1-unreadable")).toBeInTheDocument();
    /* And the ordinary row beside it is still an ordinary row. */
    expect(screen.queryByTestId("binding-row-0-unreadable")).toBeNull();
  });

  test("R2 — every captured message reaches the panel", () => {
    const { container } = show("a1");
    CAPTURED_DIAGNOSTICS.forEach((item) => {
      expect(container.textContent).toContain(item.message);
    });
  });

  test("the two row-level ones land on their own rows", () => {
    show("a1");
    expect(within(screen.getByTestId("binding-row-0")).getAllByText(/default/i).length)
      .toBeGreaterThan(0);
    expect(screen.getByTestId("binding-row-1").textContent).toMatch(/values/i);
  });

  test("the graph-level one is shown under Elsewhere, not on a row", () => {
    show("a1");
    const elsewhere = screen.getByTestId("skeleton-elsewhere-notice");
    expect(elsewhere.textContent).toMatch(/exactly one end node/i);
    expect(elsewhere.textContent).toMatch(/This graph/);
  });

  test("viewed from another node, this node's problems are still visible", () => {
    /* Selecting a different node must not make the rest of the graph look
       clean — that was the whole failure. */
    const { container } = show("start");
    CAPTURED_DIAGNOSTICS.forEach((item) => {
      expect(container.textContent).toContain(item.message);
    });
    expect(screen.getByTestId("skeleton-elsewhere-notice").textContent).toMatch(/Node a1/);
  });
});

describe("R2 residual — an output-mapping problem is visible too", () => {
  /* A `type` left on an output mapping: the wire has no room for it, because
   * the type is inherited from the source. The real store saves the document
   * unchanged and reports it at
   * ["document","nodes",1,"config","execution","outputs",0,"type"].
   *
   * It used to be claimed into `rows.outputs`, which nothing renders — so it
   * was taken from the notices and shown nowhere. Counting buckets would not
   * have caught that; only looking for the message does. */
  const draft = CAPTURED_OUTPUT_MAPPING_PROBLEM.document;
  const diagnostics = CAPTURED_OUTPUT_MAPPING_PROBLEM.diagnostics;

  const showOutput = (nodeId) =>
    render(
      <ConfigContext.Provider value={cfg}>
        <DetailPanel
          recipe={{ name: "R", nodes: draft.nodes, edges: [] }}
          selectedNodeId={nodeId}
          onChange={() => {}}
          onChangeSilent={() => {}}
          document={draft}
          diagnostics={diagnostics}
          onDocumentChange={() => {}}
        />
      </ConfigContext.Provider>,
    );

  test("the capture really is an output-row path", () => {
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].path).toEqual([
      "document", "nodes", 1, "config", "execution", "outputs", 0, "type",
    ]);
  });

  test("with End selected, the message is on screen", () => {
    const { container } = showOutput("end");
    expect(container.textContent).toContain(diagnostics[0].message);
  });

  test("with Start selected, the message is on screen", () => {
    const { container } = showOutput("start");
    expect(container.textContent).toContain(diagnostics[0].message);
  });

  test("it is named as belonging to the End node", () => {
    showOutput("start");
    expect(screen.getByTestId("skeleton-elsewhere-notice").textContent).toMatch(/Node end/);
  });
});
