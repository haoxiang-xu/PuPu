import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./run-restart-update-qualification.mjs", import.meta.url), "utf8");
const declaration = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
// Minimal, non-secret process evidence from run 35314008246. The old launch
// used an 8.3 path; NSIS relaunched PID 9072 using the corresponding long path.
const shortRoot = String.raw`C:\Users\RUNNER~1\AppData\Local\Temp\pupu-restart-update-qualification-OXAMnb\installed-n-minus-one\installed`;
const longRoot = String.raw`C:\Users\runneradmin\AppData\Local\Temp\pupu-restart-update-qualification-OXAMnb\installed-n-minus-one\installed`;
const shortExe = `${shortRoot}\\PuPu.exe`;
const longExe = `${longRoot}\\PuPu.exe`;
const sidecarSuffix = String.raw`\resources\unchain_runtime\dist\windows\unchain-server.exe`;
const newApp = { pid: 9072, ppid: 1404, executablePath: longExe, command: `"${longExe}" --updated` };
const newSidecar = { pid: 8216, ppid: 9072, executablePath: longRoot + sidecarSuffix, command: longRoot + sidecarSuffix };
const installed = { executablePath: shortExe, candidateNeedle: shortRoot, launchCwd: shortRoot, sidecarNeedle: shortRoot + sidecarSuffix };
const resolutions = new Map([
  [shortRoot, longRoot], [longRoot, longRoot],
  [shortExe, longExe], [longExe, longExe],
  [shortRoot + sidecarSuffix, longRoot + sidecarSuffix], [longRoot + sidecarSuffix, longRoot + sidecarSuffix],
  ["C:\\other\\PuPu.exe", "C:\\other\\PuPu.exe"],
  [`${longRoot}-other\\PuPu.exe`, `${longRoot}-other\\PuPu.exe`],
  ["C:\\", "C:\\"],
]);
const realpath = (value) => {
  if (!resolutions.has(value)) throw new Error("ENOENT: unavailable process image");
  return resolutions.get(value);
};

function replay(rows, resolver = realpath) {
  const sandbox = {
    fs: { realpathSync: { native: resolver } }, path,
    process: { platform: "win32", pid: 999, ppid: 998 },
    RESTART_UPDATE_TIMEOUTS: { relaunch: 1, sidecar: 1 },
    readProcessTable: () => rows,
    waitFor: async (predicate) => {
      const result = await predicate();
      if (!result) throw new Error("test polling exhausted");
      return result;
    },
  };
  vm.createContext(sandbox);
  vm.runInContext([
    declaration("const normalizePath =", "const hashFile ="),
    declaration("const descendantPids =", "const processAlive ="),
    declaration("const findRelaunchedRoot =", "export const assertFeedRequests ="),
    declaration("const selectRestartCleanupPids =", "class RestartCleanupTimeoutError"),
    "this.find = findRelaunchedRoot; this.sidecar = assertRelaunchedSidecar; this.cleanup = selectRestartCleanupPids; this.canonical = canonicalWindowsPath;",
  ].join("\n"), sandbox);
  return sandbox;
}

test("recorded long-path PuPu relaunch is recognized against the short-path fixture", async () => {
  const f = replay([newApp, newSidecar]);
  assert.equal((await f.find({ installed, oldPid: 3064 })).pid, 9072);
});

test("recorded long-path Sidecar is recognized only as a descendant of the new root", async () => {
  await replay([newApp, newSidecar]).sidecar({ installed, rootPid: 9072 });
  await assert.rejects(replay([{ ...newSidecar, ppid: 7000 }]).sidecar({ installed, rootPid: 9072 }), /polling exhausted/);
});

test("cleanup recognizes the real private installation but not command arguments or sibling folders", () => {
  const unrelated = { pid: 777, ppid: 7000, executablePath: "C:\\other\\PuPu.exe", command: `C:\\other\\PuPu.exe --open "${shortExe}"` };
  const sibling = { pid: 778, ppid: 7000, executablePath: `${longRoot}-other\\PuPu.exe`, command: `${longRoot}-other\\PuPu.exe` };
  const f = replay([newApp, newSidecar, unrelated, sibling]);
  assert.deepEqual([...f.cleanup({ rows: [newApp, newSidecar, unrelated, sibling], installedFixture: installed })].sort(), [8216, 9072]);
});

test("same name or installation path in arguments cannot qualify an unrelated executable", async () => {
  const row = { pid: 777, ppid: 7000, executablePath: "C:\\other\\PuPu.exe", command: `C:\\other\\PuPu.exe --open "${shortExe}"` };
  await assert.rejects(replay([row]).find({ installed, oldPid: 3064 }), /polling exhausted/);
});

test("missing, denied or malformed image paths fail closed without command-line fallback", async () => {
  for (const executablePath of [undefined, "", "C:\\gone\\PuPu.exe", 42]) {
    const row = { ...newApp, executablePath, command: shortExe };
    const f = replay([row]);
    await assert.rejects(f.find({ installed, oldPid: 3064 }), /polling exhausted/);
    assert.deepEqual([...f.cleanup({ rows: [row], installedFixture: installed })], []);
  }
  const f = replay([newApp], () => { throw new Error("EACCES"); });
  await assert.rejects(f.find({ installed, oldPid: 3064 }), /polling exhausted/);
});

test("filesystem-resolved namespace and case variations compare equally, but roots cannot own an entire volume", async () => {
  const f = replay([newApp], (value) => `\\\\?\\${realpath(value).toUpperCase()}`);
  assert.equal((await f.find({ installed, oldPid: 3064 })).pid, 9072);
  assert.deepEqual([...f.cleanup({ rows: [newApp], installedFixture: { launchCwd: "C:\\" } })], []);
  const unc = replay([], () => String.raw`\\?\UNC\server\share\folder\PuPu.exe`);
  assert.equal(unc.canonical("trusted resolver input"), "//server/share/folder/pupu.exe");
});

test("a Sidecar or helper in the private directory cannot stand in for the PuPu root", async () => {
  await assert.rejects(replay([newSidecar]).find({ installed, oldPid: 3064 }), /polling exhausted/);
  await assert.rejects(replay([{ ...newApp, pid: 3064 }]).find({ installed, oldPid: 3064 }), /polling exhausted/);
});

test("unresolvable images preserve already observed ownership but cannot add unrelated PIDs", () => {
  const rows = [newApp, newSidecar, { pid: 777, ppid: 7000, executablePath: longExe }];
  const f = replay(rows, () => { throw new Error("image removed during cleanup"); });
  const actual = f.cleanup({ rows, runtime: { child: { pid: 9072 }, observedPids: new Set([9072]) }, installedFixture: installed });
  assert.deepEqual([...actual].sort(), [8216, 9072]);
});

test("native Windows realpath resolves a real 8.3 image to the long-path process image", { skip: process.platform !== "win32" }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-path-identity-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, "long executable name.exe");
  fs.writeFileSync(executable, "path identity only; never executable");
  const probe = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command",
    "$fso = New-Object -ComObject Scripting.FileSystemObject; $fso.GetFile($env:PUPU_PATH_IDENTITY_TEST_FILE).ShortPath"],
  { encoding: "utf8", windowsHide: true, timeout: 15000, env: { ...process.env, PUPU_PATH_IDENTITY_TEST_FILE: executable } });
  assert.equal(probe.status, 0, probe.stderr || String(probe.error || ""));
  const short = probe.stdout.trim();
  if (!short.includes("~")) { t.skip("8.3 aliases are disabled on this filesystem"); return; }
  const f = replay([{ pid: 9072, ppid: 1404, executablePath: executable, command: `"${executable}" --updated` }], fs.realpathSync.native);
  assert.equal((await f.find({ installed: { executablePath: short }, oldPid: 3064 })).pid, 9072);
});
