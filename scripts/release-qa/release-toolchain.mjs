#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";

const SHA = /^[0-9a-f]{40}$/;
const PRODUCT_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.[1-9]\d*)?$/;
export const TOOLS_QUALIFICATION_SCHEMA = "pupu.release-update-qualification.v2";

export function validateToolsTag(toolsTag, releaseTag) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(releaseTag || "") ||
      typeof toolsTag !== "string" || !toolsTag.startsWith(`${releaseTag}-tools.`) ||
      !/^[1-9]\d*$/.test(toolsTag.slice(`${releaseTag}-tools.`.length))) {
    throw new Error("tools tag must be the exact stable release tag followed by -tools.N");
  }
  return toolsTag;
}

export function validateReleaseTools(tools, release) {
  if (!tools || typeof tools !== "object" || Array.isArray(tools) ||
      JSON.stringify(Object.keys(tools).sort()) !== '["commit","tag"]') {
    throw new Error("tools identity keys must be exactly commit, tag");
  }
  if (typeof release?.tag !== "string" || typeof release?.commit !== "string" || typeof tools.tag !== "string" ||
      typeof tools.commit !== "string" || !PRODUCT_TAG.test(release.tag) || !SHA.test(release.commit) || !SHA.test(tools.commit)) {
    throw new Error("tools and product identity require valid tags and full lowercase commit SHAs");
  }
  if (tools.tag === release.tag) {
    if (tools.commit !== release.commit) throw new Error("legacy tools commit must equal product commit");
  } else validateToolsTag(tools.tag, release.tag);
  return tools;
}

export function validateToolchainExecution({ releaseTag, releaseCommit, refType, refName, sha, checkoutSha }) {
  if (refType !== "tag" || sha !== checkoutSha) throw new Error("tools must execute from an exact tag SHA checkout");
  return validateReleaseTools({ tag: refName, commit: sha }, { tag: releaseTag, commit: releaseCommit });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    const args = process.argv.slice(2);
    if ((args.length !== 2 && args.length !== 4) || args[0] !== "--release-tag" ||
        (args.length === 4 && args[2] !== "--release-commit") || !PRODUCT_TAG.test(args[1] || "")) {
      throw new Error("expected --release-tag <product-tag> [--release-commit <sha>]");
    }
    const git = (...values) => execFileSync("git", values, { encoding: "utf8" }).trim();
    const commit = git("rev-parse", `refs/tags/${args[1]}^{commit}`);
    if (args.length === 4 && args[3] !== commit) throw new Error("resolved product tag does not match preflight commit");
    validateToolchainExecution({ releaseTag: args[1], releaseCommit: commit,
      refType: process.env.GITHUB_REF_TYPE, refName: process.env.GITHUB_REF_NAME,
      sha: process.env.GITHUB_SHA, checkoutSha: git("rev-parse", "HEAD") });
    process.stdout.write(`${commit}\n`);
  } catch (error) { console.error(`[release-toolchain] ${error.message}`); process.exitCode = 1; }
}
