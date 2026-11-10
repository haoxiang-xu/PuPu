import React, { useState } from "react";
import { fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import MissingPolicySelect from "./detail_panel/missing_policy_select";
import RunNodeStatus, { run_status_caption } from "./nodes/run_node_status";
import { agentMessage, renderAgentMessage, agentError } from "./agents_i18n";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const authorText = "Author's {name} · é · 用户原文";
const initial = { name: "task", value: { kind: "ref", node_id: "start", path: ["text"] },
  missing: "default", default: authorText };

function PolicyFixture({ locale, onChange }) {
  const [binding, setBinding] = useState(initial);
  return (
    <ConfigContext.Provider value={cfg}>
      <LocaleContext.Provider value={{ locale }}>
        <MissingPolicySelect binding={binding} onChange={(next) => { onChange(next); setBinding(next); }} />
      </LocaleContext.Provider>
    </ConfigContext.Provider>
  );
}

test.each([
  ["en", "If missing"],
  ["zh-CN", "值缺失时"],
  ["zh-TW", "值缺失時"],
  ["de", "Wenn der Wert fehlt"],
  ["ja", "値がない場合"],
  ["ko", "값이 없을 때"],
  ["es", "Si falta el valor"],
  ["fr", "Si la valeur manque"],
  ["it", "Se il valore manca"],
  ["pt-BR", "Se o valor estiver ausente"],
  ["ru", "Если значение отсутствует"],
])("missing-policy copy is localized in %s without rewriting its binding", (locale, label) => {
  const onChange = jest.fn();
  const before = JSON.stringify(initial);
  render(<PolicyFixture locale={locale} onChange={onChange} />);
  expect(screen.getByText(label)).toBeInTheDocument();
  expect(screen.getByDisplayValue(authorText)).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
  expect(JSON.stringify(initial)).toBe(before);
});

test("changing locale preserves an active input, author text and the one explicit edit", () => {
  const onChange = jest.fn();
  const { rerender } = render(<PolicyFixture locale="en" onChange={onChange} />);
  const input = screen.getByDisplayValue(authorText);
  input.focus();
  fireEvent.change(input, { target: { value: "Edited {count} · 不可翻译" } });
  expect(onChange).toHaveBeenCalledTimes(1);
  const emitted = JSON.stringify(onChange.mock.calls[0][0]);
  for (const locale of ["zh-CN", "de", "ja", "en"]) {
    rerender(<PolicyFixture locale={locale} onChange={onChange} />);
    expect(screen.getByDisplayValue("Edited {count} · 不可翻译")).toBe(input);
    expect(input).toHaveFocus();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(onChange.mock.calls[0][0])).toBe(emitted);
  }
  expect(JSON.parse(emitted)).toEqual({ ...initial, default: "Edited {count} · 不可翻译" });
});

test("a stored JSON default remains raw data while its surrounding description is translated", () => {
  const binding = { ...initial, default: { toString: null, label: "agents.run.cancelled", count: 0 } };
  const before = JSON.stringify(binding);
  const onChange = jest.fn();
  render(<ConfigContext.Provider value={cfg}><LocaleContext.Provider value={{ locale: "zh-CN" }}>
    <MissingPolicySelect binding={binding} onChange={onChange} />
  </LocaleContext.Provider></ConfigContext.Provider>);
  expect(screen.getByTestId("stored-json-default")).toHaveTextContent("已保存的 JSON 默认值");
  const storedCode = within(screen.getByTestId("stored-json-default"))
    .getByText(JSON.stringify(binding.default), { selector: "code" });
  expect(storedCode.textContent).toBe(JSON.stringify(binding.default));
  expect(onChange).not.toHaveBeenCalled();
  expect(JSON.stringify(binding)).toBe(before);
});

test("run captions localize their meaning while retaining state, raw reason and child content", () => {
  const projection = { node_id: "step.原样", state: "waiting", phase: "receipt_recorded",
    reason: "backend_reason/{raw}/not_a_translation_key" };
  const before = JSON.stringify(projection);
  render(<ConfigContext.Provider value={cfg}><LocaleContext.Provider value={{ locale: "zh-CN" }}>
    <RunNodeStatus projection={projection} isDark={false}><span>{authorText}</span></RunNodeStatus>
  </LocaleContext.Provider></ConfigContext.Provider>);
  const badge = screen.getByTestId("run-node-state-step.原样");
  expect(badge).toHaveAttribute("aria-label", "收据已记录 · 等待恢复");
  expect(badge).toHaveAttribute("data-run-state", "waiting");
  expect(badge.title).toBe(`收据已记录 · 等待恢复 · ${projection.reason}`);
  expect(screen.getByText(authorText)).toBeInTheDocument();
  expect(JSON.stringify(projection)).toBe(before);
});

test("omitting the locale preserves the existing English helper and component fallback", () => {
  expect(run_status_caption({ state: "cancelled", phase: "cancelled" })).toBe("Cancelled");
  expect(run_status_caption({ state: "running", phase: "result_received" }))
    .toBe("Result recorded · not committed");
  render(<PolicyFixture locale="unsupported-locale" onChange={() => {}} />);
  expect(screen.getByText("If missing")).toBeInTheDocument();
  expect(screen.getByDisplayValue(authorText)).toBeInTheDocument();
});

test("persistent owned notices use the translator at display time and snapshot raw variables", () => {
  const vars = { value: "Raw {value} · agents.run.cancelled · é" };
  const notice = agentMessage("agents.missing.stored_json", vars);
  vars.value = "a later mutation";
  expect(renderAgentMessage(notice)).toBe(
    "Stored JSON default: Raw {value} · agents.run.cancelled · é. It stays unchanged until you enter replacement text.",
  );
  const { result } = renderHook(() => useTranslation(), {
    wrapper: ({ children }) => <LocaleContext.Provider value={{ locale: "zh-CN" }}>{children}</LocaleContext.Provider>,
  });
  expect(renderAgentMessage(notice, result.current.t)).toBe(
    "已保存的 JSON 默认值：Raw {value} · agents.run.cancelled · é。只有输入替换文本后，它才会改变。",
  );
});

test("only locally created messages translate; key-like raw strings and JSON objects stay opaque", () => {
  const raw = { key: "agents.run.cancelled", vars: {} };
  expect(renderAgentMessage("agents.run.cancelled")).toBe("agents.run.cancelled");
  expect(renderAgentMessage(raw)).toBe(raw);
  expect(renderAgentMessage(null)).toBeNull();
  const local = agentMessage("agents.run.cancelled");
  const replayedJson = JSON.parse(JSON.stringify(local));
  expect(renderAgentMessage(replayedJson)).toBe(replayedJson);
});

test("nested owned fallback copy follows the current locale without interpreting raw variable keys", () => {
  const inner = agentMessage("agents.run.cancelled");
  const notice = agentMessage("agents.missing.stored_json", { value: inner });
  const { result } = renderHook(() => useTranslation(), {
    wrapper: ({ children }) => <LocaleContext.Provider value={{ locale: "zh-CN" }}>{children}</LocaleContext.Provider>,
  });
  expect(renderAgentMessage(notice)).toContain("Stored JSON default: Cancelled.");
  expect(renderAgentMessage(notice, result.current.t)).toContain("JSON 默认值：已取消。");
});

test("local error provenance preserves normal Error behavior and never rebrands server errors", () => {
  const local = agentError("agents.run.unavailable");
  expect(local).toBeInstanceOf(Error);
  expect(local.message).toBe("State unavailable");
  expect(JSON.stringify(local)).toBe("{}");
  const remote = new Error("agents.run.unavailable");
  expect(renderAgentMessage(remote)).toBe(remote);
  const { result } = renderHook(() => useTranslation(), {
    wrapper: ({ children }) => <LocaleContext.Provider value={{ locale: "zh-CN" }}>{children}</LocaleContext.Provider>,
  });
  expect(renderAgentMessage(local, result.current.t)).toBe("状态不可用");
  local.message = "replacement raw backend text";
  expect(renderAgentMessage(local, result.current.t)).toBe(local);
});

test("owned local problem metadata preserves the original error bytes and stays absent from serialization", () => {
  const { agentProblem, agentProblemMessage, copyAgentProblem } = require("./agents_i18n");
  const details = { code: "raw_code", path: ["raw", 1] };
  const problem = agentProblem("agents.rename.non_blank", undefined, details);
  expect(JSON.stringify(problem)).toBe(JSON.stringify({ ...details, message: "Node label must be non-blank." }));
  expect(Object.keys(problem)).toEqual(["code", "path", "message"]);
  expect(agentProblemMessage(problem, (key) => `T:${key}`)).toBe("T:agents.rename.non_blank");
  const forwarded = copyAgentProblem(problem, { ...problem });
  expect(agentProblemMessage(forwarded, (key) => `T:${key}`)).toBe("T:agents.rename.non_blank");
  const opaque = { ...problem };
  expect(agentProblemMessage(opaque, (key) => `T:${key}`)).toBe(problem.message);
  problem.message = "an opaque replacement";
  expect(agentProblemMessage(problem, (key) => `T:${key}`)).toBe("an opaque replacement");
  expect(agentProblemMessage(copyAgentProblem(forwarded, { message: "different" }), (key) => `T:${key}`)).toBe("different");
});

test("a changed Error cannot regain stale ownership through a diagnostic wrapper", () => {
  const { agentProblemFromMessage, copyAgentProblem, agentProblemMessage } = require("./agents_i18n");
  const error = agentError("agents.rename.non_blank"); error.message = "raw replacement";
  const wrapped = agentProblemFromMessage(error, { code: "raw" });
  expect(agentProblemMessage(wrapped, (key) => `T:${key}`)).toBe(error);
  const source = agentMessage("agents.rename.non_blank");
  const copied = copyAgentProblem(source, { message: undefined });
  expect(agentProblemMessage(copied, (key) => `T:${key}`)).toBeUndefined();
});

test("owned callback reasons keep their public English string and opaque payloads cannot forge ownership", () => {
  const { agentReasonPayload, agentPayloadReason } = require("./agents_i18n");
  const notice = agentMessage("agents.rename.non_blank");
  const payload = agentReasonPayload({ id: "raw", reason: notice });
  expect(payload).toEqual({ id: "raw", reason: "Node label must be non-blank." });
  expect(JSON.stringify(payload)).toBe('{"id":"raw","reason":"Node label must be non-blank."}');
  expect(agentPayloadReason(payload, (key) => `T:${key}`)).toBe("T:agents.rename.non_blank");
  expect(agentPayloadReason(JSON.parse(JSON.stringify(payload)), (key) => `T:${key}`)).toBe(payload.reason);
  payload.reason = "raw replacement";
  expect(agentPayloadReason(payload, (key) => `T:${key}`)).toBe("raw replacement");
});
