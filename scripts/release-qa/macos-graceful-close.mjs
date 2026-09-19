import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Fixed JXA source; identities travel as argv, never interpolated code. Resolve
// the *running instance*, not Application(bundlePath), which can launch/resolve
// a different instance after Squirrel replaces the bundle in place.
export const MACOS_CLOSE_SCRIPT = `
ObjC.import("AppKit");
ObjC.bindFunction("realpath", ["char *", ["char *", "void *"]]);
function run(argv) {
  var pid = Number(argv[0]), bundle = argv[1], executable = argv[2];
  var pinnedStart = argv[3], action = argv[4];
  if (!(pid > 1 && pid <= 2147483647 && Math.floor(pid) === pid) ||
      (action !== "inspect" && action !== "quit")) throw Error("invalid macOS close arguments");
  var app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(pid);
  if (app.isNil() || app.terminated) throw Error("macOS close target is no longer running");
  function canonical(url) {
    if (url.isNil()) throw Error("macOS close target has no file URL");
    // Foundation removes /private from some system paths even after resolving
    // symlinks. Use POSIX realpath, exactly like Node fs.realpathSync.native.
    // Each short-lived probe resolves only two URLs; never guess path aliases.
    var resolved;
    try { resolved = $.realpath(ObjC.unwrap(url.path), null); }
    catch (_) { throw Error("macOS close cannot resolve target file URL"); }
    if (typeof resolved !== "string" || resolved.charAt(0) !== "/")
      throw Error("macOS close cannot resolve target file URL");
    return resolved;
  }
  var actualBundle = canonical(app.bundleURL), actualExecutable = canonical(app.executableURL);
  if (Number(app.processIdentifier) !== pid || actualBundle !== bundle || actualExecutable !== executable)
    throw Error("macOS close target identity mismatch");
  var start;
  if (!app.launchDate.isNil() && pinnedStart.indexOf("kernel-lstart:") !== 0) {
    start = "launch-date:" + String(app.launchDate.timeIntervalSince1970);
  } else {
    // Direct executable launches need not have a LaunchServices launchDate.
    // Pin the kernel's start time instead; never substitute the current time.
    var task = $.NSTask.alloc.init, pipe = $.NSPipe.pipe;
    task.launchPath = "/bin/ps";
    task.arguments = ["-p", String(pid), "-o", "lstart="];
    task.environment = { LC_ALL: "C" };
    task.standardOutput = pipe;
    task.launch;
    var bytes = pipe.fileHandleForReading.readDataToEndOfFile;
    task.waitUntilExit;
    if (Number(task.terminationStatus) !== 0) throw Error("macOS close cannot read kernel start time");
    var kernelStart = ObjC.unwrap($.NSString.alloc.initWithDataEncoding(bytes, $.NSUTF8StringEncoding)).trim();
    if (!/^[A-Z][a-z]{2} [A-Z][a-z]{2} +[0-9]{1,2} [0-9]{2}:[0-9]{2}:[0-9]{2} [0-9]{4}$/.test(kernelStart))
      throw Error("macOS close has invalid kernel start time");
    start = "kernel-lstart:" + kernelStart;
  }
  if (pinnedStart && pinnedStart !== start) throw Error("macOS close PID was reused");
  var ready = Boolean(app.finishedLaunching), sent = false, accepted = false;
  if (action === "quit" && ready) {
    // Normal Cocoa quit preserves the application's before-quit/unload vetoes.
    // A true result is NOT proof of process exit; the caller checks that later.
    sent = true;
    accepted = Boolean(app.terminate);
  }
  return JSON.stringify({ schema: "pupu.macos-close-observation.v1", pid: pid,
    bundle_path: actualBundle, executable_path: actualExecutable, started_at: start,
    finished_launching: ready, request_sent: sent, accepted: accepted });
}
`;

const positive = (value) => Number.isSafeInteger(value) && value > 0;
const canonicalPath = (value, realpath) => {
  if (typeof value !== "string" || !path.posix.isAbsolute(value) || /[\r\n\0]/.test(value)) {
    throw new Error("macOS close requires an absolute identity path");
  }
  return realpath(value);
};

export function validateMacCloseObservation(row, { pid, bundlePath, executablePath, startedAt, action }) {
  const keys = ["schema", "pid", "bundle_path", "executable_path", "started_at", "finished_launching", "request_sent", "accepted"];
  if (!row || typeof row !== "object" || Array.isArray(row) ||
      JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(keys.sort()) ||
      row.schema !== "pupu.macos-close-observation.v1" || row.pid !== pid ||
      row.bundle_path !== bundlePath || row.executable_path !== executablePath ||
      typeof row.started_at !== "string" || !/^(?:launch-date:[1-9][0-9]*(?:\.[0-9]+)?|kernel-lstart:[A-Z][a-z]{2} [A-Z][a-z]{2} +[0-9]{1,2} [0-9]{2}:[0-9]{2}:[0-9]{2} [0-9]{4})$/.test(row.started_at) ||
      (startedAt && row.started_at !== startedAt) ||
      typeof row.finished_launching !== "boolean" || typeof row.request_sent !== "boolean" || typeof row.accepted !== "boolean" ||
      (row.accepted && !row.request_sent) || (row.request_sent && !row.finished_launching) ||
      (action === "inspect" && row.request_sent) ||
      (action === "quit" && row.finished_launching && !row.request_sent)) {
    throw new Error("invalid macOS close observation or changed process identity");
  }
  return row;
}

// Native launch readiness plus a bounded settling period, NOT a claim that
// React or its quit-drain listener is ready. Squirrel drops the old CDP port,
// so no new renderer readiness can be inferred from the old browser session.
// Poll only before sending. Never retry an uncertain/already sent quit, nor
// force termination to turn application vetoes into qualification passes.
export async function closeMacApplication(pid, appPath, imagePath, {
  timeoutMs = 120_000,
  settleMs = 10_000,
  pollMs = 1_000,
  realpath = fs.realpathSync.native,
  spawnProbe = spawnSync,
  now = Date.now,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onObservation = (row) => console.log(`[macos-close] ${JSON.stringify(row)}`),
} = {}) {
  if (!positive(pid) || pid <= 1 || pid > 2_147_483_647 || pid === process.pid || pid === process.ppid ||
      !positive(timeoutMs) || !positive(settleMs) || !positive(pollMs) || settleMs >= timeoutMs) {
    throw new Error("invalid macOS close PID or time budget");
  }
  const bundlePath = canonicalPath(appPath, realpath);
  const executablePath = canonicalPath(imagePath, realpath);
  if (!bundlePath.endsWith(".app") || !executablePath.startsWith(`${bundlePath}/Contents/MacOS/`)) {
    throw new Error("macOS close executable must belong to the expected app bundle");
  }
  const deadline = now() + timeoutMs;
  let startedAt = "", readySince = null, attempt = 0, last = null;
  while (now() < deadline) {
    const action = readySince !== null && now() - readySince >= settleMs ? "quit" : "inspect";
    const result = spawnProbe("/usr/bin/osascript", ["-l", "JavaScript", "-e", MACOS_CLOSE_SCRIPT,
      String(pid), bundlePath, executablePath, startedAt, action], {
      encoding: "utf8", timeout: Math.max(1, Math.min(10_000, deadline - now())), maxBuffer: 64 * 1024,
    });
    attempt += 1;
    if (result.error || result.status !== 0) {
      throw new Error(`macOS close probe failed (pid=${pid}, action=${action}, attempt=${attempt}): ${String(
        result.stderr || result.error?.message || result.stdout || "unknown failure",
      ).trim().slice(-4_000)}; last=${JSON.stringify(last)}`);
    }
    const row = validateMacCloseObservation(JSON.parse(String(result.stdout || "").trim()), {
      pid, bundlePath, executablePath, startedAt, action,
    });
    startedAt = row.started_at;
    last = { ...row, action, attempt, elapsed_ms: timeoutMs - Math.max(0, deadline - now()),
      readiness: "native-launch-plus-settle-not-renderer-handshake" };
    onObservation(last);
    if (now() >= deadline) break;
    if (row.request_sent) {
      if (!row.accepted) throw new Error(`macOS normal quit request rejected; last=${JSON.stringify(last)}`);
      return last;
    }
    if (!row.finished_launching) readySince = null;
    else if (readySince === null) readySince = now();
    await pause(Math.min(pollMs, deadline - now()));
  }
  throw new Error(`macOS close readiness timed out (pid=${pid}, budget=${timeoutMs}ms); last=${JSON.stringify(last)}`);
}
