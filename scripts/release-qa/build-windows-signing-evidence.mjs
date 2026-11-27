#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { canonicalizeWindowsSigningEvidence } from "./canonicalize-windows-signing-evidence.mjs";
import { WINDOWS_UNSIGNED_PAYLOAD_EXCEPTIONS } from "./windows-release-candidate-signing.mjs";

const CANDIDATE_SCHEMA = "pupu.windows-release-candidate-signing.v1";
const QUALIFICATION_SCHEMA = "pupu.windows-signing-qualification.v1";
const PAYLOAD_PREFIX = ".release-qa\\windows-unpacked\\";
const EXCEPTION_REASON = "upstream Tcl/Tk DLL excluded from re-signing after native signature observation";

const exactKeys = (value, keys, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error(`${label} has an unexpected key set`);
  }
};

const requiredString = (value, label) => {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error(`${label} must be a nonempty string`);
  }
  return value;
};

const relativePayloadPath = (value) => {
  requiredString(value, "payload_path");
  if (value.includes("/") || path.win32.isAbsolute(value) ||
      value.split("\\").some((part) => !part || part === "." || part === ".." || /[:. ]$|:/.test(part)) ||
      !/\.(exe|dll)$/i.test(value)) {
    throw new Error("payload_path must be a canonical relative Windows EXE/DLL path");
  }
  return value;
};

export function buildWindowsSigningEvidence(observation) {
  exactKeys(observation, ["schema", "evidence_schema", "run_id", "source_revision",
    "package_version", "target_id", "files"], "Windows signature observation");
  if (observation.schema !== "pupu.windows-signing-observation.v1" ||
      ![CANDIDATE_SCHEMA, QUALIFICATION_SCHEMA].includes(observation.evidence_schema)) {
    throw new Error("unsupported Windows signature observation/evidence schema");
  }
  if (!/^[1-9]\d*$/.test(requiredString(observation.run_id, "run_id")) ||
      !/^[0-9a-f]{40}$/.test(requiredString(observation.source_revision, "source_revision"))) {
    throw new Error("invalid Windows signature observation run/source identity");
  }
  const candidate = observation.evidence_schema === CANDIDATE_SCHEMA;
  if (typeof observation.package_version !== "string" || typeof observation.target_id !== "string" ||
      (candidate && (!observation.package_version || observation.target_id !== "windows-x64")) ||
      (observation.package_version && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(observation.package_version)) ||
      (observation.target_id && observation.target_id !== "windows-x64")) {
    throw new Error("invalid Windows signature observation package version/target identity");
  }
  if (!Array.isArray(observation.files) || observation.files.length === 0) {
    throw new Error("Windows signature observations must include payload files and one installer");
  }

  const signed = [], exceptions = [];
  const paths = new Set(), payloadPaths = new Set();
  let installerCount = 0, qualificationPayloadPrefix;
  for (const file of observation.files) {
    exactKeys(file, ["path", "payload_path", "sha256", "authenticode_status",
      "signer_subject", "signer_thumbprint"], "Windows file signature observation");
    requiredString(file.path, "path");
    if (file.path.includes("/") || path.win32.normalize(file.path) !== file.path ||
        paths.has(file.path.toLowerCase()) || typeof file.sha256 !== "string" ||
        !/^[0-9a-f]{64}$/.test(file.sha256)) {
      throw new Error("Windows signature observation path/hash is invalid or duplicated");
    }
    paths.add(file.path.toLowerCase());
    const installer = file.payload_path === null;
    if (installer) {
      installerCount += 1;
      if ((candidate && file.path !== `dist\\PuPu-${observation.package_version}-windows-x64-setup.exe`) ||
          (!candidate && (!path.win32.isAbsolute(file.path) || !/\.exe$/i.test(file.path)))) {
        throw new Error("Windows signature observation installer path is unexpected");
      }
    } else {
      relativePayloadPath(file.payload_path);
      if (payloadPaths.has(file.payload_path.toLowerCase())) {
        throw new Error("duplicate Windows payload signature observation");
      }
      payloadPaths.add(file.payload_path.toLowerCase());
      if (candidate && file.path !== PAYLOAD_PREFIX + file.payload_path) {
        throw new Error("Windows signature observation payload prefix does not match");
      }
      if (!candidate) {
        if (!path.win32.isAbsolute(file.path) || !file.path.endsWith(`\\${file.payload_path}`)) {
          throw new Error("qualification signature observation path does not match its payload");
        }
        const prefix = file.path.slice(0, -file.payload_path.length);
        qualificationPayloadPrefix ??= prefix;
        if (prefix !== qualificationPayloadPrefix) throw new Error("qualification payload roots differ");
      }
    }
    if (file.authenticode_status === "Valid") {
      signed.push({ path: file.path, sha256: file.sha256,
        signer_subject: requiredString(file.signer_subject, "signer_subject"),
        signer_thumbprint: requiredString(file.signer_thumbprint, "signer_thumbprint") });
    } else {
      if (installer || !WINDOWS_UNSIGNED_PAYLOAD_EXCEPTIONS.includes(file.payload_path) ||
          !["NotSigned", "UnknownError"].includes(file.authenticode_status)) {
        throw new Error(`invalid Authenticode status for ${file.path}: ${file.authenticode_status}`);
      }
      exceptions.push({ path: file.payload_path, sha256: file.sha256,
        authenticode_status: file.authenticode_status, reason: EXCEPTION_REASON });
    }
  }
  if (installerCount !== 1) throw new Error("exactly one installer signature observation is required");
  for (const payloadPath of ["PuPu.exe", "resources\\elevate.exe", ...WINDOWS_UNSIGNED_PAYLOAD_EXCEPTIONS]) {
    if (!payloadPaths.has(payloadPath.toLowerCase())) {
      throw new Error(`missing required payload signature observation: ${payloadPath}`);
    }
  }
  const counts = {
    payload_file_count: payloadPaths.size,
    signable_payload_file_count: payloadPaths.size - exceptions.length,
    installer_file_count: 1,
    unsigned_payload_exceptions: exceptions,
    signed_files: signed,
  };
  const evidence = candidate ? {
    schema: CANDIDATE_SCHEMA, status: "passed", candidate_run_id: observation.run_id,
    source_revision: observation.source_revision, package_version: observation.package_version,
    target_id: observation.target_id, ...counts,
  } : {
    schema: QUALIFICATION_SCHEMA, status: "passed", run_id: observation.run_id,
    source_revision: observation.source_revision, ...counts,
  };
  return canonicalizeWindowsSigningEvidence(evidence);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== "--observation" || args[2] !== "--evidence" ||
        !args[1] || !args[3] || args[1].startsWith("--") || args[3].startsWith("--") ||
        path.resolve(args[1]) === path.resolve(args[3])) {
      throw new Error("usage: build-windows-signing-evidence.mjs --observation <path> --evidence <path>");
    }
    const evidence = buildWindowsSigningEvidence(JSON.parse(fs.readFileSync(args[1], "utf8")));
    fs.writeFileSync(args[3], `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    console.log(`[windows-signing-evidence] classified ${evidence.signed_files.length} signed files and ${evidence.unsigned_payload_exceptions.length} unsigned exceptions`);
  } catch (error) {
    console.error(`[windows-signing-evidence] ${error.message || String(error)}`);
    process.exitCode = 1;
  }
}
