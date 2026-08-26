import assert from "node:assert/strict";
import test from "node:test";

import { validateQualificationFixtureAppUpdate } from "./validate-qualification-fixture-app-update.mjs";

const FEED_URL = "http://127.0.0.1:42871/";

test("qualification fixture app-update.yml is exactly the signed loopback provider contract", () => {
  assert.deepEqual(
    validateQualificationFixtureAppUpdate({
      contents: [
        "provider: generic",
        `url: ${FEED_URL}`,
        "updaterCacheDirName: pupu-updater",
        "",
      ].join("\n"),
      feedUrl: FEED_URL,
    }),
    {
      provider: "generic",
      url: FEED_URL,
      updaterCacheDirName: "pupu-updater",
    },
  );
});

test("qualification fixture app-update.yml rejects production providers, feed drift, and unreviewed keys", () => {
  for (const contents of [
    "provider: github\nowner: haoxiang-xu\nrepo: PuPu\nreleaseType: release\nupdaterCacheDirName: pupu-updater\n",
    "provider: generic\nurl: http://127.0.0.1:42872/\nupdaterCacheDirName: pupu-updater\n",
    "provider: generic\nurl: http://127.0.0.1:42871/\nupdaterCacheDirName: pupu-updater\nchannel: beta\n",
  ]) {
    assert.throws(
      () => validateQualificationFixtureAppUpdate({ contents, feedUrl: FEED_URL }),
      /qualification fixture app-update\.yml/,
    );
  }
});
