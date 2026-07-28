import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const runGitBuffer = (root, args) => {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: null,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) {
    const detail = String(result.stderr || result.stdout || result.error || "unknown error").trim();
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
  return result.stdout || Buffer.alloc(0);
};

export const computeWorktreeFingerprint = (root) => {
  const hash = createHash("sha256");
  hash.update("pupu-release-worktree-v1\0");
  hash.update(
    runGitBuffer(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
  );
  hash.update(
    runGitBuffer(root, ["diff", "--no-ext-diff", "--no-textconv", "--binary", "HEAD", "--"]),
  );

  const untrackedPaths = runGitBuffer(
    root,
    ["ls-files", "--others", "--exclude-standard", "-z"],
  )
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort();

  for (const relativePath of untrackedPaths) {
    const absolutePath = path.join(root, relativePath);
    const stat = fs.lstatSync(absolutePath);
    hash.update(`untracked\0${relativePath}\0${stat.mode}\0${stat.size}\0`);
    if (stat.isSymbolicLink()) {
      hash.update(fs.readlinkSync(absolutePath));
    } else if (stat.isFile()) {
      hash.update(fs.readFileSync(absolutePath));
    }
  }

  return hash.digest("hex");
};
