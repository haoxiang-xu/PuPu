import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import SkeletonCanvas from "./skeleton_canvas";
import RecipeCanvas from "./recipe_canvas";
import { new_agent_document } from "./skeleton_graph_edits";
import { migrate_recipe } from "./recipe_migration";
import { CanvasControlCenter, CanvasMessageStrip, EscapeBackHint } from "./canvas_chrome";
import { agentMessage } from "./agents_i18n";

jest.mock("../../../../BUILTIN_COMPONENTs/context_menu/context_menu", () => function MockMenu({ visible, items }) {
  return visible ? <div data-testid="locale-canvas-menu">{items.filter((item) => item.label).map((item) =>
    <button key={item.id} disabled={item.disabled} onClick={item.onClick}>{item.label}</button>)}</div> : null;
});

const localized = (locale, children) => <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
  <LocaleContext.Provider value={{ locale }}>{children}</LocaleContext.Provider>
</ConfigContext.Provider>;

test("the real native palette changes captions and searchable language without remounting its query or writing a graph", () => {
  const graph = new_agent_document({ id: "raw-graph", name: "agents.palette.search {name}" }).document;
  const before = JSON.stringify(graph);
  const onGraphCommand = jest.fn().mockReturnValue({ ok: true, document: graph });
  const tree = (locale) => localized(locale, <SkeletonCanvas resourceId={graph.id} document={graph}
    onGraphCommand={onGraphCommand} onSelectNode={jest.fn()} />);
  const view = render(tree("en"));
  fireEvent.doubleClick(screen.getByTestId("skeleton-canvas"));
  const input = screen.getByRole("textbox", { name: "Search nodes" });
  fireEvent.change(input, { target: { value: "raw query {name}" } });
  input.focus();
  view.rerender(tree("zh-CN"));
  expect(screen.getByRole("textbox", { name: "搜索节点" })).toBe(input);
  expect(input).toHaveFocus();
  expect(input).toHaveValue("raw query {name}");
  expect(onGraphCommand).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "工具调用" } });
  const tool = screen.getByTestId("palette-entry-tool_call");
  expect(tool).toHaveTextContent("工具调用");
  expect(tool).toHaveTextContent("不调用模型");
  expect(JSON.stringify(graph)).toBe(before);
  fireEvent.click(tool);
  expect(onGraphCommand).toHaveBeenCalledTimes(1);
  expect(onGraphCommand.mock.calls[0][0]).toMatchObject({ type: "add_node", node_type: "tool_call" });
  expect(JSON.stringify(graph)).toBe(before);
});

test("native canvas menu repaints in place without issuing its semantic commands", () => {
  const graph = new_agent_document({ id: "native-menu", name: "Raw name" }).document;
  const onGraphCommand = jest.fn();
  const tree = (locale) => localized(locale, <SkeletonCanvas resourceId={graph.id} document={graph}
    onGraphCommand={onGraphCommand} />);
  const view = render(tree("en"));
  fireEvent.contextMenu(screen.getByTestId("flow-editor-viewport"), { clientX: 40, clientY: 50 });
  expect(within(screen.getByTestId("locale-canvas-menu")).getByRole("button", { name: "Find node…" })).toBeInTheDocument();
  view.rerender(tree("zh-CN"));
  expect(within(screen.getByTestId("locale-canvas-menu")).getByRole("button", { name: "查找节点…" })).toBeInTheDocument();
  expect(onGraphCommand).not.toHaveBeenCalled();
});

test("legacy canvas forwards the current translator to its owned menu while preserving its document", () => {
  const recipe = migrate_recipe({ name: "Raw legacy name", agent: { prompt: "agents.canvas.menu.paste" } });
  const onRecipeChange = jest.fn();
  const before = JSON.stringify(recipe);
  const tree = (locale) => localized(locale, <RecipeCanvas recipe={recipe} recipes={[]} onRecipeChange={onRecipeChange} />);
  const view = render(tree("en"));
  fireEvent.contextMenu(screen.getByTestId("flow-editor-viewport"), { clientX: 40, clientY: 50 });
  expect(within(screen.getByTestId("locale-canvas-menu")).getByRole("button", { name: "Paste" })).toBeInTheDocument();
  view.rerender(tree("zh-CN"));
  expect(within(screen.getByTestId("locale-canvas-menu")).getByRole("button", { name: "粘贴" })).toBeInTheDocument();
  expect(onRecipeChange).not.toHaveBeenCalled();
  expect(JSON.stringify(recipe)).toBe(before);
});

test("a persistent owned notice repaints inside the real message strip while unbranded backend text stays exact", () => {
  const raw = "agents.explorer.rename_failed {name} · BACKEND_MESSAGE";
  const notice = agentMessage("agents.explorer.rename_failed", { name: raw, message: raw });
  const items = [notice, { text: raw, testId: "raw-diagnostic" }];
  const tree = (locale) => localized(locale, <CanvasMessageStrip items={items} testId="strip" />);
  const view = render(tree("en"));
  expect(screen.getByTestId("strip")).toHaveTextContent(`Could not rename “${raw}”: ${raw}`);
  view.rerender(tree("zh-CN"));
  expect(screen.getByTestId("strip")).toHaveTextContent(`无法重命名“${raw}”：${raw}`);
  expect(screen.getByTestId("raw-diagnostic")).toHaveTextContent(raw);
});

test("shared canvas controls localize their default label but preserve an explicit caller label and click policy", () => {
  const onSave = jest.fn();
  const tree = (locale, saveLabel) => localized(locale, <CanvasControlCenter onSave={onSave} saveLabel={saveLabel} saveDisabled={false} />);
  const view = render(tree("en"));
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  view.rerender(tree("zh-CN"));
  const save = screen.getByRole("button", { name: "保存" });
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(save);
  expect(onSave).toHaveBeenCalledTimes(1);
  const raw = "agents.save.save {name}";
  view.rerender(tree("zh-CN", raw));
  expect(screen.getByRole("button", { name: raw })).toBeEnabled();
  expect(onSave).toHaveBeenCalledTimes(1);
});

test("the Esc hint keeps the key literal and puts it where the locale's sentence does", () => {
  const view = render(localized("zh-CN", <EscapeBackHint visible top={20} left={14} />));
  const hint = screen.getByTestId("canvas-escape-hint");
  expect(hint).toHaveTextContent("按Esc返回");
  expect(hint.firstChild).toHaveTextContent("按");
  expect(screen.getByTestId("canvas-escape-hint-key")).toHaveTextContent("Esc");
  view.rerender(localized("en", <EscapeBackHint visible top={20} left={14} />));
  expect(hint.firstChild).toBe(screen.getByTestId("canvas-escape-hint-key"));
  expect(hint).toHaveTextContent("Escto go back");
  /* A reminder only: it takes no pointer, so the drag region keeps it. */
  expect(hint.style.pointerEvents).toBe("none");
  view.rerender(localized("en", <EscapeBackHint visible={false} top={20} left={14} />));
  expect(hint).toHaveAttribute("aria-hidden", "true");
  expect(hint.style.opacity).toBe("0");
});
