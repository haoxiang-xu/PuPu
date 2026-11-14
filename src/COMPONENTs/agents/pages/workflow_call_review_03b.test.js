import React, { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { api } from "../../../SERVICEs/api";
import WorkflowCallSection from "./recipes_page/detail_panel/workflow_call_section";
import { forget_workflow_versions, remember_workflow_version } from "./recipes_page/workflow_versions";
import { admit_version_aggregate } from "./recipes_page/managed_code_sources";
import review from "./recipes_page/workflow_call_review_capture.json";
import capture03 from "./recipes_page/workflow_call_review_capture_03.json";

/* R-WFC-03b: an input added in the panel belongs to exactly one row once it
 * is stored. Switching the pinned revision — to one whose Start reads the
 * whole input AND names `extra`, and back — must never draw a second, empty
 * editor for the same stored input, and must not delete, normalize or save
 * anything to avoid it. Every revision and caller is the real producer's
 * (workflow_call_review_capture.json, workflow_call_review_capture_03.json). */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const copy = (value) => JSON.parse(JSON.stringify(value));
const of = (data, name) => copy(data.rows.find((item) => item.case === name));
const WHOLE = review.rev_whole;
const WHOLE_EXTRA = capture03.rev_whole_extra;
const call = (document) => document.nodes.find((node) => node.id === "call");
const inputs = (document) => call(document).config.execution.inputs;
let writes;
let latest;
function Harness({ initial }) {
  const [document, setDocument] = useState(initial);
  latest = document;
  return (
    <ConfigContext.Provider value={{ theme: {} }}>
      <WorkflowCallSection document={document} node={call(document)} isDark={false} onChange={(next) => { writes.push(next); setDocument(next); }} />
    </ConfigContext.Provider>
  );
}
const ready = async () => waitFor(() => expect(within(screen.getByTestId("workflow-call-picker")).getByRole("combobox")).not.toBeDisabled());
const choose = (label) => {
  fireEvent.click(within(screen.getByTestId("workflow-call-picker")).getByRole("combobox"));
  const lists = screen.getAllByRole("listbox", { hidden: true });
  fireEvent.click(within(lists.at(-1)).getByText(label, { exact: true }));
};
const pin = async (label, revision) => {
  choose(label);
  fireEvent.change(screen.getByPlaceholderText("or a revision id, e.g. rev-2-…"), { target: { value: revision } });
  fireEvent.click(screen.getByRole("button", { name: "Pin this revision" }));
  await waitFor(() => expect(call(latest).config.workflow.revision_id).toBe(revision));
};
const add = (name) => {
  fireEvent.change(screen.getByPlaceholderText("another input name"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "Add input" }));
};
/* A value is written when it is entered; the cell keeps its focus. */
const box = (name) => within(screen.getByTestId(`workflow-call-input-${name}-value`)).getByRole("textbox");
const type = async (name, text) => {
  const cell = box(name);
  await act(async () => { cell.focus(); });
  fireEvent.change(cell, { target: { value: text } });
  fireEvent.keyDown(cell, { key: "Enter" });
  return cell;
};
const editors = (name) => screen.queryAllByTestId(`workflow-call-input-${name}`);
const valueOf = (name) => within(editors(name)[0]).getByRole("textbox");

beforeEach(() => {
  writes = [];
  forget_workflow_versions();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue([...of(review, "list_active").reply, ...of(capture03, "list_active").reply]);
  api.unchain.getManagedSkeletonWorkflowVersion = jest.fn(async (id, revision) => {
    if (id === "wf-whole" && revision === WHOLE) return of(review, "whole_publish").reply;
    if (id === "wf-whole-extra" && revision === WHOLE_EXTRA) return of(capture03, "whole_extra_publish").reply;
    throw Object.assign(new Error("Workflow version was not found."), { code: "resource_missing", path: ["revision_id"], status: 404 });
  });
  remember_workflow_version(admit_version_aggregate(of(review, "whole_publish").reply).version);
});

test("the real producer: the revision reads the whole input and names extra; the stored caller passes and runs", () => {
  expect(of(capture03, "caller_preflight").reply.ok).toBe(true);
  expect(of(capture03, "run").reply.outputs).toEqual({ answer: { message: "m", unlisted: 23, extra: "hello" }, named: "hello" });
});

test("added and written, then pinned to a revision that names it: one editor, showing the stored value; nothing deleted or saved", async () => {
  render(<Harness initial={of(review, "caller_whole_get").reply.resource.document} />);
  await ready();
  add("extra");
  const cell = await type("extra", "hello");
  expect(box("extra")).toBe(cell);
  expect(cell).toHaveFocus();
  const stored = copy(inputs(latest));
  await pin("Whole and extra · 1 published", WHOLE_EXTRA);
  expect(editors("extra")).toHaveLength(1);
  expect(valueOf("extra")).toHaveValue("hello");
  expect(screen.queryByTestId("workflow-call-added-extra")).toBeNull();
  /* The stored rows are exactly what they were: the pin changed, nothing else. */
  expect(inputs(latest)).toEqual(stored);
  expect(call(latest).config.workflow).toEqual({ workflow_id: "wf-whole-extra", revision_id: WHOLE_EXTRA });

  /* And back: one editor again, still the stored value. */
  await pin("Whole · 1 published", WHOLE);
  expect(editors("extra")).toHaveLength(1);
  expect(valueOf("extra")).toHaveValue("hello");
  expect(inputs(latest)).toEqual(stored);
});

test("added but not written, then pinned to a revision that names it: one (empty) editor — the revision's own row", async () => {
  render(<Harness initial={of(review, "caller_whole_get").reply.resource.document} />);
  await ready();
  add("extra");
  expect(editors("extra")).toHaveLength(1);
  await pin("Whole and extra · 1 published", WHOLE_EXTRA);
  expect(editors("extra")).toHaveLength(1);
  expect(screen.queryByTestId("workflow-call-added-extra")).toBeNull();
  expect(inputs(latest).map((item) => item.name)).toEqual(["message", "unlisted"]);
  await type("extra", "typed after the pin");
  expect(inputs(latest).find((item) => item.name === "extra").value).toEqual({ kind: "literal", value: "typed after the pin" });
});

test("Unset removes the stored row and forgets it; a later pin does not bring an editor back twice, and it can be added again", async () => {
  render(<Harness initial={of(review, "caller_whole_get").reply.resource.document} />);
  await ready();
  add("extra");
  await type("extra", "hello");
  fireEvent.focus(box("extra"));
  fireEvent.click(screen.getByText("Unset", { exact: true }));
  expect(inputs(latest).map((item) => item.name)).toEqual(["message", "unlisted"]);
  expect(editors("extra")).toHaveLength(0);
  await pin("Whole and extra · 1 published", WHOLE_EXTRA);
  expect(editors("extra")).toHaveLength(1);
  expect(valueOf("extra")).toHaveValue("");
  await pin("Whole · 1 published", WHOLE);
  expect(editors("extra")).toHaveLength(0);
  add("extra");
  const cell = await type("extra", "again");
  fireEvent.change(cell, { target: { value: "again!" } });
  expect(box("extra")).toBe(cell);
  expect(cell).toHaveFocus();
  expect(editors("extra")).toHaveLength(1);
});

test("a stored duplicate is still shown once as a duplicate with its Remove, beside the revision's row", async () => {
  const document = of(capture03, "caller_get").reply.resource.document;
  inputs(document).push({ name: "extra", value: { kind: "literal", value: "second" }, missing: "error" });
  remember_workflow_version(admit_version_aggregate(of(capture03, "whole_extra_publish").reply).version);
  render(<Harness initial={document} />);
  expect(editors("extra")).toHaveLength(1);
  const duplicate = screen.getByTestId("workflow-call-extra-3");
  expect(duplicate).toHaveTextContent("second");
  fireEvent.click(within(duplicate).getByRole("button", { name: "Remove stored input extra" }));
  expect(inputs(latest).map((item) => item.name)).toEqual(["message", "unlisted", "extra"]);
  expect(editors("extra")).toHaveLength(1);
});
