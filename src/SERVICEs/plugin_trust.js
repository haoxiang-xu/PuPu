import { PLUGIN_VERIFICATION_RECORDS } from "./plugin_verification_records";

/* Display-only projection. `records` is an application-owned evidence source
 * (the optional argument is for validation tests), NEVER entry.verification.
 * Recompute from the entry instead of caching a trust decision by plugin ID:
 * a local import or a different version can reuse a store ID. */
export function resolvePluginTrust(entry, records = PLUGIN_VERIFICATION_RECORDS) {
  const result = {
    origin: "unknown",
    status: "unknown",
    publisher: "",
    scope: [],
    reviewedAt: "",
    reviewedBy: "",
    reference: "",
  };
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return result;

  const packSource = entry.source && typeof entry.source === "object" &&
    !Array.isArray(entry.source) && entry.source.provider === "github" &&
    /^[\w.-]+\/[\w.-]+$/.test(entry.source.repo || "")
    ? entry.source : null;
  const source = packSource ? "skillpack" :
    typeof entry.source === "string" ? entry.source.trim().toLowerCase() : "";
  const toolkitId = typeof entry.toolkitId === "string" ? entry.toolkitId :
    typeof entry.id === "string" ? entry.id : "";
  const version = packSource ? packSource.sha : entry.version || entry.toolkitVersion;
  const sourceRepo = packSource ? `https://github.com/${packSource.repo}` : entry.sourceRepo;

  // Only explicit source classification from the catalog counts. In particular,
  // toPluginPresentation's default source=builtin must not be passed here.
  if (source === "builtin" || source === "core") {
    result.origin = "official";
    result.publisher = "PuPu";
  } else if (["mcp", "mcp_registry", "local", "plugin", "skillpack"].includes(source)) {
    result.origin = "third_party";
  }
  if (source || toolkitId) result.status = "unverified";
  if (["needs_review", "external_review"].includes(entry.trustLevel)) {
    result.status = "pending";
  }

  // This is declared publisher information, not an identity attestation.
  if (result.origin !== "official") {
    const declared = typeof entry.publisher === "string" ? entry.publisher :
      typeof entry.author === "string" ? entry.author : "";
    result.publisher = declared.trim().slice(0, 160);
    if (!result.publisher && typeof sourceRepo === "string") {
      try {
        const url = new URL(sourceRepo);
        if (url.protocol === "https:" && url.hostname === "github.com") {
          const parts = url.pathname.split("/").filter(Boolean);
          if (parts.length >= 2) result.publisher = parts[0];
        }
      } catch {
        // An absent/malformed repository URL supplies no publisher information.
      }
    }
  }

  // All identity coordinates are mandatory: an installed catalog that does not
  // preserve version/provenance must not inherit a store entry's verification.
  if (!toolkitId || !source || typeof version !== "string" || !version.trim() ||
      typeof sourceRepo !== "string" || !sourceRepo.trim() || !Array.isArray(records)) {
    return result;
  }
  const subject = { toolkitId, source, version, sourceRepo };
  const record = records.find((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const expected = ["reference", "reviewedAt", "reviewedBy", "scope", "status", "subject"];
    if (Object.keys(candidate).sort().join("|") !== expected.join("|")) return false;
    const value = candidate.subject;
    return value && typeof value === "object" && !Array.isArray(value) &&
      Object.keys(value).sort().join("|") === "source|sourceRepo|toolkitId|version" &&
      Object.keys(subject).every((key) => value[key] === subject[key]);
  });
  if (!record) return result;
  const allowedScope = ["publisher_identity", "source_ownership", "permissions", "content"];
  const scopeValid = Array.isArray(record.scope) && record.scope.length > 0 &&
    new Set(record.scope).size === record.scope.length &&
    record.scope.every((code) => allowedScope.includes(code));
  const dateValid = typeof record.reviewedAt === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(record.reviewedAt) &&
    Number.isFinite(Date.parse(record.reviewedAt)) &&
    new Date(record.reviewedAt).toISOString().slice(0, 10) === record.reviewedAt;
  let referenceValid = false;
  try {
    const url = new URL(record.reference);
    referenceValid = typeof record.reference === "string" && url.protocol === "https:" &&
      !url.username && !url.password && Boolean(url.hostname);
  } catch {
    // Invalid evidence cannot support a verified claim.
  }
  if (record.status !== "verified" || !scopeValid || !dateValid || !referenceValid ||
      typeof record.reviewedBy !== "string" || !record.reviewedBy.trim()) return result;

  return {
    ...result,
    status: "verified",
    scope: [...record.scope],
    reviewedAt: record.reviewedAt,
    reviewedBy: record.reviewedBy,
    reference: record.reference,
  };
}
