#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawnSync } = require("child_process");

const SKIP_ENV_KEY = "PUPU_VERSION_PREPARED";
const VERSION_ENV_KEY = "PUPU_BUILD_VERSION";
const PACKAGE_JSON_PATH = path.resolve(__dirname, "..", "package.json");

const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const USAGE = [
  "Usage:",
  "  npm run version:prepare-build -- --version 1.2.3",
  "  npm run version:prepare-build -- --version 1.2.3-beta.1",
  "  PUPU_BUILD_VERSION=1.2.3 npm run build:electron:linux",
].join("\n");

const logError = (message) => {
  console.error(`[version:prepare-build] ${message}`);
};

const logInfo = (message) => {
  console.log(`[version:prepare-build] ${message}`);
};

const readPackageVersion = () => {
  try {
    const raw = fs.readFileSync(PACKAGE_JSON_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed.version === "string" ? parsed.version.trim() : "";
  } catch (error) {
    throw new Error(
      `Failed to read package version from ${PACKAGE_JSON_PATH}: ${error.message}`,
    );
  }
};

const normalizeVersion = (input) => {
  if (typeof input !== "string") {
    return "";
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/^[vV](?=\d)/, "");
};

const isValidSemver = (value) => SEMVER_REGEX.test(value);

const parseVersionFromArgs = (argv) => {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }
    if (arg === "--version") {
      const nextValue = argv[index + 1];
      if (typeof nextValue !== "string" || !nextValue.trim()) {
        throw new Error("Missing value after --version");
      }
      return { version: nextValue };
    }
    if (arg.startsWith("--version=")) {
      const [, value] = arg.split("=", 2);
      if (!value || !value.trim()) {
        throw new Error("Missing value in --version=<value>");
      }
      return { version: value };
    }
  }
  return {};
};

const promptVersion = () =>
  new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(
      "Enter build version (SemVer, e.g. 1.2.3 or v1.2.3): ",
      (answer) => {
        rl.close();
        resolve(answer);
      },
    );
  });

const runNpmVersion = (version) => {
  const npmCommand = process.platform === "win32"
    ? process.env.ComSpec || "cmd.exe"
    : "npm";
  const npmArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm", "version", "--no-git-tag-version", version]
    : ["version", "--no-git-tag-version", version];
  const result = spawnSync(npmCommand, npmArgs, {
    // Spawning npm.cmd directly can throw EINVAL on Windows; cmd.exe avoids that.
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
  });

  if (result.error) {
    throw new Error(`Failed to execute npm version: ${result.error.message}`);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
};

const resolveTargetVersion = async () => {
  const parsedArgs = parseVersionFromArgs(process.argv.slice(2));
  if (parsedArgs.help) {
    console.log(USAGE);
    process.exit(0);
  }

  if (parsedArgs.version) {
    return { source: "arg", value: parsedArgs.version };
  }

  if (process.env[VERSION_ENV_KEY]) {
    return { source: "env", value: process.env[VERSION_ENV_KEY] };
  }

  const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!isInteractive) {
    throw new Error(
      `No version provided in non-interactive mode. Use --version or ${VERSION_ENV_KEY}.\n${USAGE}`,
    );
  }

  const prompted = await promptVersion();
  return { source: "prompt", value: prompted };
};

const runUpdateReadmeLinks = () => {
  const scriptPath = path.resolve(__dirname, "update-readme-links.cjs");
  const nodeCommand = process.execPath;
  const result = spawnSync(nodeCommand, [scriptPath], {
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
  });
  if (result.error) {
    logError(`Failed to run update-readme-links: ${result.error.message}`);
  }
};

const main = async () => {
  if (process.env[SKIP_ENV_KEY] === "1") {
    logInfo(`Skipped because ${SKIP_ENV_KEY}=1`);
    runUpdateReadmeLinks();
    return;
  }

  const currentVersion = readPackageVersion();
  if (!currentVersion) {
    throw new Error("Current package.json version is empty or invalid.");
  }

  const { source, value } = await resolveTargetVersion();
  const normalized = normalizeVersion(value);
  if (!normalized) {
    throw new Error("Version cannot be empty.");
  }
  if (!isValidSemver(normalized)) {
    throw new Error(`Invalid SemVer: "${value}".`);
  }

  if (normalized === currentVersion) {
    logInfo(`Version already ${normalized}; no update needed.`);
    runUpdateReadmeLinks();
    return;
  }

  logInfo(
    `Updating version from ${currentVersion} to ${normalized} (source: ${source}).`,
  );
  runNpmVersion(normalized);
  logInfo(`Version updated to ${normalized}.`);
  runUpdateReadmeLinks();
};

main().catch((error) => {
  logError(error.message || String(error));
  process.exit(1);
});
