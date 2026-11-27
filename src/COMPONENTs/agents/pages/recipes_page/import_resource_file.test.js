import { default_import_choices, import_resource_file } from "./import_resource_file";
import { import_document, import_occurrences } from "./resource_import";
import { renderAgentMessage } from "./agents_i18n";
import { subscribeSkeletonLibraryRefresh } from "../../../../SERVICEs/skeleton_library_refresh";
import producer from "../../../../SERVICEs/managed_transfer_producer.json";
import codeCapture from "./code_capture.json";

/* #484: Import opens the system file picker and imports the file chosen, with
 * no form in between. The transfer answers are the real producer's
 * (managed_transfer_producer.json); only the preload bridge is replaced. */
if (typeof global.TextDecoder === "undefined") global.TextDecoder = require("util").TextDecoder;
const copy = (value) => JSON.parse(JSON.stringify(value));
const profile = (id) => ({ ...copy(codeCapture.profiles.save_venv), id });
const file = (text, name = "managed-code.json") => new File([text], name, { type: "application/json" });
const said = (result) => renderAgentMessage(result.message);
let bridge;
beforeEach(() => {
  bridge = {
    getManagedSkeletonTransferCapabilities: jest.fn(async () => copy(producer.capabilities)),
    importManagedSkeletonResource: jest.fn(async () => copy(producer.resource)),
    listSkeletonPythonProfiles: jest.fn(async () => ({ profiles: [copy(codeCapture.profiles.list_before[0])] })),
  };
  window.unchainAPI = bridge;
});

const exported = import_document(producer.export.source_json);
const occurrences = import_occurrences(exported.document);
const binding = () => bridge.importManagedSkeletonResource.mock.calls[0][0].runtime_bindings;

test("a Code step keeps its exported Python when this machine has it", async () => {
  bridge.listSkeletonPythonProfiles.mockResolvedValue({ profiles: [copy(codeCapture.profiles.list_before[0]), profile("foreign-python")] });
  /* The producer's answer is for its own binding; the same answer for this
     one names the Python this import chose. */
  bridge.importManagedSkeletonResource.mockResolvedValue(JSON.parse(JSON.stringify(producer.resource).split("local-python").join("foreign-python")));
  const announced = [];
  const off = subscribeSkeletonLibraryRefresh((payload) => announced.push(payload));
  const result = await import_resource_file(file(producer.export.source_json));
  off();
  expect(result.ok).toBe(true);
  expect(result.resource.id).toBe("managed-code");
  const [sent] = bridge.importManagedSkeletonResource.mock.calls[0];
  expect(sent.source_json).toBe(producer.export.source_json);
  expect(binding()).toEqual([{ node_path: ["nodes", 1], environment_profile_id: "foreign-python" }]);
  expect(announced).toEqual([{ reason: "imported", resource_id: "managed-code" }]);
});

test("a Code step whose exported Python is not here runs on the built-in one", async () => {
  await import_resource_file(file(producer.export.source_json));
  expect(binding()).toEqual([{ node_path: ["nodes", 1], environment_profile_id: "builtin" }]);
});

test("the default choice is one per occurrence, keyed by address", () => {
  expect(default_import_choices(occurrences, [{ id: "foreign-python" }])).toEqual({ [occurrences[0].key]: "foreign-python" });
  expect(default_import_choices(occurrences, [])).toEqual({ [occurrences[0].key]: "builtin" });
});

test("a host without import says so and writes nothing", async () => {
  bridge.getManagedSkeletonTransferCapabilities.mockResolvedValue({ schema: "something-else" });
  const result = await import_resource_file(file(producer.export.source_json));
  expect(result.ok).toBe(false);
  expect(said(result)).toMatch(/^Import is not available here/);
  expect(bridge.importManagedSkeletonResource).not.toHaveBeenCalled();
});

test("a file that is not an export is refused before anything is sent", async () => {
  const result = await import_resource_file(file("not json"));
  expect(result.ok).toBe(false);
  expect(said(result)).toBeTruthy();
  expect(bridge.importManagedSkeletonResource).not.toHaveBeenCalled();
});

test("a file over the host's size is refused before it is read", async () => {
  bridge.getManagedSkeletonTransferCapabilities.mockResolvedValue({ ...copy(producer.capabilities), file_bytes: 4 });
  const result = await import_resource_file(file(producer.export.source_json));
  expect(result.ok).toBe(false);
  expect(bridge.importManagedSkeletonResource).not.toHaveBeenCalled();
});

test("an id that already holds other content is refused in the author's words", async () => {
  bridge.importManagedSkeletonResource.mockRejectedValue({ code: "import_conflict", path: ["source_json", "document", "id"],
    message: "Resource id already exists with different graph or source content.", status: 409 });
  const result = await import_resource_file(file(producer.export.source_json));
  expect(result.ok).toBe(false);
  expect(said(result)).toContain("already exists here with different content");
});

test("no file chosen does nothing", async () => {
  expect(await import_resource_file(null)).toEqual({ ok: false, message: null });
  expect(bridge.getManagedSkeletonTransferCapabilities).not.toHaveBeenCalled();
});

test('an unavailable saved Python falls back without bypassing changed-environment admission', async () => {
  bridge.importManagedSkeletonResource.mockResolvedValue(JSON.parse(JSON.stringify(producer.resource).split('local-python').join('builtin')));
  bridge.listSkeletonPythonProfiles.mockResolvedValue({profiles:[copy(codeCapture.profiles.list_before[0]),
    {...profile('foreign-python'),available:false,changed:false}]});
  expect((await import_resource_file(file(producer.export.source_json))).ok).toBe(true);
  expect(binding()).toEqual([{node_path:['nodes',1],environment_profile_id:'builtin'}]);
  expect(default_import_choices(occurrences,[{...profile('foreign-python'),available:true,changed:true}]))
    .toEqual({[occurrences[0].key]:'foreign-python'});
});
