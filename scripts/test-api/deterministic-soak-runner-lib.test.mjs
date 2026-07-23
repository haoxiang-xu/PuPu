import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  CAFFEINATE_FLAGS,
  CAFFEINATE_PATH,
  requiresSleepGuard,
  sleepGuardCleanupError,
  sleepGuardRuntimeError,
  sleepGuardStartupError,
  startSleepGuard,
} = require("./deterministic-soak-runner-lib.cjs");

class FakeChild extends EventEmitter {
  constructor(pid = 9001) {
    super();
    this.pid = pid;
    this.exitCode = null;
    this.signalCode = null;
    this.killSignals = [];
  }

  markSpawned() {
    this.emit("spawn");
  }

  markExited(code = 0, signal = null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("exit", code, signal);
  }

  kill(signal) {
    this.killSignals.push(signal);
    this.markExited(null, signal);
    return true;
  }
}

test("non-macOS sleep guard is a no-op", async () => {
  let spawnCalls = 0;
  const guard = startSleepGuard({
    platform: "linux",
    watchedPid: 1234,
    spawnImpl: () => {
      spawnCalls += 1;
    },
  });

  assert.deepEqual(await guard.ready, {
    kind: "none",
    pid: null,
    active: false,
    exit: null,
    error: null,
    reason: "unsupported-platform",
  });
  assert.equal(spawnCalls, 0);
  assert.equal(guard.requestStop(), false);
  assert.deepEqual(await guard.close(), guard.snapshot());
});

test("macOS sleep guard watches the Playwright process with fixed flags", async () => {
  const fakeChild = new FakeChild(7654);
  let spawnCall = null;
  const guard = startSleepGuard({
    platform: "darwin",
    watchedPid: 4321,
    spawnImpl: (command, args, options) => {
      spawnCall = { command, args, options };
      queueMicrotask(() => fakeChild.markSpawned());
      return fakeChild;
    },
  });

  assert.deepEqual(await guard.ready, {
    kind: "caffeinate",
    pid: 7654,
    active: true,
    exit: null,
    error: null,
  });
  assert.deepEqual(spawnCall, {
    command: CAFFEINATE_PATH,
    args: [...CAFFEINATE_FLAGS, "-w", "4321"],
    options: { stdio: "ignore" },
  });

  fakeChild.markExited(0, null);
  assert.deepEqual(await guard.settled, {
    kind: "caffeinate",
    pid: 7654,
    active: false,
    exit: { code: 0, signal: null },
    error: null,
  });
});

test("macOS sleep guard reports asynchronous spawn failures", async () => {
  const fakeChild = new FakeChild(null);
  const guard = startSleepGuard({
    platform: "darwin",
    watchedPid: 4321,
    spawnImpl: () => {
      queueMicrotask(() => fakeChild.emit("error", new Error("not allowed")));
      return fakeChild;
    },
  });

  const snapshot = await guard.ready;
  assert.deepEqual(snapshot, {
    kind: "caffeinate",
    pid: null,
    active: false,
    exit: null,
    error: "not allowed",
  });
  assert.equal(
    sleepGuardStartupError(snapshot),
    "sleep guard failed: not allowed",
  );
});

test("sleep guard close reaps an active caffeinate process", async () => {
  const fakeChild = new FakeChild(7654);
  const guard = startSleepGuard({
    platform: "darwin",
    watchedPid: 4321,
    spawnImpl: () => {
      queueMicrotask(() => fakeChild.markSpawned());
      return fakeChild;
    },
  });
  await guard.ready;

  const snapshot = await guard.close({ graceMs: 1, forceMs: 1 });
  assert.deepEqual(fakeChild.killSignals, ["SIGTERM"]);
  assert.deepEqual(snapshot, {
    kind: "caffeinate",
    pid: 7654,
    active: false,
    exit: { code: null, signal: "SIGTERM" },
    error: null,
  });
});

test("sleep guard cleanup escalates when graceful termination is ignored", async () => {
  const fakeChild = new FakeChild(7654);
  fakeChild.kill = (signal) => {
    fakeChild.killSignals.push(signal);
    if (signal === "SIGKILL") fakeChild.markExited(null, signal);
    return true;
  };
  const guard = startSleepGuard({
    platform: "darwin",
    watchedPid: 4321,
    spawnImpl: () => {
      queueMicrotask(() => fakeChild.markSpawned());
      return fakeChild;
    },
  });
  await guard.ready;

  const snapshot = await guard.close({ graceMs: 1, forceMs: 1 });
  assert.deepEqual(fakeChild.killSignals, ["SIGTERM", "SIGKILL"]);
  assert.equal(snapshot.active, false);
  assert.deepEqual(snapshot.exit, { code: null, signal: "SIGKILL" });
});

test("sleep guard cleanup fails closed when neither termination signal reaps it", async () => {
  const fakeChild = new FakeChild(7654);
  fakeChild.kill = (signal) => {
    fakeChild.killSignals.push(signal);
    return true;
  };
  const guard = startSleepGuard({
    platform: "darwin",
    watchedPid: 4321,
    spawnImpl: () => {
      queueMicrotask(() => fakeChild.markSpawned());
      return fakeChild;
    },
  });
  await guard.ready;

  const snapshot = await guard.close({ graceMs: 1, forceMs: 1 });
  assert.deepEqual(fakeChild.killSignals, ["SIGTERM", "SIGKILL"]);
  assert.equal(snapshot.active, true);
  assert.equal(snapshot.error, "sleep guard cleanup timed out");
  assert.equal(
    sleepGuardCleanupError(snapshot),
    "sleep guard cleanup failed: sleep guard cleanup timed out",
  );
});

test("full macOS profile is fail-closed and runtime failures are explicit", () => {
  assert.equal(
    requiresSleepGuard({ platform: "darwin", profileName: "full" }),
    true,
  );
  assert.equal(
    requiresSleepGuard({ platform: "darwin", profileName: "quick" }),
    false,
  );
  assert.equal(
    requiresSleepGuard({ platform: "linux", profileName: "full" }),
    false,
  );
  assert.equal(
    sleepGuardRuntimeError({
      kind: "caffeinate",
      pid: 10,
      active: false,
      exit: { code: null, signal: "SIGKILL" },
      error: null,
    }),
    "sleep guard exited unexpectedly (code=null, signal=SIGKILL)",
  );
  assert.equal(
    sleepGuardCleanupError({
      kind: "caffeinate",
      pid: 10,
      active: true,
      exit: null,
      error: null,
    }),
    "sleep guard cleanup failed: process is still active",
  );
  assert.equal(
    sleepGuardCleanupError({
      kind: "caffeinate",
      pid: 10,
      active: false,
      exit: { code: null, signal: "SIGTERM" },
      error: null,
    }),
    null,
  );
});
