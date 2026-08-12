#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(import.meta.dirname, "../..");
const LOCK_RELATIVE_PATH = "unchain_runtime/unchain-core.lock.json";
const GIT_REVISION_PATTERN = /^[0-9a-f]{40}$/;

export const readPinnedUnchainRevision = ({ root = DEFAULT_ROOT } = {}) => {
  const lockPath = path.join(root, LOCK_RELATIVE_PATH);
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to read ${LOCK_RELATIVE_PATH}: ${String(error?.message || error)}`,
    );
  }

  if (!payload || payload.repository !== "unchain") {
    throw new Error(
      `${LOCK_RELATIVE_PATH} must declare repository=unchain`,
    );
  }
  if (
    typeof payload.revision !== "string" ||
    !GIT_REVISION_PATTERN.test(payload.revision)
  ) {
    throw new Error(
      `${LOCK_RELATIVE_PATH} revision must be a lowercase 40-character Git SHA`,
    );
  }
  return payload.revision;
};

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  process.stdout.write(`revision=${readPinnedUnchainRevision()}\n`);
}
