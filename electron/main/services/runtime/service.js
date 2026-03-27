const createRuntimeService = ({
  app,
  dialog,
  shell,
  fs,
  path,
  getMainWindow,
}) => {
  const expandWorkspacePath = (candidatePath) => {
    if (typeof candidatePath !== "string") {
      return "";
    }
    const trimmed = candidatePath.trim();
    if (!trimmed) {
      return "";
    }

    if (trimmed === "~") {
      return app.getPath("home");
    }
    if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
      return path.join(app.getPath("home"), trimmed.slice(2));
    }
    return trimmed;
  };

  const validateWorkspaceRootPath = (
    candidatePath,
    { allowEmpty = false } = {},
  ) => {
    const expanded = expandWorkspacePath(candidatePath);
    if (!expanded) {
      return allowEmpty
        ? { valid: true, resolvedPath: "", reason: "" }
        : {
            valid: false,
            resolvedPath: "",
            reason: "Workspace root is required.",
          };
    }

    const resolvedPath = path.resolve(expanded);
    if (!fs.existsSync(resolvedPath)) {
      return {
        valid: false,
        resolvedPath: "",
        reason: `Workspace root does not exist: ${resolvedPath}`,
      };
    }

    let stats = null;
    try {
      stats = fs.statSync(resolvedPath);
    } catch (error) {
      return {
        valid: false,
        resolvedPath: "",
        reason:
          error?.message || `Unable to access workspace root: ${resolvedPath}`,
      };
    }

    if (!stats.isDirectory()) {
      return {
        valid: false,
        resolvedPath: "",
        reason: `Workspace root is not a directory: ${resolvedPath}`,
      };
    }

    return {
      valid: true,
      resolvedPath,
      reason: "",
    };
  };

  const pickWorkspaceRoot = async ({ defaultPath = "" } = {}) => {
    const validation = validateWorkspaceRootPath(defaultPath, {
      allowEmpty: true,
    });
    const fallbackPath = app.getPath("home");
    const mainWindow = getMainWindow();
    const targetWindow =
      mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;

    const dialogResult = await dialog.showOpenDialog(targetWindow, {
      title: "Select Workspace Root",
      defaultPath:
        validation.valid && validation.resolvedPath
          ? validation.resolvedPath
          : fallbackPath,
      properties: ["openDirectory", "createDirectory"],
    });

    if (
      dialogResult.canceled ||
      !Array.isArray(dialogResult.filePaths) ||
      !dialogResult.filePaths[0]
    ) {
      return { canceled: true, path: "" };
    }

    return {
      canceled: false,
      path: String(dialogResult.filePaths[0]),
    };
  };

  const validateWorkspaceRoot = ({ path: rootPath } = {}) => {
    const validation = validateWorkspaceRootPath(rootPath, {
      allowEmpty: true,
    });
    return {
      valid: Boolean(validation.valid),
      resolvedPath: validation.resolvedPath || "",
      reason: validation.reason || "",
    };
  };

  const openRuntimeFolder = async ({ path: folderPath = "" } = {}) => {
    const validation = validateWorkspaceRootPath(folderPath, {
      allowEmpty: false,
    });
    if (!validation.valid) {
      return { ok: false, error: validation.reason || "Invalid path" };
    }
    const result = await shell.openPath(validation.resolvedPath);
    return { ok: result === "", error: result || null };
  };

  const setChromeTerminalOpen = ({ open = false } = {}) => {
    const nextOpen = Boolean(open);

    if (app.isPackaged) {
      return { ok: false, open: false, error: "dev_only" };
    }

    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false, open: nextOpen, error: "main_window_unavailable" };
    }

    const targetWebContents = mainWindow.webContents;
    if (
      !targetWebContents ||
      (typeof targetWebContents.isDestroyed === "function" &&
        targetWebContents.isDestroyed())
    ) {
      return { ok: false, open: nextOpen, error: "webcontents_unavailable" };
    }

    try {
      if (nextOpen) {
        targetWebContents.openDevTools({ mode: "detach" });
      } else {
        targetWebContents.closeDevTools();
      }
      return { ok: true, open: nextOpen };
    } catch (error) {
      return {
        ok: false,
        open: nextOpen,
        error:
          typeof error?.message === "string" && error.message
            ? error.message
            : "failed_to_toggle_chrome_terminal",
      };
    }
  };

  const getDirSize = (dirPath) => {
    let total = 0;
    try {
      for (const entry of fs.readdirSync(dirPath)) {
        const full = path.join(dirPath, entry);
        try {
          const stat = fs.statSync(full);
          total += stat.isDirectory() ? getDirSize(full) : stat.size;
        } catch {
          // ignore individual file errors
        }
      }
    } catch {
      // ignore directory errors
    }
    return total;
  };

  const getPathSize = (targetPath) => {
    try {
      const stat = fs.statSync(targetPath);
      return stat.isDirectory() ? getDirSize(targetPath) : stat.size;
    } catch {
      return 0;
    }
  };

  const listFilteredDirEntries = (dirPath, predicate = () => true) => {
    if (!dirPath || !fs.existsSync(dirPath)) {
      return [];
    }

    const entries = [];
    for (const name of fs.readdirSync(dirPath)) {
      if (!predicate(name)) {
        continue;
      }

      const full = path.join(dirPath, name);
      try {
        const stat = fs.statSync(full);
        entries.push({
          name,
          size: stat.isDirectory() ? getDirSize(full) : stat.size,
          isDir: stat.isDirectory(),
        });
      } catch {
        // ignore individual file errors
      }
    }

    return entries;
  };

  const getRuntimeDirSize = ({ dirPath = "" } = {}) => {
    const targetDir =
      typeof dirPath === "string" && dirPath.trim() ? dirPath.trim() : null;

    if (!targetDir || !fs.existsSync(targetDir)) {
      return {
        entries: [],
        total: 0,
        error: targetDir ? "not_found" : "no_path",
      };
    }

    let total = 0;
    const entries = [];

    for (const name of fs.readdirSync(targetDir)) {
      const full = path.join(targetDir, name);
      try {
        const stat = fs.statSync(full);
        const size = stat.isDirectory() ? getDirSize(full) : stat.size;
        entries.push({ name, size, isDir: stat.isDirectory() });
        total += size;
      } catch {
        // ignore individual file errors
      }
    }

    entries.sort((a, b) => b.size - a.size);
    return { entries, total };
  };

  const getCharacterStorageSize = () => {
    const userDataDir = app.getPath("userData");
    const charactersDir = path.join(userDataDir, "characters");
    const avatarsDir = path.join(charactersDir, "avatars");
    const sessionsDir = path.join(userDataDir, "memory", "sessions");
    const profilesDir = path.join(userDataDir, "memory", "long_term_profiles");
    const registryPath = path.join(charactersDir, "registry.json");

    const registryExists = fs.existsSync(registryPath);
    const avatarsExists = fs.existsSync(avatarsDir);
    const registryTotal = registryExists ? getPathSize(registryPath) : 0;
    const avatarTotal = avatarsExists ? getPathSize(avatarsDir) : 0;
    const sessionEntries = listFilteredDirEntries(
      sessionsDir,
      (name) => typeof name === "string" && name.startsWith("character_"),
    );
    const profileEntries = listFilteredDirEntries(
      profilesDir,
      (name) => typeof name === "string" && name.startsWith("character_"),
    );
    const sessionTotal = sessionEntries.reduce(
      (sum, entry) => sum + (Number(entry.size) || 0),
      0,
    );
    const profileTotal = profileEntries.reduce(
      (sum, entry) => sum + (Number(entry.size) || 0),
      0,
    );

    const entries = [];
    if (registryExists) {
      entries.push({ name: "registry.json", size: registryTotal, isDir: false });
    }
    if (avatarsExists) {
      entries.push({ name: "avatars", size: avatarTotal, isDir: true });
    }
    if (sessionEntries.length > 0) {
      entries.push({ name: "sessions", size: sessionTotal, isDir: true });
    }
    if (profileEntries.length > 0) {
      entries.push({ name: "profiles", size: profileTotal, isDir: true });
    }

    entries.sort((a, b) => b.size - a.size);

    return {
      entries,
      total: registryTotal + avatarTotal + sessionTotal + profileTotal,
      registryTotal,
      avatarTotal,
      sessionTotal,
      profileTotal,
      error: "",
    };
  };

  const deleteCharacterStorageEntry = ({ entryName = "" } = {}) => {
    const safeEntryName =
      typeof entryName === "string" ? entryName.trim() : "";
    const userDataDir = app.getPath("userData");
    const charactersDir = path.join(userDataDir, "characters");
    const avatarsDir = path.join(charactersDir, "avatars");
    const sessionsDir = path.join(userDataDir, "memory", "sessions");
    const profilesDir = path.join(userDataDir, "memory", "long_term_profiles");
    const registryPath = path.join(charactersDir, "registry.json");

    const removeMatchingEntries = (dirPath, predicate) => {
      if (!dirPath || !fs.existsSync(dirPath)) {
        return 0;
      }

      let deletedCount = 0;
      for (const name of fs.readdirSync(dirPath)) {
        if (!predicate(name)) {
          continue;
        }

        try {
          fs.rmSync(path.join(dirPath, name), { recursive: true, force: true });
          deletedCount += 1;
        } catch {
          // ignore individual file errors
        }
      }
      return deletedCount;
    };

    try {
      if (safeEntryName === "registry.json") {
        fs.rmSync(registryPath, { force: true });
        return { ok: true };
      }

      if (safeEntryName === "avatars") {
        removeMatchingEntries(avatarsDir, () => true);
        return { ok: true };
      }

      if (safeEntryName === "sessions") {
        removeMatchingEntries(
          sessionsDir,
          (name) => typeof name === "string" && name.startsWith("character_"),
        );
        return { ok: true };
      }

      if (safeEntryName === "profiles") {
        removeMatchingEntries(
          profilesDir,
          (name) => typeof name === "string" && name.startsWith("character_"),
        );
        return { ok: true };
      }
    } catch (error) {
      return { ok: false, error: error.message };
    }

    return { ok: false, error: "invalid" };
  };

  const deleteRuntimeEntry = ({ dirPath = "", entryName = "" } = {}) => {
    const dir = typeof dirPath === "string" ? dirPath.trim() : "";
    const name =
      typeof entryName === "string" ? path.basename(entryName.trim()) : "";
    if (!dir || !name || name === "." || name === "..") {
      return { ok: false, error: "invalid" };
    }

    const full = path.join(dir, name);
    if (!full.startsWith(dir + path.sep) && full !== dir) {
      return { ok: false, error: "invalid" };
    }

    try {
      fs.rmSync(full, { recursive: true, force: true });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  };

  const clearRuntimeDir = ({ dirPath = "" } = {}) => {
    const dir = typeof dirPath === "string" ? dirPath.trim() : "";
    if (!dir || !fs.existsSync(dir)) {
      return { ok: false, error: "not_found" };
    }

    try {
      for (const name of fs.readdirSync(dir)) {
        fs.rmSync(path.join(dir, name), { recursive: true, force: true });
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  };

  const showSaveDialog = async ({ defaultPath = "", filters = [] } = {}) => {
    const mainWindow = getMainWindow();
    const targetWindow =
      mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;

    const dialogResult = await dialog.showSaveDialog(targetWindow, {
      title: "Export",
      defaultPath: defaultPath || app.getPath("downloads"),
      filters:
        Array.isArray(filters) && filters.length > 0
          ? filters
          : [{ name: "JSON Files", extensions: ["json"] }],
    });

    if (dialogResult.canceled || !dialogResult.filePath) {
      return { canceled: true, filePath: "" };
    }

    return { canceled: false, filePath: String(dialogResult.filePath) };
  };

  const showOpenDialog = async ({ filters = [], properties = [] } = {}) => {
    const mainWindow = getMainWindow();
    const targetWindow =
      mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;

    const dialogResult = await dialog.showOpenDialog(targetWindow, {
      title: "Import",
      defaultPath: app.getPath("downloads"),
      filters:
        Array.isArray(filters) && filters.length > 0
          ? filters
          : [{ name: "JSON Files", extensions: ["json"] }],
      properties:
        Array.isArray(properties) && properties.length > 0
          ? properties
          : ["openFile"],
    });

    if (
      dialogResult.canceled ||
      !Array.isArray(dialogResult.filePaths) ||
      !dialogResult.filePaths[0]
    ) {
      return { canceled: true, filePaths: [] };
    }

    return {
      canceled: false,
      filePaths: dialogResult.filePaths.map(String),
    };
  };

  const writeFile = ({ filePath: targetPath = "", content = "" } = {}) => {
    const p = typeof targetPath === "string" ? targetPath.trim() : "";
    if (!p) {
      return { ok: false, error: "no_path" };
    }

    try {
      fs.writeFileSync(p, content, "utf-8");
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  };

  const readFile = ({ filePath: targetPath = "" } = {}) => {
    const p = typeof targetPath === "string" ? targetPath.trim() : "";
    if (!p) {
      return { ok: false, error: "no_path", content: "" };
    }

    if (!fs.existsSync(p)) {
      return { ok: false, error: "not_found", content: "" };
    }

    try {
      const content = fs.readFileSync(p, "utf-8");
      return { ok: true, content };
    } catch (error) {
      return { ok: false, error: error.message, content: "" };
    }
  };

  return {
    validateWorkspaceRootPath,
    pickWorkspaceRoot,
    validateWorkspaceRoot,
    openRuntimeFolder,
    setChromeTerminalOpen,
    getRuntimeDirSize,
    getCharacterStorageSize,
    deleteCharacterStorageEntry,
    deleteRuntimeEntry,
    clearRuntimeDir,
    showSaveDialog,
    showOpenDialog,
    writeFile,
    readFile,
  };
};

module.exports = {
  createRuntimeService,
};
