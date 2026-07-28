import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { computeWorktreeFingerprint } from "./worktree-fingerprint.mjs";

const git = (root, args) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
};

test("worktree fingerprint covers tracked and untracked content but ignores ignored outputs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-worktree-fingerprint-"));
  try {
    git(root, ["init", "-q"]);
    git(root, ["config", "user.email", "release-qa@example.invalid"]);
    git(root, ["config", "user.name", "PuPu Release QA"]);
    fs.writeFileSync(path.join(root, ".gitignore"), "ignored/\n", "utf8");
    fs.writeFileSync(path.join(root, "tracked.txt"), "original\n", "utf8");
    git(root, ["add", ".gitignore", "tracked.txt"]);
    git(root, ["commit", "-q", "-m", "fixture"]);

    const clean = computeWorktreeFingerprint(root);

    fs.writeFileSync(path.join(root, "tracked.txt"), "changed\n", "utf8");
    assert.notEqual(computeWorktreeFingerprint(root), clean);
    fs.writeFileSync(path.join(root, "tracked.txt"), "original\n", "utf8");
    assert.equal(computeWorktreeFingerprint(root), clean);

    fs.writeFileSync(path.join(root, "untracked.txt"), "first\n", "utf8");
    const untracked = computeWorktreeFingerprint(root);
    assert.notEqual(untracked, clean);
    fs.writeFileSync(path.join(root, "untracked.txt"), "second\n", "utf8");
    assert.notEqual(computeWorktreeFingerprint(root), untracked);
    fs.rmSync(path.join(root, "untracked.txt"));

    fs.mkdirSync(path.join(root, "ignored"));
    fs.writeFileSync(path.join(root, "ignored", "report.json"), "generated\n", "utf8");
    assert.equal(computeWorktreeFingerprint(root), clean);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
