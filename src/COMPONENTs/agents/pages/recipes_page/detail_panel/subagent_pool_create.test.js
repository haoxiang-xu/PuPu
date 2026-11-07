import React, { useState } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import SubagentPoolSection from "./subagent_pool_section";
import capture from "../skeleton_native_embedded_capture.json";
import { api } from "../../../../../SERVICEs/api";

jest.mock("../../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
let current;
const copy = (value) => JSON.parse(JSON.stringify(value));
function Harness({ initial }) {
  const [document, setDocument] = useState(initial);
  current = document;
  return <SubagentPoolSection document={document} node={document.nodes.at(-1)} onChange={setDocument} isDark={false} />;
}
beforeEach(() => {
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [] });
});

test("a held name stays on its row when an embedded Agent is appended", () => {
  const document = copy(capture.rows[0].document);
  const entry = document.nodes.at(-1).config.subagents[0];
  document.nodes.at(-1).config.subagents.push({ ...entry, id: "other", name: "Taken", source: { kind: "agent_ref", agent_id: "other-resource" } });
  render(<Harness initial={document} />);
  const first = screen.getByTestId("subagent-entry-0");
  fireEvent.change(within(first).getByPlaceholderText("name"), { target: { value: "Taken" } });
  expect(within(first).getByTestId("subagent-entry-0-name-taken")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "New embedded Agent", exact: true }));
  expect(within(screen.getByTestId("subagent-entry-0")).getByPlaceholderText("name")).toHaveValue("Taken");
  expect(current.nodes.at(-1).config.subagents[0].name).toBe("New Agent");
  expect(current.nodes.at(-1).config.subagents).toHaveLength(3);
});

test("an unreadable stored entry list is never silently replaced by creation", () => {
  const document = copy(capture.rows[0].document);
  document.nodes.at(-1).config.subagents = { must: "be kept" };
  render(<Harness initial={document} />);
  expect(screen.getByRole("button", { name: "New embedded Agent", exact: true })).toBeDisabled();
  expect(current).toBe(document);
});

test("local creation works when the resource library cannot be read", async () => {
  api.unchain.listSkeletonResources.mockRejectedValue(new Error("offline"));
  const document = copy(capture.rows[0].document);
  document.nodes.at(-1).config.subagents = [];
  render(<Harness initial={document} />);
  fireEvent.click(screen.getByRole("button", { name: "+ Add an Agent", exact: true }));
  await screen.findByTestId("subagent-library-failed");
  fireEvent.click(screen.getByRole("button", { name: "New embedded Agent", exact: true }));
  expect(current.nodes.at(-1).config.subagents[0].source.kind).toBe("embedded");
});

test("legacy settings cannot be shadowed by a new embedded entry", () => {
  const document = copy(capture.rows[0].document);
  document.nodes.at(-1).config = { legacy_fields: {} };
  render(<Harness initial={document} />);
  expect(screen.queryByRole("button", { name: "New embedded Agent", exact: true })).not.toBeInTheDocument();
  expect(current).toBe(document);
});
