import React, { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import DetailPanel from "./detail_panel";
import { kernel_profiles } from "../skeleton_resources";

jest.mock("../skeleton_resources", () => ({
  is_unavailable: (result) => result?.reason === "unavailable",
  kernel_profiles: jest.fn(),
}));
jest.mock("../../../../../BUILTIN_COMPONENTs/select/select", () => function CatalogSelect({ options, value, set_value, placeholder }) {
  return <select aria-label={placeholder || "Choose value"} value={value || ""} onChange={(event) => set_value(event.target.value)}>
    <option value="">{placeholder || ""}</option>
    {(options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>;
});

const profile = {
  id: "offline:research", provider: "offline", model: "research",
  protocol: "openai-responses", endpoint: "http://127.0.0.1:1", credential_ref: "offline",
  context_window: 32000, output_limit: 4096,
  capabilities: { json_schema: true, images: false, files: false },
};
const otherProfile = { ...profile, id: "offline:other", model: "other" };
const seed = {
  schema_version: 1, kind: "agent", id: "timeline-agent", name: "Timeline Agent",
  nodes: [
    { id: "start", type: "start", config: { execution: { outputs: [{ name: "message", source: { kind: "input", path: ["message"] } }] } } },
    { id: "process", type: "agent", config: {
      kernel: { schema_version: 1, profile, prompt: "Read {{#input.question#}}.", max_iterations: 12, output_tokens: 1024, history: "root", overflow: "error", json_schema: null },
      execution: {
        inputs: [{ name: "question", value: { kind: "ref", node_id: "start", path: ["message"] }, missing: "error" }],
        outputs: [{ name: "answer", source: { kind: "result", path: ["message"] } }],
      },
    } },
    { id: "end", type: "end", config: { execution: { inputs: [], outputs: [] } } },
  ],
  edges: [
    { id: "first", kind: "flow", source_node_id: "start", source_port_id: "out", target_node_id: "process", target_port_id: "in" },
    { id: "last", kind: "flow", source_node_id: "process", source_port_id: "out", target_node_id: "end", target_port_id: "in" },
  ],
};

async function show({ document = seed, selected = "process", dark = false, changed = jest.fn() } = {}) {
  function Editor() {
    const [draft, setDraft] = useState(document);
    return <ConfigContext.Provider value={{ theme: {}, onThemeMode: dark ? "dark_mode" : "light_mode" }}>
      <DetailPanel document={draft} selectedNodeId={selected} documentRevision="edit-1"
        onDocumentChange={(next) => { changed(next); setDraft(next); }} />
    </ConfigContext.Provider>;
  }
  const view = render(<Editor />);
  // Settle the catalog promise; rendering itself already runs inside act.
  await act(async () => { await Promise.resolve(); });
  return { ...view, changed };
}

beforeEach(() => {
  kernel_profiles.mockResolvedValue({ ok: true, data: { profiles: [profile, otherProfile], unavailable: [] } });
});

test.each([false, true])("the Process inspector is one Timeline with independent disclosures (dark=%s)", async (dark) => {
  const { changed } = await show({ dark });
  const timeline = screen.getByTestId("process-detail-timeline");
  const titles = ["Input Variables", "Model", "Prompt", "Output Variables"];
  const buttons = within(timeline).getAllByRole("button").filter((button) => titles.includes(button.getAttribute("aria-label")));
  expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Input Variables", "Model", "Prompt", "Output Variables"]);
  expect(buttons.map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "false", "false", "false"]);
  expect(within(timeline).queryByText(/^Step [12]$|^Start$|^End$/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Model", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Prompt", exact: true }));
  expect(screen.getByRole("region", { name: "Model", exact: true })).toBeVisible();
  expect(screen.getByRole("region", { name: "Prompt", exact: true })).toBeVisible();
  expect(screen.getByRole("region", { name: "Input Variables", exact: true })).toBeVisible();
  expect(changed).not.toHaveBeenCalled();
  expect(kernel_profiles).toHaveBeenCalledTimes(1);
});

test("closing and reopening Prompt keeps the same editor and the unsaved document", async () => {
  const { changed } = await show();
  const toggle = screen.getByRole("button", { name: "Prompt", exact: true });
  fireEvent.click(toggle);
  const editor = within(screen.getByRole("region", { name: "Prompt", exact: true })).getByRole("textbox");
  fireEvent.change(editor, { target: { value: "Draft instructions {{#input.question#}}" } });
  const written = changed.mock.calls.at(-1)[0];
  expect(written.nodes[1].config.kernel.prompt).toBe("Draft instructions {{#input.question#}}");
  expect(written.nodes[1].config.execution).toEqual(seed.nodes[1].config.execution);
  const count = changed.mock.calls.length;
  fireEvent.click(toggle);
  expect(screen.getByTestId("process-section-prompt")).toHaveAttribute("inert");
  fireEvent.click(toggle);
  expect(within(screen.getByRole("region", { name: "Prompt", exact: true })).getByRole("textbox")).toBe(editor);
  expect(editor).toHaveValue("Draft instructions {{#input.question#}}");
  expect(changed).toHaveBeenCalledTimes(count);
});

test("Model and Prompt edit the same latest Kernel without duplicate catalog requests", async () => {
  const { changed } = await show();
  fireEvent.click(screen.getByRole("button", { name: "Prompt", exact: true }));
  fireEvent.change(within(screen.getByRole("region", { name: "Prompt", exact: true })).getByRole("textbox"), { target: { value: "Keep this draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Model", exact: true }));
  fireEvent.change(within(screen.getByRole("region", { name: "Model", exact: true })).getAllByRole("combobox")[0], { target: { value: otherProfile.id } });
  expect(changed.mock.calls.at(-1)[0].nodes[1].config.kernel).toMatchObject({ profile: otherProfile, prompt: "Keep this draft" });
  fireEvent.click(screen.getByRole("button", { name: "Model", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Model", exact: true }));
  expect(kernel_profiles).toHaveBeenCalledTimes(1);
});

test("Output keeps both JSON Output and mapping editors and folding writes nothing", async () => {
  const { changed } = await show();
  fireEvent.click(screen.getByRole("button", { name: "Output Variables", exact: true }));
  const output = screen.getByRole("region", { name: "Output Variables", exact: true });
  expect(within(output).getByTestId("skeleton-output-variables")).toBeVisible();
  expect(within(output).getByTestId("skeleton-output-schema")).toBeInTheDocument();
  expect(within(output).getByDisplayValue("answer")).toBeVisible();
  expect(changed).not.toHaveBeenCalled();
});

test("folding Model preserves a refused partial number without writing it", async () => {
  const { changed } = await show();
  const toggle = screen.getByRole("button", { name: "Model", exact: true });
  fireEvent.click(toggle);
  fireEvent.click(screen.getByTestId("kernel-advanced-toggle"));
  const count = within(screen.getByRole("region", { name: "Model", exact: true })).getByDisplayValue("12");
  fireEvent.change(count, { target: { value: "0." } });
  expect(count).toHaveValue("0.");
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  expect(within(screen.getByRole("region", { name: "Model", exact: true })).getByDisplayValue("0.")).toBe(count);
  expect(changed).not.toHaveBeenCalled();
});

test("Start and other non-Process panels keep their existing presentation", async () => {
  await show({ selected: "start" });
  expect(screen.queryByTestId("process-detail-timeline")).not.toBeInTheDocument();
  expect(screen.getByTestId("skeleton-input-variables")).toBeInTheDocument();
});

test("a collapsed section keeps its larger click target without hover highlighting", async () => {
  const { changed } = await show();
  const section = screen.getByTestId("process-disclosure-prompt");
  const toggle = screen.getByRole("button", { name: "Prompt", exact: true });
  expect(section).toHaveStyle({ backgroundColor: "transparent" });
  fireEvent.mouseEnter(toggle);
  expect(section).toHaveStyle({ backgroundColor: "transparent" });
  expect(toggle).toHaveStyle({ minHeight: "32px", backgroundColor: "transparent" });
  fireEvent.mouseLeave(section);
  expect(section).toHaveStyle({ backgroundColor: "transparent" });
  expect(changed).not.toHaveBeenCalled();
});

test("an expanded section stays transparent over both its title and editor", async () => {
  const { changed } = await show();
  const section = screen.getByTestId("process-disclosure-prompt");
  const toggle = screen.getByRole("button", { name: "Prompt", exact: true });
  fireEvent.click(toggle);
  const editor = within(screen.getByRole("region", { name: "Prompt", exact: true })).getByRole("textbox");
  fireEvent.focus(editor);
  expect(section).toHaveStyle({ backgroundColor: "transparent" });
  fireEvent.mouseEnter(toggle);
  expect(section).toHaveStyle({ backgroundColor: "transparent" });
  fireEvent.mouseLeave(toggle, { relatedTarget: editor });
  fireEvent.mouseEnter(editor, { relatedTarget: toggle });
  expect(section).toHaveStyle({ backgroundColor: "transparent" });
  expect(toggle).toHaveStyle({ backgroundColor: "transparent" });
  fireEvent.mouseLeave(section);
  expect(section).toHaveStyle({ backgroundColor: "transparent" });
  expect(changed).not.toHaveBeenCalled();
});

test("list add actions follow the rows and still preserve the rest of the document", async () => {
  const { changed } = await show();
  const input = screen.getByRole("region", { name: "Input Variables", exact: true });
  const addInput = within(input).getByRole("button", { name: "+ Add input", exact: true });
  expect(addInput).toHaveTextContent("+ Add input");
  expect(within(input).getByDisplayValue("question").compareDocumentPosition(addInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(addInput);
  fireEvent.click(screen.getByRole("button", { name: "Output Variables", exact: true }));
  const output = screen.getByRole("region", { name: "Output Variables", exact: true });
  const addOutput = within(output).getByRole("button", { name: "+ Add output", exact: true });
  expect(addOutput).toHaveTextContent("+ Add output");
  expect(within(output).getByDisplayValue("answer").compareDocumentPosition(addOutput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(addOutput);
  const saved = changed.mock.calls.at(-1)[0];
  expect(saved.nodes[1].config.execution.inputs).toHaveLength(2);
  expect(saved.nodes[1].config.execution.outputs).toHaveLength(2);
  expect(saved.nodes[1].config.kernel).toEqual(seed.nodes[1].config.kernel);
});
