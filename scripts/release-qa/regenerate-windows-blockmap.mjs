#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const installerIdentity = async (installer) => {
  const hash = crypto.createHash("sha512");
  let size = 0;
  for await (const chunk of fs.createReadStream(installer)) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { size, sha512: hash.digest("base64") };
};

export async function regenerateWindowsBlockmap({ installerPath }) {
  if (typeof installerPath !== "string" || !installerPath.trim()) {
    throw new Error("signed installer path is required");
  }
  const installer = path.resolve(installerPath);
  if (!fs.lstatSync(installer, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`signed installer is missing or not a regular file: ${installer}`);
  }
  const blockmapPath = `${installer}.blockmap`;
  const before = await installerIdentity(installer);
  const { buildBlockMap } = require("app-builder-lib/out/targets/blockmap/blockmap.js");
  const temporaryDirectory = fs.mkdtempSync(path.join(path.dirname(installer), ".pupu-blockmap-"));
  try {
    const temporaryOutput = path.join(temporaryDirectory, "installer.blockmap");
    // Omitting the third argument APPENDS to the signed installer. Always use
    // a fresh, separate output, then replace the old map without following it.
    const produced = await buildBlockMap(installer, "gzip", temporaryOutput);
    const after = await installerIdentity(installer);
    if (
      after.size !== before.size || after.sha512 !== before.sha512 ||
      produced.size !== before.size || produced.sha512 !== before.sha512
    ) {
      throw new Error("signed installer identity changed during blockmap generation");
    }
    if (!fs.lstatSync(temporaryOutput, { throwIfNoEntry: false })?.isFile() ||
        fs.statSync(temporaryOutput).size === 0) {
      throw new Error("blockmap producer did not create a nonempty external blockmap");
    }
    fs.renameSync(temporaryOutput, blockmapPath);
    return { installer_name: path.basename(installer), blockmap_path: blockmapPath,
      size: before.size, sha512: before.sha512 };
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== "--installer" || !args[1]?.trim() || args[1].startsWith("--")) {
      throw new Error("usage: regenerate-windows-blockmap.mjs --installer <path>");
    }
    const result = await regenerateWindowsBlockmap({ installerPath: args[1] });
    console.log(`[windows-blockmap] regenerated ${result.installer_name}; size=${result.size}`);
  } catch (error) {
    console.error(`[windows-blockmap] ${error.message || String(error)}`);
    process.exitCode = 1;
  }
}
