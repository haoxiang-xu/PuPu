import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import YAML from "yaml";

import { refreshWindowsUpdaterMetadata } from "./refresh-windows-updater-metadata.mjs";

const digest = (contents) => crypto.createHash("sha512").update(contents).digest("base64");

test("signed Windows installer refreshes the exact updater SHA-512 and size", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-windows-updater-metadata-"));
  const installerName = "PuPu-0.2.0-windows-x64-setup.exe";
  const installerPath = path.join(root, installerName);
  const metadataPath = path.join(root, "latest.yml");
  const unsigned = Buffer.from("unsigned installer");
  const signed = Buffer.from("signed installer with authenticode envelope");
  fs.writeFileSync(installerPath, unsigned);
  fs.writeFileSync(metadataPath, YAML.stringify({
    version: "0.2.0",
    files: [{ url: installerName, sha512: digest(unsigned), size: unsigned.length }],
    path: installerName,
    sha512: digest(unsigned),
    releaseDate: "2026-08-25T00:00:00.000Z",
  }), "utf8");

  fs.writeFileSync(installerPath, signed);
  const refreshed = refreshWindowsUpdaterMetadata({ installerPath, metadataPath });
  const metadata = YAML.parse(fs.readFileSync(metadataPath, "utf8"));

  assert.equal(refreshed.sha512, digest(signed));
  assert.equal(refreshed.size, signed.length);
  assert.equal(metadata.files[0].sha512, digest(signed));
  assert.equal(metadata.files[0].size, signed.length);
  assert.equal(metadata.sha512, digest(signed));
  assert.equal(metadata.path, installerName);
});

test("updater metadata refuses to refresh an ambiguous primary payload", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-windows-updater-metadata-"));
  const installerPath = path.join(root, "PuPu-0.2.0-windows-x64-setup.exe");
  const metadataPath = path.join(root, "latest.yml");
  fs.writeFileSync(installerPath, "signed installer", "utf8");
  fs.writeFileSync(metadataPath, YAML.stringify({
    version: "0.2.0",
    files: [{ url: path.basename(installerPath), sha512: "old", size: 1 }],
    path: "another-installer.exe",
    sha512: "old",
  }), "utf8");

  assert.throws(
    () => refreshWindowsUpdaterMetadata({ installerPath, metadataPath }),
    /primary payload/,
  );
});
