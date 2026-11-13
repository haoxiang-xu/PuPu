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
