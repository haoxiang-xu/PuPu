import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export const WINDOWS_RELEASE_CANDIDATE_SIGNING_SCHEMA = "pupu.windows-release-candidate-signing.v1";

export const WINDOWS_UNSIGNED_PAYLOAD_EXCEPTIONS = [
  "resources\\mcp_runtime\\python\\DLLs\\tcl86t.dll",
  "resources\\mcp_runtime\\python\\DLLs\\tk86t.dll",
];

const WINDOWS_UNSIGNED_PAYLOAD_EXCEPTION_REASON =
  "upstream Tcl/Tk DLL rejected by SignTool as not Authenticode-compatible (0x800700C1)";
const WINDOWS_OBSERVED_UNSIGNED_PAYLOAD_REASON =
  "upstream Tcl/Tk DLL excluded from re-signing after native signature observation";
const PAYLOAD_PREFIX = ".release-qa\\windows-unpacked\\";
const RAW_SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const GITHUB_RUN_ID_PATTERN = /^[1-9]\d*$/;
const UTF8_COMPARE = (left, right) => Buffer.compare(
  Buffer.from(left, "utf8"),
  Buffer.from(right, "utf8"),
);

const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort(UTF8_COMPARE);
  const sortedExpected = [...expected].sort(UTF8_COMPARE);
  if (JSON.stringify(actual) !== JSON.stringify(sortedExpected)) {
    throw new Error(`${label} keys must be exactly ${sortedExpected.join(", ")}`);
  }
};

const requiredString = (value, label) => {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
};

const requiredPositiveInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
};

const requiredRawSha256 = (value, label) => {
  if (typeof value !== "string" || !RAW_SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be 64 lowercase hexadecimal characters`);
  }
  return value;
};

const requireSortedUniquePaths = (items, label) => {
  if (!Array.isArray(items)) throw new Error(`${label} must be an array`);
  const paths = items.map((item) => item?.path);
  const canonical = [...new Set(paths)].sort(UTF8_COMPARE);
  if (JSON.stringify(paths) !== JSON.stringify(canonical)) {
    throw new Error(`${label} paths must be sorted and unique`);
  }
  return paths;
};

const requiredWindowsInstaller = (manifest) => {
  const installers = manifest?.assets?.filter((asset) =>
    asset?.target_id === "windows-x64" && asset.role === "installer" && asset.format === "exe"
  ) || [];
  if (installers.length !== 1) {
    throw new Error("release asset manifest must contain exactly one Windows installer");
  }
  return installers[0];
};

export function validateWindowsReleaseCandidateSigningEvidence({ evidence, manifest }) {
  exactKeys(
    evidence,
    [
      "candidate_run_id",
      "installer_file_count",
      "package_version",
      "payload_file_count",
      "schema",
      "signable_payload_file_count",
      "signed_files",
      "source_revision",
      "status",
      "target_id",
      "unsigned_payload_exceptions",
    ],
    "Windows signing evidence",
  );
  if (evidence.schema !== WINDOWS_RELEASE_CANDIDATE_SIGNING_SCHEMA) {
    throw new Error(`Windows signing evidence schema must be ${WINDOWS_RELEASE_CANDIDATE_SIGNING_SCHEMA}`);
  }
  if (evidence.status !== "passed") throw new Error("Windows signing evidence status must be passed");
  if (evidence.target_id !== "windows-x64") throw new Error("Windows signing evidence target_id must be windows-x64");
  if (evidence.candidate_run_id !== manifest?.release?.candidate_run_id ||
      !GITHUB_RUN_ID_PATTERN.test(requiredString(evidence.candidate_run_id, "Windows signing evidence candidate_run_id"))) {
    throw new Error("Windows signing evidence candidate_run_id does not match the release asset manifest");
  }
  if (evidence.package_version !== manifest?.release?.version) {
    throw new Error("Windows signing evidence package_version does not match the release asset manifest");
  }
  if (evidence.source_revision !== manifest?.release?.commit ||
      !GIT_SHA_PATTERN.test(requiredString(evidence.source_revision, "Windows signing evidence source_revision"))) {
    throw new Error("Windows signing evidence source_revision does not match the release asset manifest");
  }

  const payloadFileCount = requiredPositiveInteger(
    evidence.payload_file_count,
    "Windows signing evidence payload_file_count",
  );
  const signablePayloadFileCount = requiredPositiveInteger(
    evidence.signable_payload_file_count,
    "Windows signing evidence signable_payload_file_count",
  );
  if (evidence.installer_file_count !== 1) {
    throw new Error("Windows signing evidence installer_file_count must be 1");
  }

  if (!Array.isArray(evidence.unsigned_payload_exceptions)) {
    throw new Error("Windows signing evidence unsigned_payload_exceptions must be an array");
  }
  const exceptionPaths = requireSortedUniquePaths(
    evidence.unsigned_payload_exceptions,
    "Windows signing evidence unsigned_payload_exceptions",
  );
  if (exceptionPaths.some((filePath) => !WINDOWS_UNSIGNED_PAYLOAD_EXCEPTIONS.includes(filePath))) {
    throw new Error("Windows signing evidence has an unexpected unsigned payload exception set");
  }
  for (const [index, exception] of evidence.unsigned_payload_exceptions.entries()) {
    exactKeys(
      exception,
      ["authenticode_status", "path", "reason", "sha256"],
      `Windows signing evidence unsigned_payload_exceptions[${index}]`,
    );
    requiredRawSha256(exception.sha256, `Windows signing evidence unsigned_payload_exceptions[${index}].sha256`);
    if (requiredString(exception.authenticode_status, `Windows signing evidence unsigned_payload_exceptions[${index}].authenticode_status`) === "Valid") {
      throw new Error(`Windows signing evidence unsigned_payload_exceptions[${index}] must not be Authenticode-valid`);
    }
    if (!["NotSigned", "UnknownError"].includes(exception.authenticode_status)) {
      throw new Error(`Windows signing evidence unsigned_payload_exceptions[${index}] has an unsupported Authenticode status`);
    }
    if (![WINDOWS_UNSIGNED_PAYLOAD_EXCEPTION_REASON, WINDOWS_OBSERVED_UNSIGNED_PAYLOAD_REASON].includes(exception.reason)) {
      throw new Error(`Windows signing evidence unsigned_payload_exceptions[${index}] has an unexpected reason`);
    }
  }
  if (payloadFileCount !== signablePayloadFileCount + evidence.unsigned_payload_exceptions.length) {
    throw new Error("Windows signing evidence payload file counts do not reconcile");
  }

  if (!Array.isArray(evidence.signed_files)) {
    throw new Error("Windows signing evidence signed_files must be an array");
  }
  if (evidence.signed_files.length !== signablePayloadFileCount + evidence.installer_file_count) {
    throw new Error("Windows signing evidence signed file count does not reconcile");
  }
  const signedPaths = requireSortedUniquePaths(evidence.signed_files, "Windows signing evidence signed_files");
  if (new Set(signedPaths.map((filePath) => requiredString(filePath, "signed path").toLowerCase())).size !== signedPaths.length) {
    throw new Error("Windows signing evidence signed paths must not alias each other");
  }
  for (const [index, signedFile] of evidence.signed_files.entries()) {
    exactKeys(
      signedFile,
      ["path", "sha256", "signer_subject", "signer_thumbprint"],
      `Windows signing evidence signed_files[${index}]`,
    );
    requiredRawSha256(signedFile.sha256, `Windows signing evidence signed_files[${index}].sha256`);
    requiredString(signedFile.signer_subject, `Windows signing evidence signed_files[${index}].signer_subject`);
    requiredString(signedFile.signer_thumbprint, `Windows signing evidence signed_files[${index}].signer_thumbprint`);
  }
  for (const relativePath of WINDOWS_UNSIGNED_PAYLOAD_EXCEPTIONS) {
    const signedPath = PAYLOAD_PREFIX + relativePath;
    const coveredSigned = signedPaths.includes(signedPath);
    const coveredUnsigned = exceptionPaths.includes(relativePath);
    if (Number(coveredSigned) + Number(coveredUnsigned) !== 1 ||
        signedPaths.some((filePath) => filePath.toLowerCase() === signedPath.toLowerCase() && filePath !== signedPath)) {
      throw new Error(`Windows signing evidence must cover controlled payload exactly once: ${relativePath}`);
    }
  }
  if (!signedPaths.includes(PAYLOAD_PREFIX + "PuPu.exe")) {
    throw new Error("Windows signing evidence does not contain the signed PuPu launcher");
  }
  const elevateHelperPath = ".release-qa\\windows-unpacked\\resources\\elevate.exe";
  if (!signedPaths.includes(elevateHelperPath)) {
    throw new Error("Windows signing evidence does not contain the signed Electron Builder elevation helper");
  }
  const installer = requiredWindowsInstaller(manifest);
  const installerPath = `dist\\${installer.name}`;
  const installerEvidence = evidence.signed_files.find((file) => file.path === installerPath);
  if (!installerEvidence) {
    throw new Error("Windows signing evidence does not contain the signed release installer");
  }
  if (installer.sha256 !== `sha256:${installerEvidence.sha256}`) {
    throw new Error("Windows signing evidence installer SHA-256 does not match the release asset manifest");
  }
  for (const filePath of signedPaths) {
    if (filePath === installerPath) continue;
    const relativePath = filePath.startsWith(PAYLOAD_PREFIX) ? filePath.slice(PAYLOAD_PREFIX.length) : "";
    if (!relativePath || relativePath.includes("/") ||
        relativePath.split("\\").some((part) => !part || part === "." || part === ".." || /[:. ]$|:/.test(part)) ||
        !/\.(exe|dll)$/i.test(relativePath)) {
      throw new Error("Windows signing evidence signed payload path is not canonical");
    }
  }
  return evidence;
}

export async function validateWindowsSigningEvidenceFile({ evidencePath, installerPath, version, runId, commit }) {
  const installerName = path.basename(installerPath);
  if (installerName !== `PuPu-${version}-windows-x64-setup.exe`) {
    throw new Error("Windows signing evidence installer filename does not match the expected version");
  }
  if (!fs.lstatSync(installerPath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error("Windows signing evidence requires the exact installer file");
  }
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(installerPath)) hash.update(chunk);
  const manifest = {
    release: { version, candidate_run_id: runId, commit },
    assets: [{ name: installerName, target_id: "windows-x64", role: "installer", format: "exe",
      sha256: `sha256:${hash.digest("hex")}` }],
  };
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  return validateWindowsReleaseCandidateSigningEvidence({ evidence, manifest });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    const args = process.argv.slice(2), values = {};
    const keys = new Set(["--evidence", "--installer", "--version", "--run-id", "--commit"]);
    if (args.length !== keys.size * 2) throw new Error("expected --evidence, --installer, --version, --run-id and --commit");
    for (let i = 0; i < args.length; i += 2) {
      if (!keys.has(args[i]) || Object.hasOwn(values, args[i]) || !args[i + 1] || args[i + 1].startsWith("--")) {
        throw new Error("invalid Windows signing evidence verification arguments");
      }
      values[args[i]] = args[i + 1];
    }
    await validateWindowsSigningEvidenceFile({ evidencePath: values["--evidence"], installerPath: values["--installer"],
      version: values["--version"], runId: values["--run-id"], commit: values["--commit"] });
    console.log("[windows-signing-evidence] strict package gate passed");
  } catch (error) {
    console.error(`[windows-signing-evidence] ${error.message || String(error)}`);
    process.exitCode = 1;
  }
}
