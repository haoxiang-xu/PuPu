const normalize = (raw, key) => {
  if (Array.isArray(raw)) return { [key]: raw };
  return raw || { [key]: [] };
};

export const createCatalogHandlers = ({ unchainAPI, chatStorage }) => ({
  listModels: async () => normalize(await unchainAPI.getModelCatalog(), "models"),
  listToolkits: async () =>
    normalize(await unchainAPI.getToolkitCatalog(), "toolkits"),
  listCharacters: async () =>
    normalize(await unchainAPI.listCharacters(), "characters"),
  selectModel: async ({ id, model_id }) => {
    chatStorage.setChatModel(id, model_id);
    return { ok: true, model_id };
  },
  setToolkits: async ({ id, toolkit_ids }) => {
    chatStorage.setChatSelectedToolkits(id, toolkit_ids);
    return { ok: true };
  },
  setCharacter: async ({ id, character_id }) => {
    chatStorage.setChatCharacter(id, character_id);
    return { ok: true };
  },
});

export const registerCatalogHandlers = ({ bridge, unchainAPI, chatStorage }) => {
  const h = createCatalogHandlers({ unchainAPI, chatStorage });
  bridge.register("listModels", h.listModels);
  bridge.register("listToolkits", h.listToolkits);
  bridge.register("listCharacters", h.listCharacters);
  bridge.register("selectModel", h.selectModel);
  bridge.register("setToolkits", h.setToolkits);
  bridge.register("setCharacter", h.setCharacter);
};
