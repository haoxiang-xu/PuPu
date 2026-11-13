import React from "react";
import { act, render, screen } from "@testing-library/react";
import SubagentPoolSection from "./subagent_pool_section";
import { list_resources } from "../skeleton_resources";

/* A subagent row is an Agent resource, so it wears that Agent's icon: a
   referenced Agent's from its stored summary, an embedded one's from its own
   document — always in the row's text colour, a legacy stored colour is never
   drawn. The icon is changed only from the Agents explorer: there is no
   control here. These fixtures put `presentation` only where it is read; the
   local document validator is not what is asserted here. */

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
  expect(first.getAttribute("data-agent-tint")).toBe("currentColor");
  expect(first.style.background).toBe("");
  expect(screen.getByTestId("subagent-entry-1-icon").getAttribute("data-agent-icon")).toBe("bot");
  /* A referenced Agent's icon is that resource's: no control here. */
  expect(screen.queryByTestId("subagent-entry-0-icon-button")).toBeNull();
});

test("an Agent with no presentation is drawn in the row's text colour, never a default blue", async () => {
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
  expect(icon.getAttribute("data-agent-tint")).toBe("currentColor");
});

test("an embedded Agent reads its own document's icon, and offers no control to change it", async () => {
  const embedded = { ...base, id: "s1", name: "Inline", source: { kind: "embedded", document: child({ presentation: { icon: "gemini", color: "#2e8f5a" } }) } };
  const onChange = await show(node([embedded]));
  const icon = screen.getByTestId("subagent-entry-0-icon");
  expect(icon.getAttribute("data-agent-icon")).toBe("gemini");
  expect(icon.getAttribute("data-agent-tint")).toBe("currentColor");
  expect(screen.queryByTestId("subagent-entry-0-icon-button")).toBeNull();
  expect(screen.queryByTestId("subagent-entry-0-icon-row")).toBeNull();
  expect(screen.queryByRole("dialog", { name: "Agent icon" })).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});

test("the library rows draw each Agent's icon in the row's colour", async () => {
  await show(node([]));
  // eslint-disable-next-line testing-library/no-node-access
  const marks = Array.from(screen.getByTestId("subagent-picker").querySelectorAll('[data-agent-variant="glyph"]'));
  expect(marks.map((el) => el.getAttribute("data-agent-icon"))).toEqual(["robot_bust", "bot"]);
  marks.forEach((el) => expect(el.getAttribute("data-agent-tint")).toBe("currentColor"));
});
