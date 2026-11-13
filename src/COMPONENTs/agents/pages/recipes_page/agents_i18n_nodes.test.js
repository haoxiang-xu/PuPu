import React from "react";
import { fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { buildRecipeCanvasContextMenuItems } from "./recipe_canvas_context_menu_items";
import StartNode from "./nodes/start_node";
import ToolCallNode from "./nodes/tool_call_node";
import CodeNode from "./nodes/code_node";
import HooksPoolNode from "./nodes/hooks_pool_node";
import RecipeNodePalette from "./recipe_node_palette";
import { branch_ports, branch_summary, case_display } from "./skeleton_branch_config";
import { source_label } from "./skill_read_config";

jest.mock("../../../../BUILTIN_COMPONENTs/modal/modal", () => function MockModal({ children, ariaLabel }) {
  return <div role="dialog" aria-label={ariaLabel}>{children}</div>;
});
jest.mock("../../../../BUILTIN_COMPONENTs/icon/icon", () => function MockIcon() { return null; });

const config = { theme: {}, onThemeMode: "light_mode" };
const localized = (locale, children) => <ConfigContext.Provider value={config}>
  <LocaleContext.Provider value={{ locale }}>{children}</LocaleContext.Provider>
</ConfigContext.Provider>;

test("canvas actions translate their captions while keeping commands, shortcuts, guards and callback identities", () => {
  const t = renderHook(() => useTranslation(), { wrapper: ({ children }) => localized("zh-CN", children) }).result.current.t;
  const onPaste = jest.fn();
  const items = buildRecipeCanvasContextMenuItems({ onPaste, canPaste: false, isMac: true }, t);
  const paste = items.find((item) => item.id === "paste");
  expect(paste).toMatchObject({ label: "粘贴", disabled: true, trail_icon: "command", trail: "V", onClick: onPaste });
  expect(onPaste).not.toHaveBeenCalled();
  expect(buildRecipeCanvasContextMenuItems({}).find((item) => item.id === "paste").label).toBe("Paste");
});

test("tool captions translate without interpreting an authored label, parameter name or literal that resembles a key", () => {
  const raw = "agents.nodes.tool_call {count} · é";
  const node = Object.freeze({ id: "raw-id", type: "tool_call", label: raw, config: {
    tool: { name: "read" }, execution: { inputs: [
      { name: raw, value: { kind: "literal", value: raw } },
      { name: "fallback", value: { kind: "first_present", values: [{}, {}] } },
    ] },
  } });
  const before = JSON.stringify(node);
  render(localized("zh-CN", <ToolCallNode node={node} isDark={false} />));
  const card = screen.getByTestId("tool-call-node-raw-id");
  expect(card).toHaveTextContent("工具调用");
  expect(card).toHaveTextContent("依次取 2 个来源中的首个可用值");
  expect(within(card).getAllByText(raw)).toHaveLength(3);
  expect(JSON.stringify(node)).toBe(before);
});

test("a Code card keeps its id exact, names the language, and never draws its source", () => {
  const path = "src/agents.nodes.code.python {path} é.py";
  const node = { id: "agents.rename.title", type: "code", config: { code: { source: { kind: "file", path } } } };
  const before = JSON.stringify(node);
  render(localized("zh-CN", <CodeNode node={node} isDark={false} />));
  const card = screen.getByTestId(`code-node-${node.id}`);
  expect(card).toHaveTextContent("Python");
  expect(card).not.toHaveTextContent(path);
  expect(card).toHaveTextContent(node.id);
  expect(JSON.stringify(node)).toBe(before);
});

test("the hook empty-state caption translates without changing its stored list or authored name", () => {
  const node = { id: "hooks-raw", label: "No hooks yet", type: "hooks_pool", config: { hooks: [] } };
  const before = JSON.stringify(node);
  render(localized("zh-CN", <HooksPoolNode node={node} isDark={false} />));
  const card = screen.getByTestId("hooks-pool-node-hooks-raw");
  expect(card).toHaveTextContent("尚无 hook");
  expect(within(card).getByText(node.label)).toBeInTheDocument();
  expect(JSON.stringify(node)).toBe(before);
});

test("an in-place rename survives a locale change without committing or closing", () => {
  const rename = { enabled: true, editing: true, problem: null, begin: jest.fn(), commit: jest.fn(), cancel: jest.fn() };
  const node = { id: "start", type: "start", label: "agents.nodes.start {name}", config: {} };
  const tree = (locale) => localized(locale, <StartNode node={node} isDark={false} rename={rename} />);
  const view = render(tree("en"));
  const input = screen.getByRole("textbox");
  expect(input).toHaveValue(node.label);
  fireEvent.change(input, { target: { value: "   " } });
  view.rerender(tree("zh-CN"));
  expect(screen.getByRole("textbox")).toBe(input);
  expect(input).toHaveFocus();
  expect(input).toHaveValue("   ");
  expect(rename.commit).not.toHaveBeenCalled();
  expect(rename.cancel).not.toHaveBeenCalled();
});

test("a supplied rename refusal is shown raw under the field, including strings that look like a catalog key", () => {
  const raw = "agents.graph.rename_label_blank {name} · BACKEND_REFUSAL";
  const rename = { enabled: true, editing: true, problem: raw, begin: jest.fn(), commit: jest.fn().mockReturnValue({ ok: false }), cancel: jest.fn() };
  render(localized("zh-CN", <StartNode node={{ id: "start", type: "start", label: "Authored name", config: {} }} isDark={false} rename={rename} />));
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(screen.getByRole("alert")).toHaveTextContent(raw);
  expect(rename.commit).toHaveBeenCalledWith("Authored name", "Authored name", { refocus: true });
});

test("node search captions translate while a user's query and empty-result identity stay raw", () => {
  render(localized("zh-CN", <RecipeNodePalette visible mode="find" entries={[]} x={10} y={10} onClose={jest.fn()} />));
  const search = screen.getByRole("textbox");
  expect(search).toHaveAccessibleName("查找节点");
  const query = "agents.palette.search {query}";
  fireEvent.change(search, { target: { value: query } });
  expect(search).toHaveValue(query);
  expect(screen.getByText((text) => text.includes(query) && !text.includes("No node matches"))).toBeInTheDocument();
});

test("branch captions localize without changing ports, cases, raw values or their default-English projection", () => {
  const node = { id: "raw-branch", type: "if_else", config: { execution: { inputs: [], condition: { kind: "compare", operator: "eq",
    left: { kind: "literal", value: 1 }, right: { kind: "literal", value: 1 } } } } };
  const document = { nodes: [node], edges: [] };
  const before = JSON.stringify(document);
  const t = (key, vars) => `T:${key}:${vars ? JSON.stringify(vars) : ""}`;
  const english = branch_ports(document, node);
  const translated = branch_ports(document, node, t);
  expect(translated.ports).toEqual(english.ports);
  expect(translated.rows.map(({ port_id, declared }) => ({ port_id, declared })))
    .toEqual(english.rows.map(({ port_id, declared }) => ({ port_id, declared })));
  expect(translated.rows.every((row) => row.label.startsWith("T:agents.branch."))).toBe(true);
  expect(branch_summary(node)).toBe("1 comparison");
  expect(branch_summary(node, t)).toBe('T:agents.branch.comparison_one:{"count":1}');
  expect(case_display({ value: "agents.branch.case_empty_text {value}" }, t)).toBe("“agents.branch.case_empty_text {value}”");
  expect(case_display({ value: "" }, t)).toBe("T:agents.branch.case_empty_text:");
  expect(case_display({ value: null }, t)).toBe("null");
  expect(JSON.stringify(document)).toBe(before);
});

test("known skill-source captions translate but unknown identifiers and malformed data never become lookup keys", () => {
  const t = (key, vars) => `T:${key}:${vars?.path || ""}`;
  expect(source_label("user-unchain", t)).toBe("T:agents.skill.your_skills:~/.unchain");
  expect(source_label("user-agents", t)).toBe("T:agents.skill.your_skills:~/.agents");
  expect(source_label("skillpack", t)).toBe("T:agents.skill.skill_pack:");
  expect(source_label("agents.nodes.unreadable_source {value}", t)).toBe("agents.nodes.unreadable_source {value}");
  expect(source_label({ toString: null }, t)).toBe("T:agents.nodes.unreadable_source:");
  expect(source_label("user-unchain")).toBe("your skills (~/.unchain)");
});
