import { api } from "./api";
import capture from "../COMPONENTs/agents/pages/recipes_page/skeleton_toolkit_capture.json";

const original = window.unchainAPI;
afterEach(() => { window.unchainAPI = original; });

test("strict native read refuses a missing bridge while legacy keeps its fallback", async () => {
  window.unchainAPI = {};
  await expect(api.unchain.listToolModalCatalog({ strict: true })).rejects.toMatchObject({ code: "unchain_tool_modal_catalog_unavailable" });
  await expect(api.unchain.listToolModalCatalog()).resolves.toEqual({ toolkits: [], artifactKinds: [], count: 0, source: "" });
});

test.each([null, undefined, false])( "strict read does not turn a missing reply into an empty library: %s", async (value) => {
  window.unchainAPI = { listToolModalCatalog: jest.fn().mockResolvedValue(value) };
  await expect(api.unchain.listToolModalCatalog({ strict: true })).rejects.toMatchObject({ code: "unchain_tool_modal_catalog_invalid" });
});

test("the captured real catalog is unchanged and the strict option never crosses the bridge", async () => {
  window.unchainAPI = { listToolModalCatalog: jest.fn().mockResolvedValue(capture.catalog) };
  await expect(api.unchain.listToolModalCatalog({ strict: true })).resolves.toBe(capture.catalog);
  expect(window.unchainAPI.listToolModalCatalog).toHaveBeenCalledWith();
});
