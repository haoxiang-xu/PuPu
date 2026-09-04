#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const SUPPORTED_SCHEMAS = new Set([
  "pupu.windows-release-candidate-signing.v1",
  "pupu.windows-signing-qualification.v1",
]);

const UTF8_COMPARE = (left, right) => Buffer.compare(
  Buffer.from(left, "utf8"),
  Buffer.from(right, "utf8"),
);

const canonicalizeEntries = (items, label) => {
  if (!Array.isArray(items)) {
    throw new Error(`${label} must be an array`);
  }
  const paths = items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${label}[${index}] must be an object`);
    }
    if (
      typeof item.path !== "string" ||
      !item.path ||
      item.path !== item.path.trim()
    ) {
      throw new Error(`${label}[${index}].path must be a non-empty string`);
    }
    return item.path;
  });
  if (new Set(paths).size !== paths.length) {
    throw new Error(`${label} paths must be unique`);
  }
  return [...items].sort((left, right) => UTF8_COMPARE(left.path, right.path));
};

export function canonicalizeWindowsSigningEvidence(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error("Windows signing evidence must be an object");
  }
  if (!SUPPORTED_SCHEMAS.has(evidence.schema)) {
    throw new Error(
      `unsupported Windows signing evidence schema: ${evidence.schema || "(missing)"}`,
    );
  }
  return {
    ...evidence,
    unsigned_payload_exceptions: canonicalizeEntries(
      evidence.unsigned_payload_exceptions,
      "Windows signing evidence unsigned_payload_exceptions",
    ),
    signed_files: canonicalizeEntries(
      evidence.signed_files,
      "Windows signing evidence signed_files",
    ),
  };
}

export function canonicalizeWindowsSigningEvidenceFile(evidencePath) {
  if (typeof evidencePath !== "string" || !evidencePath.trim()) {
    throw new Error("evidence path is required");
  }
  const resolvedPath = path.resolve(evidencePath);
  if (!fs.statSync(resolvedPath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Windows signing evidence is missing: ${resolvedPath}`);
  }
  let evidence;
  try {
    evidence = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    throw new Error(`unable to read Windows signing evidence: ${error.message}`);
  }
  const canonical = canonicalizeWindowsSigningEvidence(evidence);
  fs.writeFileSync(resolvedPath, `${JSON.stringify(canonical, null, 2)}\n`, "utf8");
  return canonical;
}

const parseArgs = (argv) => {
  if (argv.length !== 2 || argv[0] !== "--evidence" || !argv[1]) {
    throw new Error(
      "usage: canonicalize-windows-signing-evidence.mjs --evidence <path>",
    );
  }
  return { evidencePath: argv[1] };
};

const modulePath = path.resolve(import.meta.filename);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  try {
    const { evidencePath } = parseArgs(process.argv.slice(2));
    const canonical = canonicalizeWindowsSigningEvidenceFile(evidencePath);
    console.log(
      `[windows-signing-evidence] canonicalized ${canonical.signed_files.length} signed paths`,
    );
  } catch (error) {
    console.error(`[windows-signing-evidence] ${error.message || String(error)}`);
    process.exitCode = 1;
  }
}
