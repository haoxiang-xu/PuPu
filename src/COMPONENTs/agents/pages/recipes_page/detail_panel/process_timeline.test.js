import React, { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import DetailPanel from "./detail_panel";
import { resetProcessPanelMemory } from "./process_timeline";
import { kernel_profiles } from "../skeleton_resources";

jest.mock("../skeleton_resources", () => ({
  is_unavailable: (result) => result?.reason === "unavailable",
  kernel_profiles: jest.fn(),
}));
jest.mock("../../../../../BUILTIN_COMPONENTs/select/select", () => function CatalogSelect({ options, value, set_value, placeholder }) {
  return <select aria-label={placeholder || "Choose value"} value={value || ""} onChange={(event) => set_value(event.target.value)}>
    <option value="">{placeholder || ""}</option>
    {(options || []).flatMap((option) => option.options || [option]).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>;
});

const profile = {
  id: "ollama:research", provider: "ollama", model: "research",
  protocol: "ollama", endpoint: "http://127.0.0.1:1", credential_ref: "ollama",
  context_window: 32000, output_limit: 4096,
  capabilities: { json_schema: true, images: false, files: false },
};
const otherProfile = { ...profile, id: "ollama:other", model: "other" };
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
  resetProcessPanelMemory();
  kernel_profiles.mockResolvedValue({ ok: true, data: { profiles: [profile, otherProfile], unavailable: [] } });
});

test.each([false, true])("every part folds; Input comes first and Output last (dark=%s)", async (dark) => {
  const { changed } = await show({ dark });
  const panel = screen.getByTestId("process-detail-timeline");
  /* what the Agent is: open without a click, and it folds like every part */
  expect(screen.getByRole("region", { name: "Model", exact: true })).toBeVisible();
  const prompt = screen.getByRole("region", { name: "Prompt", exact: true });
  expect(within(prompt).getByRole("textbox")).toHaveValue("Read {{#input.question#}}.");
  expect(within(panel).getByRole("button", { name: "Model", exact: true })).toHaveAttribute("aria-expanded", "true");
  expect(within(panel).getByRole("button", { name: "Prompt", exact: true })).toHaveAttribute("aria-expanded", "true");
  /* what it is wired to: two disclosures, in the order values flow */
  const wiring = screen.getByTestId("process-wiring");
  const titles = ["Input Variables", "Output Variables"];
  const buttons = within(wiring).getAllByRole("button").filter((button) => titles.includes(button.getAttribute("aria-label")));
  expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(titles);
  expect(buttons.map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
  /* Input first, then Model, Prompt, the rarely touched limits, and Output last */
  const order = [screen.getByTestId("process-section-input"), screen.getByTestId("process-section-model"), prompt,
    screen.getByTestId("process-advanced"), screen.getByTestId("process-section-output")];
  order.slice(1).forEach((element, index) =>
    expect(order[index].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy());
  expect(within(panel).queryByText(/^Step [12]$|^Start$|^End$/)).not.toBeInTheDocument();
  expect(changed).not.toHaveBeenCalled();
  expect(kernel_profiles).toHaveBeenCalledTimes(1);
});

test("a folded part says how many rows it holds", async () => {
  await show();
  expect(screen.getByTestId("process-summary-output")).toHaveTextContent("1");
  expect(screen.getByTestId("process-summary-output")).toHaveStyle({ opacity: "1" });
  /* open, the rows speak for themselves */
  expect(screen.getByTestId("process-summary-input")).toHaveStyle({ opacity: "0" });
});

test("which parts are open is remembered from one node to the next", async () => {
  const first = await show();
  fireEvent.click(screen.getByRole("button", { name: "Output Variables", exact: true }));
  first.unmount();
  await show();
  expect(screen.getByRole("button", { name: "Output Variables", exact: true })).toHaveAttribute("aria-expanded", "true");
});

test("a part that holds a problem shows the count and opens itself", async () => {
  const document = JSON.parse(JSON.stringify(seed));
  document.nodes[1].config.kernel.prompt = "Read {{#input.missing#}}.";
  await show({ document });
  expect(screen.getByTestId("process-problems-prompt")).toHaveTextContent("1");
  expect(screen.getByTestId("process-header-prompt")).toContainElement(screen.getByTestId("process-problems-prompt"));
});

test("folding Output keeps the same editors and the unsaved document", async () => {
  const { changed } = await show();
  const editor = within(screen.getByRole("region", { name: "Prompt", exact: true })).getByRole("textbox");
  fireEvent.change(editor, { target: { value: "Draft instructions {{#input.question#}}" } });
  const written = changed.mock.calls.at(-1)[0];
  expect(written.nodes[1].config.kernel.prompt).toBe("Draft instructions {{#input.question#}}");
  expect(written.nodes[1].config.execution).toEqual(seed.nodes[1].config.execution);
  const count = changed.mock.calls.length;
  const toggle = screen.getByRole("button", { name: "Input Variables", exact: true });
  const row = within(screen.getByRole("region", { name: "Input Variables", exact: true })).getByDisplayValue("question");
  fireEvent.click(toggle);
  expect(screen.getByTestId("process-section-input")).toHaveAttribute("inert");
  fireEvent.click(toggle);
  expect(within(screen.getByRole("region", { name: "Input Variables", exact: true })).getByDisplayValue("question")).toBe(row);
  expect(editor).toHaveValue("Draft instructions {{#input.question#}}");
  expect(changed).toHaveBeenCalledTimes(count);
});

test("Model and Prompt edit the same latest Kernel without duplicate catalog requests", async () => {
  const { changed } = await show();
  fireEvent.change(within(screen.getByRole("region", { name: "Prompt", exact: true })).getByRole("textbox"), { target: { value: "Keep this draft" } });
  fireEvent.change(within(screen.getByRole("region", { name: "Model", exact: true })).getAllByRole("combobox")[0], { target: { value: otherProfile.id } });
  expect(changed.mock.calls.at(-1)[0].nodes[1].config.kernel).toMatchObject({ profile: otherProfile, prompt: "Keep this draft" });
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

test("an Output pill edits its name and picks declared sources from the default menu", async () => {
  const { changed } = await show();
  fireEvent.click(screen.getByRole("button", { name: "Output Variables", exact: true }));
  const output = screen.getByRole("region", { name: "Output Variables", exact: true });
  const row = within(output).getByTestId("output-row-0");
  fireEvent.click(within(row).getByRole("button", { name: "Result · message" }));
  await waitFor(() => expect(screen.getByText("question", { exact: true, selector: "span" })).toBeVisible());
  expect(screen.queryByText("context", { exact: true, selector: "span" })).not.toBeInTheDocument();
  expect(within(row).queryByText("question")).not.toBeInTheDocument();
  expect(changed).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText("question", { exact: true, selector: "span" }));
  expect(changed.mock.calls.at(-1)[0].nodes[1].config.execution.outputs).toEqual([
    { name: "answer", source: { kind: "input", path: ["question"] } },
  ]);
  fireEvent.change(within(row).getByRole("textbox", { name: "name" }), { target: { value: "exported" } });
  fireEvent.click(within(row).getByRole("button", { name: "Inputs · question" }));
  fireEvent.click(screen.getByText("The whole result", { exact: true }));
  expect(changed.mock.calls.at(-1)[0].nodes[1].config.execution.outputs).toEqual([
    { name: "exported", source: { kind: "result", path: [] } },
  ]);
  expect(changed.mock.calls.at(-1)[0].nodes[1].config.execution.inputs).toEqual(seed.nodes[1].config.execution.inputs);
});

test("Output hides saved Agent context and keeps it when another output is edited", async () => {
  const document = JSON.parse(JSON.stringify(seed));
  const process = document.nodes[1];
  process.config.kernel.json_schema = { type: "object", properties: {}, additionalProperties: true };
  process.config.execution.outputs[0].source.path = ["context", "summary"];
  process.config.execution.outputs.push({ name: "reply", source: { kind: "result", path: ["message"] } });
  const { changed } = await show({ document });
  expect(screen.getByTestId("process-summary-output")).toHaveTextContent("1");
  fireEvent.click(screen.getByRole("button", { name: "Output Variables", exact: true }));
  expect(screen.queryByTestId("output-row-0")).not.toBeInTheDocument();
  const row = screen.getByTestId("output-row-1");
  expect(changed).not.toHaveBeenCalled();
  fireEvent.change(within(row).getByRole("textbox", { name: "name" }), { target: { value: "edited" } });
  const saved = changed.mock.calls.at(-1)[0];
  expect(saved.nodes[1].config.execution.outputs[0]).toEqual(process.config.execution.outputs[0]);
  expect(saved.nodes[1].config.execution.outputs[1].name).toBe("edited");
});

test("folding Advanced preserves a refused partial number without writing it", async () => {
  const { changed } = await show();
  const toggle = screen.getByTestId("kernel-advanced-toggle");
  fireEvent.click(toggle);
  const count = within(screen.getByTestId("process-advanced")).getByDisplayValue("12");
  fireEvent.change(count, { target: { value: "0." } });
  expect(count).toHaveValue("0.");
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  expect(within(screen.getByTestId("process-advanced")).getByDisplayValue("0.")).toBe(count);
  expect(changed).not.toHaveBeenCalled();
});

test("Start and other non-Process panels keep their existing presentation", async () => {
  await show({ selected: "start" });
  expect(screen.queryByTestId("process-detail-timeline")).not.toBeInTheDocument();
  expect(screen.getByTestId("skeleton-input-variables")).toBeInTheDocument();
});

test("a folded part keeps its larger click target without hover highlighting", async () => {
  const { changed } = await show();
  const section = screen.getByTestId("process-disclosure-output");
  const toggle = screen.getByRole("button", { name: "Output Variables", exact: true });
  expect(section).toHaveStyle({ backgroundColor: "transparent" });
  fireEvent.mouseEnter(toggle);
  expect(section).toHaveStyle({ backgroundColor: "transparent" });
  expect(toggle).toHaveStyle({ minHeight: "32px", backgroundColor: "transparent" });
  fireEvent.click(toggle);
  fireEvent.mouseEnter(toggle);
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
  /* An Agent's outputs are added three ways; passing a value on is the plain one. */
  const addOutput = within(output).getByRole("button", { name: "+ Pass on an input", exact: true });
  expect(addOutput).toHaveTextContent("+ Pass on an input");
  expect(within(output).getByDisplayValue("answer").compareDocumentPosition(addOutput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(addOutput);
  const saved = changed.mock.calls.at(-1)[0];
  expect(saved.nodes[1].config.execution.inputs).toHaveLength(2);
  expect(saved.nodes[1].config.execution.outputs).toHaveLength(2);
  expect(saved.nodes[1].config.kernel).toEqual(seed.nodes[1].config.kernel);
});

test("prompt guidance sits beside its caption and edits nothing", async () => {
  const { changed } = await show();
  const help = screen.getByRole("button", { name: "Prompt · About", exact: true });
  expect(screen.getByTestId("process-header-prompt")).toContainElement(help);
  fireEvent.click(help);
  expect(await screen.findByTestId("kernel-prompt-references")).toHaveTextContent("{{#input.question#}}");
  expect(changed).not.toHaveBeenCalled();
});

test("model guidance belongs beside the model selector rather than floating above it", async () => {
  const { changed } = await show();
  const field = screen.getByTestId("kernel-model");
  const picker = within(field).getByRole("combobox");
  const help = within(field).getByRole("button", { name: "Model · About", exact: true });
  expect(picker).not.toContainElement(help);
  fireEvent.focus(help);
  expect(await screen.findByTestId("kernel-profile-facts")).toHaveTextContent("http://127.0.0.1:1");
  expect(changed).not.toHaveBeenCalled();
});

test("typing a node name suggests its outputs without changing the draft", async () => {
  const document = JSON.parse(JSON.stringify(seed));
  document.nodes[0].label = "Start";
  document.nodes[0].config.execution.outputs.push({ name: "files", source: { kind: "input", path: ["files"] } });
  document.nodes[1].config.execution.inputs[0] = {
    ...document.nodes[1].config.execution.inputs[0], missing: "default", default: "keep me",
  };
  const { changed, container } = await show({ document });
  const input = screen.getByRole("region", { name: "Input Variables", exact: true });
  fireEvent.click(within(input).getByRole("textbox", { name: "Start · message" }));
  expect(screen.queryByText("First of several")).not.toBeInTheDocument();
  const search = within(input).getByRole("textbox", { name: "Source" });
  fireEvent.change(search, { target: { value: "star" } });
  await waitFor(() => expect(screen.getAllByText("message", { exact: true, selector: "span" })
    .find((element) => !container.contains(element))).toBeVisible());
  expect(screen.getByText("files", { exact: true })).toBeVisible();
  expect(within(input).queryByText("files", { exact: true })).not.toBeInTheDocument();
  expect(changed).not.toHaveBeenCalled();
  fireEvent.keyDown(search, { key: "Escape" });
  expect(within(input).getByRole("textbox", { name: "Start · message" })).toBeVisible();
  expect(changed).not.toHaveBeenCalled();

  fireEvent.click(within(input).getByRole("textbox", { name: "Start · message" }));
  fireEvent.click(screen.getByText("files", { exact: true }));
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed.mock.calls[0][0].nodes[1].config.execution.inputs[0]).toEqual({
    name: "question", value: { kind: "ref", node_id: "start", path: ["files"] }, missing: "null",
  });
});

test.each(["enter", "blur"])("unselected text becomes a fixed value on %s", async (commit) => {
  const { changed } = await show();
  const input = screen.getByRole("region", { name: "Input Variables", exact: true });
  const field = within(input).getByRole("textbox", { name: "start · message" });
  fireEvent.click(field);
  fireEvent.change(field, { target: { value: "  fixed text  " } });
  expect(screen.queryByText("A fixed value")).not.toBeInTheDocument();
  expect(changed).not.toHaveBeenCalled();
  if (commit === "enter") fireEvent.keyDown(field, { key: "Enter" });
  else fireEvent.blur(field);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed.mock.calls[0][0].nodes[1].config.execution.inputs[0]).toEqual({
    name: "question", value: { kind: "literal", value: "  fixed text  " }, missing: "null",
  });
});

test.each([false, true])("Enter only picks a suggestion after keyboard selection (select=%s)", async (select) => {
  const { changed } = await show();
  const input = screen.getByRole("region", { name: "Input Variables", exact: true });
  const field = within(input).getByRole("textbox", { name: "start · message" });
  fireEvent.click(field);
  fireEvent.change(field, { target: { value: "star" } });
  if (select) fireEvent.keyDown(field, { key: "ArrowDown" });
  fireEvent.keyDown(field, { key: "Enter" });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed.mock.calls[0][0].nodes[1].config.execution.inputs[0].value).toEqual(select
    ? { kind: "ref", node_id: "start", path: ["message"] }
    : { kind: "literal", value: "star" });
});

test("new Process inputs use null for missing values and have no policy selector", async () => {
  const { changed } = await show();
  const input = screen.getByRole("region", { name: "Input Variables", exact: true });
  fireEvent.click(within(input).getByRole("button", { name: "+ Add input", exact: true }));
  const rows = changed.mock.calls[0][0].nodes[1].config.execution.inputs;
  expect(rows[0]).toEqual(seed.nodes[1].config.execution.inputs[0]);
  expect(rows[1].missing).toBe("null");
  expect(within(input).queryByText(/If missing/i)).not.toBeInTheDocument();
});

test("only the words and the arrow fold a part; the rest of its row is safe to click", async () => {
  await show();
  const header = screen.getByTestId("process-header-input");
  const toggle = screen.getByTestId("process-toggle-input");
  expect(toggle.style.position).not.toBe("absolute");
  expect(toggle.style.width).toBe("");
  fireEvent.click(header);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("the Prompt caption says how long the prompt is, and keeps up with typing", async () => {
  await show();
  const aside = screen.getByTestId("process-aside-prompt");
  expect(aside).toHaveTextContent(`${"Read {{#input.question#}}.".length} characters`);
  const box = within(screen.getByRole("region", { name: "Prompt", exact: true })).getByRole("textbox");
  fireEvent.change(box, { target: { value: "你好🙂" } });
  expect(aside).toHaveTextContent("3 characters");
});

test("Ask the agent for…: a named, typed, described output the agent produces", async () => {
  const { changed } = await show();
  fireEvent.click(screen.getByRole("button", { name: "Output Variables", exact: true }));
  const output = screen.getByRole("region", { name: "Output Variables", exact: true });
  expect(screen.queryByTestId("agent-ask-json-note")).toBeNull();
  fireEvent.click(within(output).getByRole("button", { name: "+ Ask the agent for…", exact: true }));
  const row = within(screen.getByTestId("ask-output-1"));
  fireEvent.change(row.getByLabelText("name"), { target: { value: "summary" } });
  fireEvent.change(row.getByLabelText("What the agent should produce"), { target: { value: "One sentence about the question" } });
  fireEvent.change(row.getByLabelText("Choose value"), { target: { value: "list" } });
  const saved = changed.mock.calls.at(-1)[0].nodes[1].config;
  expect(saved.kernel.json_schema).toEqual({
    type: "object",
    properties: { summary: { type: "array", description: "One sentence about the question", items: { type: "string" } } },
    required: ["summary"],
    additionalProperties: false,
  });
  expect(saved.execution.outputs).toEqual([
    { name: "answer", source: { kind: "result", path: ["message"] } },
    { name: "summary", source: { kind: "result", path: ["summary"] } },
  ]);
  expect(screen.getByTestId("agent-ask-json-note")).toHaveTextContent("JSON object");
  /* The schema itself waits under Advanced. */
  expect(screen.getByTestId("agent-output-advanced-toggle")).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(row.getByRole("button", { name: "Remove summary" }));
  const after = changed.mock.calls.at(-1)[0].nodes[1].config;
  expect(after.kernel.json_schema).toBeNull();
  expect(after.execution.outputs).toEqual([{ name: "answer", source: { kind: "result", path: ["message"] } }]);
});

test("a model that cannot answer in a structure cannot be asked, and says why", async () => {
  const noJson = JSON.parse(JSON.stringify(seed));
  noJson.nodes[1].config.kernel.profile.capabilities.json_schema = false;
  await show({ document: noJson });
  fireEvent.click(screen.getByRole("button", { name: "Output Variables", exact: true }));
  expect(screen.getByRole("button", { name: "+ Ask the agent for…", exact: true })).toBeDisabled();
  expect(screen.getByTestId("agent-ask-unavailable")).toHaveTextContent("cannot answer in a fixed structure");
});
