import React from "react";
import { render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import DetailPanel from "./detail_panel";
import {
  CAPTURED_DIAGNOSTICS,
  CAPTURED_DRAFT,
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
