import React from "react";
import { install_legacy_store_bridge } from "./recipes_page/legacy_store_test_bridge";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import { api } from "../../../SERVICEs/api";
import { RESOURCE_RESULT_KEYS } from "./recipes_page/skeleton_resource_capture";

/* Undo and redo replace the document under the detail panel rather than type
   into it, so the panel is mounted afresh: a prompt it was showing or a value
   it was holding belongs to a document that is no longer on screen. An
   ordinary edit keeps the panel as it is. The panel is a probe that counts its
   mounts and offers one edit. */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
/* The editor speaks v2 only (#357 G1); these mocks are graph-only. */
install_legacy_store_bridge(api.unchain);
jest.mock("../../../BUILTIN_COMPONENTs/flow_editor", () => ({ FlowEditor: () => <div data-testid="flow-editor" /> }));
let mockMounts = 0;
jest.mock("./recipes_page/detail_panel/detail_panel", () => function ProbePanel({ document, onDocumentChange }) {
  require("react").useEffect(() => {
    mockMounts += 1;
  }, []);
  return (
    <button type="button" onClick={() => onDocumentChange({ ...document, description: `${document.description || ""}+` })}>
      edit it
    </button>
  );
});

const result = (document) => ({
  ...Object.fromEntries(RESOURCE_RESULT_KEYS.map((key) => [key, key === "diagnostics" ? [] : null])),
  id: "life", kind: "workflow", name: "life", document, edit_token: "t1",
});
const doc = { schema_version: 1, kind: "workflow", id: "life", name: "life", nodes: [], edges: [] };
const control = (title) => within(screen.getByTitle(title)).getByRole("button");

beforeEach(() => {
  mockMounts = 0;
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(result(doc));
});

test("an edit keeps the panel; undo and redo mount it afresh", async () => {
  render(<ConfigContext.Provider value={{ theme: {} }}><SkeletonResourcePage resourceId="life" /></ConfigContext.Provider>);
  await screen.findByText("edit it");
  const opened = mockMounts;
  fireEvent.click(screen.getByText("edit it"));
  await act(async () => { await Promise.resolve(); });
  fireEvent.click(screen.getByText("edit it"));
  expect(mockMounts).toBe(opened);
  fireEvent.click(control(/^Undo/));
  expect(mockMounts).toBe(opened + 1);
  fireEvent.click(control(/^Redo/));
  expect(mockMounts).toBe(opened + 2);
});
