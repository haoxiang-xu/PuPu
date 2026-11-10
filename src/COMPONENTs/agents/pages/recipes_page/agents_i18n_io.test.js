import React from "react";
import { fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { binding_problems, expression_summary, output_mapping_problems } from "./skeleton_io";
import { output_schema_problems } from "./output_schema";
import { why_fields_cannot_hold } from "./output_schema_fields";
import { start_context_for_view } from "./start_context";
import InputVariablesSection from "./detail_panel/input_variables_section";
import OutputSchemaSection from "./detail_panel/output_schema_section";
import BindingRow from "./detail_panel/binding_row";

const localized = (locale, children) => <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
  <LocaleContext.Provider value={{ locale }}>{children}</LocaleContext.Provider>
</ConfigContext.Provider>;
const identity = (problems) => problems.map(({ code, where }) => ({ code, where }));
const tagged = (key) => `TRANSLATED:${key}`;

test.each([undefined, () => "raw function"])("const forwards the translator for a JSON-invalid stored value (%p)", (raw) => {
  const schema = { type: "object", const: raw };
  const english = output_schema_problems(schema);
  const translated = output_schema_problems(schema, tagged);
  expect(english).toHaveLength(1);
  expect(english[0]).toMatchObject({ code: "invalid_json", message: "value is not JSON" });
  expect(identity(translated)).toEqual(identity(english));
  expect(translated[0].message).toBe("TRANSLATED:agents.schema.validation.value_is_not_json");
  expect(schema).toHaveProperty("const", raw);
});

test("the shared expression summary translates only its undefined sentinel, leaving every raw JSON value unchanged", () => {
  const t = jest.fn(tagged);
  expect(expression_summary(undefined)).toBe("(nothing)");
  expect(expression_summary(undefined, t)).toBe("TRANSLATED:agents.io.nothing");
  for (const value of [null, false, 0, "agents.io.nothing {value}", { toString: null, name: "Raw name" }, ["null", 2]]) {
    expect(expression_summary(value, t)).toBe(JSON.stringify(value));
  }
  expect(t).toHaveBeenCalledTimes(1);
  expect(t).toHaveBeenCalledWith("agents.io.nothing");
});

test.each([
  [binding_problems, [{ name: "", value: { kind: "first_present", values: [{ kind: "ref", node_id: "raw-id", path: [{}] }, {}] }, missing: "absent-policy" }]],
  [output_mapping_problems, [{ name: "", source: { kind: "result", path: [{}] } }]],
  [output_schema_problems, { type: "array", properties: null, additionalProperties: 4 }],
])("local validator %p changes only its display messages when a translator is supplied", (validate, value) => {
  const before = JSON.stringify(value);
  const english = validate(value);
  const translated = validate(value, tagged);
  expect(english.length).toBeGreaterThan(0);
  expect(identity(translated)).toEqual(identity(english));
  expect(translated.every((problem) => problem.message.startsWith("TRANSLATED:agents."))).toBe(true);
  expect(english.every((problem) => !problem.message.startsWith("TRANSLATED:"))).toBe(true);
  expect(JSON.stringify(value)).toBe(before);
});

test("schema reasons deduplicate their original semantic identity before formatting, even if translations collide", () => {
  const schema = { type: "object", $defs: {}, minLength: 1, maxLength: 5 };
  const english = why_fields_cannot_hold(schema);
  expect(english).toBe("it uses reusable definitions and root bounds");
  const t = jest.fn((key, vars) => key === "agents.schema.fields.uses_many"
    ? `MANY:${vars.reasons}|${vars.last}`
    : key === "agents.schema.fields.list_separator" ? " / " : "SAME");
  expect(why_fields_cannot_hold(schema, t)).toBe("MANY:SAME|SAME");
  expect(t.mock.calls.filter(([key]) => key === "agents.schema.fields.root_bounds")).toHaveLength(1);
  expect(t.mock.calls.filter(([key]) => key === "agents.schema.fields.reusable_definitions")).toHaveLength(1);
  expect(schema).toEqual({ type: "object", $defs: {}, minLength: 1, maxLength: 5 });
});

test("caller-context localization preserves field identities and its exact default-English contract", () => {
  const t = renderHook(() => useTranslation(), { wrapper: ({ children }) => localized("zh-CN", children) }).result.current.t;
  const raw = "agents.io.caller_input {name}";
  const node = { id: "start", type: "start", config: { execution: { outputs: [{ name: raw, source: { kind: "result", path: ["message"] } }] } } };
  const doc = { nodes: [node], edges: [] };
  const before = JSON.stringify(doc);
  const english = start_context_for_view([{ pool_node_id: "pool", entry_id: "child" }], [], doc);
  const translated = start_context_for_view([{ pool_node_id: "pool", entry_id: "child" }], [], doc, t);
  expect(translated.fields).toEqual(english.fields);
  expect(translated.kind).toBe(english.kind);
  expect(translated.message).not.toBe(english.message);
  expect(translated.fields).toEqual([{ name: raw, type: "text" }, { name: "message", type: "text" }]);
  expect(english.message).toMatch(/same delegated message text/);
  expect(JSON.stringify(doc)).toBe(before);
});

test("the unknown caller description is localized as presentation and has no editable field or write action", () => {
  const node = { id: "start", type: "start", config: {} };
  const onChange = jest.fn();
  render(localized("zh-CN", <InputVariablesSection document={{ nodes: [node], edges: [] }} node={node} onChange={onChange} />));
  const section = screen.getByTestId("skeleton-input-variables");
  expect(section).toHaveTextContent("输入变量");
  expect(section).not.toHaveTextContent("The caller is not specified");
  expect(within(section).queryByRole("textbox")).toBeNull();
  expect(within(section).queryByRole("button")).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
  expect(node.config).toEqual({});
});

test("a saved-store diagnostic stays raw beside translated binding controls", () => {
  const raw = "agents.io.validation.unknown_missing_policy {value} · RAW_BACKEND";
  const binding = { name: raw, value: { kind: "literal", value: raw }, missing: "error" };
  const before = JSON.stringify(binding);
  const onChange = jest.fn();
  render(localized("zh-CN", <BindingRow binding={binding} index={0} sources={[]} problems={[{ code: "raw_code", where: "bindings[0]", message: raw }]}
    onChange={onChange} onRemove={jest.fn()} />));
  expect(screen.getByTestId("binding-row-0")).toHaveTextContent(raw);
  expect(screen.getByTestId("binding-row-0")).not.toHaveTextContent("a value written here, not read from the graph");
  expect(onChange).not.toHaveBeenCalled();
  expect(JSON.stringify(binding)).toBe(before);
});

test("partially typed schema JSON keeps its exact text and focus across language changes without writing", () => {
  const schema = { type: "object", properties: { "agents.schema.title": { type: "string" } }, additionalProperties: false };
  const node = { id: "schema-node", type: "agent", config: { kernel: { profile: { capabilities: { json_schema: true } }, json_schema: schema } } };
  const document = { schema_version: 1, kind: "agent", id: "raw-doc", nodes: [node], edges: [] };
  const before = JSON.stringify(document);
  const onChange = jest.fn();
  const tree = (locale) => localized(locale, <OutputSchemaSection document={document} node={node} revision="edit-raw" onChange={onChange} />);
  const view = render(tree("en"));
  fireEvent.click(screen.getByRole("button", { name: "Edit as JSON" }));
  const input = screen.getByPlaceholderText('{ "type": "object", "properties": {} }');
  fireEvent.change(input, { target: { value: '{"raw-name":' } });
  input.focus();
  input.setSelectionRange(4, 7);
  view.rerender(tree("zh-CN"));
  expect(screen.getByPlaceholderText('{ "type": "object", "properties": {} }')).toBe(input);
  expect(input).toHaveFocus();
  expect(input).toHaveValue('{"raw-name":');
  expect([input.selectionStart, input.selectionEnd]).toEqual([4, 7]);
  expect(screen.getByTestId("schema-json-unreadable")).not.toHaveTextContent("This is not JSON yet");
  expect(onChange).not.toHaveBeenCalled();
  expect(JSON.stringify(document)).toBe(before);
});
