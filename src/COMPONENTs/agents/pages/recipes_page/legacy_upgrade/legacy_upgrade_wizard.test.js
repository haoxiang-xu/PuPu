import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import fixture from "../../../../../SERVICEs/legacy_upgrade_producer.json";
import { api } from "../../../../../SERVICEs/api";
import { install_legacy_store_bridge } from "../legacy_store_test_bridge";
import LegacyUpgradeWizard from "./legacy_upgrade_wizard";

/* The form over the real producer's captures. The facade is the mocked seam
   (its own suite proves the wire); every reply here is what the host actually
   answered for the fixture Agent, and every request the form sends is checked
   for the closed shape the host accepted. */

jest.mock("../../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
jest.mock("../../../../../SERVICEs/provider_secret_status", () => ({
  providerSecretConfigured: (provider) => provider === "openai",
}));
install_legacy_store_bridge(api.unchain);

jest.mock("../../../../../BUILTIN_COMPONENTs/modal/modal", () => ({ __esModule: true,
  default: ({ open, children, ariaLabel }) => (open ? <div role="dialog" aria-label={ariaLabel}>{children}</div> : null) }));
jest.mock("../../../../../BUILTIN_COMPONENTs/select/select", () => function MockSelect({ options, value, set_value, placeholder, disabled }) {
  return (
    <select data-testid="select" data-placeholder={placeholder || ""} value={value == null ? "" : String(value)} disabled={disabled} onChange={(event) => set_value(event.target.value)}>
      <option value="">{placeholder || ""}</option>
      {(options || []).flatMap((option) => option.options || [option]).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
});
jest.mock("../../../../../BUILTIN_COMPONENTs/input/input", () => {
  const Mock = ({ value, set_value, placeholder }) => <input placeholder={placeholder} value={value} onChange={(event) => set_value(event.target.value)} />;
  return { __esModule: true, default: Mock, Input: Mock };
});
jest.mock("../../../../../BUILTIN_COMPONENTs/input/textfield", () => function MockTextField({ value, set_value, placeholder }) {
  return <textarea placeholder={placeholder} value={value} onChange={(event) => set_value(event.target.value)} />;
});

const flat = fixture.cases.flat;
const payload = (capture) => JSON.parse(capture.payload_json);
const profile = flat.request.choices.kernels[0].kernel.profile;
const cfg = { theme: {}, onThemeMode: "light_mode" };
const resource = { id: flat.before.id, edit_token: flat.before.edit_token, document: flat.before.document, name: flat.before.name };

const stock = () => {
  for (const key of Object.keys(api.unchain)) delete api.unchain[key];
  api.unchain.getSkeletonLegacyUpgradeCapabilities = jest.fn(async () => fixture.capabilities);
  api.unchain.inspectSkeletonLegacyUpgrade = jest.fn(async () => ({ response: flat.inventory, payload: payload(flat.inventory) }));
  api.unchain.previewSkeletonLegacyUpgrade = jest.fn(async () => ({ response: flat.preview, payload: payload(flat.preview) }));
  api.unchain.applySkeletonLegacyUpgrade = jest.fn(async () => ({ response: flat.applied, payload: payload(flat.applied) }));
  api.unchain.listSkeletonKernelProfiles = jest.fn(async () => ({ profiles: [profile], unavailable: [] }));
  api.unchain.listToolModalCatalog = jest.fn(async () => ({ toolkits: [] }));
  api.unchain.listSkeletonResources = jest.fn(async () => ({ resources: [] }));
  api.unchain.getSkeletonResource = jest.fn(async () => flat.saved);
};

const mount = (props = {}) => {
  const onUpgraded = jest.fn();
  const onClose = jest.fn();
  const view = render(
    <ConfigContext.Provider value={cfg}>
      <LegacyUpgradeWizard open resource={resource} isDark={false} onClose={onClose} onUpgraded={onUpgraded} onReopen={jest.fn()} {...props} />
    </ConfigContext.Provider>,
  );
  return { view, onUpgraded, onClose };
};

async function answer_kernel() {
  const slot = await screen.findByTestId("legacy-upgrade-slot-kernel");
  const model = await within(slot).findByTestId("kernel-model");
  fireEvent.change(within(model).getByTestId("select"), { target: { value: profile.id } });
  fireEvent.click(within(slot).getByLabelText("Accept this Kernel projection"));
}

beforeEach(stock);

test("inventory → kernel choice → real preview → explicit apply → reopen, with closed requests", async () => {
  const { onUpgraded } = mount();
  const inventory = await screen.findByTestId("legacy-upgrade-inventory");
  await waitFor(() => expect(inventory).toHaveTextContent("needs_upgrade"));
  expect(api.unchain.inspectSkeletonLegacyUpgrade).toHaveBeenCalledWith({
    resource_id: resource.id, schema: "pupu.skeleton-legacy-upgrade.request.v1",
    expected_edit_token: resource.edit_token, expected_runtime_manifest_digest: fixture.capabilities.runtime_manifest.manifest_digest,
  });
  /* The host converts the root toolkit pool on its own: shown, not asked. */
  expect(screen.getByTestId("legacy-upgrade-info")).toHaveTextContent("root_toolkit_pool_required");
  const apply = screen.getByTestId("legacy-upgrade-apply");
  expect(apply).toBeDisabled();
  const preview = screen.getByRole("button", { name: "Preview" });
  expect(preview).toBeDisabled();
  await answer_kernel();
  await waitFor(() => expect(screen.getByRole("button", { name: "Preview" })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  const summary = await screen.findByTestId("legacy-upgrade-preview");
  expect(summary).toHaveTextContent("4 nodes");
  expect(summary).toHaveTextContent("openai · test-model");
  const sent = api.unchain.previewSkeletonLegacyUpgrade.mock.calls[0][0];
  expect(Object.keys(sent).sort()).toEqual(["choices", "expected_edit_token", "expected_runtime_manifest_digest", "resource_id", "schema"]);
  expect(sent.choices.kernels).toHaveLength(1);
  expect(sent.choices.kernels[0]).toMatchObject({ path: ["nodes", 1], model_policy: "preserve", prompt_policy: "preserve", accept_projection: true });
  expect(sent.choices.kernels[0].kernel.profile).toEqual(profile);
  expect(sent.choices.toolkits).toEqual([]);
  expect(sent.choices.acknowledged).toEqual([]);
  expect(api.unchain.applySkeletonLegacyUpgrade).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId("legacy-upgrade-apply"));
  await screen.findByTestId("legacy-upgrade-acknowledged");
  const applied = api.unchain.applySkeletonLegacyUpgrade.mock.calls[0][0];
  expect(applied.choices).toEqual(sent.choices);
  expect(applied.expected_projection_digest).toBe(flat.preview.projection_digest);
  expect(applied.expected_edit_token).toBe(resource.edit_token);
  expect(onUpgraded).toHaveBeenCalledTimes(1);
  expect(onUpgraded.mock.calls[0][0].edit_token).toBe(flat.saved.edit_token);
  expect(api.unchain.applySkeletonLegacyUpgrade).toHaveBeenCalledTimes(1);
});

test("changing a choice after the preview takes the preview and Upgrade away until a new preview", async () => {
  mount();
  await answer_kernel();
  fireEvent.click(await screen.findByRole("button", { name: "Preview" }));
  await screen.findByTestId("legacy-upgrade-preview");
  const slot = screen.getByTestId("legacy-upgrade-slot-kernel");
  const policies = within(slot).getAllByTestId("select");
  fireEvent.change(policies[policies.length - 2], { target: { value: "replace" } });
  await waitFor(() => expect(screen.queryByTestId("legacy-upgrade-preview")).toBeNull());
  expect(screen.getByTestId("legacy-upgrade-apply")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Preview" })).not.toBeDisabled();
});

test("a timed-out apply is unconfirmed: no retry, choices kept, one deliberate read says what it saw", async () => {
  const timeout = Object.assign(new Error("Legacy Agent upgrade result is unconfirmed; read the resource before another apply"), { code: "legacy_upgrade_timeout", path: [], status: null });
  Object.defineProperty(timeout, "legacyUpgrade", { value: Object.freeze({ operation: "apply", outcome: "unconfirmed" }) });
  api.unchain.applySkeletonLegacyUpgrade = jest.fn(async () => { throw timeout; });
  const { onUpgraded } = mount();
  await answer_kernel();
  fireEvent.click(await screen.findByRole("button", { name: "Preview" }));
  await screen.findByTestId("legacy-upgrade-preview");
  fireEvent.click(screen.getByTestId("legacy-upgrade-apply"));
  const alert = await screen.findByTestId("legacy-upgrade-unconfirmed");
  expect(alert).toHaveTextContent("Unconfirmed");
  expect(screen.getByTestId("legacy-upgrade-apply")).toBeDisabled();
  expect(onUpgraded).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId("legacy-upgrade-read"));
  await waitFor(() => expect(alert).toHaveTextContent("matching resource"));
  expect(screen.getByRole("button", { name: "Reopen the Agent" })).toBeInTheDocument();
  expect(api.unchain.applySkeletonLegacyUpgrade).toHaveBeenCalledTimes(1);
});

test("a stale-token refusal is said as not written, and the stored Agent can be read again without losing the choices", async () => {
  const refusal = Object.assign(new Error("Draft changed since it was read"), { code: "edit_conflict", path: ["expected_edit_token"], status: 409 });
  Object.defineProperty(refusal, "legacyUpgrade", { value: Object.freeze({ operation: "apply", outcome: "prewrite_refused" }) });
  api.unchain.applySkeletonLegacyUpgrade = jest.fn(async () => { throw refusal; });
  api.unchain.getSkeletonResource = jest.fn(async () => ({ ...flat.before, edit_token: "edit-2-someone-else" }));
  mount();
  await answer_kernel();
  fireEvent.click(await screen.findByRole("button", { name: "Preview" }));
  await screen.findByTestId("legacy-upgrade-preview");
  fireEvent.click(screen.getByTestId("legacy-upgrade-apply"));
  const refused = await screen.findByTestId("legacy-upgrade-refused");
  expect(refused).toHaveTextContent("Not written");
  expect(refused).toHaveTextContent("edit_conflict");
  fireEvent.click(screen.getByRole("button", { name: "Read the stored Agent again" }));
  await waitFor(() => expect(api.unchain.inspectSkeletonLegacyUpgrade).toHaveBeenCalledTimes(2));
  expect(api.unchain.inspectSkeletonLegacyUpgrade.mock.calls[1][0].expected_edit_token).toBe("edit-2-someone-else");
  /* The Kernel the author chose is still there, and the preview is not. */
  const slot = await screen.findByTestId("legacy-upgrade-slot-kernel");
  await waitFor(() => expect(within(within(slot).getByTestId("kernel-model")).getByTestId("select").value).toBe(profile.id));
  expect(screen.queryByTestId("legacy-upgrade-preview")).toBeNull();
  expect(api.unchain.applySkeletonLegacyUpgrade).toHaveBeenCalledTimes(1);
});

test("a preview refusal that names a Kernel adds that row; a blocking refusal keeps Upgrade unavailable", async () => {
  api.unchain.previewSkeletonLegacyUpgrade = jest.fn()
    .mockRejectedValueOnce(Object.assign(new Error("Choose a Kernel for this legacy Agent"), { code: "kernel_choice_required", path: ["nodes", 2, "config", "legacy_fields", "subagents", 0], status: 400 }))
    .mockRejectedValueOnce(Object.assign(new Error("Exact scoped legacy subagent alias was not found"), { code: "resource_missing", path: ["nodes", 2, "config", "legacy_fields", "subagents", 0], status: 404 }));
  mount();
  await answer_kernel();
  fireEvent.click(await screen.findByRole("button", { name: "Preview" }));
  const problems = await screen.findByTestId("legacy-upgrade-problems");
  expect(problems).toHaveTextContent("kernel_choice_required");
  await waitFor(() => expect(screen.getAllByTestId("legacy-upgrade-slot-kernel")).toHaveLength(2));
  const added = screen.getAllByTestId("legacy-upgrade-slot-kernel")[1];
  fireEvent.change(within(await within(added).findByTestId("kernel-model")).getByTestId("select"), { target: { value: profile.id } });
  fireEvent.click(within(added).getByLabelText("Accept this Kernel projection"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Preview" })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  await waitFor(() => expect(screen.getByTestId("legacy-upgrade-problems")).toHaveTextContent("Cannot upgrade as it stands"));
  expect(screen.getByTestId("legacy-upgrade-apply")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
  expect(api.unchain.applySkeletonLegacyUpgrade).not.toHaveBeenCalled();
});

test("closing writes nothing and a native draft asks for nothing", async () => {
  api.unchain.inspectSkeletonLegacyUpgrade = jest.fn(async () => ({ response: flat.inventory, payload: { ...payload(flat.inventory), state: "native_draft", requirements: [] } }));
  const { onClose } = mount();
  await screen.findByTestId("legacy-upgrade-native");
  expect(screen.getByTestId("legacy-upgrade-apply")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(api.unchain.previewSkeletonLegacyUpgrade).not.toHaveBeenCalled();
  expect(api.unchain.applySkeletonLegacyUpgrade).not.toHaveBeenCalled();
});
