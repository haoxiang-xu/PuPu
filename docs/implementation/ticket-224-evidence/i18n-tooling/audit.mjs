import { flattenKeys, extractPlaceholders } from "./keys.mjs";

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** Heuristic: worth flagging when a value is identical to English? */
function isTranslatable(s) {
  if (typeof s !== "string") return false;
  const trimmed = s.trim();
  if (trimmed.length < 3) return false; // "OK", "On"
  if (!/[A-Za-z]/.test(trimmed)) return false; // pure symbols/numbers
  if (/^pupu$/i.test(trimmed)) return false; // brand name
  return true;
}

/**
 * Pure audit. Inputs:
 *   en      — parsed en.json (source of truth)
 *   locales — { name: parsedJson } for every non-en locale
 *   code    — { staticKeys:Set, dynamicCount:number, literalKeys:Set } from scan.mjs
 *   strict  — when true, compute suspectedUntranslated
 */
export function auditLocales({ en, locales, code, strict = false }) {
  const enFlat = flattenKeys(en);
  const enKeys = Object.keys(enFlat);
  const enKeySet = new Set(enKeys);

  const localeReports = {};
  for (const [name, obj] of Object.entries(locales)) {
    const flat = flattenKeys(obj);
    const keys = new Set(Object.keys(flat));
    const missing = enKeys.filter((k) => !keys.has(k));
    const orphan = Object.keys(flat).filter((k) => !enKeySet.has(k));
    const placeholderMismatch = [];
    for (const k of enKeys) {
      if (!keys.has(k)) continue;
      const a = extractPlaceholders(enFlat[k]);
      const b = extractPlaceholders(flat[k]);
      if (!setsEqual(a, b)) {
        placeholderMismatch.push({ key: k, en: [...a].sort(), locale: [...b].sort() });
      }
    }
    const report = { missing, orphan, placeholderMismatch };
    if (strict) {
      report.suspectedUntranslated = enKeys.filter(
        (k) => keys.has(k) && flat[k] === enFlat[k] && isTranslatable(enFlat[k]),
      );
    }
    localeReports[name] = report;
  }

  const missingInEn = [...code.staticKeys].filter((k) => !enKeySet.has(k)).sort();
  const referenced = new Set([...code.staticKeys, ...code.literalKeys]);
  const deadKeys = enKeys.filter((k) => !referenced.has(k));

  return {
    sourceLocale: "en",
    enKeyCount: enKeys.length,
    locales: localeReports,
    code: {
      missingInEn,
      deadKeys,
      dynamicCount: code.dynamicCount,
      note: "based on static analysis; dynamically-composed keys (t(variable)) are not covered",
    },
  };
}

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { scanSource, mergeScans } from "./scan.mjs";

function parseArgs(argv) {
  const args = { strict: false, root: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--strict") args.strict = true;
    else if (argv[i] === "--root") args.root = argv[++i];
  }
  return args;
}

function walkJs(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkJs(full, acc);
    // skip *.test.js — test-only key references would mask dead keys / fake missingInEn
    else if (name.endsWith(".js") && !name.endsWith(".test.js")) acc.push(full);
  }
  return acc;
}

function main(argv) {
  const args = parseArgs(argv);
  const localesDir = join(args.root, "src/locales");
  const srcDir = join(args.root, "src");
  const en = JSON.parse(readFileSync(join(localesDir, "en.json"), "utf8"));
  const locales = {};
  for (const f of readdirSync(localesDir)) {
    if (f.endsWith(".json") && f !== "en.json") {
      locales[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(localesDir, f), "utf8"));
    }
  }
  const code = mergeScans(walkJs(srcDir).map((p) => scanSource(readFileSync(p, "utf8"))));
  const report = auditLocales({ en, locales, code, strict: args.strict });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
