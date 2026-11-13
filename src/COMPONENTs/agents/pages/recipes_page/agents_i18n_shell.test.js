import React from "react";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { buildAgentExplorerMenuItems } from "./agent_explorer_menu_items";
import { conflict_message, preflight_message, SESSION_STATUS } from "./skeleton_resource_session";
import SkeletonSaveBar from "./skeleton_save_bar";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const chineseTranslator = () => renderHook(() => useTranslation(), {
  wrapper: ({ children }) => <LocaleContext.Provider value={{ locale: "zh-CN" }}>{children}</LocaleContext.Provider>,
}).result.current.t;

test("translated resource menus allow Delete for Default and keep exact callback identities", () => {
  const node = Object.freeze({ kind: "resource", id: "resource-原样", name: "agents.save.saved",
    active: true, is_default: true });
  const options = { node, activeDirty: true, onDuplicate: jest.fn(), onStartRename: jest.fn(), onDeleteResource: jest.fn() };
  const before = JSON.stringify(node);
  const items = buildAgentExplorerMenuItems(options, chineseTranslator());
  expect(items.map((x) => x.label).filter(Boolean)).toEqual(["重命名", "复制", "删除"]);
  expect(items[0]).toMatchObject({ disabled: true, trail: "请先保存" });
  expect(items[3]).toMatchObject({ danger: true });
  expect(items[3].disabled).not.toBe(true);
  items[3].onClick();
  expect(options.onDeleteResource).toHaveBeenCalledWith(node);
  expect(options.onDuplicate).not.toHaveBeenCalled();
  items[1].onClick();
  expect(options.onDuplicate).toHaveBeenCalledTimes(1);
  expect(options.onDuplicate).toHaveBeenCalledWith(node);
  expect(JSON.stringify(node)).toBe(before);
});

test("localized folder actions pass the unchanged folder id and keep action structure", () => {
  const node = Object.freeze({ kind: "folder", folder_id: "folder/{raw}/中文", name: "New Agent" });
  const options = { node, onNewAgent: jest.fn(), onNewWorkflow: jest.fn(), onNewFolder: jest.fn(),
    onStartRename: jest.fn(), onDeleteFolder: jest.fn() };
  const items = buildAgentExplorerMenuItems(options, chineseTranslator());
  expect(items[0].label).toBe("新建智能体");
  items[0].onClick();
  expect(options.onNewAgent).toHaveBeenCalledWith("folder/{raw}/中文");
  expect(items[3]).toEqual({ type: "separator" });
  expect(items[6]).toMatchObject({ label: "删除文件夹", danger: true });
  expect(node.name).toBe("New Agent");
});

test("localized conflict explanations do not settle or rewrite a conflict", () => {
  const session = { conflict: { stale_choice: false, token: "edit-{raw}" },
    document: { id: "agents.save.saved", name: "Author's own English name" } };
  const before = JSON.stringify(session);
  const text = conflict_message(session, chineseTranslator());
  expect(text).toMatch(/未覆盖/);
  expect(text).not.toMatch(/This was saved somewhere else/);
  expect(JSON.stringify(session)).toBe(before);
  expect(conflict_message({ ...session, conflict: null }, chineseTranslator())).toBeNull();
  expect(conflict_message(session)).toMatch(/^This was saved somewhere else/);
});

test("a translated preflight caption retains the complete raw backend message and state", () => {
  const raw = "RAW_TYPE_MISMATCH {value} · é · document.nodes[0]";
  const session = { preflight: { ok: false, error: { code: "raw_code", path: ["nodes", 0], message: raw } } };
  const before = JSON.stringify(session);
  const t = chineseTranslator();
  expect(preflight_message(session, t)).toBe(`暂时无法运行 — ${raw}`);
  expect(JSON.stringify(session)).toBe(before);
  expect(preflight_message({ preflight: { ok: true } }, t)).toBe("可以运行。");
  expect(preflight_message({ preflight: { ok: true } })).toBe("Ready to run.");
});

test("localized save controls keep the same unsaved session and only call save after an explicit click", () => {
  const session = { status: SESSION_STATUS.READY, dirty: true, saving: false, conflict: null,
    edit_token: "edit-original", document: { id: "agent-original", name: "Saved somewhere else" } };
  const before = JSON.stringify(session);
  const onSave = jest.fn();
  const show = (locale) => <ConfigContext.Provider value={cfg}><LocaleContext.Provider value={{ locale }}>
    <SkeletonSaveBar session={session} onSave={onSave} onPreflight={jest.fn()}
      onKeepMine={jest.fn()} onTakeTheirs={jest.fn()} />
  </LocaleContext.Provider></ConfigContext.Provider>;
  const { rerender } = render(show("zh-CN"));
  expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent("有未保存的更改");
  expect(onSave).not.toHaveBeenCalled();
  rerender(show("en"));
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  expect(JSON.stringify(session)).toBe(before);
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(session)).toBe(before);
});
