import fs from "fs";
import path from "path";

/* The rail carries a Discover item and, under a hairline, a Browse group. If a
   locale translates both to the same word the two are indistinguishable. */
const LOCALES_DIR = path.join(__dirname, "../../locales");
const locales = fs
  .readdirSync(LOCALES_DIR)
  .filter((name) => name.endsWith(".json"))
  .map((name) => [name.replace(/\.json$/, ""), JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, name), "utf8")).toolkit]);

describe("plugins rail labels", () => {
  test.each(locales)("%s: Browse is worded differently from Discover and Installed", (code, toolkit) => {
    expect(toolkit.nav_browse).toBeTruthy();
    expect(toolkit.nav_browse).not.toBe(toolkit.nav_discover);
    expect(toolkit.nav_browse).not.toBe(toolkit.nav_installed);
  });
});
