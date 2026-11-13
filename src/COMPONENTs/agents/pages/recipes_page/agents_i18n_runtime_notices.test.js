import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import { node_label_capability } from "./node_label_capability";
import SkeletonRunView from "./skeleton_run_view";
import { api } from "../../../../SERVICEs/api";

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
const scope = { owner_chat_id: "raw-chat", execution_id: "raw-execution", resource_id: "raw-agent" };
const tree = (locale) => <ConfigContext.Provider value={{ theme: {} }}><LocaleContext.Provider value={{ locale }}>
  <SkeletonRunView scope={scope} isDark={false} onClose={jest.fn()} />
</LocaleContext.Provider></ConfigContext.Provider>;
test("local Rename capability refusal translates without changing the capability verdict", () => {
  const response = { hostile: "agents.rename.raw {id}" }; const before = JSON.stringify(response);
  const original = node_label_capability(response); const translated = node_label_capability(response, (key) => `T:${key}`);
  expect(translated.allowed).toBe(original.allowed); expect(translated.reason).toMatch(/^T:agents\./);
  expect(JSON.stringify(response)).toBe(before);
});
test("an owned run-observation failure follows locale without reopening its read scope", async () => {
  delete api.unchain.getSkeletonRunObservation;
  const view = render(tree("en"));
  await waitFor(() => expect(screen.getByTestId("run-observation-error")).toHaveTextContent("Run details are not available."));
  view.rerender(tree("zh-CN"));
  expect(screen.getByTestId("run-observation-error")).not.toHaveTextContent("Run details are not available.");
  expect(screen.getByTestId("run-observation-error").textContent).not.toContain("agents.");
});
test("a backend error that resembles a catalog key remains literal across locale changes", async () => {
  const raw = "agents.runtime.observation_unavailable {code}";
  api.unchain.getSkeletonRunObservation = jest.fn().mockResolvedValue({ ok: false, error: { message: raw } });
  const view = render(tree("en")); await waitFor(() => expect(screen.getByTestId("run-observation-error")).toHaveTextContent(raw));
  view.rerender(tree("zh-CN")); expect(screen.getByTestId("run-observation-error")).toHaveTextContent(raw);
  expect(api.unchain.getSkeletonRunObservation).toHaveBeenCalledTimes(1);
});
