const { contextBridge, ipcRenderer } = require("electron");
const { createMisoStreamClient } = require("./stream/miso_stream_client");
const { createAppInfoBridge } = require("./bridges/app_info_bridge");
const { createAppUpdateBridge } = require("./bridges/app_update_bridge");
const { createOllamaBridge } = require("./bridges/ollama_bridge");
const {
  createOllamaLibraryBridge,
} = require("./bridges/ollama_library_bridge");
const { createMisoBridge } = require("./bridges/miso_bridge");
const { createThemeBridge } = require("./bridges/theme_bridge");
const { createWindowStateBridge } = require("./bridges/window_state_bridge");

const runtimeInfo = {
  isElectron: true,
  platform: process.platform,
};

const streamClient = createMisoStreamClient(ipcRenderer);

contextBridge.exposeInMainWorld("runtime", runtimeInfo);
contextBridge.exposeInMainWorld("appInfoAPI", createAppInfoBridge(ipcRenderer));
contextBridge.exposeInMainWorld("appUpdateAPI", createAppUpdateBridge(ipcRenderer));
contextBridge.exposeInMainWorld("osInfo", {
  platform: process.platform,
});
contextBridge.exposeInMainWorld("ollamaAPI", createOllamaBridge(ipcRenderer));
contextBridge.exposeInMainWorld(
  "ollamaLibraryAPI",
  createOllamaLibraryBridge(ipcRenderer),
);
contextBridge.exposeInMainWorld(
  "misoAPI",
  createMisoBridge(ipcRenderer, streamClient),
);
contextBridge.exposeInMainWorld("themeAPI", createThemeBridge(ipcRenderer));
contextBridge.exposeInMainWorld(
  "windowStateAPI",
  createWindowStateBridge(ipcRenderer),
);
