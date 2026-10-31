import { api } from "./api";
import capture from "../COMPONENTs/agents/pages/recipes_page/tool_call_capture.json";

/* Real producer → strict consumer for the Tool Call schema read (#352,
 * BC-352-1).
 *
 * `tool_call_capture.json` was produced on 2026-10-22 by
 * native-advanced/steps-352/tools/capture_tool_catalog.py: the PuPu sidecar's
 * real Flask routes on the fixed installed runtime, run offline by the
 * fixed-pair interpreter in an isolated home. Nothing in it is hand-built.
 *
 * Everything between that answer and the caller is shipped code: Main's
 * request builder (which must rebuild exactly the request the capture sent),
 * Main's closed response reader and IPC reply, the preload bridge and the
 * renderer facade with its closed shape check. The IPC is the only fake, and
 * it serves only the captured requests. */

const { createMisoBridge } = require("../../electron/preload/bridges/unchain_bridge");
const { CHANNELS } = require("../../electron/shared/channels");
const { createSkeletonResourceReply } = require("../../electron/shared/skeleton_resource_transport");
const { readSkeletonResourceResponse } = require("../../electron/main/services/unchain/skeleton_resource_response");
const { buildSkeletonResourceRequest } = require("../../electron/main/services/unchain/service");

const reply = (status, bodyText) => createSkeletonResourceReply(() => readSkeletonResourceResponse({
  status, ok: status >= 200 && status < 300, text: async () => bodyText,
}));

/* `edit` changes the captured body before it is served, for the negative
   cases; the request must still be the captured one. */
function install(entry, edit = (text) => text) {
  const seen = [];
  window.unchainAPI = createMisoBridge({
    invoke: async (channel, command) => {
      seen.push(command);
      if (channel !== CHANNELS.UNCHAIN.SKELETON_RESOURCE_COMMAND) throw new Error(`unexpected channel ${channel}`);
      expect(Object.keys(command).sort()).toEqual(["action", "payload"]);
      expect(buildSkeletonResourceRequest(command.action, command.payload)).toStrictEqual(entry.request);
      return reply(entry.status, edit(entry.body_text));
    },
  }, {});
  return seen;
}
const reshape = (fn) => (text) => JSON.stringify(fn(JSON.parse(text)));

afterEach(() => {
  delete window.unchainAPI;
});

test("the capture is what this test assumes it is", () => {
  expect(capture.core_schemas.request).toStrictEqual({ method: "GET", path: "/skeleton_tools/schemas?toolkit=core" });
  expect(capture.core_schemas.status).toBe(200);
  const body = JSON.parse(capture.core_schemas.body_text);
  expect(body.tools.map((tool) => tool.name)).toEqual(["ask_user_question", "edit", "glob", "grep", "lsp", "read", "shell", "web_fetch", "write"]);
  expect(capture.missing_toolkit.status).toBe(404);
});

test("Core's schemas arrive exactly as the runtime declared them", async () => {
  const seen = install(capture.core_schemas);
  const answer = await api.unchain.listSkeletonToolSchemas("core");
  const body = JSON.parse(capture.core_schemas.body_text);
  expect(seen).toEqual([{ action: "tool_schemas", payload: { toolkit_id: "core" } }]);
  expect(answer).toStrictEqual({ toolkit_id: "core", tools: body.tools });
  const read = answer.tools.find((tool) => tool.name === "read");
  expect(read.parameters.required).toEqual(["path"]);
  expect(read.parameters.additionalProperties).toBe(false);
});

test("an unknown toolkit is refused with the sidecar's own code, status and path", async () => {
  install(capture.missing_toolkit);
  await expect(api.unchain.listSkeletonToolSchemas("no-such-toolkit")).rejects.toMatchObject({
    code: "toolkit_missing", status: 404, path: ["toolkit"],
  });
});

describe("a body that is not the agreed shape is refused at the facade", () => {
  test.each([
    ["an extra top-level key", reshape((body) => ({ ...body, cached: true }))],
    ["another schema version", reshape((body) => ({ ...body, schema: "pupu.skeleton_tool_schemas.v2" }))],
    ["another toolkit's answer", reshape((body) => ({ ...body, toolkit_id: "plan" }))],
    ["an extra key on a tool", reshape((body) => ({ ...body, tools: body.tools.map((tool, i) => (i === 0 ? { ...tool, requiresConfirmation: true } : tool)) }))],
    ["a tool without parameters", reshape((body) => ({ ...body, tools: body.tools.map((tool, i) => (i === 0 ? { name: tool.name, description: tool.description } : tool)) }))],
    ["two tools with one name", reshape((body) => ({ ...body, tools: [...body.tools, body.tools[0]] }))],
  ])("%s", async (_label, edit) => {
    install(capture.core_schemas, edit);
    await expect(api.unchain.listSkeletonToolSchemas("core")).rejects.toMatchObject({ code: "skeleton_tool_schemas_malformed" });
  });
});
