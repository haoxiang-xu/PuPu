import React from "react";
import { render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import SubagentPoolPanel from "./subagent_pool_panel";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => (
  <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>
);

const show = (subagents) => {
  const node = { id: "sp", type: "subagent_pool", subagents };
  return render(
    wrap(
      <SubagentPoolPanel
        node={node}
        recipe={{ nodes: [node], edges: [] }}
        onChange={() => {}}
      />,
    ),
  );
};

describe("SubagentPoolPanel lists entries", () => {
  test("each row names its Agent and where it comes from", () => {
    show([
      { kind: "recipe_ref", recipe_name: "Explore" },
      { kind: "inline", name: "summarizer" },
    ]);
    expect(screen.getByText("Explore")).toBeInTheDocument();
    expect(screen.getByText("Referenced")).toBeInTheDocument();
    expect(screen.getByText("summarizer")).toBeInTheDocument();
    expect(screen.getByText("Legacy inline")).toBeInTheDocument();
  });

  test("a referenced Agent is never called a workflow", () => {
    /* The row used to print the entry's `kind`, so `recipe_ref` read "workflow"
     * — the reference field's name mistaken for the resource's kind. */
    show([{ kind: "recipe_ref", recipe_name: "Explore" }]);
    expect(screen.queryByText(/workflow/i)).not.toBeInTheDocument();
  });

  test("empty state says so rather than showing a blank row", () => {
    const { container } = show([]);
    expect(screen.getByText(/no subagents configured/i)).toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="subagent-row-0"]'),
    ).toBeNull();
  });
});

describe("SubagentPoolPanel never edits a subagent's contents", () => {
  test("a row offers no editable control beyond removing the entry", () => {
    /* Contents are edited by opening the subagent's own graph. A row that let
     * a prompt, model or tool be edited here would be the old inline-modal
     * design the redesign removed. */
    const { container } = show([
      { kind: "inline", name: "summarizer", prompt: "You are..." },
    ]);
    const row = container.querySelector('[data-testid="subagent-row-0"]');
    expect(row.querySelector("input, textarea, select")).toBeNull();
    expect(within(row).getAllByRole("button")).toHaveLength(1);
  });

  test("an entry's prompt is not rendered anywhere on the panel", () => {
    show([{ kind: "inline", name: "summarizer", prompt: "You are a summarizer" }]);
    expect(screen.queryByText(/you are a summarizer/i)).not.toBeInTheDocument();
  });

  test("the panel says what it manages and what it does not", () => {
    show([]);
    expect(screen.getByText(/this panel manages the/i)).toBeInTheDocument();
  });
});
