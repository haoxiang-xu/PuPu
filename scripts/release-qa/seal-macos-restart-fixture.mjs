#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { MACOS_RESTART_FIXTURE_SIGNING_SCHEMA, validateMacSigningEvidence } from "./macos-signing-evidence.mjs";
import { createRestartUpdateFixtureEvidence } from "./restart-update-fixture-evidence.mjs";
import { hashFileSha256, writeJson } from "./release-artifact-manifest.mjs";
import { verifyFixtureReleaseSnapshot } from "./qualification-fixture-snapshot.mjs";
import { validateQualificationFixtureAppUpdate } from "./validate-qualification-fixture-app-update.mjs";

export function bindMacFixtureSigningEvidence({ evidence, fixturePath, targetId, fromTag, fromVersion, fromCommit }) {
  validateMacSigningEvidence(evidence);
  if (evidence.schema !== MACOS_RESTART_FIXTURE_SIGNING_SCHEMA || evidence.target.id !== targetId ||
      evidence.source.ref !== `refs/tags/${fromTag}` || evidence.source.commit !== fromCommit ||
      evidence.package.version !== fromVersion) throw new Error("macOS fixture signing evidence identity mismatch");
  const dmg = evidence.artifacts.find((item) => item.format === "dmg");
  if (dmg.name !== path.basename(fixturePath) || dmg.sha256 !== hashFileSha256(fixturePath) ||
      dmg.size_bytes !== fs.statSync(fixturePath).size) throw new Error("macOS fixture DMG bytes differ from verified signing evidence");
  return createRestartUpdateFixtureEvidence({ fixturePath, targetId, fromTag, fromVersion, fromCommit,
    signerSubject: evidence.certificate.subject, signerThumbprint: evidence.certificate.leaf_sha256 });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    const allowed = ["signing-evidence", "dist-dir", "target", "from-tag", "from-version", "from-commit", "feed-url", "snapshot", "out"];
    const args = {};
    for (let i = 2; i < process.argv.length; i += 2) {
      const key = process.argv[i].slice(2), value = process.argv[i + 1];
      if (!process.argv[i].startsWith("--") || !allowed.includes(key) || args[key] || !value || value.startsWith("--")) throw new Error("invalid fixture sealing arguments");
      args[key] = value;
    }
    if (Object.keys(args).length !== allowed.length) throw new Error("all fixture sealing arguments are required");
    const evidence = JSON.parse(fs.readFileSync(args["signing-evidence"], "utf8"));
    const fixturePath = path.resolve(args["dist-dir"], `PuPu-${args["from-version"]}-${args.target}.dmg`);
    const sealed = bindMacFixtureSigningEvidence({ evidence, fixturePath, targetId: args.target,
      fromTag: args["from-tag"], fromVersion: args["from-version"], fromCommit: args["from-commit"] });
    const resources = path.resolve(args["dist-dir"], args.target === "macos-arm64" ? "mac-arm64" : "mac", "PuPu.app/Contents/Resources");
    verifyFixtureReleaseSnapshot({ snapshotPath: args.snapshot, asarPath: path.join(resources, "app.asar") });
    validateQualificationFixtureAppUpdate({ contents: fs.readFileSync(path.join(resources, "app-update.yml"), "utf8"), feedUrl: args["feed-url"] });
    writeJson(path.resolve(args.out), sealed);
  } catch (error) { console.error(`[macos-restart-fixture] ${error.message}`); process.exitCode = 1; }
}
