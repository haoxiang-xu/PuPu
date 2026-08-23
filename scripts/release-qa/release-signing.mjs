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
    const hasCertificate = has(environment, "WIN_CSC_LINK") || has(environment, "CSC_LINK");
    const hasPassword = has(environment, "WIN_CSC_KEY_PASSWORD") || has(environment, "CSC_KEY_PASSWORD");
    if (!hasCertificate || !hasPassword) {
      failures.push("Windows requires WIN_CSC_LINK/CSC_LINK and WIN_CSC_KEY_PASSWORD/CSC_KEY_PASSWORD");
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
