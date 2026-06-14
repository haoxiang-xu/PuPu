import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import DetailPanel from "./detail_panel";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => (
  <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>
);

describe("DetailPanel", () => {
  test("shows empty state when no node selected", () => {
    const { container } = render(
      wrap(
        <DetailPanel
          recipe={{ nodes: [], edges: [] }}
          selectedNodeId={null}
          onChange={() => {}}
        />,
      ),
    );
    expect(screen.getByText(/select a node/i)).toBeInTheDocument();
    const panel = container.querySelector('[data-testid="recipe-detail-panel"]');
    expect(panel).toHaveClass("scrollable");
    expect(panel).toHaveAttribute("data-sb-wall", "4");
    expect(panel).toHaveAttribute("data-sb-edge", "2");
    expect(panel).toHaveAttribute("data-sb-edge-top", "36");
    expect(panel).toHaveAttribute("data-sb-edge-bottom", "12");
  });

  test("dispatches to start panel when start node selected", () => {
    const recipe = {
      nodes: [
        {
          id: "start",
          type: "start",
          outputs: [{ name: "text", type: "string" }],
        },
      ],
      edges: [],
    };
    const { container } = render(
      wrap(
        <DetailPanel
          recipe={recipe}
          selectedNodeId="start"
          onChange={() => {}}
        />,
      ),
    );
    expect(screen.getByText("Start")).toBeInTheDocument();
    const panel = container.querySelector('[data-testid="recipe-detail-panel"]');
    expect(panel).toHaveAttribute("data-sb-edge", "2");
  });
});
