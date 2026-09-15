#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import { validateQualificationFixtureAppUpdate } from "./validate-qualification-fixture-app-update.mjs";
import { validateRunnerLoopbackFeedUrl } from "./write-qualification-fixture-build-config.mjs";

// electron-builder's Windows dir target omits app-update.yml. Materialize only
// the allowed qualification feed difference, before any signing or sealing.
// Never repair/overwrite an existing mismatched config (including on retry).
export function prepareQualificationFixtureAppUpdate({ appUpdatePath, feedUrl }) {
  const output = path.resolve(appUpdatePath);
  const contents = YAML.stringify({
    provider: "generic",
    url: validateRunnerLoopbackFeedUrl(feedUrl),
    updaterCacheDirName: "pupu-updater",
  });
  validateQualificationFixtureAppUpdate({ contents, feedUrl });
  try {
    fs.writeFileSync(output, contents, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  // Also reject stale output and broken payload paths; do not create resources/.
  return validateQualificationFixtureAppUpdate({
    contents: fs.readFileSync(output, "utf8"),
    feedUrl,
  });
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== "--app-update" || args[2] !== "--feed-url") {
      throw new Error("expected --app-update <path> --feed-url <runner-loopback-url>");
    }
    prepareQualificationFixtureAppUpdate({ appUpdatePath: args[1], feedUrl: args[3] });
    console.log("[qualification-fixture] prepared and validated unsigned loopback updater config");
  } catch (error) {
    console.error(`[qualification-fixture] ${error.message || String(error)}`);
    process.exitCode = 1;
  }
}
