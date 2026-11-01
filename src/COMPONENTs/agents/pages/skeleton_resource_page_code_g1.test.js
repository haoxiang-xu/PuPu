/* eslint-disable testing-library/no-node-access -- the code block and viewer are read off the real shared editor. */
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import { api } from "../../../SERVICEs/api";
import capture from "./recipes_page/managed_code_capture.json";
import codeCapture from "./recipes_page/code_capture.json";
import { code_node_at, managed_path, sha256_text } from "./recipes_page/managed_code_sources";
import { openAddNode, pressCanvasNode } from "./recipes_page/skeleton_canvas_test_helpers";

/* #357 G1 on the real page: SkeletonResourcePage, FlowEditor, DetailPanel,
 * the panel's text box, the node's preview and viewer, drilling into an
 * embedded and a referenced subagent. Only the renderer facade is replaced,
 * and only its v2 methods exist: there is no graph-only method to fall back
 * to. Every resource opens from the real producer's reply
 * (managed_code_capture.json). A Save is answered by a strict in-test store
 * that projects the edit the way the host does; whether the real store and
 * the real sidecar accept the exact Save requests written here is proved by
 * replaying them (code-g1-ui-01/tools/replay_g1_*), with G1_PAYLOAD_DIR set. */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const fs = require("fs");
const copy = (value) => JSON.parse(JSON.stringify(value));
const captured = (name) => copy(capture.rows.find((item) => item.case === name).reply);
const refusal = (name) => {
  const { code, path, message, status } = capture.rows.find((item) => item.case === name).refusal;
  return Object.assign(new Error(message), { code, path, status });
};
const profile = require("./recipes_page/skeleton_native_embedded_capture.json").rows[1].document.nodes[1].config.kernel.profile;
const CHILD = ["nodes", 5, "config", "subagents", 0, "source", "document", "nodes", 1];
const T = capture.texts;
const exported = [];
const exportPayload = (name, base, payload) => {
  exported.push(name);
  if (process.env.G1_PAYLOAD_DIR) {
    fs.writeFileSync(`${process.env.G1_PAYLOAD_DIR}/${name}.json`, JSON.stringify({ base, edit: payload }, null, 2) + "\n");
  }
};

/* A strict stand-in for the store, enough to answer a Save the way the host
   projects one: closed v2 edit, compare-and-set, each bound node's source
   rewritten to the generated path of its text, manifest in canonical order,
   bodies de-duplicated and sorted. It is not evidence about the host — the
   replay is — but it refuses anything the host would. */
function rank(a, b) {
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const ta = typeof a[index] === "string" ? 0 : 1;
    const tb = typeof b[index] === "string" ? 0 : 1;
    if (ta !== tb) return ta - tb;
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return a.length - b.length;
}
function makeStore(names) {
  const held = Object.create(null);
  names.forEach((name) => {
    const reply = captured(name);
    held[reply.resource.id] = reply;
  });
  let revision = 10;
  const store = {
    held,
    get: jest.fn(async (id) => {
      if (!held[id]) throw Object.assign(new Error("Skeleton resource was not found."), { code: "resource_missing", path: ["resource_id"], status: 404 });
      return copy(held[id]);
    }),
    save: jest.fn(async (edit) => {
      expect(Object.keys(edit).sort()).toEqual(["document", "expected_edit_token", "managed_sources", "schema"]);
      expect(edit.schema).toBe("pupu.skeleton-edit.v2");
      const id = edit.document.id;
      const current = held[id] ? held[id].resource.edit_token : null;
      if (edit.expected_edit_token !== current) throw refusal("root_stale_token");
      const document = copy(edit.document);
      const entries = [];
      const bodies = Object.create(null);
      edit.managed_sources.forEach((item) => {
        expect(Object.keys(item).sort()).toEqual(["node_path", "text"]);
        const node = code_node_at(document, item.node_path);
        expect(node).not.toBeNull();
        const sha = sha256_text(item.text);
        node.config.code = { ...(node.config.code || {}), source: { kind: "file", path: managed_path(sha) } };
        entries.push({ node_path: item.node_path, sha256: sha });
        bodies[sha] = item.text;
      });
      entries.sort((a, b) => rank(a.node_path, b.node_path));
      revision += 1;
      const before = held[id] ? held[id].resource : { kind: "agent", name: document.name, description: "", archived: false, draft_digest: "d".repeat(64), source_identity: null };
      held[id] = {
        schema: "pupu.skeleton-resource.v2",
        resource: { ...before, id, name: document.name, document, edit_token: `edit-${revision}-test`, diagnostics: [] },
        sources_manifest: { schema: "pupu.skeleton-code-sources.v1", entries },
        contents: Object.keys(bodies).sort().map((sha) => ({ sha256: sha, text: bodies[sha] })),
        content_digest: "a".repeat(64),
      };
      return copy(held[id]);
    }),
  };
  api.unchain.getManagedSkeletonResource = store.get;
  api.unchain.saveManagedSkeletonResource = store.save;
  return store;
}

let view;
async function open(id) {
  view = render(<ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage resourceId={id} /></ConfigContext.Provider>);
  await screen.findByTestId("skeleton-node-start");
}
const textBox = (node_id) => screen.getByRole("textbox", { name: `Code of ${node_id}` });
const openNode = async (id) => {
  pressCanvasNode(id);
  await screen.findByTestId("code-section");
};
const type = (node_id, text) => fireEvent.change(textBox(node_id), { target: { value: text } });
const save = async (store) => {
  const before = store.save.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(store.save.mock.calls.length).toBe(before + 1));
  await waitFor(() => expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/));
  return store.save.mock.calls.at(-1)[0];
};
const rowsOf = (edit) => edit.managed_sources.map((item) => JSON.stringify(item)).sort();
const rows = (...pairs) => pairs.map(([node_path, text]) => JSON.stringify({ node_path, text })).sort();
const openRow = (pool, index) => fireEvent.doubleClick(within(screen.getByTestId(`skeleton-node-${pool}`)).getByTestId(`pool-node-row-${index}`));
const up = () => fireEvent.keyDown(window.document, { key: "Escape" });

beforeEach(() => {
  localStorage.clear();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [] });
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [profile], unavailable: [] });
  api.unchain.listSkeletonPythonProfiles = jest.fn().mockResolvedValue({ profiles: codeCapture.profiles.list_after });
});

const NEW_ROOT = "def main(input, context):\n\tvalue = input.get(\"x\")   \n    return {\"message\": \"naïve — 你好 \u{1F680}\"}";

test("write the code, see it on the node and in the viewer, Save it through v2, reopen it byte for byte", async () => {
  const store = makeStore(["root_get"]);
  await open("g1-root");
  await openNode("score");
  expect(textBox("score")).toHaveValue(T.root);
  const block = screen.getByTestId("code-node-score-block");
  expect(block).toHaveTextContent("def main(input, context):");

  type("score", NEW_ROOT);
  expect(textBox("score")).toHaveValue(NEW_ROOT);
  expect(screen.getByTestId("code-node-score-block")).toHaveTextContent("value = input.get(\"x\")");
  expect(screen.getByTestId("code-node-score-block")).toHaveTextContent("3 lines");
  fireEvent.mouseEnter(screen.getByTestId("code-node-score"));
  fireEvent.click(screen.getByRole("button", { name: "View the code of score" }));
  const viewer = await screen.findByTestId("code-node-score-viewer");
  expect(viewer).toHaveTextContent("Read-only · 3 lines");
  expect(viewer.textContent).toContain("naïve — 你好 \u{1F680}");

  const edit = await save(store);
  expect(edit.expected_edit_token).toBe("edit-1-445cb3d55fd3de7ba89a707a");
  expect(edit.managed_sources).toEqual([{ node_path: ["nodes", 1], text: NEW_ROOT }]);
  expect(edit.document.nodes[1].config.code.source).toEqual({ kind: "file", path: managed_path(sha256_text(NEW_ROOT)) });
  exportPayload("root-edit", "root_get", edit);

  view.unmount();
  await open("g1-root");
  await openNode("score");
  expect(textBox("score").value).toBe(NEW_ROOT);
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent(/^Saved$/);
});

test("an embedded child's code belongs to the parent: edit both, Save once, every sibling's text goes with it", async () => {
  const store = makeStore(["nested_get"]);
  await open("g1-nested");
  await openNode("first");
  expect(textBox("first")).toHaveValue(T.shared);
  type("first", "def main(input, context):\n    return {\"message\": \"first, changed\"}\n");

  openRow("pool", 0);
  await screen.findByTestId("skeleton-node-child_code");
  await openNode("child_code");
  expect(textBox("child_code")).toHaveValue(T.child);
  type("child_code", T.child + "# edited inside the child\n");
  up();
  await screen.findByTestId("skeleton-node-second");

  const edit = await save(store);
  expect(edit.document.id).toBe("g1-nested");
  expect(rowsOf(edit)).toEqual(rows(
    [["nodes", 1], "def main(input, context):\n    return {\"message\": \"first, changed\"}\n"],
    [["nodes", 3], T.shared],
    [CHILD, T.child + "# edited inside the child\n"],
  ));
  exportPayload("nested-edit", "nested_get", edit);

  view.unmount();
  await open("g1-nested");
  await openNode("second");
  expect(textBox("second").value).toBe(T.shared);
  openRow("pool", 0);
  await openNode("child_code");
  expect(textBox("child_code").value).toBe(T.child + "# edited inside the child\n");
});

test("deleting a Code node drops its text and moves the rest to where the nodes now are", async () => {
  const store = makeStore(["nested_get"]);
  await open("g1-nested");
  pressCanvasNode("first");
  await screen.findByTestId("code-section");
  fireEvent.keyDown(window, { code: "Delete", key: "Delete" });
  await waitFor(() => expect(screen.queryByTestId("skeleton-node-first")).toBeNull());
  const edit = await save(store);
  expect(edit.document.nodes.map((node) => node.id)).toEqual(["start", "agent", "second", "end", "pool"]);
  expect(rowsOf(edit)).toEqual(rows(
    [["nodes", 2], T.shared],
    [["nodes", 4, "config", "subagents", 0, "source", "document", "nodes", 1], T.child],
  ));
  exportPayload("nested-delete", "nested_get", edit);
});

test("a referenced Agent is its own resource: its code is saved with it, and the parent is not written", async () => {
  const store = makeStore(["nested_get", "ref_get"]);
  await open("g1-nested");
  openRow("pool", 1);
  await screen.findByTestId("skeleton-node-ref_code");
  expect(store.get).toHaveBeenLastCalledWith("g1-ref");
  await openNode("ref_code");
  expect(textBox("ref_code")).toHaveValue(T.ref);
  type("ref_code", T.ref + "# shared definition changed\n");
  const edit = await save(store);
  expect(edit.document.id).toBe("g1-ref");
  expect(edit.expected_edit_token).toBe("edit-1-955dcc731a4858f0f0b29659");
  expect(edit.managed_sources).toEqual([{ node_path: ["nodes", 1], text: T.ref + "# shared definition changed\n" }]);
  expect(store.save).toHaveBeenCalledTimes(1);
  exportPayload("ref-edit", "ref_get", edit);

  up();
  await screen.findByTestId("skeleton-node-first");
  await openNode("first");
  expect(textBox("first")).toHaveValue(T.shared);
  expect(store.held["g1-nested"].resource.edit_token).toBe("edit-1-ef223876e8d12447cef20e90");
});

test("code with carriage returns is shown as stored, not edited, and a Save for another setting keeps its bytes", async () => {
  const store = makeStore(["crlf_get"]);
  await open("g1-crlf");
  await openNode("crlf_code");
  expect(textBox("crlf_code")).toBeDisabled();
  expect(screen.getByTestId("code-text-crlf")).toBeInTheDocument();
  fireEvent.change(within(screen.getByTestId("code-limits")).getByPlaceholderText("seconds"), { target: { value: "9" } });
  const edit = await save(store);
  expect(edit.managed_sources).toEqual([{ node_path: ["nodes", 1], text: T.crlf }]);
  expect(edit.document.nodes[1].config.code.timeout_ms).toBe(9000);
  exportPayload("crlf-limit", "crlf_get", edit);
});

test("choosing a workspace file replaces the written code explicitly; the Save binds nothing for that node", async () => {
  const store = makeStore(["root_get"]);
  await open("g1-root");
  await openNode("score");
  fireEvent.click(within(screen.getByTestId("code-source")).getByText("Use a workspace file"));
  expect(screen.getByTestId("code-file-replaces")).toBeInTheDocument();
  /* The reserved space is not a workspace file. */
  fireEvent.change(within(screen.getByTestId("code-source")).getByPlaceholderText("tools/score.py"), { target: { value: managed_path("a".repeat(64)) } });
  expect(screen.getByTestId("code-source-problem")).toHaveTextContent("__pupu_code__");
  fireEvent.change(within(screen.getByTestId("code-source")).getByPlaceholderText("tools/score.py"), { target: { value: "tools/score.py" } });
  const edit = await save(store);
  expect(edit.managed_sources).toEqual([]);
  expect(edit.document.nodes[1].config.code.source).toEqual({ kind: "file", path: "tools/score.py" });
  exportPayload("root-to-file", "root_get", edit);
});

test("a new Code node opens on the text; the first keystroke is the first thing written", async () => {
  const store = makeStore(["plain_get"]);
  await open("g1-plain");
  openAddNode();
  fireEvent.click(screen.getByTestId("palette-entry-code"));
  await screen.findByTestId("code-section");
  const box = screen.getByRole("textbox", { name: /^Code of / });
  expect(box).toHaveValue("");
  const id = box.getAttribute("aria-label").replace("Code of ", "");
  fireEvent.change(box, { target: { value: "def main(input, context):\n    return {}\n" } });
  const edit = await save(store);
  const index = edit.document.nodes.findIndex((node) => node.id === id);
  expect(edit.managed_sources).toEqual([{ node_path: ["nodes", index], text: "def main(input, context):\n    return {}\n" }]);
  exportPayload("plain-new-code", "plain_get", edit);
});

test("a conflict keeps my text; keeping mine sends it at their token", async () => {
  const store = makeStore(["root_get"]);
  await open("g1-root");
  await openNode("score");
  type("score", "mine\n");
  /* Another editor saves first. */
  store.held["g1-root"].resource.edit_token = "edit-9-elsewhere";
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await screen.findByRole("button", { name: "Keep mine and replace it" });
  expect(textBox("score")).toHaveValue("mine\n");
  fireEvent.click(screen.getByRole("button", { name: "Keep mine and replace it" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Keep mine and replace it" })).toBeNull());
  const edit = await save(store);
  expect(edit.expected_edit_token).toBe("edit-9-elsewhere");
  expect(edit.managed_sources).toEqual([{ node_path: ["nodes", 1], text: "mine\n" }]);
});

test("a host without the v2 methods is unavailable; the graph-only methods are never called", async () => {
  api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(captured("root_get").resource);
  view = render(<ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage resourceId="g1-root" /></ConfigContext.Provider>);
  await screen.findByTestId("skeleton-store-unavailable");
  expect(api.unchain.getSkeletonResource).not.toHaveBeenCalled();
  expect(screen.queryByRole("textbox", { name: /^Code of / })).toBeNull();
});

test("a reply whose text does not match its digest does not open", async () => {
  const store = makeStore(["root_get"]);
  store.held["g1-root"].contents[0].text += "x";
  view = render(<ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage resourceId="g1-root" /></ConfigContext.Provider>);
  await screen.findByTestId("skeleton-load-failed");
  expect(screen.queryByTestId("skeleton-node-score")).toBeNull();
});

afterAll(() => {
  if (process.env.G1_PAYLOAD_DIR) fs.writeFileSync(`${process.env.G1_PAYLOAD_DIR}/index.json`, JSON.stringify(exported, null, 2) + "\n");
});
