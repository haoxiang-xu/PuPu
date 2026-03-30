const { contextBridge, ipcRenderer } = require("electron");
const { CHANNELS } = require("../shared/channels");
const { createMisoStreamClient } = require("./stream/unchain_stream_client");
const { createAppInfoBridge } = require("./bridges/app_info_bridge");
const { createAppUpdateBridge } = require("./bridges/app_update_bridge");
const { createOllamaBridge } = require("./bridges/ollama_bridge");
const {
  createOllamaLibraryBridge,
} = require("./bridges/ollama_library_bridge");
const { createMisoBridge } = require("./bridges/unchain_bridge");
const { createThemeBridge } = require("./bridges/theme_bridge");
const { createWindowStateBridge } = require("./bridges/window_state_bridge");

const runtimeInfo = {
  isElectron: true,
  platform: process.platform,
};

const streamClient = createMisoStreamClient(ipcRenderer);
const UNCHAIN_HTTP_ACCESS_LOG_PATTERN =
  /^\S+ - - \[[^\]]+\] "[A-Z]+ .* HTTP\/\d\.\d" \d{3} -$/;

const isMisoHttpAccessLog = (text) =>
  typeof text === "string" && UNCHAIN_HTTP_ACCESS_LOG_PATTERN.test(text.trim());

ipcRenderer.on(CHANNELS.MISO.RUNTIME_LOG, (_event, payload = {}) => {
  const level = payload?.level === "stderr" ? "stderr" : "stdout";
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  if (!text || isMisoHttpAccessLog(text)) {
    return;
  }

  if (level === "stderr") {
    console.error(`["unchain:error] ${text}`);
    return;
  }

  console.log(`[unchain] ${text}`);
});

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
  "unchainAPI",
  createMisoBridge(ipcRenderer, streamClient),
);
contextBridge.exposeInMainWorld("themeAPI", createThemeBridge(ipcRenderer));
contextBridge.exposeInMainWorld(
  "windowStateAPI",
  createWindowStateBridge(ipcRenderer),
);
