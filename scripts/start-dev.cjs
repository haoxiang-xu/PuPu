const path = require("path");
const net = require("net");
const { spawn } = require("child_process");

const electronBinary = require("electron");
const { createPortFinder } = require("../electron/shared/port_utils");

const DEFAULT_WEB_PORT = 2907;
const DEFAULT_WEB_PORT_RANGE_END = 2925;
const DEV_SERVER_HOST = "127.0.0.1";
const REACT_SCRIPTS_ENTRY = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-scripts",
  "bin",
  "react-scripts.js",
);

const { findAvailablePort } = createPortFinder(net);

const normalizePort = (candidate) => {
  const numeric = Number(candidate);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 65535) {
    return null;
  }
  return numeric;
};

const pickDevServerPort = async () => {
  const preferredPort =
    normalizePort(process.env.PUPU_WEB_PORT || process.env.PORT) ||
    DEFAULT_WEB_PORT;
  const configuredRangeEnd = normalizePort(process.env.PUPU_WEB_PORT_RANGE_END);
  const rangeEnd =
    configuredRangeEnd && configuredRangeEnd >= preferredPort
      ? configuredRangeEnd
      : DEFAULT_WEB_PORT_RANGE_END;

  const port = await findAvailablePort({
    host: "127.0.0.1",
    startPort: preferredPort,
    endPort: Math.max(preferredPort, rangeEnd),
    fallbackToEphemeral: true,
  });

  if (!port) {
    throw new Error("Unable to find an open development web port");
  }

  return { port, preferredPort };
};

const waitForChildClose = (child) =>
  new Promise((resolve) => {
    if (!child) {
      resolve({ code: 0, signal: null });
      return;
    }

    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({
        code: child.exitCode,
        signal: child.signalCode,
      });
      return;
    }

    child.once("close", (code, signal) => {
      resolve({ code, signal });
    });
  });

const stopChild = (child, signal = "SIGTERM") => {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  try {
    child.kill(signal);
  } catch {
    // Ignore races when the child exits before the signal arrives.
  }
};

const main = async () => {
  if (!electronBinary) {
    throw new Error("Electron binary could not be resolved");
  }

  const { port, preferredPort } = await pickDevServerPort();
  // Keep the browser origin on localhost so Chromium localStorage/session data
  // stays on the same origin as prior dev runs, while the server still binds
  // only to 127.0.0.1.
  const devServerUrl = `http://localhost:${port}/#`;

  if (port === preferredPort) {
    console.log(`[pupu] using dev web port ${port}`);
  } else {
    console.log(
      `[pupu] dev web port ${preferredPort} is busy, using ${port} instead`,
    );
  }

  const webProcess = spawn(
    process.execPath,
    [REACT_SCRIPTS_ENTRY, "start"],
    {
      cwd: path.join(__dirname, ".."),
      env: {
        ...process.env,
        BROWSER: "none",
        HOST: DEV_SERVER_HOST,
        PORT: String(port),
      },
      stdio: "inherit",
    },
  );

  const electronProcess = spawn(electronBinary, ["."], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      ELECTRON_START_URL: devServerUrl,
    },
    stdio: "inherit",
  });

  let shutdownStarted = false;

  const shutdown = (signal = "SIGTERM") => {
    if (shutdownStarted) {
      return;
    }
    shutdownStarted = true;

    stopChild(electronProcess, signal);
    stopChild(webProcess, signal);

    setTimeout(() => {
      stopChild(electronProcess, "SIGKILL");
      stopChild(webProcess, "SIGKILL");
    }, 4000);
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });

  const markChildStartupError = (name) => (error) => {
    console.error(
      `[pupu] failed to start ${name}: ${error?.message || "unknown error"}`,
    );
    shutdown();
  };

  webProcess.once("error", markChildStartupError("web dev server"));
  electronProcess.once("error", markChildStartupError("electron"));

  const firstExit = await Promise.race([
    waitForChildClose(webProcess).then((payload) => ({ name: "web", ...payload })),
    waitForChildClose(electronProcess).then((payload) => ({
      name: "electron",
      ...payload,
    })),
  ]);

  shutdown();

  await Promise.all([waitForChildClose(webProcess), waitForChildClose(electronProcess)]);

  if (typeof firstExit.code === "number") {
    process.exit(firstExit.code);
    return;
  }

  process.exit(0);
};

main().catch((error) => {
  console.error(`[pupu] ${error?.message || "Failed to start development mode"}`);
  process.exit(1);
});
