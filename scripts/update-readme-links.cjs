#!/usr/bin/env node

/**
 * Renders the marked README download section from a verified release manifest.
 *
 * This script intentionally does not read package.json or infer artifact names.
 * Use it only after a candidate/Draft Release manifest has passed verification:
 *   node scripts/update-readme-links.cjs --manifest release-assets.v1.json
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const README_PATH = path.join(ROOT, "README.md");
const CONTRACT_PATH = path.join(ROOT, "contracts", "release", "release-artifact-contract.v1.json");

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = value;
    index += 1;
  }
  return args;
};

const updateReadme = async ({ manifestPath, readmePath = README_PATH, repository }) => {
  const {
    readJson,
    readReleaseArtifactContract,
  } = await import("./release-qa/release-artifact-manifest.mjs");
  const {
    renderReleaseDownloadBlock,
    replaceReleaseDownloadBlock,
  } = await import("./release-qa/release-readme.mjs");
  const contract = readReleaseArtifactContract(CONTRACT_PATH);
  const manifest = readJson(manifestPath);
  const block = renderReleaseDownloadBlock({ manifest, contract, repository });
  const current = fs.readFileSync(readmePath, "utf8");
  const updated = replaceReleaseDownloadBlock(current, block);
  if (updated !== current) fs.writeFileSync(readmePath, updated, "utf8");
  return { changed: updated !== current, tag: manifest.release.tag };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifest) {
    throw new Error("Usage: node scripts/update-readme-links.cjs --manifest <verified-release-assets.json> [--readme README.md] [--repository owner/repo]");
  }
  const result = await updateReadme({
    manifestPath: path.resolve(args.manifest),
    readmePath: args.readme ? path.resolve(args.readme) : README_PATH,
    repository: args.repository,
  });
  console.log(`[update-readme-links] ${result.changed ? "Rendered" : "Kept"} verified links for ${result.tag}.`);
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`[update-readme-links] ${error.message || String(error)}`);
    process.exit(1);
  });
}

module.exports = { updateReadme };
