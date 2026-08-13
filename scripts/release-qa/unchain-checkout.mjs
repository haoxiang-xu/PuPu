import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { readPinnedUnchainRevision } from "./resolve-unchain-revision.mjs";

const runGit = (root, args) => {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0 || result.error) {
    const detail = String(
      result.stderr || result.stdout || result.error || "unknown error",
    ).trim();
    throw new Error(`git ${args.join(" ")} failed in ${root}: ${detail}`);
  }
  return result.stdout.trim();
};

export const resolveUnchainRoot = ({
  pupuRoot,
  environment = process.env,
} = {}) => path.resolve(
  environment.UNCHAIN_SOURCE_PATH || path.join(pupuRoot, "..", "unchain"),
);

export const inspectPinnedUnchainCheckout = ({
  pupuRoot,
  unchainRoot,
} = {}) => {
  const sourceMarker = path.join(unchainRoot, "src", "unchain", "__init__.py");
  if (!fs.existsSync(sourceMarker)) {
    throw new Error(
      `Invalid Unchain source checkout: expected ${sourceMarker}`,
    );
  }

  const lockedRevision = readPinnedUnchainRevision({ root: pupuRoot });
  const testedRevision = runGit(unchainRoot, ["rev-parse", "HEAD"]);
  const status = runGit(unchainRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  const dirty = Boolean(status);
  const failures = [];
  if (testedRevision !== lockedRevision) {
    failures.push("tested Unchain HEAD does not match the runtime lock");
  }
  if (dirty) {
    failures.push("tested Unchain checkout is dirty");
  }

  return {
    sourcePath: unchainRoot,
    lockedRevision,
    testedRevision,
    dirty,
    status,
    valid: failures.length === 0,
    failures,
  };
};

export const describeUnchainCheckout = (checkout) => [
  `locked_sha=${checkout.lockedRevision}`,
  `tested_sha=${checkout.testedRevision}`,
  `dirty=${checkout.dirty}`,
  ...(checkout.failures || []),
].join("; ");

export const requirePinnedUnchainCheckout = (options) => {
  const checkout = inspectPinnedUnchainCheckout(options);
  if (!checkout.valid) {
    throw new Error(`Unchain release checkout rejected: ${describeUnchainCheckout(checkout)}`);
  }
  return checkout;
};
