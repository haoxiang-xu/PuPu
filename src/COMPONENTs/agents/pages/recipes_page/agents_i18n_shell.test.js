import React from "react";
import { renderHook } from "@testing-library/react";
import { LocaleContext } from "../../../../CONTAINERs/config/context";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { buildAgentExplorerMenuItems } from "./agent_explorer_menu_items";
import { conflict_message, preflight_message } from "./skeleton_resource_session";

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
