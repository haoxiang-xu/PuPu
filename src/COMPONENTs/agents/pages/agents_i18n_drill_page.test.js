import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import { api } from "../../../SERVICEs/api";
import { install_legacy_store_bridge } from "./recipes_page/legacy_store_test_bridge";
import { CAPTURED_DUPLICATE_ENTRIES } from "./recipes_page/skeleton_drill_identity_capture";
import zh from "../../../locales/zh-CN.json";

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
install_legacy_store_bridge(api.unchain);
jest.mock("../../../BUILTIN_COMPONENTs/flow_editor", () => ({ FlowEditor: (props) => <div>
  {(props.nodes || []).map((node) => <div key={node.id} data-testid={`flow-node-${node.id}`}>{props.render_node(node)}</div>)}
</div> }));

test("a retained native pool refusal changes language without rereading, writing or altering its raw entry", async () => {
  const document = JSON.parse(CAPTURED_DUPLICATE_ENTRIES.find((row) => row.case === "duplicate-entry-ids").document);
  const entry = document.nodes.find((node) => node.id === "pool-a").config.subagents[0];
  entry.source = null;
  const before = JSON.stringify(document);
  api.unchain.getSkeletonResource = jest.fn().mockResolvedValue({ id: document.id, kind: "agent", document, edit_token: "edit-1", diagnostics: [], archived: false });
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [] });
  api.unchain.listSkeletonKernelProfiles = jest.fn().mockResolvedValue({ profiles: [], unavailable: [] });
  api.unchain.saveSkeletonResource = jest.fn();
  const tree = (locale) => <ConfigContext.Provider value={{ theme: {} }}><LocaleContext.Provider value={{ locale }}>
    <SkeletonResourcePage resourceId={document.id} />
  </LocaleContext.Provider></ConfigContext.Provider>;
  const view = render(tree("en"));
  const pool = await screen.findByTestId("flow-node-pool-a");
  const row = within(pool).getByTestId("pool-node-row-0");
  fireEvent.doubleClick(row);
  await waitFor(() => expect(screen.getAllByText("This entry does not say where its Agent comes from, so there is no graph to open.").length).toBeGreaterThan(0));
  view.rerender(tree("zh-CN"));
  expect(within(pool).getByTestId("pool-node-row-0")).toBe(row);
  expect(row).toHaveAttribute("title", zh.agents.drill.no_source);
  expect(screen.getByText(zh.agents.drill.no_source)).toBeInTheDocument();
  expect(api.unchain.getSkeletonResource).toHaveBeenCalledTimes(1);
  expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
  expect(JSON.stringify(document)).toBe(before);
});
