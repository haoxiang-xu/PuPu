import { createCatalogHandlers } from "./catalog";

const makeDeps = () => {
  const calls = [];
  return {
    calls,
    unchainAPI: {
      getModelCatalog: async () => ({
        models: [{ id: "gpt-5", provider: "openai", label: "GPT-5" }],
      }),
      getToolkitCatalog: async () => ({
        toolkits: [{ id: "tk1", name: "Search", enabled_by_default: false }],
      }),
      listCharacters: async () => ({
        characters: [{ id: "ch1", name: "Default" }],
      }),
    },
    chatStorage: {
      setChatModel: (id, model) => calls.push(["model", id, model]),
      setChatSelectedToolkits: (id, ids) => calls.push(["toolkits", id, ids]),
      setChatCharacter: (id, charId) =>
        calls.push(["character", id, charId]),
    },
  };
};

describe("catalog handlers", () => {
  test("listModels", async () => {
    const d = makeDeps();
    const h = createCatalogHandlers(d);
    const r = await h.listModels({});
    expect(r.models[0].id).toBe("gpt-5");
  });
  test("listModels normalizes array result", async () => {
    const d = makeDeps();
    d.unchainAPI.getModelCatalog = async () => [{ id: "x" }];
    const h = createCatalogHandlers(d);
    const r = await h.listModels({});
    expect(r.models).toEqual([{ id: "x" }]);
  });
  test("listModels flattens PuPu provider-keyed catalog", async () => {
    const d = makeDeps();
    d.unchainAPI.getModelCatalog = async () => ({
      providers: {
        openai: ["gpt-5", "gpt-4.1"],
        anthropic: ["claude-sonnet-4-6"],
      },
      active: { provider: "openai", model: "gpt-5" },
    });
    const h = createCatalogHandlers(d);
    const r = await h.listModels({});
    expect(r.models).toEqual([
      { id: "openai:gpt-5", provider: "openai", label: "gpt-5" },
      { id: "openai:gpt-4.1", provider: "openai", label: "gpt-4.1" },
      {
        id: "anthropic:claude-sonnet-4-6",
        provider: "anthropic",
        label: "claude-sonnet-4-6",
      },
    ]);
    expect(r.active).toEqual({ provider: "openai", model: "gpt-5" });
  });
  test("listToolkits", async () => {
    const h = createCatalogHandlers(makeDeps());
    const r = await h.listToolkits({});
    expect(r.toolkits).toHaveLength(1);
  });
  test("listCharacters", async () => {
    const h = createCatalogHandlers(makeDeps());
    const r = await h.listCharacters({});
    expect(r.characters[0].name).toBe("Default");
  });
  test("selectModel writes through", async () => {
    const d = makeDeps();
    const h = createCatalogHandlers(d);
    await h.selectModel({ id: "c1", model_id: "gpt-5" });
    expect(d.calls).toContainEqual(["model", "c1", "gpt-5"]);
  });
  test("setToolkits writes through (override)", async () => {
    const d = makeDeps();
    const h = createCatalogHandlers(d);
    await h.setToolkits({ id: "c1", toolkit_ids: ["a", "b"] });
    expect(d.calls).toContainEqual(["toolkits", "c1", ["a", "b"]]);
  });
  test("setCharacter accepts null to clear", async () => {
    const d = makeDeps();
    const h = createCatalogHandlers(d);
    await h.setCharacter({ id: "c1", character_id: null });
    expect(d.calls).toContainEqual(["character", "c1", null]);
  });
});
