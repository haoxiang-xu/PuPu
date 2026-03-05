const { CHANNELS } = require("../../shared/channels");

const createOllamaLibraryBridge = (ipcRenderer) => ({
  search: (query, category) =>
    ipcRenderer.invoke(CHANNELS.OLLAMA.LIBRARY_SEARCH, { query, category }),
});

module.exports = {
  createOllamaLibraryBridge,
};
