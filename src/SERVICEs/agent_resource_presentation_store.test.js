import producer from "./agent_resource_presentation_producer.json";
import older from "./managed_transfer_producer.json";
import { api } from "./api";
import { subscribeSkeletonLibraryRefresh } from "./skeleton_library_refresh";
import {
  normalize_presentation,
  with_presentation,
  writeResourcePresentation,
} from "./agent_resource_presentation_store";

jest.mock("./api", () => ({
  api: {
    unchain: {
      getManagedCodeCapabilities: jest.fn(),
      getManagedSkeletonResource: jest.fn(),
      saveManagedSkeletonResource: jest.fn(),
    },
  },
}));

/* Every answer below is real producer output (agent_resource_presentation_producer.json,
   recorded from the actual PuPu Flask routes over a temp HOME with the
   imported unchain). The consumer side is strict: the save payload and the
   document it carries are compared as exact key sets. */

const clone = (value) => JSON.parse(JSON.stringify(value));
const PALETTE_COLOR = "#1d8798";
const EDIT_KEYS = ["document", "expected_edit_token", "managed_sources", "schema"];
const sorted_keys = (value) => Object.keys(value).sort();
const store_error = (answer) =>
  Object.assign(new Error(answer.body.error.message), {
    code: answer.body.error.code,
    path: answer.body.error.path,
  });

let refreshes;
let unsubscribe;

beforeEach(() => {
  api.unchain.getManagedCodeCapabilities.mockResolvedValue(clone(producer.capabilities));
  api.unchain.getManagedSkeletonResource.mockResolvedValue(clone(producer.loaded));
  api.unchain.saveManagedSkeletonResource.mockResolvedValue(clone(producer.saved));
  refreshes = [];
  unsubscribe = subscribeSkeletonLibraryRefresh((event) => refreshes.push(event));
});

afterEach(() => {
  if (typeof unsubscribe === "function") unsubscribe();
});

test("the producer capture is what it claims", () => {
  const skeleton = producer.capabilities.runtime_manifest.protocols.find((p) => p.id === "skeleton_execution");
  expect(skeleton.minor).toBeGreaterThanOrEqual(9);
  expect(skeleton.features).toContain("document_presentation_v1");
  expect(producer.loaded.resource.document.presentation).toBeUndefined();
  expect(producer.saved.resource.document.presentation).toEqual({ icon: "robot", color: "#1a2b3c" });
  expect(producer.conflict.status).toBe(409);
  expect(producer.invalid.body.error.code).toBe("invalid_value");
});

test("writes through the v2 aggregate with the exact edit payload the store accepted", async () => {
  /* The capture was recorded with "#1a2b3c", which the runtime admits (it is
     format-only) but PuPu no longer writes: the palette is a frontend rule.
     The write uses a palette colour, and the comparison below swaps only
     that one value in the recorded request. */
  const answer = await writeResourcePresentation("managed-code", { icon: "robot", color: PALETTE_COLOR });

  expect(answer.ok).toBe(true);
  expect(answer.presentation).toEqual({ icon: "robot", color: PALETTE_COLOR });
  expect(api.unchain.getManagedSkeletonResource).toHaveBeenCalledWith("managed-code");
  expect(api.unchain.saveManagedSkeletonResource).toHaveBeenCalledTimes(1);
  const [payload] = api.unchain.saveManagedSkeletonResource.mock.calls[0];
  expect(sorted_keys(payload)).toEqual(EDIT_KEYS);
  expect(sorted_keys(payload.document)).toEqual(
    [...Object.keys(producer.loaded.resource.document), "presentation"].sort(),
  );
  expect(payload.document.presentation).toEqual({ icon: "robot", color: PALETTE_COLOR });
  expect(sorted_keys(payload.document.presentation)).toEqual(["color", "icon"]);
  expect(payload.expected_edit_token).toBe(producer.loaded.resource.edit_token);
  /* Exactly the request the real store accepted, Code text included. */
  expect(payload).toEqual({
    ...producer.save_request,
    document: { ...producer.save_request.document, presentation: { icon: "robot", color: PALETTE_COLOR } },
  });
  expect(refreshes).toHaveLength(1);
  expect(refreshes[0].resource_id).toBe("managed-code");
});

test("null removes the key and leaves every other key as it was", async () => {
  api.unchain.getManagedSkeletonResource.mockResolvedValue(clone(producer.saved));
  api.unchain.saveManagedSkeletonResource.mockResolvedValue(clone(producer.loaded));

  const answer = await writeResourcePresentation("managed-code", null);

  expect(answer.ok).toBe(true);
  expect(answer.presentation).toBeNull();
  const [payload] = api.unchain.saveManagedSkeletonResource.mock.calls[0];
  expect(sorted_keys(payload)).toEqual(EDIT_KEYS);
  expect(Object.prototype.hasOwnProperty.call(payload.document, "presentation")).toBe(false);
  expect(sorted_keys(payload.document)).toEqual(sorted_keys(producer.loaded.resource.document));
  expect(payload.expected_edit_token).toBe(producer.saved.resource.edit_token);
  expect(payload.managed_sources).toEqual(producer.save_request.managed_sources);
});

test("an empty object is written as the default (key removed)", async () => {
  api.unchain.getManagedSkeletonResource.mockResolvedValue(clone(producer.saved));
  await writeResourcePresentation("managed-code", {});
  const [payload] = api.unchain.saveManagedSkeletonResource.mock.calls[0];
  expect("presentation" in payload.document).toBe(false);
});

test("an edit conflict comes back as a typed failure, never a throw", async () => {
  api.unchain.saveManagedSkeletonResource.mockRejectedValue(store_error(producer.conflict));
  const answer = await writeResourcePresentation("managed-code", { icon: "robot" });
  expect(answer.ok).toBe(false);
  expect(answer.code).toBe("edit_conflict");
  expect(refreshes).toHaveLength(0);
});

test("the store's own refusal is passed on with its code", async () => {
  api.unchain.saveManagedSkeletonResource.mockRejectedValue(store_error(producer.invalid));
  const answer = await writeResourcePresentation("managed-code", { icon: "robot" });
  expect(answer).toMatchObject({ ok: false, code: "invalid_value" });
});

test("a resource that cannot be read fails typed and nothing is saved", async () => {
  api.unchain.getManagedSkeletonResource.mockRejectedValue(
    Object.assign(new Error("Skeleton resource was not found"), { code: "resource_missing" }),
  );
  const answer = await writeResourcePresentation("missing", { icon: "robot" });
  expect(answer).toMatchObject({ ok: false, code: "resource_missing" });
  expect(api.unchain.saveManagedSkeletonResource).not.toHaveBeenCalled();
});

test("an older runtime without document_presentation_v1 is refused before anything is sent", async () => {
  api.unchain.getManagedCodeCapabilities.mockResolvedValue(clone(older.code_capabilities));
  const answer = await writeResourcePresentation("managed-code", { icon: "robot" });
  expect(answer).toEqual({ ok: false, code: "presentation_unsupported" });
  expect(api.unchain.getManagedSkeletonResource).not.toHaveBeenCalled();
  expect(api.unchain.saveManagedSkeletonResource).not.toHaveBeenCalled();
});

test.each([
  [{ icon: "Robot" }],
  [{ color: "#ABCDEF" }],
  /* Well formed, and admitted by the runtime, but not in PuPu's palette. */
  [{ color: "#1a2b3c" }],
  [{ icon: "robot", extra: 1 }],
  ["robot"],
  [[]],
])("an invalid presentation %p is refused locally", async (value) => {
  const answer = await writeResourcePresentation("managed-code", value);
  expect(answer).toEqual({ ok: false, code: "invalid_presentation" });
  expect(api.unchain.getManagedCodeCapabilities).not.toHaveBeenCalled();
  expect(api.unchain.saveManagedSkeletonResource).not.toHaveBeenCalled();
});

test("pure helpers keep key order and copy values", () => {
  const document = { schema_version: 1, kind: "agent", id: "a", name: "A", presentation: { icon: "x" }, nodes: [], edges: [] };
  expect(Object.keys(with_presentation(document, { color: "#000000" }))).toEqual(
    ["schema_version", "kind", "id", "name", "nodes", "edges", "presentation"],
  );
  expect(with_presentation(document, null)).not.toHaveProperty("presentation");
  expect(normalize_presentation({ icon: "a", color: "#2e8f5a" })).toEqual({ ok: true, value: { icon: "a", color: "#2e8f5a" } });
  expect(normalize_presentation({ icon: "a", color: "#00ff00" })).toEqual({ ok: false });
  expect(normalize_presentation(undefined)).toEqual({ ok: true, value: null });
});
