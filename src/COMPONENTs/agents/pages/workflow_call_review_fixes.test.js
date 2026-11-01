import React, { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { api } from "../../../SERVICEs/api";
import SkeletonResourcePage from "./skeleton_resource_page";
import WorkflowCallSection from "./recipes_page/detail_panel/workflow_call_section";
import { pressCanvasNode } from "./recipes_page/skeleton_canvas_test_helpers";
import { forget_workflow_versions, remember_workflow_version, request_workflow_version, workflow_version_state } from "./recipes_page/workflow_versions";
import { admit_version_aggregate } from "./recipes_page/managed_code_sources";
import { publish_workflow, read_workflow_version } from "./recipes_page/skeleton_resources";
import { subscribeSkeletonLibraryRefresh } from "../../../SERVICEs/skeleton_library_refresh";
import capture from "./recipes_page/workflow_call_review_capture.json";

/* R-WFC-01…05 (independent review of 775859b3). Every store answer is the
 * real producer's (workflow_call_review_capture.json: a published Workflow
 * whose Start reads the whole input, a caller with a duplicated input, a
 * caller passing an unlisted key to it). The section is driven through its
 * real controls; R-WFC-04 on the real page. */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const copy = (value) => JSON.parse(JSON.stringify(value));
const row = (name) => copy(capture.rows.find((item) => item.case === name));
const REV = capture.rev_whole;
const call = (document) => document.nodes.find((node) => node.id === "call");
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
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
const chooseWhole = async () => {
  const picker = screen.getByTestId("workflow-call-picker");
  await waitFor(() => expect(within(picker).getByRole("combobox")).not.toBeDisabled());
  fireEvent.click(within(picker).getByRole("combobox"));
  const lists = screen.getAllByRole("listbox", { hidden: true });
  fireEvent.click(within(lists.at(-1)).getByText("Whole · 1 published", { exact: true }));
};
const unpinned = () => {
  const document = row("caller_whole_get").reply.resource.document;
  delete call(document).config.workflow;
  return document;
};

beforeEach(() => {
  writes = [];
  forget_workflow_versions();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue(row("list_active").reply);
  api.unchain.getManagedSkeletonResource = jest.fn(async (id) => {
    const found = capture.rows.find((item) => item.reply && item.reply.resource && item.reply.resource.id === id && /_get$|_create$/.test(item.case));
    return copy(found.reply);
  });
  api.unchain.getManagedSkeletonWorkflowVersion = jest.fn().mockResolvedValue(row("whole_publish").reply);
  api.unchain.publishManagedSkeletonWorkflow = jest.fn().mockResolvedValue(row("whole_publish").reply);
});

describe("R-WFC-01: readers of one revision share one read", () => {
  test("two concurrent requests both settle with the admitted revision, from one read", async () => {
    const late = deferred();
    api.unchain.getManagedSkeletonWorkflowVersion.mockImplementation(() => late.promise);
    const first = request_workflow_version("wf-whole", REV);
    const second = request_workflow_version("wf-whole", REV);
    late.resolve(row("whole_publish").reply);
    const [a, b] = await Promise.all([first, second]);
    expect([a.status, b.status]).toEqual(["ready", "ready"]);
    expect(api.unchain.getManagedSkeletonWorkflowVersion).toHaveBeenCalledTimes(1);
  });

  test("Pin waits for the read another reader already started, then pins", async () => {
    const late = deferred();
    api.unchain.getManagedSkeletonWorkflowVersion.mockImplementation(() => late.promise);
    const canvas = request_workflow_version("wf-whole", REV);
    render(<Harness initial={unpinned()} />);
    await chooseWhole();
    fireEvent.change(screen.getByPlaceholderText("or a revision id, e.g. rev-2-…"), { target: { value: REV } });
    fireEvent.click(screen.getByRole("button", { name: "Pin this revision" }));
    await act(async () => {
      late.resolve(row("whole_publish").reply);
      await canvas;
    });
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(call(writes[0]).config.workflow).toEqual({ workflow_id: "wf-whole", revision_id: REV });
    expect(screen.getByTestId("workflow-call-pin-state")).toHaveTextContent("Pinned revision 1.");
    expect(workflow_version_state("wf-whole", REV).status).toBe("ready");
  });
});

describe("R-WFC-02: every stored input occurrence is drawn and repairable", () => {
  test("the second `message` row is shown with its value, said to be a duplicate, and can be removed", async () => {
    remember_workflow_version(admit_version_aggregate(row("whole_publish").reply).version);
    expect(row("caller_duplicate_preflight").refusal).toMatchObject({ code: "duplicate_name", path: ["document", "nodes", 2, "config", "execution", "inputs", 1, "name"] });
    render(<Harness initial={row("caller_duplicate_get").reply.resource.document} />);
    const area = screen.getByTestId("workflow-call-inputs");
    expect(area).toHaveTextContent("second survives");
    const duplicate = screen.getByTestId("workflow-call-extra-1");
    expect(duplicate).toHaveTextContent("message");
    expect(duplicate).toHaveTextContent(/another row already passes it/i);
    fireEvent.click(within(duplicate).getByRole("button", { name: "Remove stored input message" }));
    expect(call(latest).config.execution.inputs).toEqual([row("caller_duplicate_get").reply.resource.document.nodes[2].config.execution.inputs[0]]);
  });
});

describe("R-WFC-03: a Start that reads the whole input reads every key", () => {
  test("the run agrees: an unlisted key arrives", () => {
    expect(row("run_whole").reply.outputs).toEqual({ answer: { message: "m", unlisted: 23 } });
    expect(row("caller_whole_preflight").reply.preflight.ok).toBe(true);
  });

  test("an unlisted stored key is an editable row, never called ignored, and more can be added", async () => {
    remember_workflow_version(admit_version_aggregate(row("whole_publish").reply).version);
    render(<Harness initial={row("caller_whole_get").reply.resource.document} />);
    const area = screen.getByTestId("workflow-call-inputs");
    expect(area).not.toHaveTextContent(/ignores it/i);
    const unlisted = screen.getByTestId("tool-call-argument-unlisted");
    expect(unlisted).toHaveTextContent(/whole input/i);
    fireEvent.click(within(unlisted).getByText("Value"));
    fireEvent.change(within(screen.getByTestId("tool-call-argument-unlisted")).getByPlaceholderText("a value written here"), { target: { value: "24" } });
    expect(call(latest).config.execution.inputs.find((item) => item.name === "unlisted").value).toEqual({ kind: "literal", value: "24" });

    fireEvent.change(screen.getByPlaceholderText("another input name"), { target: { value: "extra" } });
    fireEvent.click(screen.getByRole("button", { name: "Add input" }));
    const added = screen.getByTestId("tool-call-argument-extra");
    fireEvent.click(within(added).getByText("Value"));
    fireEvent.change(within(screen.getByTestId("tool-call-argument-extra")).getByPlaceholderText("a value written here"), { target: { value: "x" } });
    expect(call(latest).config.execution.inputs.map((item) => item.name)).toEqual(["message", "unlisted", "extra"]);
    expect(screen.queryByTestId("workflow-call-problems")).toBeNull();
  });

  test("a name already passed cannot be added twice", async () => {
    remember_workflow_version(admit_version_aggregate(row("whole_publish").reply).version);
    render(<Harness initial={row("caller_whole_get").reply.resource.document} />);
    fireEvent.change(screen.getByPlaceholderText("another input name"), { target: { value: "unlisted" } });
    expect(screen.getByRole("button", { name: "Add input" })).toBeDisabled();
  });
});

describe("R-WFC-03a: a new input keeps its editor across its first write", () => {
  const typeFirst = async (row_testid) => {
    fireEvent.click(within(screen.getByTestId(row_testid)).getByText("Value"));
    const before = within(screen.getByTestId(row_testid)).getByPlaceholderText("a value written here");
    await act(async () => { before.focus(); });
    fireEvent.change(before, { target: { value: "h" } });
    return before;
  };

  test("in the section: the same text box, still focused, keeps taking keystrokes; nothing is saved", async () => {
    remember_workflow_version(admit_version_aggregate(row("whole_publish").reply).version);
    render(<Harness initial={row("caller_whole_get").reply.resource.document} />);
    fireEvent.change(screen.getByPlaceholderText("another input name"), { target: { value: "extra" } });
    fireEvent.click(screen.getByRole("button", { name: "Add input" }));
    expect(writes).toHaveLength(0);
    const before = await typeFirst("tool-call-argument-extra");
    const after = within(screen.getByTestId("tool-call-argument-extra")).getByPlaceholderText("a value written here");
    expect(after).toBe(before);
    expect(before.isConnected).toBe(true);
    expect(after).toHaveFocus();
    expect(call(latest).config.execution.inputs.find((item) => item.name === "extra").value).toEqual({ kind: "literal", value: "h" });
    fireEvent.change(after, { target: { value: "he" } });
    fireEvent.change(after, { target: { value: "hello" } });
    expect(within(screen.getByTestId("tool-call-argument-extra")).getByPlaceholderText("a value written here")).toBe(before);
    expect(after).toHaveFocus();
    expect(after.value).toBe("hello");
    expect(after.selectionStart).toBe(5);
    expect(call(latest).config.execution.inputs.find((item) => item.name === "extra").value).toEqual({ kind: "literal", value: "hello" });
    /* Unset still removes it; the stored row and its diagnostics path are unchanged. */
    fireEvent.click(screen.getByRole("button", { name: "Unset extra" }));
    expect(call(latest).config.execution.inputs.map((item) => item.name)).toEqual(["message", "unlisted"]);
  });

  test("on the real page: the same focused text box, no Save", async () => {
    const aggregate = row("caller_whole_get").reply;
    api.unchain.saveManagedSkeletonResource = jest.fn();
    api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [], unavailable: [] });
    api.unchain.listSkeletonPythonProfiles = jest.fn().mockResolvedValue({ profiles: [] });
    render(<ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage resourceId={aggregate.resource.id} /></ConfigContext.Provider>);
    await screen.findByTestId("skeleton-node-start");
    pressCanvasNode("call");
    await screen.findByTestId("workflow-call-section");
    await waitFor(() => expect(within(screen.getByTestId("workflow-call-picker")).getByRole("combobox")).not.toBeDisabled());
    await screen.findByPlaceholderText("another input name");
    fireEvent.change(screen.getByPlaceholderText("another input name"), { target: { value: "extra" } });
    fireEvent.click(screen.getByRole("button", { name: "Add input" }));
    const before = await typeFirst("tool-call-argument-extra");
    const after = within(screen.getByTestId("tool-call-argument-extra")).getByPlaceholderText("a value written here");
    expect(after).toBe(before);
    expect(after).toHaveFocus();
    fireEvent.change(after, { target: { value: "hi" } });
    expect(after.value).toBe("hi");
    expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent("Unsaved changes");
    expect(api.unchain.saveManagedSkeletonResource).not.toHaveBeenCalled();
  });
});

describe("R-WFC-04: the store's diagnostics land on a drawn row", () => {
  test("the real page shows the real store's duplicate-name diagnostic on the second row", async () => {
    const aggregate = row("caller_duplicate_get").reply;
    expect(aggregate.resource.diagnostics.map((item) => item.message)).toEqual(["binding name is duplicated"]);
    api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [], unavailable: [] });
    api.unchain.listSkeletonPythonProfiles = jest.fn().mockResolvedValue({ profiles: [] });
    render(<ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage resourceId={aggregate.resource.id} /></ConfigContext.Provider>);
    await screen.findByTestId("skeleton-node-start");
    pressCanvasNode("call");
    await screen.findByTestId("workflow-call-section");
    await screen.findByTestId("workflow-call-extra-1");
    expect(within(screen.getByTestId("workflow-call-extra-1")).getByText("binding name is duplicated")).toBeInTheDocument();
  });
});

describe("R-WFC-05: a revision answer must be about what was asked", () => {
  test("a publication answering for another Workflow is refused before it is announced, kept or pinned", async () => {
    const announced = [];
    const off = subscribeSkeletonLibraryRefresh((payload) => announced.push(payload));
    api.unchain.publishManagedSkeletonWorkflow.mockResolvedValue(row("other_publish").reply);
    const result = await publish_workflow("wf-whole", "edit-1-x");
    off();
    expect(result).toMatchObject({ ok: false, reason: "refused", error: { code: "identity_mismatch" } });
    expect(announced).toEqual([]);
  });

  test("a version read answering with another revision is refused at the adapter", async () => {
    api.unchain.getManagedSkeletonWorkflowVersion.mockResolvedValue(row("other_publish").reply);
    expect(await read_workflow_version("wf-whole", REV)).toMatchObject({ ok: false, error: { code: "identity_mismatch" } });
  });

  test("through the real controls, nothing is pinned and the author is told", async () => {
    api.unchain.publishManagedSkeletonWorkflow.mockResolvedValue(row("other_publish").reply);
    render(<Harness initial={unpinned()} />);
    await chooseWhole();
    fireEvent.click(screen.getByRole("button", { name: "Publish its current draft and pin it" }));
    await screen.findByText(/Nothing was pinned/);
    expect(writes).toHaveLength(0);
    expect(workflow_version_state("wf-other", row("other_publish").reply.version.revision_id)).toBeNull();
  });

  test("control: the same-identity publication pins exactly that reference", async () => {
    render(<Harness initial={unpinned()} />);
    await chooseWhole();
    fireEvent.click(screen.getByRole("button", { name: "Publish its current draft and pin it" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(call(writes[0]).config.workflow).toEqual({ workflow_id: "wf-whole", revision_id: REV });
  });
});
