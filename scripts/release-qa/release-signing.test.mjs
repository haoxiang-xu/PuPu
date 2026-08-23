import assert from "node:assert/strict";
import test from "node:test";

import { releaseSigningFailures } from "./release-signing.mjs";

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
