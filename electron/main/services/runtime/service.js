const createRuntimeService = ({ app, dialog, shell, fs, path, getMainWindow }) => {
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

  const validateWorkspaceRootPath = (candidatePath, { allowEmpty = false } = {}) => {
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
        reason: error?.message || `Unable to access workspace root: ${resolvedPath}`,
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

  return {
    validateWorkspaceRootPath,
    pickWorkspaceRoot,
    validateWorkspaceRoot,
    openRuntimeFolder,
    getRuntimeDirSize,
    deleteRuntimeEntry,
    clearRuntimeDir,
  };
};

module.exports = {
  createRuntimeService,
};
