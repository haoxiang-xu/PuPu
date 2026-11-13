/* eslint-disable testing-library/no-node-access, testing-library/no-container -- The header's title and caption lines are the surface. */
import React from "react";
import { render } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../../CONTAINERs/config/context";
import { node_caption, node_type_label } from "./node_caption";
import AgentNode from "./agent_node";
import StartNode from "./start_node";
import EndNode from "./end_node";
import ToolPoolNode from "./tool_pool_node";
import SubagentPoolNode from "./subagent_pool_node";
import BranchNode from "./branch_node";
import ToolCallNode from "./tool_call_node";
import SkillReadNode from "./skill_read_node";
import CodeNode from "./code_node";
import WorkflowCallNode from "./workflow_call_node";
import HooksPoolNode from "./hooks_pool_node";

jest.mock("../../../../../BUILTIN_COMPONENTs/icon/icon", () => function MockIcon() { return null; });

const wrap = (children, locale = "en") => (
  <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <LocaleContext.Provider value={{ locale }}>{children}</LocaleContext.Provider>
  </ConfigContext.Provider>
);
const lines = (ui, locale) => {
  const { container, unmount } = render(wrap(ui, locale));
  const title = container.querySelector("[data-node-title]");
  const out = [title.textContent, title.nextSibling.textContent];
  unmount();
  return out;
};

test("the caption is the type, then the summary; nothing is said twice", () => {
  expect(node_caption({ type: "agent", title: "Agent", summary: "gpt-4.1" })).toBe("gpt-4.1");
  expect(node_caption({ type: "agent", title: "Reviewer", summary: "gpt-4.1" })).toBe("Agent · gpt-4.1");
  expect(node_caption({ type: "agent", title: "Agent", summary: "" })).toBe("");
  expect(node_caption({ type: "agent", title: "Reviewer", summary: "" })).toBe("Agent");
  expect(node_caption({ type: "tool_call", title: "read_file", summary: "read_file" })).toBe("Tool call");
  expect(node_caption({ type: "workflow_call", title: "Mine", summary: ["Flow", "revision 2"] })).toBe("Workflow call · Flow · revision 2");
  expect(node_caption({ type: "__proto__", title: "x", summary: "y" })).toBe("y");
  expect(node_type_label("constructor")).toBe("");
});

const config = (extra = {}) => ({ config: { ...extra } });
const named = (node, label = "My step") => ({ ...node, label });

/* [type, node, unnamed lines, renamed caption] */
const CASES = [
  ["start", <StartNode node={{ id: "start", type: "start", ...config() }} />, ["Start", "entry"], "Start · entry",
    (label) => <StartNode node={named({ id: "start", type: "start", ...config() }, label)} />],
  ["end", <EndNode node={{ id: "end", type: "end", ...config() }} />, ["End", "exit"], "End · exit",
    (label) => <EndNode node={named({ id: "end", type: "end", ...config() }, label)} />],
  ["agent", <AgentNode node={{ id: "agent", type: "agent", ...config() }} />, ["Agent", ""], "Agent",
    (label) => <AgentNode node={named({ id: "agent", type: "agent", ...config() }, label)} />],
  ["toolkit_pool", <ToolPoolNode native toolkits={[{}]} node={{ id: "tp", type: "toolkit_pool", ...config() }} />, ["Toolkit Pool", "1 toolkit"], "Toolkit Pool · 1 toolkit",
    (label) => <ToolPoolNode native toolkits={[{}]} node={named({ id: "tp", type: "toolkit_pool", ...config() }, label)} />],
  ["subagent_pool", <SubagentPoolNode rows={[]} node={{ id: "sp", type: "subagent_pool", ...config() }} />, ["Subagent Pool", "0 subagents"], "Subagent Pool · 0 subagents",
    (label) => <SubagentPoolNode rows={[]} node={named({ id: "sp", type: "subagent_pool", ...config() }, label)} />],
  ["if_else", <BranchNode rows={[]} summary="On text" node={{ id: "b", type: "if_else", ...config() }} />, ["If / Else", "On text"], "If / Else · On text",
    (label) => <BranchNode rows={[]} summary="On text" node={named({ id: "b", type: "if_else", ...config() }, label)} />],
  ["switch_case", <BranchNode rows={[]} summary="" node={{ id: "s", type: "switch_case", ...config() }} />, ["Switch / Case", ""], "Switch / Case",
    (label) => <BranchNode rows={[]} summary="" node={named({ id: "s", type: "switch_case", ...config() }, label)} />],
  ["tool_call", <ToolCallNode node={{ id: "tc", type: "tool_call", ...config({ tool: { name: "read_file" } }) }} />, ["read_file", "Tool call"], "Tool call · read_file",
    (label) => <ToolCallNode node={named({ id: "tc", type: "tool_call", ...config({ tool: { name: "read_file" } }) }, label)} />],
  ["tool_call (no tool)", <ToolCallNode node={{ id: "tc", type: "tool_call", ...config() }} />, ["Tool call", "pick a tool"], "Tool call · pick a tool",
    (label) => <ToolCallNode node={named({ id: "tc", type: "tool_call", ...config() }, label)} />],
  ["skill_read (no skill)", <SkillReadNode node={{ id: "sr", type: "skill_read", ...config() }} />, ["Skill read", "pick a skill"], "Skill read · pick a skill",
    (label) => <SkillReadNode node={named({ id: "sr", type: "skill_read", ...config() }, label)} />],
  ["code", <CodeNode node={{ id: "code_1", type: "code", ...config() }} />, ["code_1", "Code · Python"], "Code · Python",
    (label) => <CodeNode node={named({ id: "code_1", type: "code", ...config() }, label)} />],
  ["workflow_call (unpinned)", <WorkflowCallNode node={{ id: "wf", type: "workflow_call", ...config() }} />, ["Workflow call", "pin a revision"], "Workflow call · pin a revision",
    (label) => <WorkflowCallNode node={named({ id: "wf", type: "workflow_call", ...config() }, label)} />],
  ["hooks_pool", <HooksPoolNode node={{ id: "hp", type: "hooks_pool", ...config({ hooks: [] }) }} />, ["Hooks Pool", "No hooks yet"], "Hooks Pool · No hooks yet",
    (label) => <HooksPoolNode node={named({ id: "hp", type: "hooks_pool", ...config({ hooks: [] }) }, label)} />],
];

test.each(CASES)("%s: unnamed keeps today's title; renamed, the line below names the type", (_type, unnamed, before, after, renamed) => {
  expect(lines(unnamed)).toEqual(before);
  expect(lines(renamed("My step"))).toEqual(["My step", after]);
});

test("the caption is translated and joined by the locale's own catalog", () => {
  expect(lines(<StartNode node={named({ id: "start", type: "start", config: {} }, "问题")} />, "zh-CN")).toEqual(["问题", "开始 · 入口"]);
  expect(lines(<CodeNode node={named({ id: "c", type: "code", config: {} }, "Parse")} />, "ja")).toEqual(["Parse", "コード · Python"]);
});
