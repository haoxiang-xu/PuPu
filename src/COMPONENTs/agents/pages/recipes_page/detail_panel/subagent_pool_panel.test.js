import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import SubagentPoolPanel from "./subagent_pool_panel";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => (
  <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>
);

describe("SubagentPoolPanel", () => {
  test("lists subagents", () => {
    const node = {
      id: "sp",
      type: "subagent_pool",
      subagents: [
        { kind: "recipe_ref", recipe_name: "Explore" },
        { kind: "local", name: "summarizer" },
      ],
    };
    render(
      wrap(
        <SubagentPoolPanel
          node={node}
          recipe={{ nodes: [node], edges: [] }}
          onChange={() => {}}
        />,
      ),
    );
    expect(screen.getByText("Explore")).toBeInTheDocument();
    expect(screen.getByText("workflow")).toBeInTheDocument();
    expect(screen.getByText("summarizer")).toBeInTheDocument();
  });
});
