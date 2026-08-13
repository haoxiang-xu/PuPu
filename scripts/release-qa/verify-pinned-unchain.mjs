#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  describeUnchainCheckout,
  inspectPinnedUnchainCheckout,
  resolveUnchainRoot,
} from "./unchain-checkout.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const unchainRoot = resolveUnchainRoot({ pupuRoot: root });
const checkout = inspectPinnedUnchainCheckout({
  pupuRoot: root,
  unchainRoot,
});

console.log(`[release-qa] ${describeUnchainCheckout(checkout)}`);
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
  process.exit(1);
}
