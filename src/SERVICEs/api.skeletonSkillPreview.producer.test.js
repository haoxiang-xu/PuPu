import { api } from "./api";
import capture from "../COMPONENTs/agents/pages/recipes_page/skill_read_capture.json";

/* Real producer → strict consumer for the Skill Read preview (#352, BC-352-2).
 *
 * `skill_read_capture.json` was produced on 2026-10-22 by
 * native-advanced/steps-352/tools/capture_skill_preview.py: the PuPu sidecar's
 * real Flask routes on the fixed installed runtime, run offline by the
 * fixed-pair interpreter in an isolated home holding three user skills (one
 * shadowed by another of the same name). Nothing in it is hand-built.
 *
 * Between that answer and the caller is shipped code only: Main's request
 * builder (which must rebuild exactly the request the capture sent), Main's
 * closed response reader and IPC reply, the preload bridge and the facade. */

const { createMisoBridge } = require("../../electron/preload/bridges/unchain_bridge");
const { CHANNELS } = require("../../electron/shared/channels");
const { createSkeletonResourceReply } = require("../../electron/shared/skeleton_resource_transport");
const { readSkeletonResourceResponse } = require("../../electron/main/services/unchain/skeleton_resource_response");
const { buildSkeletonResourceRequest } = require("../../electron/main/services/unchain/service");

const reply = (status, bodyText) => createSkeletonResourceReply(() => readSkeletonResourceResponse({
  status, ok: status >= 200 && status < 300, text: async () => bodyText,
}));
function install(entry, edit = (text) => text) {
  const seen = [];
  window.unchainAPI = createMisoBridge({
    invoke: async (channel, command) => {
      seen.push(command);
      if (channel !== CHANNELS.UNCHAIN.SKELETON_RESOURCE_COMMAND) throw new Error(`unexpected channel ${channel}`);
      expect(buildSkeletonResourceRequest(command.action, command.payload)).toStrictEqual(entry.request);
      return reply(entry.status, edit(entry.body_text));
    },
  }, {});
  return seen;
}
const reshape = (fn) => (text) => JSON.stringify(fn(JSON.parse(text)));
const requested = (entry) => entry.request.body.skill;

afterEach(() => {
  delete window.unchainAPI;
});

test("the capture is what this test assumes it is", () => {
  const inventory = JSON.parse(capture.inventory.body_text);
  expect(inventory.skills.map((skill) => [skill.name, skill.source])).toEqual([["drafts", "user-agents"], ["notes", "user-unchain"]]);
  expect([capture.preview_notes.status, capture.preview_shadowed.status, capture.preview_malformed.status]).toEqual([200, 404, 400]);
});

test("a listed skill's preview arrives exactly as the runtime read it", async () => {
  const seen = install(capture.preview_notes);
  const body = JSON.parse(capture.preview_notes.body_text);
  await expect(api.unchain.previewSkeletonSkill(requested(capture.preview_notes), true)).resolves.toStrictEqual({
    identity: body.identity, body: body.body, revision: body.revision, bytes: body.bytes,
  });
  expect(seen).toEqual([{ action: "skill_preview", payload: { skill: requested(capture.preview_notes), include_user_dirs: true } }]);
  expect(body.body).toBe("Notes for the builder\n\nUse these steps:\n1. read\n2. write");
});

test("multi-byte text keeps its byte count across every hop", async () => {
  install(capture.preview_drafts);
  const answer = await api.unchain.previewSkeletonSkill(requested(capture.preview_drafts), true);
  expect(answer.body).toBe("Drafting rules — ünïcode");
  expect(answer.bytes).toBe(28);
});

test("a shadowed identity is refused with the run's own code", async () => {
  install(capture.preview_shadowed);
  await expect(api.unchain.previewSkeletonSkill(requested(capture.preview_shadowed), true)).rejects.toMatchObject({
    code: "identity_mismatch", status: 404, path: ["skill"],
  });
});

describe("a body that is not the agreed shape is refused at the facade", () => {
  test.each([
    ["an extra top-level key", reshape((body) => ({ ...body, preview: true }))],
    ["another identity", reshape((body) => ({ ...body, identity: { ...body.identity, name: "drafts" } }))],
    ["a size that is not the body's", reshape((body) => ({ ...body, bytes: body.bytes + 1 }))],
    ["no revision", reshape(({ revision, ...rest }) => rest)],
  ])("%s", async (_label, edit) => {
    install(capture.preview_notes, edit);
    await expect(api.unchain.previewSkeletonSkill(requested(capture.preview_notes), true)).rejects.toMatchObject({
      code: "skeleton_skill_preview_malformed",
    });
  });
});
