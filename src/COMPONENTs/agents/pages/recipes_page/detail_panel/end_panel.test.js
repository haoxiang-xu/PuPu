import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import EndPanel from "./end_panel";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => (
  <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>
);

describe("EndPanel", () => {
  test("lists upstream variables", () => {
    const recipe = {
      nodes: [
        {
          id: "start",
          type: "start",
          outputs: [{ name: "text", type: "string" }],
        },
        {
          id: "end",
          type: "end",
          outputs_schema: [{ name: "output", type: "string" }],
        },
      ],
      edges: [
        {
          id: "e",
          kind: "flow",
          source_node_id: "start",
          source_port_id: "out",
          target_node_id: "end",
          target_port_id: "in",
        },
      ],
    };
    const end_node = recipe.nodes[1];
    render(
      wrap(<EndPanel node={end_node} recipe={recipe} onChange={() => {}} />),
    );
    expect(screen.getByText("start.text")).toBeInTheDocument();
  });
});
