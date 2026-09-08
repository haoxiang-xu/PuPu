const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

if (process.platform !== "win32" || !process.env.LOCALAPPDATA) {
  console.error("[pupu] start:installed currently supports per-user Windows installs.");
  process.exit(1);
}

const executable = path.join(process.env.LOCALAPPDATA, "Programs", "PuPu", "PuPu.exe");
if (!fs.existsSync(executable)) {
  console.error(`[pupu] Installed app not found: ${executable}. Install PuPu first.`);
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_START_URL;
const child = spawn(executable, process.argv.slice(2), {
  cwd: path.dirname(executable),
  env,
  detached: true,
  windowsHide: true,
  stdio: "ignore",
});
child.once("error", (error) => {
  console.error(`[pupu] Could not launch installed app: ${error.message}`);
  process.exitCode = 1;
});
child.once("spawn", () => {
  console.log(`[pupu] Launched INSTALLED app: ${executable}`);
  console.log("[pupu] Close any development PuPu window before using the installed app.");
  child.unref();
});
