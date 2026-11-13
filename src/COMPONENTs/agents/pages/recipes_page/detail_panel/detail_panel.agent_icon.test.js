import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import DetailPanel from "./detail_panel";
import AgentNode from "../nodes/agent_node";
import { kernel_profiles, list_resources } from "../skeleton_resources";

/* In an Agent document the Agent node is the Agent, so the panel header is
   where its icon and colour are shown and changed: through the ordinary
   document edit, as the document's own `presentation`. */

jest.mock("../../../use_presentation_capability", () => ({
  ...jest.requireActual("../../../use_presentation_capability"),
  usePresentationCapability: () => "supported",
}));
jest.mock("./panel_help", () => function GuidanceText({ children }) { return <>{children}</>; });
jest.mock("../skeleton_resources", () => ({
  is_unavailable: (result) => Boolean(result) && result.ok === false && result.reason === "unavailable",
  list_resources: jest.fn(),
  kernel_profiles: jest.fn(),
}));
beforeEach(() => {
  list_resources.mockResolvedValue({ ok: true, data: { resources: [] } });
  kernel_profiles.mockReturnValue(new Promise(() => {}));
});

const flow = (id, a, b) => ({ id, kind: "flow", source_node_id: a, source_port_id: "out", target_node_id: b, target_port_id: "in" });
const agent_document = (extra = {}) => ({
  schema_version: 1,
  kind: "agent",
  id: "agent-1",
  name: "A",
  nodes: [
    { id: "s", type: "start", config: { execution: { outputs: [] } } },
    { id: "k", type: "agent", config: { execution: { inputs: [], outputs: [] } } },
    { id: "e", type: "end", config: { execution: { inputs: [], outputs: [] } } },
  ],
  edges: [flow("f1", "s", "k"), flow("f2", "k", "e")],
  ...extra,
});
const show = (document, selectedNodeId = "k") => {
  const onDocumentChange = jest.fn();
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <DetailPanel recipe={null} selectedNodeId={selectedNodeId} onChange={() => {}} onChangeSilent={() => {}}
        document={document} rootDocument={document} diagnostics={[]} onDocumentChange={onDocumentChange} />
    </ConfigContext.Provider>,
  );
  return onDocumentChange;
};

test("the Agent node's header draws the document's presentation and writes a choice into it", () => {
  const onDocumentChange = show(agent_document({ presentation: { icon: "robot_dome", color: "#1d8798" } }));
  const avatar = screen.getByTestId("recipe-detail-panel-agent-icon-avatar");
  expect(avatar.getAttribute("data-agent-icon")).toBe("robot_dome");
  expect(avatar.getAttribute("data-agent-color")).toBe("#1d8798");
  fireEvent.click(screen.getByTestId("recipe-detail-panel-agent-icon"));
  fireEvent.click(screen.getByTestId("recipe-detail-panel-agent-icon-picker-icon-ollama"));
  expect(onDocumentChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onDocumentChange).toHaveBeenLastCalledWith(expect.objectContaining({ presentation: { icon: "ollama", color: "#1d8798" } }));
  fireEvent.click(screen.getByTestId("recipe-detail-panel-agent-icon"));
  fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const reset = onDocumentChange.mock.calls[onDocumentChange.mock.calls.length - 1][0];
  expect(reset).not.toHaveProperty("presentation");
  expect(reset.nodes).toHaveLength(3);
});

test("an Agent without a presentation shows the default, and other nodes keep their own icon", () => {
  show(agent_document());
  expect(screen.getByTestId("recipe-detail-panel-agent-icon-avatar").getAttribute("data-agent-icon")).toBe("bot");
});

test("a Start node has no Agent icon control", () => {
  show(agent_document(), "s");
  expect(screen.queryByTestId("recipe-detail-panel-agent-icon")).toBeNull();
});

test("the canvas Agent node wears a presentation when it is given one", () => {
  const { rerender } = render(<AgentNode node={{ id: "k", type: "agent", config: {} }} isDark={false} />);
  expect(screen.queryByTestId("agent-node-avatar")).toBeNull();
  rerender(<AgentNode node={{ id: "k", type: "agent", config: {} }} isDark={false} presentation={{ icon: "kimi", color: "#d9622b" }} />);
  expect(screen.getByTestId("agent-node-avatar").getAttribute("data-agent-icon")).toBe("kimi");
});
