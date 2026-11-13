import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import { api } from "../../../../../SERVICEs/api";
import WorkflowParametersSection from "./workflow_parameters_section";
import capture from "../workflow_parameters_producer.json";

jest.mock("../../../../../SERVICEs/api", () => ({ api: { unchain: { getManagedCodeCapabilities: jest.fn() } } }));
jest.mock("../../../../../BUILTIN_COMPONENTs/icon/icon", () => function TestIcon() { return null; });

function show(type) {
  const write = jest.fn();
  function Live() {
    const [document, setDocument] = React.useState({
      schema_version: 1, kind: "workflow", id: "controls", name: "Controls",
      input_schema: { type: "object", properties: { city: { type } }, required: ["city"], additionalProperties: false },
      nodes: [{ id: "start", type: "start", config: { execution: { outputs: [{ name: "city", source: { kind: "result", path: ["city"] } }] } } }], edges: [],
    });
    return <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <WorkflowParametersSection document={document} isDark={false} onChange={(next) => { write(next); setDocument(next); }} />
    </ConfigContext.Provider>;
  }
  render(<Live />); return write;
}

beforeEach(() => api.unchain.getManagedCodeCapabilities.mockResolvedValue(capture.capabilities));

test("the actual Mini UI selector can replace a malformed stored type without an opening write", async () => {
  const write = show({ toString: null });
  await waitFor(() => expect(screen.getByRole("button", { name: "Add parameter" })).toBeEnabled());
  expect(write).not.toHaveBeenCalled();
  const row = screen.getByTestId("workflow-parameter-0");
  const picker = within(row).getAllByRole("combobox")[0];
  expect(picker).toHaveTextContent("Stored:");
  fireEvent.click(picker);
  const lists = screen.getAllByRole("listbox", { hidden: true });
  fireEvent.click(within(lists.at(-1)).getByText("Text", { exact: true }));
  expect(write).toHaveBeenCalledTimes(1);
  expect(write.mock.calls[0][0].input_schema.properties.city).toEqual({ type: "string" });
});

test("the actual default selector keeps an invalid stored type visible but writes only a JSON default", async () => {
  const write = show("constructor");
  await waitFor(() => expect(screen.getByRole("button", { name: "Add parameter" })).toBeEnabled());
  const row = screen.getByTestId("workflow-parameter-0");
  fireEvent.click(within(row).getAllByRole("combobox")[1]);
  const lists = screen.getAllByRole("listbox", { hidden: true });
  fireEvent.click(within(lists.at(-1)).getByText("Default value", { exact: true }));
  const next = write.mock.calls.at(-1)[0];
  expect(next.input_schema.properties.city).toEqual({ type: "constructor", default: null });
  expect(JSON.parse(JSON.stringify(next))).toEqual(next);
});
