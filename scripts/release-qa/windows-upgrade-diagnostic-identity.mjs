import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanArtifactUploadPaths } from "./secret-material-denylist.mjs";

export const WINDOWS_DIAGNOSTIC_SCHEMA = "pupu.windows-upgrade-diagnostic.v1";
export const DIAGNOSTIC_UPLOAD_PATHS = Object.freeze([
  "pupu/windows-upgrade-diagnostic-result.json",
  "pupu/windows-upgrade-diagnostic-identity.json",
  "pupu/restart-update-diagnostics.json",
  "pupu/qualification-feed-server.v1.json",
  "pupu/windows-restart-fixture.v1.json",
  "fixture-source/windows-signing-qualification.v1.json",
  "fixture-source/.release-qa/build-feature-snapshot/build_feature_flags.snapshot.json",
  "fixture-source/.release-qa/build-feature-snapshot/build_feature_flags.snapshot.json.sha256",
]);

export function createWindowsDiagnosticIdentity(input) {
  const keys = ["toolsCommit", "toolsRef", "runId", "candidateRunId", "candidateTag", "candidateCommit", "manifest", "fromTag", "fromVersion", "fromCommit"];
  if (!input || Object.keys(input).sort().join() !== keys.sort().join()) throw new Error("diagnostic identity requires exact keys");
  for (const key of ["toolsCommit", "candidateCommit", "fromCommit"]) {
    if (typeof input[key] !== "string" || !/^[a-f0-9]{40}$/.test(input[key])) throw new Error(`invalid ${key}`);
  }
  for (const key of ["runId", "candidateRunId"]) {
    if (typeof input[key] !== "string" || !/^[1-9][0-9]*$/.test(input[key])) throw new Error(`invalid ${key}`);
  }
  if (input.toolsRef !== "refs/heads/dev") throw new Error("diagnostic tools must run from dev");
  for (const tag of [input.candidateTag, input.fromTag]) {
    if (typeof tag !== "string" || !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) throw new Error("invalid stable tag");
  }
  const from = input.fromTag.slice(1).split(".").map(BigInt);
  const to = input.candidateTag.slice(1).split(".").map(BigInt);
  const differing = from.findIndex((value, index) => value !== to[index]);
  if (input.fromVersion !== input.fromTag.slice(1) || differing < 0 || from[differing] > to[differing]) throw new Error("fixture must be a lower matching stable version");
  const manifest = input.manifest;
  if (manifest?.schema !== "pupu.release-assets.v1" || manifest.release?.tag !== input.candidateTag ||
      manifest.release?.commit !== input.candidateCommit || manifest.release?.version !== input.candidateTag.slice(1) ||
      !/^sha256:[a-f0-9]{64}$/.test(manifest.manifest_digest || "")) throw new Error("diagnostic candidate identity mismatch");
  return {
    schema: "pupu.windows-upgrade-diagnostic-identity.v1", diagnostic_only: true,
    tools: { ref: input.toolsRef, commit: input.toolsCommit, run_id: input.runId },
    candidate: { tag: input.candidateTag, commit: input.candidateCommit, run_id: input.candidateRunId, manifest_digest: manifest.manifest_digest },
    fixture: { tag: input.fromTag, version: input.fromVersion, commit: input.fromCommit },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).join(" ") === "--scan") {
    const root = path.resolve("..");
    const paths = DIAGNOSTIC_UPLOAD_PATHS.filter((file) => fs.existsSync(path.join(root, file)));
    if (paths.length) scanArtifactUploadPaths({ root, paths, failOnViolation: true });
  } else {
    if (process.argv.length !== 2) throw new Error("unsupported diagnostic identity arguments");
    const env = process.env;
    const result = createWindowsDiagnosticIdentity({
      toolsCommit: env.GITHUB_SHA, toolsRef: env.GITHUB_REF, runId: env.GITHUB_RUN_ID,
      candidateRunId: env.CANDIDATE_RUN_ID, candidateTag: env.RELEASE_TAG, candidateCommit: env.TAG_COMMIT,
      manifest: JSON.parse(fs.readFileSync("../candidate/release-assets.v1.json", "utf8")),
      fromTag: env.FROM_TAG, fromVersion: env.FROM_VERSION, fromCommit: env.FROM_COMMIT,
    });
    fs.writeFileSync("windows-upgrade-diagnostic-identity.json", `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  }
}
