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
    // Open first, then describe the descriptor. This digest is the evidence
    // that a worktree did not change, so the bytes hashed have to be the bytes
    // that were measured — an lstat followed by a read by path can be handed
    // two different inodes. O_NOFOLLOW makes a symlink fail the open, which is
    // how a symlink is detected here rather than by a prior stat.
    let handle = null;
    try {
      handle = fs.openSync(absolutePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    } catch (error) {
      if (error?.code !== "ELOOP" && error?.code !== "EMLINK") throw error;
    }
    if (handle === null) {
      const linkStat = fs.lstatSync(absolutePath);
      hash.update(`untracked\0${relativePath}\0${linkStat.mode}\0${linkStat.size}\0`);
      hash.update(fs.readlinkSync(absolutePath));
      continue;
    }
    try {
      const stat = fs.fstatSync(handle);
      hash.update(`untracked\0${relativePath}\0${stat.mode}\0${stat.size}\0`);
      if (stat.isFile()) {
        hash.update(fs.readFileSync(handle));
      }
    } finally {
      fs.closeSync(handle);
    }
  }

  return hash.digest("hex");
};
