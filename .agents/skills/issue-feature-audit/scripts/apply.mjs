import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mergeLocale, serializeLocale } from "./keys.mjs";

/** Pure: return the locale object with missing keys filled from `translations`, en-ordered. */
export function applyTranslations({ en, locale, translations }) {
  return mergeLocale(en, locale, translations);
}

function parseArgs(argv) {
  const args = { root: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") args.root = argv[++i];
    else if (argv[i] === "--locale") args.locale = argv[++i];
    else if (argv[i] === "--translations") args.translations = argv[++i];
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args.locale || !args.translations) {
    process.stderr.write("usage: apply.mjs --locale <name> --translations <file.json> [--root <dir>]\n");
    process.exit(1);
  }
  const localesDir = join(args.root, "src/locales");
  const en = JSON.parse(readFileSync(join(localesDir, "en.json"), "utf8"));
  const file = join(localesDir, `${args.locale}.json`);
  const locale = JSON.parse(readFileSync(file, "utf8"));
  const translations = JSON.parse(readFileSync(args.translations, "utf8"));
  const merged = applyTranslations({ en, locale, translations });
  writeFileSync(file, serializeLocale(merged));
  process.stdout.write(`Updated ${args.locale}.json (+${Object.keys(translations).length} keys)\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
