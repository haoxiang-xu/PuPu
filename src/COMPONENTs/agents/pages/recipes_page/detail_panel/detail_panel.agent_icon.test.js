import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import DetailPanel from "./detail_panel";
import AgentNode from "../nodes/agent_node";
import { kernel_profiles, list_resources } from "../skeleton_resources";

/* An Agent node is a node: its header and its canvas tile wear the fixed
   Agent node identity, whatever icon (or legacy colour) the Agent resource's
   document stores. The resource's icon is changed only from the Explorer. */

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

/* The header's 26px tile: the fixed node identity. */
const header_tile = () => {
  // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
  const tiles = Array.from(document.body.querySelectorAll("div")).filter((el) => el.style.width === "26px" && el.style.height === "26px");
  expect(tiles).toHaveLength(1);
  return tiles[0];
};

test.each([
  ["an icon-only presentation", { icon: "robot_dome" }],
  ["a legacy icon and colour", { icon: "robot_dome", color: "#1d8798" }],
  ["no presentation", undefined],
])("the Agent node's header wears the fixed Agent node identity with %s, and offers no picker", (_label, presentation) => {
  const onDocumentChange = show(agent_document(presentation ? { presentation } : {}));
  // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
  expect(document.body.querySelector("[data-agent-icon]")).toBeNull();
  expect(screen.queryByTestId("recipe-detail-panel-agent-icon")).toBeNull();
  expect(screen.queryByRole("button", { name: "Change icon" })).toBeNull();
  expect(header_tile().style.background).not.toBe("rgb(29, 135, 152)");
  expect(onDocumentChange).not.toHaveBeenCalled();
});

test("the header tile is the same with and without a stored presentation", () => {
  show(agent_document());
  const plain = header_tile().outerHTML;
  document.body.innerHTML = "";
  show(agent_document({ presentation: { icon: "kimi", color: "#d9622b" } }));
  expect(header_tile().outerHTML).toBe(plain);
});

test("the canvas Agent node draws the fixed bot on the Agent blue, and takes no presentation", () => {
  const node = { id: "k", type: "agent", config: {} };
  const { container, rerender } = render(<AgentNode node={node} isDark={false} />);
  const plain = container.innerHTML;
  // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
  expect(container.querySelector("[data-agent-icon]")).toBeNull();
  // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
  const tile = container.querySelector("[data-node-header] > div");
  expect(tile.style.background).toBe("rgb(74, 91, 216)");
  rerender(<AgentNode node={node} isDark={false} presentation={{ icon: "kimi", color: "#d9622b" }} />);
  expect(container.innerHTML).toBe(plain);
  expect(screen.queryByTestId("agent-node-avatar")).toBeNull();
});
