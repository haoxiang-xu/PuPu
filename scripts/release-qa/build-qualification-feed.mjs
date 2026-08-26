#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  hashFileSha256,
  readJson,
  readReleaseArtifactContract,
  validateReleaseAssetManifest,
  verifyReleaseAssetDirectory,
  writeJson,
} from "./release-artifact-manifest.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
export const QUALIFICATION_FEED_SCHEMA = "pupu.qualification-feed.v1";
export const QUALIFICATION_FEED_TARGETS = Object.freeze([
  "macos-arm64",
  "macos-x64",
  "windows-x64",
]);

const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new Error(`${label} keys must be exactly ${required.join(", ")}`);
  }
};

const requireSha256 = (value, label) => {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be sha256:<64 lowercase hex>`);
  }
  return value;
};

const requireSha512 = (value, label) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error(`${label} must be a base64 SHA-512 value`);
  }
  return value;
};

const oneAsset = (manifest, targetId, predicate, label) => {
  const matches = manifest.assets.filter((asset) => asset.target_id === targetId && predicate(asset));
  if (matches.length !== 1) throw new Error(`${targetId} must have exactly one ${label}`);
  return matches[0];
};

const resolveFeedBinding = ({ manifest, contract, targetId }) => {
  if (!QUALIFICATION_FEED_TARGETS.includes(targetId)) {
    throw new Error(`qualification feed target is unsupported: ${targetId}`);
  }
  const target = contract.targets.find((candidate) => candidate.id === targetId && candidate.status === "required");
  if (!target?.updater_channel) throw new Error(`qualification feed target has no updater channel: ${targetId}`);
  const updaterMetadata = manifest.updater_metadata.filter((item) => item.name === target.updater_channel);
  if (updaterMetadata.length !== 1 || !updaterMetadata[0].target_ids.includes(targetId)) {
    throw new Error(`candidate manifest updater metadata does not bind ${targetId}`);
  }
  const payload = oneAsset(
    manifest,
    targetId,
    (asset) => asset.role === "updater-payload" ||
      (targetId === "windows-x64" && asset.role === "installer" && asset.format === "exe"),
    "updater payload",
  );
  const blockmap = oneAsset(
    manifest,
    targetId,
    (asset) => asset.role === "updater-blockmap" && asset.format === "blockmap",
    "updater blockmap",
  );
  const payloadReference = updaterMetadata[0].references.find((item) => item.name === payload.name);
  if (!payloadReference) {
    throw new Error(`candidate updater metadata does not reference ${targetId} payload`);
  }
  return { metadata: updaterMetadata[0], payload, payloadReference, blockmap };
};

const outputNames = (feed) => [
  feed.metadata.name,
  feed.payload.name,
  feed.blockmap.name,
  "qualification-feed.v1.json",
].sort();

export function validateQualificationFeed(feed, { manifest, contract, targetId = "" } = {}) {
  validateReleaseAssetManifest(manifest, contract);
  exactKeys(
    feed,
    ["blockmap", "candidate_manifest_digest", "metadata", "payload", "schema", "target_id"],
    "qualification feed",
  );
  if (feed.schema !== QUALIFICATION_FEED_SCHEMA) {
    throw new Error(`qualification feed schema must be ${QUALIFICATION_FEED_SCHEMA}`);
  }
  if (targetId && feed.target_id !== targetId) {
    throw new Error("qualification feed target does not match expectation");
  }
  if (feed.candidate_manifest_digest !== manifest.manifest_digest) {
    throw new Error("qualification feed candidate manifest digest does not match the sealed candidate");
  }
  requireSha256(feed.candidate_manifest_digest, "qualification feed candidate_manifest_digest");
  const binding = resolveFeedBinding({ manifest, contract, targetId: feed.target_id });
  exactKeys(feed.metadata, ["name", "sha256"], "qualification feed metadata");
  if (feed.metadata.name !== binding.metadata.name || feed.metadata.sha256 !== binding.metadata.sha256) {
    throw new Error("qualification feed metadata does not match the sealed candidate");
  }
  exactKeys(feed.payload, ["name", "sha256", "sha512"], "qualification feed payload");
  if (feed.payload.name !== binding.payload.name || feed.payload.sha256 !== binding.payload.sha256 ||
      feed.payload.sha512 !== binding.payloadReference.sha512) {
    throw new Error("qualification feed payload does not match the sealed candidate");
  }
  exactKeys(feed.blockmap, ["name", "sha256"], "qualification feed blockmap");
  if (feed.blockmap.name !== binding.blockmap.name || feed.blockmap.sha256 !== binding.blockmap.sha256) {
    throw new Error("qualification feed blockmap does not match the sealed candidate");
  }
  requireSha256(feed.metadata.sha256, "qualification feed metadata.sha256");
  requireSha256(feed.payload.sha256, "qualification feed payload.sha256");
  requireSha512(feed.payload.sha512, "qualification feed payload.sha512");
  requireSha256(feed.blockmap.sha256, "qualification feed blockmap.sha256");
  return feed;
}

export function verifyQualificationFeedDirectory({ feedDir, manifest, contract, targetId = "" }) {
  const directory = path.resolve(feedDir);
  const feed = readJson(path.join(directory, "qualification-feed.v1.json"));
  validateQualificationFeed(feed, { manifest, contract, targetId });
  const expected = outputNames(feed);
  const actual = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`qualification feed inventory mismatch: expected=${expected.join(",")}; actual=${actual.join(",")}`);
  }
  for (const item of [feed.metadata, feed.payload, feed.blockmap]) {
    const source = path.join(directory, item.name);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
      throw new Error(`qualification feed file is missing: ${item.name}`);
    }
    if (hashFileSha256(source) !== item.sha256) {
      throw new Error(`qualification feed file bytes do not match sealed candidate: ${item.name}`);
    }
  }
  return feed;
}

export function buildQualificationFeed({ candidateDir, outDir, targetId, contract }) {
  const candidateRoot = path.resolve(candidateDir);
  const output = path.resolve(outDir);
  if (fs.existsSync(output)) throw new Error(`qualification feed output directory must not already exist: ${output}`);
  const manifest = readJson(path.join(candidateRoot, "release-assets.v1.json"));
  validateReleaseAssetManifest(manifest, contract);
  verifyReleaseAssetDirectory({ manifest, contract, assetDir: path.join(candidateRoot, "assets") });
  const binding = resolveFeedBinding({ manifest, contract, targetId });
  const feed = {
    schema: QUALIFICATION_FEED_SCHEMA,
    target_id: targetId,
    candidate_manifest_digest: manifest.manifest_digest,
    metadata: { name: binding.metadata.name, sha256: binding.metadata.sha256 },
    payload: {
      name: binding.payload.name,
      sha256: binding.payload.sha256,
      sha512: binding.payloadReference.sha512,
    },
    blockmap: { name: binding.blockmap.name, sha256: binding.blockmap.sha256 },
  };
  validateQualificationFeed(feed, { manifest, contract, targetId });
  fs.mkdirSync(output, { recursive: true });
  for (const item of [feed.metadata, feed.payload, feed.blockmap]) {
    fs.copyFileSync(path.join(candidateRoot, "assets", item.name), path.join(output, item.name));
  }
  writeJson(path.join(output, "qualification-feed.v1.json"), feed);
  verifyQualificationFeedDirectory({ feedDir: output, manifest, contract, targetId });
  return feed;
}

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`invalid argument near ${key || "(end)"}`);
    }
    args[key.slice(2)] = value;
    index += 1;
  }
  for (const key of ["candidate-dir", "out-dir", "target"]) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  return args;
};

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const contract = readReleaseArtifactContract(path.join(ROOT, "contracts/release/release-artifact-contract.v1.json"));
    const feed = buildQualificationFeed({
      candidateDir: args["candidate-dir"],
      outDir: args["out-dir"],
      targetId: args.target,
      contract,
    });
    console.log(`[qualification-feed] built ${feed.target_id} feed for ${feed.candidate_manifest_digest}`);
  } catch (error) {
    console.error(`[qualification-feed] ${error.message || String(error)}`);
    process.exitCode = 1;
  }
}
