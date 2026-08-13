import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  inspectPinnedUnchainCheckout,
  requirePinnedUnchainCheckout,
  resolveUnchainRoot,
} from "./unchain-checkout.mjs";

const git = (root, args) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
};

const fixture = (run) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-unchain-checkout-"));
  const pupuRoot = path.join(root, "pupu");
  const unchainRoot = path.join(root, "unchain");
  fs.mkdirSync(path.join(pupuRoot, "unchain_runtime"), { recursive: true });
  fs.mkdirSync(path.join(unchainRoot, "src", "unchain"), { recursive: true });
  fs.writeFileSync(
    path.join(unchainRoot, "src", "unchain", "__init__.py"),
    "# fixture\n",
  );
  git(unchainRoot, ["init", "-q"]);
  git(unchainRoot, ["config", "user.email", "release-qa@example.invalid"]);
  git(unchainRoot, ["config", "user.name", "PuPu Release QA"]);
  git(unchainRoot, ["add", "."]);
  git(unchainRoot, ["commit", "-q", "-m", "fixture"]);
  const revision = git(unchainRoot, ["rev-parse", "HEAD"]);
  fs.writeFileSync(
    path.join(pupuRoot, "unchain_runtime", "unchain-core.lock.json"),
    `${JSON.stringify({ repository: "unchain", revision }, null, 2)}\n`,
  );

  try {
    run({ pupuRoot, unchainRoot, revision });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

test("accepts the exact clean Unchain checkout and resolves the default sibling", () => {
  fixture(({ pupuRoot, unchainRoot, revision }) => {
    assert.equal(resolveUnchainRoot({ pupuRoot, environment: {} }), unchainRoot);
    const checkout = requirePinnedUnchainCheckout({ pupuRoot, unchainRoot });
    assert.equal(checkout.lockedRevision, revision);
    assert.equal(checkout.testedRevision, revision);
    assert.equal(checkout.dirty, false);
    assert.equal(checkout.valid, true);
  });
});

test("rejects a dirty checkout before release tests run", () => {
  fixture(({ pupuRoot, unchainRoot }) => {
    fs.writeFileSync(
      path.join(unchainRoot, "src", "unchain", "__init__.py"),
      "# dirty fixture\n",
    );
    const checkout = inspectPinnedUnchainCheckout({ pupuRoot, unchainRoot });
    assert.equal(checkout.dirty, true);
    assert.equal(checkout.valid, false);
    assert.throws(
      () => requirePinnedUnchainCheckout({ pupuRoot, unchainRoot }),
      /dirty=true.*tested Unchain checkout is dirty/,
    );
  });
});

test("rejects a clean checkout whose HEAD differs from the runtime lock", () => {
  fixture(({ pupuRoot, unchainRoot, revision }) => {
    fs.writeFileSync(path.join(unchainRoot, "next.txt"), "next\n");
    git(unchainRoot, ["add", "."]);
    git(unchainRoot, ["commit", "-q", "-m", "next"]);
    const checkout = inspectPinnedUnchainCheckout({ pupuRoot, unchainRoot });
    assert.equal(checkout.lockedRevision, revision);
    assert.notEqual(checkout.testedRevision, revision);
    assert.equal(checkout.dirty, false);
    assert.equal(checkout.valid, false);
    assert.throws(
      () => requirePinnedUnchainCheckout({ pupuRoot, unchainRoot }),
      /tested Unchain HEAD does not match the runtime lock/,
    );
  });
});
