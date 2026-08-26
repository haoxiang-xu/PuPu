import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { releaseSigningFailures } from "./release-signing.mjs";

const releaseSigningScript = fileURLToPath(new URL("./release-signing.mjs", import.meta.url));

test("release signing credentials require macOS code signing plus notarization and Windows Artifact Signing", () => {
  assert.match(releaseSigningFailures("macos", {}).join(" "), /CSC_LINK/);
  assert.match(releaseSigningFailures("windows", {}).join(" "), /AZURE_ARTIFACT_SIGNING_ENDPOINT/);
  assert.deepEqual(releaseSigningFailures("linux", {}), []);
  assert.deepEqual(releaseSigningFailures("macos", {
    CSC_LINK: "certificate",
    CSC_KEY_PASSWORD: "password",
    APPLE_API_KEY: "key",
    APPLE_API_KEY_ID: "id",
    APPLE_API_ISSUER: "issuer",
  }), []);
  assert.deepEqual(releaseSigningFailures("windows", {
    AZURE_CLIENT_ID: "client-id",
    AZURE_TENANT_ID: "tenant-id",
    AZURE_SUBSCRIPTION_ID: "subscription-id",
    AZURE_ARTIFACT_SIGNING_ENDPOINT: "https://wus2.codesigning.azure.net",
    AZURE_ARTIFACT_SIGNING_ACCOUNT_NAME: "account-name",
    AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME: "profile-name",
  }), []);
  assert.match(releaseSigningFailures("windows", {
    WIN_CSC_LINK: "legacy-certificate",
    WIN_CSC_KEY_PASSWORD: "legacy-password",
  }).join(" "), /AZURE_CLIENT_ID/);
});

test("release signing executes its fail-closed CLI entrypoint with a portable URL guard", () => {
  const result = spawnSync(process.execPath, [releaseSigningScript, "--platform", "windows"], {
    encoding: "utf8",
    env: {},
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AZURE_CLIENT_ID/);
  assert.match(fs.readFileSync(releaseSigningScript, "utf8"), /pathToFileURL\(process\.argv\[1\]\)\.href/);
});
