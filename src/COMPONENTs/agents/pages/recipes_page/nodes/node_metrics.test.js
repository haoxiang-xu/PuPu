/* eslint-disable testing-library/no-node-access, testing-library/no-container -- the measured header and puzzle body are read off the drawn DOM. */
import React from "react";
import { render } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import StartNode from "./start_node";
import EndNode from "./end_node";
import AgentNode from "./agent_node";
import ToolPoolNode from "./tool_pool_node";
import SubagentPoolNode from "./subagent_pool_node";
import HooksPoolNode from "./hooks_pool_node";
import ToolCallNode from "./tool_call_node";
import SkillReadNode from "./skill_read_node";
import WorkflowCallNode from "./workflow_call_node";
import CodeNode from "./code_node";
import BranchNode from "./branch_node";
import {
  BRANCH_ROW_HEIGHT,
  NODE_HEADER_HEIGHT,
  NODE_MIN_HEIGHT,
  NODE_PADDING_X,
  NODE_PADDING_Y,
  NODE_PORT_ANCHOR,
  branch_layout,
} from "./node_metrics";
import { native_step_ports } from "../skeleton_node_catalog";
import { branch_ports } from "../skeleton_branch_config";
import { ports_for_type } from "../recipe_node_catalog";

/* One minimum height, one header and one port line for every node type on
 * the canvas, taken from Start and Agent. jsdom has no layout, so the drawn
 * styles are read — the same numbers the browser lays out. */

const execution = { inputs: [], outputs: [] };
const CASES = {
  start: <StartNode node={{ id: "start", type: "start" }} isDark={false} />,
  end: <EndNode node={{ id: "end", type: "end" }} isDark={false} />,
  agent: <AgentNode node={{ id: "agent", type: "agent", config: {} }} isDark={false} />,
  toolkit_pool: <ToolPoolNode node={{ id: "tp", type: "toolkit_pool", config: {} }} native toolkits={[]} isDark={false} />,
  subagent_pool: <SubagentPoolNode node={{ id: "sp", type: "subagent_pool", config: {} }} rows={[]} isDark={false} />,
  hooks_pool: <HooksPoolNode node={{ id: "hp", type: "hooks_pool", config: { hooks: [] } }} isDark={false} />,
  tool_call: <ToolCallNode node={{ id: "tc", type: "tool_call", config: { execution } }} isDark={false} />,
  skill_read: <SkillReadNode node={{ id: "sr", type: "skill_read", config: { execution } }} isDark={false} />,
  workflow_call: <WorkflowCallNode node={{ id: "wc", type: "workflow_call", config: { execution } }} isDark={false} />,
  code: <CodeNode node={{ id: "cd", type: "code", config: { execution } }} isDark={false} />,
  if_else: <BranchNode node={{ id: "if", type: "if_else", config: {} }} rows={[{ port_id: "true", label: "True", declared: true }, { port_id: "false", label: "False", declared: true }]} isDark={false} />,
  switch_case: <BranchNode node={{ id: "sw", type: "switch_case", config: {} }} rows={[{ port_id: "default", label: "Default", declared: true }]} isDark={false} />,
};

const draw = (element) => render(
  <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>{element}</ConfigContext.Provider>,
).container;

test("the reference numbers: Start's header, centred in the minimum height", () => {
  expect(NODE_HEADER_HEIGHT).toBe(35);
  expect(NODE_MIN_HEIGHT).toBe(63);
  expect(NODE_PORT_ANCHOR).toBe(NODE_MIN_HEIGHT / 2);
});

describe.each(Object.keys(CASES))("%s", (type) => {
  test("draws the shared header at the shared place, in a body at least the shared minimum tall", () => {
    const container = draw(CASES[type]);
    const headers = container.querySelectorAll("[data-node-header]");
    expect(headers).toHaveLength(1);
    const header = headers[0];
    expect(header.style.height).toBe(`${NODE_HEADER_HEIGHT}px`);
    const body = header.parentElement;
    expect(body.style.paddingTop).toBe(`${NODE_PADDING_Y}px`);
    expect(body.style.paddingLeft).toBe(`${NODE_PADDING_X}px`);
    /* A branch is drawn at its layout's height; every other node's body is
       at least the minimum and grows with its rows. */
    const branch = container.querySelector("[data-branch-body]");
    const floor = branch ? branch.style.height : body.style.minHeight;
    expect(floor).toBe(`${NODE_MIN_HEIGHT}px`);
  });

  test("its side notch and bump sit on the shared port line", () => {
    const container = draw(CASES[type]);
    const side_y = container.querySelector("[data-puzzle-body]").getAttribute("data-side-y");
    /* Pools have only top and bottom attach ports; their side line is unused. */
    const pool = ["toolkit_pool", "subagent_pool", "hooks_pool"].includes(type);
    expect(side_y).toBe(pool ? "50%" : `${NODE_PORT_ANCHOR}px`);
  });
});

test("every node's in port is level with Start's and Agent's", () => {
  /* Start, End and Agent never grow, so their middle is the port line. */
  ["start", "end", "agent"].forEach((type) => {
    expect(ports_for_type(type).every((port) => port.anchor === undefined)).toBe(true);
  });
  ["tool_call", "skill_read", "code", "workflow_call"].forEach((type) => {
    expect(native_step_ports(type).map((port) => port.anchor)).toEqual([NODE_PORT_ANCHOR, NODE_PORT_ANCHOR]);
  });
  ["if_else", "switch_case"].forEach((type) => {
    const node = { id: "b", type, config: { execution: { inputs: [], cases: [{ id: "case-1", value: "a" }, { id: "case-2", value: "b" }] } } };
    const { ports } = branch_ports({ nodes: [node], edges: [] }, node);
    expect(ports.find((port) => port.id === "in").anchor).toBe(NODE_PORT_ANCHOR);
  });
});

describe("branch rows", () => {
  test("a Switch with no case or one case is exactly as tall as Start, and so is If / Else", () => {
    [0, 1, 2].forEach((count) => expect(branch_layout(count).height).toBe(NODE_MIN_HEIGHT));
    const rows = (n) => Array.from({ length: n }, (_, i) => ({ port_id: `p${i}`, label: `p${i}`, declared: true }));
    [0, 1, 2].forEach((n) => {
      const container = draw(<BranchNode node={{ id: "sw", type: "switch_case", config: {} }} rows={rows(n)} isDark={false} />);
      expect(container.querySelector("[data-testid=branch-node-sw] [data-branch-body]").style.height).toBe(`${NODE_MIN_HEIGHT}px`);
    });
  });

  test("the node draws one right-side bump per outlet, each on its outlet's line, and the inlet notch", () => {
    const rows = (n) => Array.from({ length: n }, (_, i) => ({ port_id: `p${i}`, label: `p${i}`, declared: true }));
    [1, 2, 4].forEach((n) => {
      const container = draw(<BranchNode node={{ id: "sw", type: "switch_case", config: {} }} rows={rows(n)} isDark={false} />);
      const tabs = Array.from(container.querySelectorAll("[data-puzzle-tab]"));
      expect(tabs.map((tab) => tab.getAttribute("data-tab-side"))).toEqual(Array(n).fill("right"));
      expect(tabs.map((tab) => tab.getAttribute("data-tab-y"))).toEqual(branch_layout(n).anchors.map((y) => `${y}px`));
      expect(container.querySelector("[data-puzzle-body]").style.maskImage).toContain(`0%   ${NODE_PORT_ANCHOR}px`);
    });
  });

  test("single-side tab callers are unchanged: Start's bump sits on the shared port line", () => {
    const container = draw(<StartNode node={{ id: "start", type: "start", config: {} }} isDark={false} />);
    const tabs = Array.from(container.querySelectorAll("[data-puzzle-tab]"));
    expect(tabs).toHaveLength(1);
    expect(tabs[0].getAttribute("data-tab-side")).toBe("right");
  });

  test("one outlet runs straight through on the inlet's line; two sit evenly above and below it", () => {
    expect(branch_layout(1).anchors).toEqual([NODE_PORT_ANCHOR]);
    expect(branch_layout(2).anchors).toEqual([NODE_PORT_ANCHOR - BRANCH_ROW_HEIGHT / 2, NODE_PORT_ANCHOR + BRANCH_ROW_HEIGHT / 2]);
  });

  test("more outlets start at the top inset and the node grows a row each", () => {
    const three = branch_layout(3);
    const four = branch_layout(4);
    expect(four.height - three.height).toBe(BRANCH_ROW_HEIGHT);
    expect(three.anchors[0]).toBe(three.top + BRANCH_ROW_HEIGHT / 2);
    expect(three.top + 3 * BRANCH_ROW_HEIGHT).toBeLessThanOrEqual(three.height);
  });

  test("each outlet port is anchored on the row the node draws for it", () => {
    const node = { id: "sw", type: "switch_case", config: { execution: { inputs: [], cases: [{ id: "c1", value: 1 }, { id: "c2", value: 2 }, { id: "c3", value: 3 }] } } };
    const { ports, rows } = branch_ports({ nodes: [node], edges: [] }, node);
    const container = draw(<BranchNode node={node} rows={rows} isDark={false} />);
    const column = container.querySelector("[data-testid=branch-row-sw-0]").parentElement;
    const top = parseFloat(column.style.paddingTop);
    ports.filter((port) => port.side === "right").forEach((port, index) => {
      expect(port.anchor).toBe(top + BRANCH_ROW_HEIGHT / 2 + index * BRANCH_ROW_HEIGHT);
    });
  });
});
