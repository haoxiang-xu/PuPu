import assert from "node:assert/strict";
import test from "node:test";

import { releaseSigningFailures } from "./release-signing.mjs";

test("release signing credentials require macOS code signing plus notarization and Windows signing", () => {
  assert.match(releaseSigningFailures("macos", {}).join(" "), /CSC_LINK/);
  assert.match(releaseSigningFailures("windows", {}).join(" "), /WIN_CSC_LINK/);
  assert.deepEqual(releaseSigningFailures("linux", {}), []);
  assert.deepEqual(releaseSigningFailures("macos", {
    CSC_LINK: "certificate",
    CSC_KEY_PASSWORD: "password",
    APPLE_API_KEY: "key",
    APPLE_API_KEY_ID: "id",
    APPLE_API_ISSUER: "issuer",
  }), []);
  assert.deepEqual(releaseSigningFailures("windows", {
    WIN_CSC_LINK: "certificate",
    WIN_CSC_KEY_PASSWORD: "password",
  }), []);
});
