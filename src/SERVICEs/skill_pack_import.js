import { SkillFrontmatterError, coerceBool, parseSkillFile } from "./skill_frontmatter";

/* skill_pack_import — turn a scanned local directory of Claude-style SKILL.md
 * files into a PuPu "skill pack" (a pure-skill plugin: tools empty, skills
 * non-empty). This is the frontend brain of the S3 open-skill-ecosystem
 * importer; it mirrors mcp_install.js's normalizeCustomMcpRecipe one tier up
 * (custom MCP: user form -> recipe; skill pack: scanned files -> descriptor).
 *
 * It is deliberately pure and side-effect-free so it can be unit tested
 * without any fs / IPC. The Electron main process supplies the raw scan (see
 * api.unchain.scanSkillDir); persistence is handled by the backend skill_packs
 * store (api.unchain.installSkillPack) which appends the pack into catalog v2,
 * where plugin_skill_sync turns each skill into a /command.
 *
 * Phase-1 boundaries (spec 2026-07-18, architect M2/M3/M6):
 *   - instruction-only: a skill folder shipping scripts/executables is REJECTED
 *   - degraded (not silent): a skill whose body references sibling
 *     reference/asset files is imported but flagged so the UI can say so
 *   - 64KB technical cap on a single skill body (M2): oversize -> REJECTED
 *   - every imported skill is phase "composer" with empty tools (open skills
 *     don't use PuPu's {tools} placeholder) — the only phase plugin_skill_sync
 *     surfaces as a command this iteration.
 */

/* Single-body technical cap (architect M2). Measured in UTF-8 bytes. */
export const SKILL_BODY_MAX_BYTES = 64 * 1024;

/* Mirrors skill_rows.py `_SKILL_NAME_RE` — the command name must be a clean
 * slash-command token. Anything else is skipped-and-reported, never coerced. */
const SKILL_NAME_RE = /^[a-zA-Z0-9_-]+$/;

/* A skill folder is "instruction-only" iff it ships nothing executable. Any
 * file with one of these extensions, or living under a `scripts/` segment,
 * disqualifies the whole skill (phase-1 hard gate). */
const SCRIPT_EXTENSIONS = new Set([
  "py", "pyw", "ipynb",
  "js", "mjs", "cjs", "ts", "tsx", "jsx",
  "sh", "bash", "zsh", "fish",
  "rb", "pl", "pm", "php", "lua", "tcl",
  "go", "rs", "java", "class", "kt", "scala",
  "c", "cc", "cpp", "h", "hpp",
  "exe", "bin", "app", "com", "msi",
  "ps1", "bat", "cmd", "vbs", "wsf",
  "jar", "war", "dll", "so", "dylib",
]);

const extOf = (relPath) => {
  const base = String(relPath || "").split("/").pop() || "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
};

const utf8ByteLength = (text) => {
  const str = String(text || "");
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str).length;
  }
  // Fallback for environments without TextEncoder — count code units.
  let bytes = 0;
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) bytes += 4; // surrogate pair -> 4 bytes, skip low half
    else bytes += 3;
  }
  return bytes;
};

/* Slugify the picked directory name into the pack's toolkitId. The
 * `skillpack.` namespace keeps imported packs distinct from `mcp.*` (installed
 * MCP) and builtin toolkit ids, and is what the backend store validates. */
export const toSkillPackId = (dirName) => {
  const slug = String(dirName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `skillpack.${slug || "imported"}`;
};

/* P-D6 (ticket #291) canonical skill-name slug — the exact same rules as
 * the Python twin `canonical_skill_name` in skill_rows.py: lowercase; `_`
 * and any character outside [a-z0-9-] -> "-"; collapse runs of "-"; strip
 * leading/trailing "-"; truncate to 64 chars; strip a trailing "-" left
 * dangling by that truncation. Idempotent. */
const CANONICAL_NAME_MAX_LENGTH = 64;

export const canonicalSkillName = (name) => {
  let text = String(name || "").toLowerCase();
  text = text.replace(/[^a-z0-9-]+/g, "-");
  text = text.replace(/-{2,}/g, "-");
  text = text.replace(/^-+|-+$/g, "");
  text = text.slice(0, CANONICAL_NAME_MAX_LENGTH);
  text = text.replace(/-+$/g, "");
  return text;
};

/* P-D6 tolerant boolean coercion for a frontmatter policy flag — the JS
 * twin of skill_rows.py's `_row_bool`. Missing (`undefined`/`null`) ->
 * `defaultValue` (a *present* JSON `null` on a stored row is the backend
 * normalizer's job — it treats it as invalid, never permissive); an actual boolean passes through; one of the
 * case-insensitive strings true/false/yes/no/on/off/1/0 -> the matching
 * bool; anything else explicit -> `null` ("invalid" — the caller must
 * never treat that as permissive). */
const TRUE_FLAG_STRINGS = new Set(["true", "yes", "on", "1"]);
const FALSE_FLAG_STRINGS = new Set(["false", "no", "off", "0"]);

export const parseFlag = (value, defaultValue) => {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (TRUE_FLAG_STRINGS.has(text)) return true;
    if (FALSE_FLAG_STRINGS.has(text)) return false;
    return null;
  }
  return null;
};

/* Mirrors skill_rows.py's `_clean_aliases`: `seed` (the raw frontmatter
 * spelling, when it differs from the canonical name) comes first, then any
 * explicit string entries from the frontmatter's own `aliases:` list —
 * trimmed, deduplicated, and never equal to the canonical name itself. Safe
 * to run again downstream (backend `normalize_skill_rows` applies the same
 * cleaning) since it is idempotent. */
const cleanAliases = (canonical, rawAliases, seed) => {
  const aliases = [...seed];
  const seen = new Set(aliases);
  if (Array.isArray(rawAliases)) {
    for (const candidate of rawAliases) {
      if (typeof candidate !== "string") continue;
      const cleaned = candidate.trim();
      if (!cleaned || cleaned === canonical || seen.has(cleaned)) continue;
      aliases.push(cleaned);
      seen.add(cleaned);
    }
  }
  return aliases;
};

/* Frontmatter keys that are surfaced as their own named fields — every
 * other key on a skill's frontmatter becomes part of `metadata`. `aliases`
 * is reserved for the skill's own alias list (see `buildSkillPackFromScan`)
 * so it never gets dumped into the metadata bag either. */
const METADATA_EXCLUDED_KEYS = new Set([
  "name",
  "description",
  "title",
  "disable-model-invocation",
  "user-invocable",
  "aliases",
]);

/* P4 (ticket #291 feature audit): the importer used to be a single-line
 * colon splitter that could not represent block scalars (`|`/`>`), nested
 * mappings/lists, or inline comments — e.g. `description: >` over an
 * indented paragraph came back as the literal string `">"`, and a nested
 * `metadata:` mapping came back empty with its children flattened onto the
 * top level. `parseSkillFile` (skill_frontmatter.js) is a faithful JS port
 * of Unchain's authoritative SKILL.md YAML-subset parser
 * (src/unchain/skills/frontmatter.py), so the renderer producer and the
 * backend validator now share the exact same grammar and rejections.
 *
 * Returns `{ data: null, body, error: null }` when there is no leading
 * `---` fence at all (caller reports `no_frontmatter`), or
 * `{ data: null, body, error }` when a fence is present but the frontmatter
 * is otherwise malformed — unterminated, tab-indented, a YAML tag/anchor/
 * alias, a flow mapping, or a duplicate `name`/`description`/
 * `disable-model-invocation`/`user-invocable` (caller reports
 * `invalid_frontmatter`). On success, `data` holds the parsed fields
 * (strings, and nested objects/arrays for mappings/lists) and `body` is the
 * markdown after the closing fence. */
export const parseFrontmatter = (content) => {
  const text = String(content || "");
  try {
    const { fields, body } = parseSkillFile(text);
    return { data: fields, body, error: null };
  } catch (err) {
    if (err instanceof SkillFrontmatterError) {
      const noFence = /^missing YAML frontmatter/.test(err.message);
      return { data: null, body: text, error: noFence ? null : err };
    }
    throw err;
  }
};

/* Does this skill folder ship anything executable? `folderFiles` are paths of
 * every file in the SKILL.md's own folder subtree (the SKILL.md itself may or
 * may not be included — it's ignored either way). */
const folderHasScripts = (folderFiles, ownRelPath) =>
  (Array.isArray(folderFiles) ? folderFiles : []).some((f) => {
    const p = String(f || "");
    if (!p || p === ownRelPath || /\/SKILL\.md$/i.test(p) || p === "SKILL.md") {
      return false;
    }
    if (p.split("/").some((seg) => seg.toLowerCase() === "scripts")) return true;
    return SCRIPT_EXTENSIONS.has(extOf(p));
  });

/* Collect relative link/image targets in the markdown body — `](target)` and
 * `]: target` reference-style — dropping URLs, mailto, and in-page anchors.
 * Used to detect whether an imported skill leans on sibling files we did NOT
 * import (references/assets), which makes it "degraded". */
const bodyRelativeRefs = (body) => {
  const text = String(body || "");
  const refs = new Set();
  const push = (raw) => {
    let target = String(raw || "").trim();
    if (!target) return;
    // strip a markdown title: (path "title")
    target = target.split(/\s+/)[0];
    target = target.replace(/^<|>$/g, "");
    if (!target) return;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return; // scheme: http:, mailto:, data:
    if (target.startsWith("#")) return; // in-page anchor
    if (target.startsWith("//")) return; // protocol-relative URL
    refs.add(target.replace(/^\.\//, ""));
  };
  const inline = /\]\(([^)]+)\)/g;
  let m;
  while ((m = inline.exec(text)) !== null) push(m[1]);
  const reference = /^\s*\[[^\]]+\]:\s*(\S+)/gm;
  while ((m = reference.exec(text)) !== null) push(m[1]);
  return [...refs];
};

/* Which of the body's relative refs actually resolve to a sibling file present
 * in the folder (normalized against the SKILL.md's own folder). */
const degradedRefs = (body, folderFiles, ownRelPath) => {
  const relRefs = bodyRelativeRefs(body);
  if (relRefs.length === 0) return [];
  const folderPrefix = ownRelPath.includes("/")
    ? ownRelPath.slice(0, ownRelPath.lastIndexOf("/") + 1)
    : "";
  const present = new Set(
    (Array.isArray(folderFiles) ? folderFiles : []).map((f) => String(f || "")),
  );
  const hit = [];
  for (const ref of relRefs) {
    // ref is relative to the SKILL.md's folder; resolve to a folder-rooted path
    const resolved = (folderPrefix + ref).replace(/\/\.\//g, "/");
    if (present.has(resolved) || present.has(ref)) hit.push(ref);
  }
  return hit;
};

/* Build the skill's `metadata` bag from every parsed frontmatter field other
 * than the ones with their own named output field (see
 * `METADATA_EXCLUDED_KEYS`). Values are preserved as their parsed type
 * (string / nested object / array) rather than flattened to strings — the
 * P4 fix. A conventional top-level `metadata:` mapping (as used by
 * Unchain's own SKILL.md fixtures for author/license/version) is unwrapped
 * one level so its children land directly in the bag instead of double
 * nesting under a redundant `metadata.metadata` key; a `metadata:` value
 * that is not itself a plain mapping (e.g. a bare scalar) is kept verbatim
 * under its own key so nothing is silently dropped. */
const buildMetadata = (data) => {
  const entries = [];
  for (const [key, value] of Object.entries(data)) {
    if (METADATA_EXCLUDED_KEYS.has(key)) continue;
    if (key === "metadata" && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        entries.push([nestedKey, nestedValue]);
      }
      continue;
    }
    entries.push([key, value]);
  }
  return Object.fromEntries(entries);
};

/**
 * Build a skill-pack descriptor from a scanned directory.
 *
 * @param {{dirName: string, files: Array<{relPath: string, content: string, folderFiles?: string[]}>}} scan
 * @returns {{
 *   toolkitId: string,
 *   toolkitName: string,
 *   skills: Array<{
 *     name: string,
 *     title: string,
 *     description: string,
 *     body: string,
 *     phase: "composer",
 *     tools: string[],
 *     aliases: string[],
 *     modelInvocable: boolean,
 *     userInvocable: boolean,
 *     metadata: Object<string, string>,
 *   }>,
 *   skipped: Array<{relPath: string, reason: string}>,
 *   degraded: Array<{name: string, relPath: string, refs: string[]}>,
 *   rejected: Array<{relPath: string, reason: string}>,
 *   warnings: Array<{name: string, relPath: string, reason: string}>,
 * }}
 */
export const buildSkillPackFromScan = (scan) => {
  const dirName = scan && typeof scan.dirName === "string" ? scan.dirName : "";
  const files = scan && Array.isArray(scan.files) ? scan.files : [];

  const skills = [];
  const skipped = [];
  const degraded = [];
  const rejected = [];
  const warnings = [];
  // Keyed on the RAW frontmatter spelling (P4 fix, ticket #291): only an
  // exact repeat of the same raw name is a producer-level duplicate. Two
  // different raw spellings that canonicalize to the same /command (e.g.
  // "echo-loud" and "Echo_Loud") are BOTH kept — the backend's
  // `normalize_skill_rows` retains every colliding row under a suffixed
  // canonical name rather than silently losing one, so the producer must
  // not pre-emptively drop it here.
  const seenRawNames = new Set();

  for (const file of files) {
    if (!file || typeof file !== "object") continue;
    const relPath = typeof file.relPath === "string" ? file.relPath : "";
    if (!relPath) continue;

    // Instruction-only gate first: a scripted folder is rejected outright,
    // regardless of frontmatter validity.
    if (folderHasScripts(file.folderFiles, relPath)) {
      rejected.push({ relPath, reason: "scripts_present" });
      continue;
    }

    const { data, body, error } = parseFrontmatter(file.content);
    if (!data) {
      skipped.push({ relPath, reason: error ? "invalid_frontmatter" : "no_frontmatter" });
      continue;
    }
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const description =
      typeof data.description === "string" ? data.description.trim() : "";
    if (!name) {
      skipped.push({ relPath, reason: "missing_name" });
      continue;
    }
    if (!SKILL_NAME_RE.test(name)) {
      skipped.push({ relPath, reason: "invalid_name" });
      continue;
    }
    if (!description) {
      skipped.push({ relPath, reason: "missing_description" });
      continue;
    }
    const canonicalName = canonicalSkillName(name);
    if (!canonicalName) {
      // Canonicalizes to nothing (e.g. a raw name of only "-"/"_") — same
      // "unusable command token" outcome as failing SKILL_NAME_RE above.
      skipped.push({ relPath, reason: "invalid_name" });
      continue;
    }
    if (seenRawNames.has(name)) {
      skipped.push({ relPath, reason: "duplicate_name" });
      continue;
    }

    const trimmedBody = String(body || "").trim();
    if (utf8ByteLength(trimmedBody) > SKILL_BODY_MAX_BYTES) {
      rejected.push({ relPath, reason: "body_too_large" });
      continue;
    }

    const refs = degradedRefs(trimmedBody, file.folderFiles, relPath);
    if (refs.length > 0) {
      degraded.push({ name: canonicalName, relPath, refs });
    }

    // P-D6: the raw frontmatter spelling becomes an alias when it differs
    // from the canonical /command name; an explicit `aliases:` list in the
    // frontmatter is merged in behind it (mirrors skill_rows.py's
    // `_clean_aliases`, which the backend applies again on top — idempotent).
    const aliasSeed = canonicalName !== name ? [name] : [];
    const aliases = cleanAliases(canonicalName, data.aliases, aliasSeed);

    let modelInvocable;
    try {
      modelInvocable = !coerceBool(data["disable-model-invocation"], false);
    } catch {
      modelInvocable = false; // invalid -> restrictive, never permissive
      warnings.push({
        name: canonicalName,
        relPath,
        reason: "invalid_flag:disable-model-invocation",
      });
    }

    let userInvocable;
    try {
      userInvocable = coerceBool(data["user-invocable"], true);
    } catch {
      userInvocable = false; // invalid -> restrictive, never permissive
      warnings.push({
        name: canonicalName,
        relPath,
        reason: "invalid_flag:user-invocable",
      });
    }

    const metadata = buildMetadata(data);

    seenRawNames.add(name);
    skills.push({
      name: canonicalName,
      title:
        (typeof data.title === "string" && data.title.trim()) || canonicalName,
      description,
      body: trimmedBody,
      phase: "composer",
      tools: [],
      aliases,
      modelInvocable,
      userInvocable,
      metadata,
    });
  }

  return {
    toolkitId: toSkillPackId(dirName),
    toolkitName: String(dirName || "").trim() || "Imported skills",
    skills,
    skipped,
    degraded,
    rejected,
    warnings,
  };
};

/**
 * Which of a pack's skills would collide with an already-registered command.
 * The command registry is first-wins across plugins, so a colliding skill
 * would silently NOT take effect — the UI must surface this, not swallow it
 * (spec §4 "重名 → 明示提示,不静默吞"). Pure: the caller supplies an
 * `isRegistered(commandName)` predicate (e.g. name => !!getCommand(name)).
 *
 * @param {Array<{name: string}>} skills
 * @param {(commandName: string) => boolean} isRegistered
 * @returns {Array<{name: string, command: string}>}
 */
export const findCommandConflicts = (skills, isRegistered) => {
  if (!Array.isArray(skills) || typeof isRegistered !== "function") return [];
  const conflicts = [];
  for (const skill of skills) {
    const name = skill && typeof skill.name === "string" ? skill.name : "";
    if (!name) continue;
    const command = `/${name}`;
    let hit = false;
    try {
      hit = !!isRegistered(command);
    } catch {
      hit = false;
    }
    if (hit) conflicts.push({ name, command });
  }
  return conflicts;
};
