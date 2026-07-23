const { spawn } = require("node:child_process");

const CAFFEINATE_PATH = "/usr/bin/caffeinate";
const CAFFEINATE_FLAGS = Object.freeze(["-dimsu"]);

const errorMessage = (error) =>
  String(error?.message || error || "unknown sleep guard error");

const snapshotState = (state) => ({
  kind: state.kind,
  pid: state.pid,
  active: state.active,
  exit: state.exit ? { ...state.exit } : null,
  error: state.error,
  ...(state.reason ? { reason: state.reason } : {}),
});

const sleep = (durationMs) =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });

const startSleepGuard = ({
  platform = process.platform,
  watchedPid,
  spawnImpl = spawn,
  command = CAFFEINATE_PATH,
} = {}) => {
  const state = {
    kind: platform === "darwin" ? "caffeinate" : "none",
    pid: null,
    active: false,
    exit: null,
    error: null,
    reason: platform === "darwin" ? "" : "unsupported-platform",
  };
  let guardProcess = null;
  let readyDone = false;
  let settledDone = false;
  let terminatedDone = false;
  let resolveReady;
  let resolveSettled;
  let resolveTerminated;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  const settled = new Promise((resolve) => {
    resolveSettled = resolve;
  });
  const terminated = new Promise((resolve) => {
    resolveTerminated = resolve;
  });
  const snapshot = () => snapshotState(state);
  const markReady = () => {
    if (readyDone) return;
    readyDone = true;
    resolveReady(snapshot());
  };
  const markSettled = () => {
    if (settledDone) return;
    settledDone = true;
    resolveSettled(snapshot());
  };
  const markTerminated = () => {
    if (terminatedDone) return;
    terminatedDone = true;
    resolveTerminated(snapshot());
  };

  if (platform !== "darwin") {
    markReady();
    markTerminated();
    return {
      ready,
      settled: null,
      snapshot,
      requestStop: () => false,
      close: async () => snapshot(),
    };
  }

  if (!Number.isSafeInteger(watchedPid) || watchedPid <= 0) {
    state.error = `invalid watched process id: ${String(watchedPid)}`;
    markReady();
    markSettled();
    markTerminated();
    return {
      ready,
      settled,
      snapshot,
      requestStop: () => false,
      close: async () => snapshot(),
    };
  }

  try {
    guardProcess = spawnImpl(
      command,
      [...CAFFEINATE_FLAGS, "-w", String(watchedPid)],
      {
        stdio: "ignore",
      },
    );
  } catch (error) {
    state.error = errorMessage(error);
    markReady();
    markSettled();
    markTerminated();
  }

  if (guardProcess) {
    state.pid = Number.isSafeInteger(guardProcess.pid)
      ? guardProcess.pid
      : null;
    guardProcess.once("spawn", () => {
      state.pid = Number.isSafeInteger(guardProcess.pid)
        ? guardProcess.pid
        : state.pid;
      state.active = true;
      markReady();
    });
    guardProcess.once("error", (error) => {
      state.error = errorMessage(error);
      state.active =
        state.pid != null &&
        guardProcess.exitCode == null &&
        guardProcess.signalCode == null;
      markReady();
      markSettled();
      if (!state.active) markTerminated();
    });
    guardProcess.once("exit", (code, signal) => {
      state.active = false;
      state.exit = {
        code: Number.isInteger(code) ? code : null,
        signal: signal || null,
      };
      markReady();
      markSettled();
      markTerminated();
    });
  }

  const requestStop = (signal = "SIGTERM") => {
    if (!guardProcess || !state.active) return false;
    try {
      return guardProcess.kill(signal);
    } catch (error) {
      state.error = state.error || errorMessage(error);
      markSettled();
      return false;
    }
  };

  const close = async ({ graceMs = 1000, forceMs = 1000 } = {}) => {
    if (!state.active) return snapshot();
    requestStop("SIGTERM");
    await Promise.race([terminated, sleep(graceMs)]);
    if (state.active) {
      requestStop("SIGKILL");
      await Promise.race([terminated, sleep(forceMs)]);
    }
    if (state.active && !state.error) {
      state.error = "sleep guard cleanup timed out";
      markSettled();
    }
    return snapshot();
  };

  return {
    ready,
    settled,
    snapshot,
    requestStop,
    close,
  };
};

const sleepGuardStartupError = (snapshot) => {
  if (!snapshot || snapshot.kind !== "caffeinate") return null;
  if (snapshot.error) return `sleep guard failed: ${snapshot.error}`;
  if (!snapshot.active) {
    const exit = snapshot.exit;
    return exit
      ? `sleep guard exited during startup (code=${String(exit.code)}, signal=${String(exit.signal)})`
      : "sleep guard did not become active";
  }
  return null;
};

const sleepGuardRuntimeError = (snapshot) => {
  if (!snapshot || snapshot.kind !== "caffeinate") return null;
  if (snapshot.error) return `sleep guard failed: ${snapshot.error}`;
  if (
    snapshot.exit &&
    (snapshot.exit.code !== 0 || snapshot.exit.signal != null)
  ) {
    return `sleep guard exited unexpectedly (code=${String(snapshot.exit.code)}, signal=${String(snapshot.exit.signal)})`;
  }
  return null;
};

const sleepGuardCleanupError = (snapshot) => {
  if (!snapshot || snapshot.kind !== "caffeinate") return null;
  if (snapshot.error) return `sleep guard cleanup failed: ${snapshot.error}`;
  if (snapshot.active) return "sleep guard cleanup failed: process is still active";
  return null;
};

const requiresSleepGuard = ({ platform = process.platform, profileName }) =>
  platform === "darwin" && profileName === "full";

module.exports = {
  CAFFEINATE_FLAGS,
  CAFFEINATE_PATH,
  requiresSleepGuard,
  sleepGuardCleanupError,
  sleepGuardRuntimeError,
  sleepGuardStartupError,
  startSleepGuard,
};
