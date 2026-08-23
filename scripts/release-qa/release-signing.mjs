import process from "node:process";

const has = (environment, key) =>
  typeof environment[key] === "string" && environment[key].trim().length > 0;

const hasAppleNotarizationCredentials = (environment) =>
  (has(environment, "APPLE_API_KEY") &&
    has(environment, "APPLE_API_KEY_ID") &&
    has(environment, "APPLE_API_ISSUER")) ||
  (has(environment, "APPLE_ID") &&
    has(environment, "APPLE_APP_SPECIFIC_PASSWORD") &&
    has(environment, "APPLE_TEAM_ID")) ||
  (has(environment, "APPLE_KEYCHAIN") && has(environment, "APPLE_KEYCHAIN_PROFILE"));

export function releaseSigningFailures(platform, environment = process.env) {
  const failures = [];
  if (!["macos", "windows", "linux"].includes(platform)) {
    return [`unsupported signing platform: ${platform || "(missing)"}`];
  }
  if (platform === "macos") {
    if (!has(environment, "CSC_LINK") || !has(environment, "CSC_KEY_PASSWORD")) {
      failures.push("macOS requires CSC_LINK and CSC_KEY_PASSWORD");
    }
    if (!hasAppleNotarizationCredentials(environment)) {
      failures.push("macOS requires Apple notarization credentials");
    }
  }
  if (platform === "windows") {
    const required = [
      "AZURE_CLIENT_ID",
      "AZURE_TENANT_ID",
      "AZURE_SUBSCRIPTION_ID",
      "AZURE_ARTIFACT_SIGNING_ENDPOINT",
      "AZURE_ARTIFACT_SIGNING_ACCOUNT_NAME",
      "AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME",
    ];
    const missing = required.filter((key) => !has(environment, key));
    if (missing.length > 0) {
      failures.push(`Windows Artifact Signing requires ${missing.join(", ")}`);
    }
  }
  return failures;
}

export function assertReleaseSigningCredentials(platform, environment = process.env) {
  const failures = releaseSigningFailures(platform, environment);
  if (failures.length > 0) {
    throw new Error(failures.join("; "));
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--platform") {
      args.platform = argv[index + 1] || "";
      index += 1;
    }
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { platform } = parseArgs(process.argv.slice(2));
    assertReleaseSigningCredentials(platform);
    console.log(`[release-signing] ${platform} signing credentials are present`);
  } catch (error) {
    console.error(`[release-signing] ${error.message || String(error)}`);
    process.exit(1);
  }
}
