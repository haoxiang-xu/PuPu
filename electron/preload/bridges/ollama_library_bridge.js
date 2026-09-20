const { CHANNELS } = require("../../shared/channels");

const createOllamaLibraryBridge = (ipcRenderer) => ({
  search: (query, category, sort) =>
    ipcRenderer.invoke(CHANNELS.OLLAMA.LIBRARY_SEARCH, {
      query,
      category,
      sort,
    }),
  tags: (name) => ipcRenderer.invoke(CHANNELS.OLLAMA.LIBRARY_TAGS, { name }),
});

module.exports = {
  createOllamaLibraryBridge,
};
