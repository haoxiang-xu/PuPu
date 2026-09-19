import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const nativePath = (value, realpath) => {
  if (typeof value !== "string" || !path.posix.isAbsolute(value) || /[\r\n\0]/.test(value)) return null;
  try { return realpath(value); } catch { return null; }
};

// ps command contains arguments as well as the image. Admit only an exact image
// at its beginning, never a bundle directory or a path mentioned by a launcher.
// /var and /private/var aliases are admitted only after filesystem resolution.
export function macRestartImageArguments(row, expectedPath, realpath = fs.realpathSync.native) {
  const resolved = nativePath(expectedPath, realpath);
  if (!resolved || resolved === "/" || typeof row?.command !== "string") return null;
  const aliases = new Set([expectedPath, resolved]);
  if (resolved.startsWith("/private/")) {
    const alias = resolved.slice("/private".length);
    if (nativePath(alias, realpath) === resolved) aliases.add(alias);
  }
  for (const alias of aliases) {
    for (const prefix of [alias, `"${alias}"`]) {
      if (row.command === prefix) return "";
      if (row.command.startsWith(`${prefix} `)) return row.command.slice(prefix.length + 1);
    }
  }
  return null;
}

export const matchesMacRestartImage = (row, expectedPath, realpath = fs.realpathSync.native) =>
  macRestartImageArguments(row, expectedPath, realpath) !== null;

export function buildMacRestartLaunch({ home, debugPort }) {
  if (typeof home !== "string" || !path.posix.isAbsolute(home) || home === "/" ||
      path.posix.normalize(home) !== home || /[\r\n\0]/.test(home)) {
    throw new Error("macOS restart requires a native absolute user home");
  }
  return {
    userData: path.posix.join(home, "Library/Application Support/PuPu"),
    directories: [],
    environment: { HOME: home },
    args: [`--remote-debugging-port=${debugPort}`],
  };
}

export function preflightMacRestartProfile({
  environment = process.env,
  nativeHome = () => os.userInfo().homedir,
  lstat = fs.lstatSync,
} = {}) {
  if (environment.GITHUB_ACTIONS !== "true" || environment.RUNNER_ENVIRONMENT !== "github-hosted") {
    throw new Error("macOS restart qualification requires a disposable GitHub-hosted runner; refusing local or self-hosted profiles");
  }
  // userInfo uses the OS account record, not an inherited temporary HOME.
  const home = nativeHome();
  const { userData } = buildMacRestartLaunch({ home, debugPort: 0 });
  if (lstat(userData, { throwIfNoEntry: false })) {
    throw new Error("macOS restart qualification requires a fresh PuPu profile; refusing an existing profile or symlink");
  }
  return home;
}

export function inspectMacRestartProfile({ rows, rootPid, executablePath, userData, realpath = fs.realpathSync.native }) {
  const root = rows.find((row) => row.pid === rootPid);
  if (!root || !matchesMacRestartImage(root, executablePath, realpath)) return null;
  const owned = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (owned.has(row.ppid) && !owned.has(row.pid)) { owned.add(row.pid); changed = true; }
  }
  const rendererImage = path.posix.join(path.posix.dirname(path.posix.dirname(executablePath)),
    "Frameworks/PuPu Helper (Renderer).app/Contents/MacOS/PuPu Helper (Renderer)");
  const expected = nativePath(userData, realpath);
  if (!expected) throw new Error("macOS expected restart profile is unresolvable");
  const renderers = [];
  for (const row of rows) {
    if (row.pid === rootPid || !owned.has(row.pid)) continue;
    const args = macRestartImageArguments(row, rendererImage, realpath);
    if (args === null || !/(?:^|\s)--type=renderer(?:\s|$)/.test(args)) continue;
    const values = [...args.matchAll(/(?:^|\s)--user-data-dir=(?:"([^"]*)"|'([^']*)'|(.+?))(?=\s--[A-Za-z]|$)/g)]
      .map((match) => match[1] ?? match[2] ?? match[3]);
    if (values.length !== 1 || nativePath(values[0], realpath) !== expected) {
      throw new Error("macOS renderer profile does not match the retained settings profile");
    }
    renderers.push(row.pid);
  }
  if (!renderers.length) return null;
  return { root_pid: rootPid, renderer_pids: renderers, user_data: expected };
}
