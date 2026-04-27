const DEFAULT_DEBOUNCE_MS = 150;
const FILE_NAME = "chats.json";
const TMP_SUFFIX = ".tmp";

const createChatStorageService = ({
  app,
  fs,
  fsp,
  path,
  debounceMs = DEFAULT_DEBOUNCE_MS,
} = {}) => {
  if (!app || !fs || !fsp || !path) {
    throw new Error("createChatStorageService: missing dependencies");
  }

  let memoryStore = null;
  let pendingPayload = null;
  let debounceTimer = null;
  let lastWritePromise = Promise.resolve();
  let resolvedFilePath = null;
  let resolvedTmpPath = null;

  const resolvePaths = () => {
    if (resolvedFilePath) return;
    const userDataDir = app.getPath("userData");
    resolvedFilePath = path.join(userDataDir, FILE_NAME);
    resolvedTmpPath = resolvedFilePath + TMP_SUFFIX;
  };

  const init = async () => {
    resolvePaths();
    try {
      const raw = await fsp.readFile(resolvedFilePath, "utf8");
      memoryStore = JSON.parse(raw);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        memoryStore = null;
        return;
      }
      console.warn("[chat-storage] failed to read chats.json:", error.message);
      memoryStore = null;
    }
  };

  const getBootstrapSnapshot = () => memoryStore;

  const persistPayloadAsync = async (payload) => {
    resolvePaths();
    const json = JSON.stringify(payload);
    await fsp.writeFile(resolvedTmpPath, json, "utf8");
    await fsp.rename(resolvedTmpPath, resolvedFilePath);
  };

  const persistPayloadSync = (payload) => {
    resolvePaths();
    const json = JSON.stringify(payload);
    fs.writeFileSync(resolvedTmpPath, json, "utf8");
    fs.renameSync(resolvedTmpPath, resolvedFilePath);
  };

  const scheduleWrite = () => {
    if (debounceTimer !== null) {
      return;
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const payload = pendingPayload;
      pendingPayload = null;
      if (payload === null) {
        return;
      }
      lastWritePromise = persistPayloadAsync(payload).catch((error) => {
        console.error("[chat-storage] async write failed:", error);
      });
    }, debounceMs);
  };

  const write = (nextStore) => {
    memoryStore = nextStore;
    pendingPayload = nextStore;
    scheduleWrite();
  };

  const flushSync = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (pendingPayload !== null) {
      try {
        persistPayloadSync(pendingPayload);
      } catch (error) {
        console.error("[chat-storage] sync flush failed:", error);
      }
      pendingPayload = null;
    }
  };

  const drain = () => lastWritePromise;

  return {
    init,
    getBootstrapSnapshot,
    write,
    flushSync,
    drain,
  };
};

module.exports = { createChatStorageService };
