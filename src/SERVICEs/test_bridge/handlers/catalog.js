const normalize = (raw, key) => {
  if (Array.isArray(raw)) return { [key]: raw };
  return raw || { [key]: [] };
};

const flattenModelCatalog = (raw) => {
  if (Array.isArray(raw)) return { models: raw };
  if (raw?.models && Array.isArray(raw.models)) return raw;
  if (raw?.providers && typeof raw.providers === "object") {
    const models = [];
    for (const [provider, names] of Object.entries(raw.providers)) {
      if (!Array.isArray(names)) continue;
      for (const name of names) {
        models.push({ id: `${provider}:${name}`, provider, label: name });
      }
    }
    return { models, active: raw.active || null };
  }
  return { models: [] };
};

export const createCatalogHandlers = ({ unchainAPI, chatStorage }) => ({
  listModels: async () => flattenModelCatalog(await unchainAPI.getModelCatalog()),
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
