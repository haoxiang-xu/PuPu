const { clipboard } = require("electron");

// Minimum file size (bytes) to consider a macOS screenshot non-blank.
// A solid-black PNG of any region is typically < 500 bytes.
const MACOS_BLANK_THRESHOLD = 1024;

// How long to wait (ms) for the window minimize animation before spawning tool.
const MINIMIZE_SETTLE_MS = 300;

// Windows clipboard polling settings.
const WIN_POLL_INTERVAL_MS = 200;
const WIN_POLL_TIMEOUT_MS = 30000;

// Linux screenshot tool candidates, in priority order.
const LINUX_TOOLS = [
  { bin: "gnome-screenshot", args: (f) => ["-a", "-f", f] },
  { bin: "maim", args: (f) => ["-s", f] },
  { bin: "scrot", args: (f) => ["-s", f] },
  { bin: "xfce4-screenshooter", args: (f) => ["-r", "-s", f] },
  { bin: "spectacle", args: (f) => ["-r", "-b", "-n", "-o", f] },
  { bin: "flameshot", args: (f) => ["gui", "-p", f] },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createScreenshotService = ({
  fs,
  path,
  os,
  child_process,
  getMainWindow,
}) => {
  const { execFile, spawnSync } = child_process;

  // ── helpers ──────────────────────────────────────────────────────────────

  const makeTmpPath = (ext = "png") =>
    path.join(os.tmpdir(), `pupu-screenshot-${Date.now()}.${ext}`);

  const execFileAsync = (bin, args) =>
    new Promise((resolve, reject) => {
      execFile(bin, args, { timeout: 60000 }, (err, stdout, stderr) => {
        if (err) {
          reject(Object.assign(err, { stdout, stderr }));
        } else {
          resolve({ stdout, stderr });
        }
      });
    });

  const readBase64 = (filePath) => {
    const buf = fs.readFileSync(filePath);
    return buf.toString("base64");
  };

  const tryUnlink = (filePath) => {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // best-effort cleanup
    }
  };

  const getImageHash = (nativeImage) => {
    if (!nativeImage || nativeImage.isEmpty()) return null;
    // Use a short slice of the PNG buffer as a cheap fingerprint.
    return nativeImage.toPNG().slice(0, 64).toString("hex");
  };

  // ── platform implementations ──────────────────────────────────────────────

  const captureOnMac = async (mainWindow) => {
    const tmpFile = makeTmpPath("png");
    try {
      mainWindow.minimize();
      await sleep(MINIMIZE_SETTLE_MS);

      try {
        await execFileAsync("screencapture", ["-i", tmpFile]);
      } catch {
        // screencapture exits non-zero on cancel (Esc) — that's fine.
      }

      if (!fs.existsSync(tmpFile)) {
        return { ok: false, cancelled: true };
      }

      const stat = fs.statSync(tmpFile);
      const data = readBase64(tmpFile);

      if (stat.size < MACOS_BLANK_THRESHOLD) {
        return {
          ok: false,
          cancelled: false,
          error:
            "Screenshot appears blank. Please grant Screen Recording permission in System Settings → Privacy & Security.",
        };
      }

      return { ok: true, data, mimeType: "image/png" };
    } finally {
      tryUnlink(tmpFile);
      if (!mainWindow.isDestroyed()) {
        mainWindow.restore();
        mainWindow.focus();
      }
    }
  };

  const captureOnWindows = async (mainWindow) => {
    const beforeHash = getImageHash(clipboard.readImage());

    mainWindow.minimize();
    await sleep(MINIMIZE_SETTLE_MS);

    // Launch Snipping Tool in clipboard mode.
    try {
      execFile("SnippingTool.exe", ["/clip"], () => {});
    } catch {
      // Ignore — the process launches asynchronously.
    }

    // Poll clipboard for a new image.
    const deadline = Date.now() + WIN_POLL_TIMEOUT_MS;
    let data = null;

    while (Date.now() < deadline) {
      await sleep(WIN_POLL_INTERVAL_MS);
      const img = clipboard.readImage();
      const hash = getImageHash(img);
      if (hash && hash !== beforeHash) {
        data = img.toPNG().toString("base64");
        break;
      }
    }

    if (!mainWindow.isDestroyed()) {
      mainWindow.restore();
      mainWindow.focus();
    }

    if (!data) {
      return { ok: false, cancelled: true };
    }

    return { ok: true, data, mimeType: "image/png" };
  };

  const findLinuxTool = () => {
    for (const tool of LINUX_TOOLS) {
      const result = spawnSync("which", [tool.bin], { encoding: "utf8" });
      if (result.status === 0 && result.stdout.trim()) {
        return tool;
      }
    }
    return null;
  };

  const captureOnLinux = async (mainWindow) => {
    const tool = findLinuxTool();
    if (!tool) {
      return {
        ok: false,
        cancelled: false,
        error:
          "No screenshot tool found. Install gnome-screenshot, maim, scrot, flameshot, or spectacle.",
      };
    }

    const tmpFile = makeTmpPath("png");
    try {
      mainWindow.minimize();
      await sleep(MINIMIZE_SETTLE_MS);

      try {
        await execFileAsync(tool.bin, tool.args(tmpFile));
      } catch {
        // User may have cancelled — check file existence below.
      }

      if (!fs.existsSync(tmpFile)) {
        return { ok: false, cancelled: true };
      }

      const data = readBase64(tmpFile);
      return { ok: true, data, mimeType: "image/png" };
    } finally {
      tryUnlink(tmpFile);
      if (!mainWindow.isDestroyed()) {
        mainWindow.restore();
        mainWindow.focus();
      }
    }
  };

  // ── public API ────────────────────────────────────────────────────────────

  const capture = async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false, cancelled: false, error: "No active window." };
    }

    const platform = process.platform;
    try {
      if (platform === "darwin") return await captureOnMac(mainWindow);
      if (platform === "win32") return await captureOnWindows(mainWindow);
      return await captureOnLinux(mainWindow);
    } catch (err) {
      if (!mainWindow.isDestroyed()) {
        mainWindow.restore();
        mainWindow.focus();
      }
      return { ok: false, cancelled: false, error: err.message || "Screenshot failed." };
    }
  };

  const checkAvailability = () => {
    const platform = process.platform;
    if (platform === "darwin" || platform === "win32") {
      return { available: true };
    }
    // Linux: check tool chain.
    const tool = findLinuxTool();
    if (tool) {
      return { available: true };
    }
    return {
      available: false,
      reason:
        "No screenshot tool found. Install gnome-screenshot, maim, scrot, flameshot, or spectacle.",
    };
  };

  return { capture, checkAvailability };
};

module.exports = { createScreenshotService };
