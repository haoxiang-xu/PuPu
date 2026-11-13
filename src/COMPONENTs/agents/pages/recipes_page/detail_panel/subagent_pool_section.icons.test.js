import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import SubagentPoolSection from "./subagent_pool_section";
import { node_subagents } from "../skeleton_document";
import { list_resources } from "../skeleton_resources";

/* A subagent wears its Agent's icon and colour: a referenced Agent's from its
   stored summary, an embedded one's from its own document — and an embedded
   one's is changed in its settings, written like its name. These fixtures put
   `presentation` only where it is read; the local document validator is not
   what is asserted here. */

jest.mock("../../../use_presentation_capability", () => ({
  ...jest.requireActual("../../../use_presentation_capability"),
  usePresentationCapability: () => "supported",
}));
jest.mock("../skeleton_resources", () => ({
  is_unavailable: (result) => Boolean(result) && result.ok === false && result.reason === "unavailable",
  list_resources: jest.fn(),
}));

const base = {
  description: "",
  allowed_modes: ["delegate", "worker"],
  output_mode: "summary",
  memory_policy: "ephemeral",
  parallel_safe: true,
  allowed_tools: null,
  disabled_tools: [],
};
const child = (extra = {}) => ({
  schema_version: 1, kind: "agent", id: "child", name: "Child",
  nodes: [{ id: "k", type: "agent", config: { execution: { inputs: [], outputs: [] } } }], edges: [], ...extra,
});
const node = (subagents) => ({ id: "pool", type: "subagent_pool", config: { subagents } });
const doc = (pool) => ({
  schema_version: 1, kind: "agent", id: "parent", name: "Reviewer",
  nodes: [{ id: "k", type: "agent", config: { execution: { inputs: [], outputs: [] } } }, pool],
  edges: [{ id: "a", kind: "attach", source_node_id: "k", source_port_id: "attach_bot", target_node_id: "pool", target_port_id: "attach_top" }],
});
const LIBRARY = [
  { id: "res-1", kind: "agent", name: "Summarizer", archived: false, presentation: { icon: "robot_bust", color: "#B94A74" } },
  { id: "res-2", kind: "agent", name: "Checker", archived: false },
];

async function show(pool) {
  list_resources.mockResolvedValue({ ok: true, data: { resources: LIBRARY } });
  const onChange = jest.fn();
  render(<SubagentPoolSection document={doc(pool)} node={pool} isDark={false} onChange={onChange} />);
  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async () => {});
  return onChange;
}

beforeEach(() => list_resources.mockReset());

test("a referenced Agent's strip and the library rows draw the stored presentation", async () => {
  await show(node([
    { ...base, id: "s1", name: "Summarizer", source: { kind: "agent_ref", agent_id: "res-1" } },
    { ...base, id: "s2", name: "Checker", source: { kind: "agent_ref", agent_id: "res-2" } },
  ]));
  const first = screen.getByTestId("subagent-entry-0-icon");
  expect(first.getAttribute("data-agent-icon")).toBe("robot_bust");
  expect(first.getAttribute("data-agent-color")).toBe("#b94a74");
  expect(screen.getByTestId("subagent-entry-1-icon").getAttribute("data-agent-icon")).toBe("bot");
  /* A referenced Agent's icon is that resource's: no control here. */
  expect(screen.queryByTestId("subagent-entry-0-icon-button")).toBeNull();
});

test("an Agent with no chosen colour is drawn in the row's text colour, never a default blue", async () => {
  await show(node([
    { ...base, id: "s2", name: "Checker", source: { kind: "agent_ref", agent_id: "res-2" } },
  ]));
  const icon = screen.getByTestId("subagent-entry-0-icon");
  expect(icon.getAttribute("data-agent-variant")).toBe("glyph");
  expect(icon.getAttribute("data-agent-tint")).toBe("currentColor");
  expect(icon.style.background).toBe("");
});

test("a referenced Agent's icon follows the library when it is re-read", async () => {
  await show(node([
    { ...base, id: "s1", name: "Summarizer", source: { kind: "agent_ref", agent_id: "res-1" } },
  ]));
  expect(screen.getByTestId("subagent-entry-0-icon").getAttribute("data-agent-icon")).toBe("robot_bust");
  list_resources.mockResolvedValue({ ok: true, data: { resources: [
    { ...LIBRARY[0], presentation: { icon: "run", color: "#2e8f5a" } }, LIBRARY[1],
  ] } });
  const { emitSkeletonLibraryRefresh } = require("../../../../../SERVICEs/skeleton_library_refresh");
  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async () => { emitSkeletonLibraryRefresh(); });
  const icon = screen.getByTestId("subagent-entry-0-icon");
  expect(icon.getAttribute("data-agent-icon")).toBe("run");
  expect(icon.getAttribute("data-agent-color")).toBe("#2e8f5a");
});

test("an embedded Agent reads its own document's presentation and writes a choice into it", async () => {
  const embedded = { ...base, id: "s1", name: "Inline", source: { kind: "embedded", document: child({ presentation: { icon: "gemini" } }) } };
  const onChange = await show(node([embedded]));
  expect(screen.getByTestId("subagent-entry-0-icon").getAttribute("data-agent-icon")).toBe("gemini");
  fireEvent.click(screen.getByTestId("subagent-entry-0-icon-button"));
  fireEvent.click(screen.getByTestId("subagent-entry-0-icon-button-picker-color-2e8f5a"));
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const written = node_subagents(onChange.mock.calls[onChange.mock.calls.length - 1][0].nodes[1]);
  expect(written[0].source.document.presentation).toEqual({ icon: "gemini", color: "#2e8f5a" });
  expect(written[0].source.document.nodes).toEqual(embedded.source.document.nodes);
  expect(written[0].name).toBe("Inline");
});

test("Reset to default removes an embedded Agent's presentation", async () => {
  const embedded = { ...base, id: "s1", name: "Inline", source: { kind: "embedded", document: child({ presentation: { icon: "gemini" } }) } };
  const onChange = await show(node([embedded]));
  fireEvent.click(screen.getByTestId("subagent-entry-0-icon-button"));
  fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const written = node_subagents(onChange.mock.calls[onChange.mock.calls.length - 1][0].nodes[1]);
  expect(written[0].source.document).not.toHaveProperty("presentation");
});
