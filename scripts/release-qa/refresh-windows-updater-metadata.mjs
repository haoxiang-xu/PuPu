#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import YAML from "yaml";

const requiredPath = (value, label) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return path.resolve(value);
};

const requireFile = (filePath, label) => {
  if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`${label} is missing: ${filePath}`);
  }
};

const sha512 = (filePath) => crypto
  .createHash("sha512")
  .update(fs.readFileSync(filePath))
  .digest("base64");

const parseMetadata = (metadataPath) => {
  const document = YAML.parseDocument(fs.readFileSync(metadataPath, "utf8"), {
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    throw new Error(`invalid updater metadata: ${document.errors[0].message}`);
  }
  const value = document.toJSON();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("updater metadata must be an object");
  }
  if (typeof value.version !== "string" || !value.version.trim()) {
    throw new Error("updater metadata version is missing");
  }
  if (!Array.isArray(value.files)) {
    throw new Error("updater metadata files must be an array");
  }
  return value;
};

export function refreshWindowsUpdaterMetadata({ installerPath, metadataPath }) {
  const installer = requiredPath(installerPath, "installer path");
  const metadata = requiredPath(metadataPath, "metadata path");
  requireFile(installer, "signed installer");
  requireFile(metadata, "updater metadata");

  const value = parseMetadata(metadata);
  const installerName = path.basename(installer);
  const references = value.files.filter((file) => file?.url === installerName);
  if (references.length !== 1) {
    throw new Error(`updater metadata must describe ${installerName} exactly once`);
  }
  if (value.path !== installerName || value.sha512 !== references[0].sha512) {
    throw new Error(`updater metadata primary payload must be ${installerName}`);
  }

  const signedSha512 = sha512(installer);
  const signedSize = fs.statSync(installer).size;
  references[0] = {
    ...references[0],
    sha512: signedSha512,
    size: signedSize,
  };
  value.files = value.files.map((file) =>
    file?.url === installerName ? references[0] : file,
  );
  value.sha512 = signedSha512;
  fs.writeFileSync(metadata, YAML.stringify(value), "utf8");
  return {
    installer_name: installerName,
    sha512: signedSha512,
    size: signedSize,
  };
}

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`invalid argument near ${key || "(end)"}`);
    }
    args[key.slice(2)] = value;
  }
  if (Object.keys(args).length !== 2 || !args.installer || !args.metadata) {
    throw new Error("usage: refresh-windows-updater-metadata.mjs --installer <path> --metadata <path>");
  }
  return args;
};

const modulePath = path.resolve(import.meta.filename);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const refreshed = refreshWindowsUpdaterMetadata({
      installerPath: args.installer,
      metadataPath: args.metadata,
    });
    console.log(
      `[windows-updater-metadata] refreshed ${refreshed.installer_name}; ` +
      `size=${refreshed.size}`,
    );
  } catch (error) {
    console.error(`[windows-updater-metadata] ${error.message || String(error)}`);
    process.exitCode = 1;
  }
}
