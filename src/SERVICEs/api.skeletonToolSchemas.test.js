import { api } from "./api";

/* The facade's read of one toolkit's tool schemas (#352, BC-352-1).
 *
 * CLOSED at every level: the Tool Call panel renders one argument row per
 * property, so an answer that is not exactly the agreed shape is a protocol
 * error rather than an empty or partial list — "this toolkit has no tools"
 * and "that was not a schema list" must not become the same value. */

const tool = (name, extra = {}) => ({
  name,
  description: `${name} does a thing`,
  parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  ...extra,
});
const answer = (extra = {}) => ({
  schema: "pupu.skeleton_tool_schemas.v1",
  toolkit_id: "core",
  tools: [tool("read")],
  ...extra,
});

const original = window.unchainAPI;
afterEach(() => {
  window.unchainAPI = original;
});

const install = (value) => {
  const method = jest.fn(async () => value);
  window.unchainAPI = { listSkeletonToolSchemas: method };
  return method;
};

test("passes the toolkit id and returns the tools as given", async () => {
  const method = install(answer());
  await expect(api.unchain.listSkeletonToolSchemas("core")).resolves.toStrictEqual({
    toolkit_id: "core",
    tools: [tool("read")],
  });
  expect(method).toHaveBeenCalledWith("core");
});

test.each([
  ["a wrong schema name", answer({ schema: "pupu.skeleton_tool_schemas.v2" })],
  ["another toolkit's answer", answer({ toolkit_id: "plan" })],
  ["an extra top-level key", answer({ extra: true })],
  ["tools not a list", answer({ tools: {} })],
  ["a tool with an extra key", answer({ tools: [tool("read", { title: "Read" })] })],
  ["a tool without parameters", answer({ tools: [{ name: "read", description: "x" }] })],
  ["parameters not an object", answer({ tools: [tool("read", { parameters: [] })] })],
  ["a blank tool name", answer({ tools: [tool("")] })],
  ["one name twice", answer({ tools: [tool("read"), tool("read")] })],
  ["not an object at all", null],
])("refuses %s as a protocol error", async (_label, value) => {
  install(value);
  await expect(api.unchain.listSkeletonToolSchemas("core")).rejects.toMatchObject({
    code: "skeleton_tool_schemas_malformed",
  });
});

test("a refusal from the store keeps its code", async () => {
  window.unchainAPI = {
    listSkeletonToolSchemas: jest.fn(async () => {
      // The preload rejects with a plain record; the facade restores the Error.
      // eslint-disable-next-line no-throw-literal
      throw { code: "toolkit_unsupported", path: ["toolkit"], message: "only builtin toolkits", status: 409 };
    }),
  };
  await expect(api.unchain.listSkeletonToolSchemas("remote")).rejects.toMatchObject({
    code: "toolkit_unsupported",
    status: 409,
  });
});
