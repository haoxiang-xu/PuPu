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
