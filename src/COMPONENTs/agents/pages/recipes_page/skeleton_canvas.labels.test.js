import React from "react";
import { render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import SkeletonCanvas from "./skeleton_canvas";
import AgentNode from "./nodes/agent_node";
import StartNode from "./nodes/start_node";
import { node_identity } from "./detail_panel/node_identity";
const types = ["start", "end", "agent", "toolkit_pool", "subagent_pool", "if_else", "switch_case", "tool_call", "skill_read", "workflow_call", "hooks_pool", "code"];
const native = (type, label) => ({ id: type, type, config: {}, ...(label === undefined ? {} : { label }) });
const wrap = (ui) => <ConfigContext.Provider value={{ theme: {} }}>{ui}</ConfigContext.Provider>;
test("every real native node drawing and identity displays its valid label", () => {
  const nodes = types.map((type) => native(type, `Named ${type}`));
  render(wrap(<SkeletonCanvas resourceId="labels" document={{ schema_version: 1, kind: "agent", id: "labels", nodes, edges: [] }} />));
  nodes.forEach((node) => {
    expect(within(screen.getByTestId(`skeleton-node-${node.id}`)).getByText(node.label)).toBeInTheDocument();
    expect(node_identity(node).title).toBe(node.label);
  });
});
test("malformed native labels never masquerade as a valid title", () => {
  const node = native("agent", { toString: null });
  render(wrap(<AgentNode node={node} />));
  /* Without a valid label of its own a native Agent reads "Agent", not its id. */
  expect(screen.getByText("Agent")).toBeInTheDocument();
  expect(node_identity(node).title).toBe("Agent");
});
test("legacy Agent labels and Start fallback retain their existing titles", () => {
  render(wrap(<><AgentNode node={{ id: "legacy", type: "agent", label: "Legacy author name" }} /><StartNode /></>));
  expect(screen.getByText("Legacy author name")).toBeInTheDocument(); expect(screen.getByText("Start")).toBeInTheDocument();
  expect(node_identity({ id: "legacy", type: "agent", label: "Legacy author name" }).title).toBe("Legacy author name");
});

/* #484: unlabelled nodes — every graph until someone renames a node, and
 * what the save API writes — read the same on the card and in the panel.
 * The shapes are the ones stored in "template agent 1". */
test("an unlabelled node's card and panel header give the same name", () => {
  const nodes = [
    { id: "find-docs", type: "tool_call", config: { tool: { name: "glob" } } },
    { id: "skill-read", type: "skill_read", config: { skill: { name: "workflow-test-notes", source: "user" } } },
    { id: "count-words", type: "code", config: {} },
    { id: "summarize", type: "workflow_call", config: { workflow: { workflow_id: "test-workflow-2", revision_id: "rev-1" } } },
    { id: "route", type: "switch_case", config: {} },
    { id: "is-question", type: "if_else", config: {} },
  ];
  const { rerender } = render(wrap(<SkeletonCanvas resourceId="unlabelled" document={{ schema_version: 1, kind: "agent", id: "unlabelled", nodes, edges: [] }} />));
  const expected = { "find-docs": "glob", "skill-read": "workflow-test-notes", "count-words": "count-words", summarize: "test-workflow-2", route: "Switch / Case", "is-question": "If / Else" };
  nodes.forEach((node) => {
    const title = node_identity(node).title;
    expect(title).toBe(expected[node.id]);
    expect(within(screen.getByTestId(`skeleton-node-${node.id}`)).getAllByText(title).length).toBeGreaterThan(0);
  });
  /* Renamed, both move to the author's name together. */
  const renamed = nodes.map((node) => ({ ...node, label: `Renamed ${node.id}` }));
  rerender(wrap(<SkeletonCanvas resourceId="unlabelled" document={{ schema_version: 1, kind: "agent", id: "unlabelled", nodes: renamed, edges: [] }} />));
  renamed.forEach((node) => {
    expect(node_identity(node).title).toBe(node.label);
    expect(within(screen.getByTestId(`skeleton-node-${node.id}`)).getByText(node.label)).toBeInTheDocument();
  });
});
