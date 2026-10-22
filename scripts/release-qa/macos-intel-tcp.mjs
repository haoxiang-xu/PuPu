import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function shouldEnableMacosIntelTcp({ platform = process.platform, arch = process.arch, env = process.env } = {}) {
  return platform === "darwin" && arch === "x64" && env.GITHUB_ACTIONS === "true"
    && env.RUNNER_ENVIRONMENT === "github-hosted" && env.GITHUB_REPOSITORY === "haoxiang-xu/PuPu";
}

function executePf(args, input) {
  const result = spawnSync("/usr/bin/sudo", ["-n", "/sbin/pfctl", ...args], {
    input, encoding: "utf8", timeout: 20_000, maxBuffer: 1024 * 1024,
  });
  return { ...result, status: result.status ?? 125 };
}

const signalStatus = (signal) => ({ SIGINT: 130, SIGTERM: 143 })[signal] || 1;

export async function runMacosIntelTcp({
  command, args = [], platform = process.platform, arch = process.arch, env = process.env,
  executePf: pf = executePf, spawnCommand = spawn, signals = process,
  killGroup = (pid, signal) => process.kill(-pid, signal),
  cancellationGraceMs = 5000,
}) {
  if (typeof command !== "string" || !command || !Array.isArray(args) || [...args].some((arg) => typeof arg !== "string")) {
    throw new Error("expected a command and string arguments");
  }
  const enabled = shouldEnableMacosIntelTcp({ platform, arch, env });
  if (enabled && ![env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT].every((value) => /^[1-9]\d*$/.test(value || ""))) {
    throw new Error("hosted Intel workaround requires numeric run and attempt identities");
  }
  const anchor = enabled ? `com.apple/pupu-intel-tcp-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}-${process.pid}-${randomBytes(6).toString("hex")}` : null;
  let anchorLoaded = false;
  let token;
  let child;
  let cancelled;
  let cancellationTimer;
  let groupKilled = false;
  let result;
  let executionError;
  const cleanupErrors = [];
  const pfOutput = (response) => `${response?.stdout || ""}${response?.stderr || ""}`;
  const requireSuccess = (response) => {
    if (!response || response.status !== 0) {
      throw new Error(`PF operation failed (${response?.status ?? "unknown"}): ${pfOutput(response).slice(-4096)}`);
    }
    return pfOutput(response);
  };
  const checkedPf = async (pfArgs, input) => requireSuccess(await pf(pfArgs, input));
  const checkCancellation = () => { if (cancelled) throw new Error("command cancelled"); };
  const forward = (signal = cancelled) => {
    if (!child?.pid || signal === "SIGKILL" && groupKilled) return;
    try {
      if (platform === "win32") child.kill(signal);
      else killGroup(child.pid, signal);
      if (signal === "SIGKILL") groupKilled = true;
    } catch (error) {
      if (error.code !== "ESRCH") executionError = error;
      else if (signal === "SIGKILL") groupKilled = true;
    }
    if (child && signal !== "SIGKILL" && !cancellationTimer) {
      cancellationTimer = setTimeout(() => forward("SIGKILL"), cancellationGraceMs);
    }
  };
  const onInt = () => { cancelled ||= "SIGINT"; forward(); };
  const onTerm = () => { cancelled ||= "SIGTERM"; forward(); };
  signals.on("SIGINT", onInt);
  signals.on("SIGTERM", onTerm);
  try {
    if (enabled) {
      checkCancellation();
      const root = await checkedPf(["-sr"]);
      checkCancellation();
      if (!/^\s*anchor\s+"com\.apple\/\*"(?:\s|$)/m.test(root)) throw new Error("safe PF parent anchor is missing; main ruleset will not be replaced");
      // Mark ownership before loading: even a failed load can leave partial rules.
      anchorLoaded = true;
      await checkedPf(["-a", anchor, "-f", "-"], "block return out quick proto udp from any to any port 443\n");
      checkCancellation();
      const response = await pf(["-E"]);
      // Preserve our reference even when enabling reports a later failure.
      token = pfOutput(response).match(/Token\s*:\s*(\d+)/i)?.[1];
      requireSuccess(response);
      if (!token) throw new Error("PF enable reference token is missing; refusing an unowned global disable");
      checkCancellation();
      const rules = await checkedPf(["-a", anchor, "-sr"]);
      if (!/^block return out quick proto udp from any to any port\s*(?:=\s*)?(?:443|https)\s*$/m.test(rules)) {
        throw new Error("temporary UDP443 block was not verified");
      }
    }
    checkCancellation();
    result = await new Promise((resolve, reject) => {
      child = spawnCommand(command, args, { env, stdio: "inherit", detached: platform !== "win32" });
      const current = child;
      const remove = () => {
        clearTimeout(cancellationTimer);
        current.removeListener("error", onError);
        current.removeListener("close", onClose);
        child = undefined;
      };
      const onError = (error) => { remove(); reject(error); };
      const onClose = (code, signal) => {
        // The group leader can exit while an ignoring grandchild survives.
        if (cancelled) forward("SIGKILL");
        remove();
        resolve(code ?? signalStatus(signal));
      };
      current.once("error", onError);
      current.once("close", onClose);
      if (cancelled) forward();
    });
  } catch (error) {
    executionError ||= error;
  } finally {
    clearTimeout(cancellationTimer);
    // Never flush the root ruleset, states, another anchor, or another PF reference.
    try { if (anchorLoaded) await checkedPf(["-a", anchor, "-F", "rules"]); } catch (error) { cleanupErrors.push(error); }
    try { if (token) await checkedPf(["-X", token]); } catch (error) { cleanupErrors.push(error); }
    signals.removeListener("SIGINT", onInt);
    signals.removeListener("SIGTERM", onTerm);
  }
  if (cleanupErrors.length) throw new Error(`PF cleanup failed: ${cleanupErrors.map((error) => error.message).join("; ")}`);
  if (cancelled) return { status: signalStatus(cancelled), enabled };
  if (executionError) throw executionError;
  return { status: result, enabled };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [, , separator, command, ...args] = process.argv;
  if (separator !== "--" || !command) {
    console.error("Usage: node macos-intel-tcp.mjs -- command args...");
    process.exitCode = 1;
  } else {
    runMacosIntelTcp({ command, args }).then((result) => { process.exitCode = result.status; })
      .catch((error) => { console.error(`[macos-intel-tcp] ${error.message}`); process.exitCode = 1; });
  }
}
