const {
  createSkillRepoDownloader,
} = require("./skill_repo_download");

const createRuntimeService = ({
  app,
  dialog,
  shell,
  fs,
  path,
  getMainWindow,
}) => {
  // S6a: store one-click skill-pack install — fetch + parse-only extract of a
  // pinned GitHub repo tarball. All hard limits + temp lifecycle live in the
  // downloader module; real deps (global fetch, zlib, tar) are its defaults.
  const skillRepoDownloader = createSkillRepoDownloader({
    fs,
    path,
    getTempDir: () => app.getPath("temp"),
  });
  const appPath =
    typeof app.getAppPath === "function" ? app.getAppPath() : process.cwd();
  const BUILD_FEATURE_FLAGS_SNAPSHOT_PATH = path.join(
    appPath,
    ".local",
    "build_feature_flags.snapshot.json",
  );

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

  const syncBuildFeatureFlagsSnapshot = ({ featureFlags = {} } = {}) => {
    if (app.isPackaged) {
      return {
        ok: false,
        path: BUILD_FEATURE_FLAGS_SNAPSHOT_PATH,
        error: "dev_only",
      };
    }

    const normalized =
      featureFlags && typeof featureFlags === "object" && !Array.isArray(featureFlags)
        ? Object.fromEntries(
            Object.entries(featureFlags).map(([key, value]) => [key, value === true]),
          )
        : {};

    try {
      fs.mkdirSync(path.dirname(BUILD_FEATURE_FLAGS_SNAPSHOT_PATH), {
        recursive: true,
      });
      fs.writeFileSync(
        BUILD_FEATURE_FLAGS_SNAPSHOT_PATH,
        `${JSON.stringify(normalized, null, 2)}\n`,
        "utf-8",
      );
      return {
        ok: true,
        path: BUILD_FEATURE_FLAGS_SNAPSHOT_PATH,
        error: "",
      };
    } catch (error) {
      return {
        ok: false,
        path: BUILD_FEATURE_FLAGS_SNAPSHOT_PATH,
        error:
          typeof error?.message === "string" && error.message
            ? error.message
            : "failed_to_sync_build_feature_flags_snapshot",
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

  /* Scan a user-picked directory for Claude-style SKILL.md files. Returns the
     raw material the frontend importer (skill_pack_import.js) needs: for every
     SKILL.md, its content plus the list of sibling files in its own folder
     subtree (so the importer can gate on scripts and flag reference/asset
     dependencies). Bounded to keep a pathological tree from hanging the main
     process; parsing/filtering/normalizing all happen in the renderer. */
  const SKILL_SCAN_MAX_DEPTH = 8;
  const SKILL_SCAN_MAX_SKILLS = 500;
  const SKILL_SCAN_MAX_BYTES = 256 * 1024; // per SKILL.md read cap
  const SKILL_SCAN_IGNORE_DIRS = new Set([
    ".git",
    "node_modules",
    ".venv",
    "__pycache__",
    ".DS_Store",
  ]);

  const scanSkillDir = ({ directory = "" } = {}) => {
    const root = typeof directory === "string" ? directory.trim() : "";
    if (!root) return { ok: false, error: "no_path", files: [] };
    if (!fs.existsSync(root)) return { ok: false, error: "not_found", files: [] };

    const dirName = path.basename(root.replace(/[/\\]+$/, "")) || "imported";
    const skillMdPaths = [];

    const walk = (absDir, depth) => {
      if (depth > SKILL_SCAN_MAX_DEPTH) return;
      if (skillMdPaths.length >= SKILL_SCAN_MAX_SKILLS) return;
      let dirents;
      try {
        dirents = fs.readdirSync(absDir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const dirent of dirents) {
        if (SKILL_SCAN_IGNORE_DIRS.has(dirent.name)) continue;
        const abs = path.join(absDir, dirent.name);
        if (dirent.isDirectory()) {
          walk(abs, depth + 1);
        } else if (dirent.isFile() && dirent.name === "SKILL.md") {
          skillMdPaths.push(abs);
        }
        if (skillMdPaths.length >= SKILL_SCAN_MAX_SKILLS) return;
      }
    };

    /* Recursively list every file under a folder, returned as paths relative to
       the scan root (so they align with the SKILL.md relPath the importer sees). */
    const listFolderFiles = (folderAbs) => {
      const out = [];
      const inner = (absDir, depth) => {
        if (depth > SKILL_SCAN_MAX_DEPTH) return;
        let dirents;
        try {
          dirents = fs.readdirSync(absDir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const dirent of dirents) {
          if (SKILL_SCAN_IGNORE_DIRS.has(dirent.name)) continue;
          const abs = path.join(absDir, dirent.name);
          if (dirent.isDirectory()) inner(abs, depth + 1);
          else if (dirent.isFile()) {
            out.push(path.relative(root, abs).split(path.sep).join("/"));
          }
        }
      };
      inner(folderAbs, 0);
      return out;
    };

    try {
      walk(root, 0);
      const files = [];
      for (const skillAbs of skillMdPaths) {
        const relPath = path.relative(root, skillAbs).split(path.sep).join("/");
        let content = "";
        try {
          const stat = fs.statSync(skillAbs);
          if (stat.size <= SKILL_SCAN_MAX_BYTES) {
            content = fs.readFileSync(skillAbs, "utf-8");
          } else {
            // Oversized SKILL.md — still surface it (empty body) so the importer
            // reports it rather than the scan silently dropping it.
            content = fs.readFileSync(skillAbs, "utf-8").slice(0, SKILL_SCAN_MAX_BYTES);
          }
        } catch {
          content = "";
        }
        files.push({
          relPath,
          content,
          folderFiles: listFolderFiles(path.dirname(skillAbs)),
        });
      }
      return { ok: true, dirName, files };
    } catch (error) {
      return { ok: false, error: error.message, files: [] };
    }
  };

  return {
    validateWorkspaceRootPath,
    pickWorkspaceRoot,
    validateWorkspaceRoot,
    openRuntimeFolder,
    setChromeTerminalOpen,
    syncBuildFeatureFlagsSnapshot,
    getRuntimeDirSize,
    getCharacterStorageSize,
    deleteCharacterStorageEntry,
    deleteRuntimeEntry,
    clearRuntimeDir,
    showSaveDialog,
    showOpenDialog,
    writeFile,
    readFile,
    scanSkillDir,
    downloadSkillRepo: skillRepoDownloader.downloadSkillRepo,
    sweepLeftoverSkillpackDirs: skillRepoDownloader.sweepLeftoverSkillpackDirs,
  };
};

module.exports = {
  createRuntimeService,
};
