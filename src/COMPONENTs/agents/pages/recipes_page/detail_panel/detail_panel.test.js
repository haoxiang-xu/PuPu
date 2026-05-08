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
    render(
      wrap(
        <DetailPanel
          recipe={{ nodes: [], edges: [] }}
          selectedNodeId={null}
          onChange={() => {}}
        />,
      ),
    );
    expect(screen.getByText(/select a node/i)).toBeInTheDocument();
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
    render(
      wrap(
        <DetailPanel
          recipe={recipe}
          selectedNodeId="start"
          onChange={() => {}}
        />,
      ),
    );
    expect(screen.getByText("Start")).toBeInTheDocument();
  });
});
