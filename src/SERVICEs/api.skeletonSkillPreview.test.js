import { api } from "./api";

/* The facade's exact-identity skill read behind the Skill Read preview
 * (#352, BC-352-2).
 *
 * CLOSED: the panel shows this body as what the run will read, so an answer
 * for another identity, with a size that does not match its body, or with any
 * key it does not know is a protocol error, never a preview. */

const identity = { source: "user-unchain", source_id: "/h/.unchain/skills/notes/SKILL.md", name: "notes" };
const answer = (extra = {}) => ({
  schema: "pupu.skeleton_skill_preview.v1",
  identity: { ...identity },
  body: "Notes body — ünïcode",
  revision: "sha256:abc",
  bytes: 24, // UTF-8: "—" is 3 bytes, "ü" and "ï" 2 each
  ...extra,
});

const original = window.unchainAPI;
afterEach(() => {
  window.unchainAPI = original;
});
const install = (value) => {
  const method = jest.fn(async () => value);
  window.unchainAPI = { previewSkeletonSkill: method };
  return method;
};

test("sends exactly the identity and the user-roots switch, and returns the read as given", async () => {
  const method = install(answer());
  await expect(api.unchain.previewSkeletonSkill({ ...identity, extra: "dropped" }, false)).resolves.toStrictEqual({
    identity, body: "Notes body — ünïcode", revision: "sha256:abc", bytes: 24,
  });
  expect(method).toHaveBeenCalledWith(identity, false);
});

test.each([
  ["a wrong schema name", answer({ schema: "pupu.skeleton_skill_preview.v2" })],
  ["another identity's answer", answer({ identity: { ...identity, name: "drafts" } })],
  ["an identity with an extra key", answer({ identity: { ...identity, revision: "r" } })],
  ["an extra top-level key", answer({ diagnostics: [] })],
  ["a body that is not text", answer({ body: null })],
  ["a size that does not match the body", answer({ bytes: 3 })],
  ["a blank revision", answer({ revision: "" })],
  ["not an object at all", null],
])("refuses %s as a protocol error", async (_label, value) => {
  install(value);
  await expect(api.unchain.previewSkeletonSkill(identity, true)).rejects.toMatchObject({
    code: "skeleton_skill_preview_malformed",
  });
});

test("a refusal keeps the sidecar's code and status", async () => {
  window.unchainAPI = { previewSkeletonSkill: jest.fn(async () => {
    // The preload rejects with a plain record; the facade restores the Error.
    // eslint-disable-next-line no-throw-literal
    throw { code: "identity_mismatch", path: ["skill"], message: "this skill is not available as identified", status: 404 };
  }) };
  await expect(api.unchain.previewSkeletonSkill(identity, true)).rejects.toMatchObject({ code: "identity_mismatch", status: 404 });
});

test("an identity that is not three non-empty texts is not sent", async () => {
  const method = install(answer());
  await expect(api.unchain.previewSkeletonSkill({ source: "user-unchain", name: "notes" }, true)).rejects.toMatchObject({
    code: "skeleton_skill_preview_invalid",
  });
  await expect(api.unchain.previewSkeletonSkill(identity, "yes")).rejects.toMatchObject({ code: "skeleton_skill_preview_invalid" });
  expect(method).not.toHaveBeenCalled();
});
