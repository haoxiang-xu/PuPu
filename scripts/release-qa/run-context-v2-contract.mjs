#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  describeUnchainCheckout,
  inspectPinnedUnchainCheckout,
  resolveUnchainRoot,
} from "./unchain-checkout.mjs";
import {
  PUPU_ADAPTER_CONTRACT_TESTS,
  STRICT_FAKE_CONTRACT_FILE,
  STRICT_FAKE_CONTRACT_TEST_NAMES,
  UNCHAIN_CORE_CONTRACT_TESTS,
} from "./context-v2-contract-matrix.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const unchainRoot = resolveUnchainRoot({ pupuRoot: ROOT });
const checkout = inspectPinnedUnchainCheckout({
  pupuRoot: ROOT,
  unchainRoot,
});

console.log(`[context-v2-contract] ${describeUnchainCheckout(checkout)}`);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `locked_sha=${checkout.lockedRevision}`,
      `tested_sha=${checkout.testedRevision}`,
      `dirty=${checkout.dirty}`,
      "",
    ].join("\n"),
  );
}
if (!checkout.valid) {
  console.error("[context-v2-contract] pinned checkout verification failed");
  process.exit(1);
}

const venvPython = process.platform === "win32"
  ? path.join("Scripts", "python.exe")
  : path.join("bin", "python");
const python = process.env.PYTHON || [
  path.join(ROOT, ".venv", venvPython),
  path.join(unchainRoot, ".venv", venvPython),
].find((candidate) => fs.existsSync(candidate)) ||
  (process.platform === "win32" ? "python" : "python3");
const pythonPath = [
  path.join(unchainRoot, "src"),
  process.env.PYTHONPATH,
].filter(Boolean).join(path.delimiter);
const strictFakeSource = fs.readFileSync(
  path.join(ROOT, STRICT_FAKE_CONTRACT_FILE),
  "utf8",
);
for (const testName of STRICT_FAKE_CONTRACT_TEST_NAMES) {
  if (!strictFakeSource.includes(`it("${testName}"`)) {
    console.error(
      `[context-v2-contract] strict fake sentinel is missing: ${testName}`,
    );
    process.exit(1);
  }
}

const runStage = ({ name, command, args, cwd, env = {} }) => {
  console.log(`\n[context-v2-contract] === ${name} ===`);
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`[context-v2-contract] ${name}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[context-v2-contract] ${name} failed`);
    process.exit(result.status || 1);
  }
};

runStage({
  name: "Unchain core contract matrix",
  command: python,
  args: ["-m", "pytest", ...UNCHAIN_CORE_CONTRACT_TESTS, "-q", "--tb=short"],
  cwd: unchainRoot,
  env: { PYTHONPATH: pythonPath },
});
runStage({
  name: "PuPu adapter contract matrix",
  command: python,
  args: ["-m", "pytest", ...PUPU_ADAPTER_CONTRACT_TESTS, "-q", "--tb=short"],
  cwd: path.join(ROOT, "unchain_runtime", "server"),
  env: { PYTHONPATH: pythonPath },
});
runStage({
  name: "Node strict provider fake",
  command: process.execPath,
  args: [
    "--test",
    "--test-name-pattern",
    `^(?:${STRICT_FAKE_CONTRACT_TEST_NAMES.map((name) =>
      name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    ).join("|")})$`,
    STRICT_FAKE_CONTRACT_FILE,
  ],
  cwd: ROOT,
});

console.log("\n[context-v2-contract] all blocking stages passed");
