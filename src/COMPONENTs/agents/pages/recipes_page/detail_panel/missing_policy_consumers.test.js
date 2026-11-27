import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import { api } from "../../../../../SERVICEs/api";
import BindingRow from "./binding_row";
import ToolCallSection from "./tool_call_section";
import capture from "../tool_call_capture.json";

jest.mock("../../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>;
const source = { kind: "ref", node_id: "start", path: ["message"] };

test("the real ordinary binding row preserves a stored JSON default until text replacement", () => {
  const stored = { toString: null };
  const binding = { name: "path", value: source, missing: "default", default: stored };
  const changes = jest.fn();
  render(wrap(<BindingRow binding={binding} index={0} sources={[]} problems={[]}
    isDark={false} onChange={changes} onRemove={() => {}} />));

  expect(screen.getByTestId("stored-json-default")).toHaveTextContent('{"toString":null}');
  expect(changes).not.toHaveBeenCalled();
  fireEvent.change(screen.getByPlaceholderText(/enter text to replace the stored JSON/i),
    { target: { value: "replacement" } });
  expect(changes).toHaveBeenCalledTimes(1);
  expect(changes.mock.calls[0][0]).toEqual({ ...binding, default: "replacement" });
  expect(changes.mock.calls[0][0].value).toBe(source);
  expect(binding.default).toBe(stored);
});

test("the real Tool Call controls keep their default and source while the catalog loads", async () => {
  const catalog = JSON.parse(capture.catalog_v2.body_text);
  const core = JSON.parse(capture.core_schemas.body_text);
  api.unchain.listToolModalCatalog = jest.fn(async () => catalog);
  api.unchain.listSkeletonToolSchemas = jest.fn(async () => ({ toolkit_id: core.toolkit_id, tools: core.tools }));
  const stored = { toString: null, fallback: false };
  const binding = { name: "path", value: source, missing: "default", default: stored };
  const node = { id: "tool", type: "tool_call", config: {
    tool: { name: "read", on_error: "stop", approval_timeout_ms: 1000 },
    execution: { inputs: [binding], outputs: [] },
  } };
  const document = { schema_version: 1, kind: "agent", id: "default-controls", name: "Default controls",
    nodes: [
      { id: "start", type: "start", config: { execution: { outputs: [{ name: "message", source: { kind: "result", path: ["message"] } }] } } },
      node,
    ],
    edges: [{ id: "flow", kind: "flow", source_node_id: "start", source_port_id: "out", target_node_id: "tool", target_port_id: "in" }],
  };
  const before = JSON.stringify(document);
  const changes = jest.fn();
  render(wrap(<ToolCallSection document={document} node={node} isDark={false} onChange={changes} />));
  await act(async () => { await Promise.resolve(); });
  const argument = screen.getByTestId("tool-call-argument-path");

  expect(within(argument).getByTestId("stored-json-default")).toHaveTextContent('{"toString":null,"fallback":false}');
  expect(changes).not.toHaveBeenCalled();
  expect(JSON.stringify(document)).toBe(before);
  fireEvent.change(within(argument).getByPlaceholderText(/enter text to replace the stored JSON/i),
    { target: { value: "chosen/path" } });
  expect(changes).toHaveBeenCalledTimes(1);
  const next = changes.mock.calls[0][0];
  expect(next.nodes.find((entry) => entry.id === "tool").config.execution.inputs[0]).toEqual({ ...binding, default: "chosen/path" });
  expect(next.nodes[0]).toBe(document.nodes[0]);
  expect(document.nodes[1].config.execution.inputs[0].default).toBe(stored);
});
