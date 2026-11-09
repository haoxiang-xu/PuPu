import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { install_legacy_store_bridge } from "./recipes_page/legacy_store_test_bridge";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import { api } from "../../../SERVICEs/api";
import fixture from "../../../SERVICEs/legacy_upgrade_producer.json";
import { RESOURCE_RESULT_KEYS } from "./recipes_page/skeleton_resource_capture";

/* The upgrade entry on the Builder page (#473 CP2): offered for a stored
   first-hop draft, absent for a native graph, held back while the draft has
   unsaved edits, and reopening the resource after the host confirmed. */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
install_legacy_store_bridge(api.unchain);
jest.mock("../../../BUILTIN_COMPONENTs/modal/modal", () => ({ __esModule: true,
  default: ({ open, children, ariaLabel }) => (open ? <div role="dialog" aria-label={ariaLabel}>{children}</div> : null) }));

const cfg = { theme: {}, onThemeMode: "light_mode" };
const flat = fixture.cases.flat;
const payload = (capture) => JSON.parse(capture.payload_json);

const result = (overrides) => {
  const base = {};
  RESOURCE_RESULT_KEYS.forEach((key) => { base[key] = key === "diagnostics" ? [] : null; });
  return { ...base, id: flat.before.id, kind: "agent", name: flat.before.name, ...overrides };
};

beforeEach(() => {
  for (const key of Object.keys(api.unchain)) delete api.unchain[key];
  api.unchain.getSkeletonResource = jest.fn(async () => result({ document: flat.before.document, edit_token: flat.before.edit_token }));
  api.unchain.listSkeletonKernelProfiles = jest.fn(async () => ({ profiles: [], unavailable: [] }));
  api.unchain.listToolModalCatalog = jest.fn(async () => ({ toolkits: [] }));
  api.unchain.getSkeletonLegacyUpgradeCapabilities = jest.fn(async () => fixture.capabilities);
  api.unchain.inspectSkeletonLegacyUpgrade = jest.fn(async () => ({ response: flat.inventory, payload: payload(flat.inventory) }));
});

const mount = () => render(<ConfigContext.Provider value={cfg}><SkeletonResourcePage resourceId={flat.before.id} /></ConfigContext.Provider>);

test("a stored first-hop draft is offered the upgrade; opening it reads the real inventory and writes nothing", async () => {
  mount();
  const offer = await screen.findByTestId("skeleton-legacy-upgrade-offer");
  expect(offer).toHaveTextContent("Legacy Agent");
  const open = screen.getByTestId("skeleton-legacy-upgrade-open");
  expect(open).not.toBeDisabled();
  fireEvent.click(open);
  await screen.findByTestId("legacy-upgrade-wizard");
  await waitFor(() => expect(api.unchain.inspectSkeletonLegacyUpgrade).toHaveBeenCalledTimes(1));
  expect(api.unchain.inspectSkeletonLegacyUpgrade.mock.calls[0][0]).toMatchObject({ resource_id: flat.before.id, expected_edit_token: flat.before.edit_token });
  expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent("Saved");
});

test("a native graph gets no offer", async () => {
  api.unchain.getSkeletonResource = jest.fn(async () => result({ document: flat.saved.document, edit_token: flat.saved.edit_token }));
  mount();
  await screen.findByTestId("skeleton-save-state");
  await waitFor(() => expect(screen.getByTestId("skeleton-save-state")).toHaveTextContent("Saved"));
  expect(screen.queryByTestId("skeleton-legacy-upgrade-offer")).toBeNull();
});
