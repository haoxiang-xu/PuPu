import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import ToolCallSection from "./detail_panel/tool_call_section";
import CodeSection from "./detail_panel/code_section";
import BranchSection from "./detail_panel/branch_section";
import SkillReadSection from "./detail_panel/skill_read_section";
import { python_profiles } from "./skeleton_resources";
import { api } from "../../../../SERVICEs/api";
import { CODE_LIMITS, code_source_text, limit_from_text } from "./code_config";
import { case_problems } from "./skeleton_branch_config";
import { literal_from_text } from "./tool_call_config";

jest.mock("../../../../SERVICEs/toolkit_catalog_refresh", () => ({ subscribeToolkitCatalogRefresh: () => () => {} }));
jest.mock("./skeleton_resources", () => ({
  is_unavailable: (value) => Boolean(value) && value.ok === false && value.reason === "unavailable",
  python_profiles: jest.fn(), save_python_profile: jest.fn(), probe_python_profile: jest.fn(),
}));
jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
jest.mock("../../../../SERVICEs/plugin_skill_sync", () => ({ readSkillsIncludeUserDirsSetting: () => true }));
jest.mock("../../../../BUILTIN_COMPONENTs/select/select", () => function Select({ options, value, set_value, disabled, placeholder }) {
  return <select value={value == null ? "" : value} disabled={disabled} onChange={(event) => set_value(event.target.value)}>
    <option value="">{placeholder || ""}</option>{(options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>;
});
jest.mock("../../../../BUILTIN_COMPONENTs/input/input", () => function Input({ value, set_value, placeholder, disabled }) {
  return <input value={value} placeholder={placeholder} disabled={disabled} onChange={(event) => set_value(event.target.value)} />;
});
jest.mock("../../../../BUILTIN_COMPONENTs/input/textfield", () => function Textfield({ value, set_value, placeholder }) {
  return <textarea value={value} placeholder={placeholder} onChange={(event) => set_value(event.target.value)} />;
});
jest.mock("../../../../BUILTIN_COMPONENTs/input/button", () => function Button({ label, ariaLabel, onClick, disabled }) {
  return <button aria-label={ariaLabel} onClick={onClick} disabled={disabled}>{label || ariaLabel}</button>;
});
jest.mock("../../../../BUILTIN_COMPONENTs/input/switch", () => function Switch({ on, set_on }) {
  return <input type="checkbox" checked={Boolean(on)} onChange={(event) => set_on(event.target.checked)} />;
});

const localized = (locale, child) => <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
  <LocaleContext.Provider value={{ locale }}>{child}</LocaleContext.Provider>
</ConfigContext.Provider>;
const graph = (node) => ({ schema_version: 1, kind: "agent", id: "raw-doc", name: "raw name", nodes: [node], edges: [] });
const settle = () => act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); });
const marker = jest.fn((key, vars = {}) => `TRANSLATED:${key}:${JSON.stringify(vars)}`);

beforeEach(() => {
  jest.clearAllMocks();
  marker.mockImplementation((key, vars = {}) => `TRANSLATED:${key}:${JSON.stringify(vars)}`);
  python_profiles.mockResolvedValue({ ok: true, data: { profiles: [] } });
  api.unchain.getSkillInventory = jest.fn().mockResolvedValue({ schema: "pupu.skill_inventory.v1", skills: [] });
  api.unchain.previewSkeletonSkill = jest.fn();
  api.unchain.listToolModalCatalog = jest.fn().mockRejectedValue(new Error("opaque library error"));
});

test("Code locale changes preserve pending invalid limit text, focus, document and profile request identity", async () => {
  const node = { id: "raw-code", type: "code", config: { execution: { inputs: [], outputs: [] }, code: { environment_profile_id: "raw-python" } } };
  const document = graph(node);
  const before = JSON.stringify(document);
  const onChange = jest.fn();
  const tree = (locale) => localized(locale, <CodeSection document={document} node={node} revision={1} isDark={false} onChange={onChange} />);
  const view = render(tree("en"));
  await settle();
  const input = within(screen.getByTestId("code-limits")).getByPlaceholderText("seconds");
  input.focus();
  fireEvent.change(input, { target: { value: "-not-a-number {value}" } });
  const english = screen.getByTestId("code-timeout-raw-code-problem").textContent;
  const requests = python_profiles.mock.calls.slice();
  view.rerender(tree("zh-CN"));
  await settle();
  expect(input).toHaveFocus();
  expect(input).toHaveValue("-not-a-number {value}");
  expect(python_profiles.mock.calls).toEqual(requests);
  expect(onChange).not.toHaveBeenCalled();
  expect(JSON.stringify(document)).toBe(before);
  expect(screen.getByTestId("code-timeout-raw-code-problem").textContent).not.toBe(english);
});

test("Code whole rich explanation switches language while its code spans remain exact", async () => {
  const node = { id: "code", type: "code", config: { execution: { inputs: [], outputs: [] } } };
  const document = graph(node);
  const tree = (locale) => localized(locale, <CodeSection document={document} node={node} revision={1} isDark={false} onChange={jest.fn()} />);
  const view = render(tree("en"));
  await settle();
  const note = screen.getByTestId("code-source-note");
  const english = note.textContent;
  const tokens = within(note).getAllByText(/^(main\(input, context\)|input|context|print\(\))$/).map((element) => element.textContent);
  expect(tokens).toEqual(["main(input, context)", "input", "context", "print()"]);
  view.rerender(tree("zh-CN"));
  expect(note.textContent).not.toBe(english);
  expect(note).not.toHaveTextContent("Saving it does not run it.");
  expect(within(note).getAllByText(/^(main\(input, context\)|input|context|print\(\))$/).map((element) => element.textContent)).toEqual(tokens);
});

test("Branch missing-condition display rerenders without creating a condition or changing stored ids", () => {
  const node = { id: "branch-case-{raw}", type: "if_else", config: { execution: { inputs: [] } } };
  const document = graph(node);
  const before = JSON.stringify(document);
  const onChange = jest.fn();
  const tree = (locale) => localized(locale, <BranchSection document={document} node={node} isDark={false} onChange={onChange} />);
  const view = render(tree("en"));
  const english = screen.getByTestId("branch-condition-missing").textContent;
  view.rerender(tree("zh-CN"));
  expect(JSON.stringify(document)).toBe(before);
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByTestId("branch-condition-missing").textContent).not.toBe(english);
});

test("Skill list failure is a locale-responsive owned notice without repeating the request or exposing its opaque error", async () => {
  const raw = "agents.execution.skill {message} RAW_BACKEND";
  api.unchain.getSkillInventory.mockRejectedValue({ code: "raw-code", path: ["raw-path"], message: raw });
  const node = { id: "skill", type: "skill_read", config: { execution: { inputs: [], outputs: [] } } };
  const document = graph(node);
  const onChange = jest.fn();
  const tree = (locale) => localized(locale, <SkillReadSection document={document} node={node} isDark={false} onChange={onChange} />);
  const view = render(tree("en"));
  await settle();
  const english = view.container.textContent;
  const requests = api.unchain.getSkillInventory.mock.calls.slice();
  view.rerender(tree("zh-CN"));
  await settle();
  expect(api.unchain.getSkillInventory.mock.calls).toEqual(requests);
  expect(onChange).not.toHaveBeenCalled();
  expect(view.container).not.toHaveTextContent(raw);
  expect(view.container.textContent).not.toBe(english);
});

test("Code store refusal keeps raw backend message literal while owned wrapper rerenders", async () => {
  const raw = "agents.execution.code {value} RAW_BACKEND";
  python_profiles.mockResolvedValue({ ok: false, error: { code: "raw-code", path: ["raw-path"], message: raw } });
  const node = { id: "code", type: "code", config: { execution: { inputs: [], outputs: [] } } };
  const tree = (locale) => localized(locale, <CodeSection document={graph(node)} node={node} revision={1} isDark={false} onChange={jest.fn()} />);
  const view = render(tree("en"));
  await settle();
  const english = screen.getByTestId("code-runtime-error").textContent;
  view.rerender(tree("zh-CN"));
  expect(screen.getByTestId("code-runtime-error")).toHaveTextContent(raw);
  expect(screen.getByTestId("code-runtime-error").textContent).not.toBe(english);
  expect(python_profiles).toHaveBeenCalledTimes(1);
});

test("optional helper translators change only local display fields, preserving raw outcomes and default English", () => {
  const limit = CODE_LIMITS.timeout_ms;
  expect(limit_from_text("bad", limit)).toEqual({ ok: false, problem: "Enter a whole number." });
  expect(limit_from_text("bad", limit, marker).problem).toMatch(/^TRANSLATED:/);
  expect(limit_from_text("30", limit, marker)).toEqual(limit_from_text("30", limit));
  expect(literal_from_text("false", "boolean", marker)).toEqual(literal_from_text("false", "boolean"));
  expect(literal_from_text("broken-json", "object", marker).problem).toMatch(/^TRANSLATED:/);
  const original = case_problems([{}]);
  const translated = case_problems([{}], marker);
  expect(translated.map((row) => row.map(({ message, ...rest }) => rest))).toEqual(original.map((row) => row.map(({ message, ...rest }) => rest)));
  expect(translated[0][0].message).toMatch(/^TRANSLATED:/);
});

test("source display translates its owned reason while preserving raw path and source data", () => {
  const node = { id: "raw", type: "code", config: { code: { source: { kind: "file", path: "agents.execution.code/{value}.py" } } } };
  const before = JSON.stringify(node);
  const english = code_source_text(node);
  const translated = code_source_text(node, undefined, marker);
  expect({ ...translated, reason: english.reason }).toEqual(english);
  expect(JSON.stringify(node)).toBe(before);
  expect(translated.reason).toMatch(/^TRANSLATED:/);
});


test("Tool error rich text preserves all eight technical spans in order across a locale switch", async () => {
  const node = { id: "tool", type: "tool_call", config: { execution: { inputs: [], outputs: [] } } };
  const document = graph(node);
  const onChange = jest.fn();
  const tree = (locale) => localized(locale, <ToolCallSection document={document} node={node} isDark={false} onChange={onChange} />);
  const view = render(tree("en"));
  await settle();
  const note = screen.getByTestId("tool-call-on-error-note");
  const tokens = () => within(note).getAllByText(/^(ok|error|denied|tool_error|result|tool_failed)$/).map((element) => element.textContent);
  expect(tokens()).toEqual(["ok", "error", "ok", "error", "denied", "tool_error", "result", "tool_failed"]);
  const english = note.textContent;
  view.rerender(tree("zh-CN"));
  expect(tokens()).toEqual(["ok", "error", "ok", "error", "denied", "tool_error", "result", "tool_failed"]);
  expect(note.textContent).not.toBe(english);
  expect(onChange).not.toHaveBeenCalled();
  expect(api.unchain.listToolModalCatalog).toHaveBeenCalledTimes(1);
});
