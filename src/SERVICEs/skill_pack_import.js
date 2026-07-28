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

/* Minimal YAML-frontmatter reader: a leading `---` fence, `key: value` lines
 * until the closing `---`, then the markdown body. Intentionally NOT a full
 * YAML parser — SKILL.md frontmatter is flat scalar keys (name/description/
 * title/license). Quotes are stripped; the first colon splits key from value
 * so `description: has: colon` round-trips. Returns { data: null } when there
 * is no leading fence. */
export const parseFrontmatter = (content) => {
  const text = String(content || "");
  const lines = text.split(/\r?\n/);
  if (lines[0] == null || lines[0].trim() !== "---") {
    return { data: null, body: text };
  }
  const data = {};
  let closeIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      closeIndex = i;
      break;
    }
    const line = lines[i];
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (key) data[key] = value;
  }
  if (closeIndex === -1) {
    // Unterminated fence — treat as no valid frontmatter.
    return { data: null, body: text };
  }
  const body = lines.slice(closeIndex + 1).join("\n").replace(/^\n+/, "");
  return { data, body };
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

/**
 * Build a skill-pack descriptor from a scanned directory.
 *
 * @param {{dirName: string, files: Array<{relPath: string, content: string, folderFiles?: string[]}>}} scan
 * @returns {{
 *   toolkitId: string,
 *   toolkitName: string,
 *   skills: Array<{name, title, description, body, phase: "composer", tools: string[]}>,
 *   skipped: Array<{relPath: string, reason: string}>,
 *   degraded: Array<{name: string, relPath: string, refs: string[]}>,
 *   rejected: Array<{relPath: string, reason: string}>,
 * }}
 */
export const buildSkillPackFromScan = (scan) => {
  const dirName = scan && typeof scan.dirName === "string" ? scan.dirName : "";
  const files = scan && Array.isArray(scan.files) ? scan.files : [];

  const skills = [];
  const skipped = [];
  const degraded = [];
  const rejected = [];
  const seenNames = new Set();

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

    const { data, body } = parseFrontmatter(file.content);
    if (!data) {
      skipped.push({ relPath, reason: "no_frontmatter" });
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
    if (seenNames.has(name)) {
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
      degraded.push({ name, relPath, refs });
    }

    seenNames.add(name);
    skills.push({
      name,
      title:
        (typeof data.title === "string" && data.title.trim()) || name,
      description,
      body: trimmedBody,
      phase: "composer",
      tools: [],
    });
  }

  return {
    toolkitId: toSkillPackId(dirName),
    toolkitName: String(dirName || "").trim() || "Imported skills",
    skills,
    skipped,
    degraded,
    rejected,
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
