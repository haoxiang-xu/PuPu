import api from "../../../SERVICEs/api";
import curation from "../../../SERVICEs/plugin_store_curation.json";
import { buildSkillPackFromScan } from "../../../SERVICEs/skill_pack_import";

/* skill_pack_store_install — S6b's renderer-side orchestration of the store
   one-click skill-pack install (spec: 2026-07-18 S6, channel contract r1.2).

   Data source is the curation JSON's `skillPacks` section (S6c). The install
   chain reuses S3 verbatim after the download step:

     downloadSkillRepo({repo, sha, manifest})   — S6a main IPC; fail-closed,
       returns {ok:true, dir} with ONLY manifest-hit, sha256-verified .md
       files under a self-managed temp dir
     scanSkillDir(dir) → buildSkillPackFromScan — the S3 semantic gates run
       unchanged on top (scripts-reject / 64KB / degraded), forming the
       second gate of the double-gate design
     installSkillPack(pack)                     — backend skill_packs store →
       catalog v2 → plugin_skill_sync (/commands)

   The pack's toolkitId is FORCED to the curation entry id (adjudication 1:
   `id` IS the installed toolkitId) — the temp dir's uuid name must never
   leak into identity via toSkillPackId. */

const SHA_RE = /^[0-9a-f]{40}$/;
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

const codedError = (code) => {
  const error = new Error(`skill pack install failed: ${code}`);
  error.code = code;
  return error;
};

const isValidManifest = (manifest) =>
  Array.isArray(manifest) &&
  manifest.length > 0 &&
  manifest.every(
    (file) =>
      file &&
      typeof file.path === "string" &&
      file.path.trim() &&
      typeof file.sha256 === "string" &&
      file.sha256.trim(),
  );

/* Fail-closed listing (adjudication 1): an entry with no review record, an
   empty/invalid manifest, or a malformed source never renders an install
   affordance — it simply doesn't exist to the UI. */
export const listStoreSkillPacks = () => {
  const raw = Array.isArray(curation?.skillPacks) ? curation.skillPacks : [];
  return raw.filter(
    (pack) =>
      pack &&
      typeof pack.id === "string" &&
      pack.id.startsWith("skillpack.") &&
      typeof pack.title === "string" &&
      pack.title.trim() &&
      isValidManifest(pack.manifest) &&
      pack.review &&
      typeof pack.review.recordId === "string" &&
      pack.review.recordId.trim() &&
      pack.source &&
      pack.source.provider === "github" &&
      REPO_RE.test(String(pack.source.repo || "")) &&
      SHA_RE.test(String(pack.source.sha || "")),
  );
};

/* Run the full store install chain for one curation entry. Throws a coded
   error — `code` is the r1.2 enum from main (invalid_payload|network|timeout|
   not_found|too_large|malformed|integrity|fs) or a facade code — which the
   caller maps to i18n copy. Returns the installed pack descriptor. */
export const installStoreSkillPack = async (packEntry) => {
  const source = packEntry?.source || {};
  const download = await api.unchain.downloadSkillRepo({
    repo: source.repo,
    sha: source.sha,
    manifest: packEntry?.manifest,
  });
  if (!download || download.ok !== true || !download.dir) {
    throw codedError(download?.error || "network");
  }

  const scan = await api.unchain.scanSkillDir(download.dir);
  if (!scan || scan.ok === false) throw codedError("fs");

  const built = buildSkillPackFromScan({
    dirName: scan.dirName,
    files: scan.files,
  });
  /* Every file passed S6a's byte-integrity gate, so an empty build means the
     S3 semantic gates rejected the reviewed content — a curation/content
     mismatch, not a network problem. */
  if (!built.skills.length) throw codedError("malformed");

  const pack = {
    ...built,
    toolkitId: packEntry.id,
    toolkitName: packEntry.title || built.toolkitName,
  };
  await api.unchain.installSkillPack(pack);
  return pack;
};
