import { resolvePluginTrust, resolvePluginListing } from "./plugin_trust";
import { PLUGIN_VERIFICATION_RECORDS } from "./plugin_verification_records";
import registry from "./mcp_toolkit_registry.json";
import curation from "./plugin_store_curation.json";

const entry = { toolkitId: "mcp.example", source: "mcp", version: "1.2.0", sourceRepo: "https://github.com/example/plugin" };
const record = {
  subject: { ...entry }, status: "verified", scope: ["source_ownership", "permissions"],
  reviewedAt: "2026-09-12", reviewedBy: "Example reviewer", reference: "https://example.com/review/1",
};

test.each([undefined, null, [], "builtin", 1])("missing/malformed entry is explicitly unknown: %p", (value) => {
  expect(resolvePluginTrust(value)).toEqual({ origin: "unknown", status: "unknown", publisher: "", scope: [], reviewedAt: "", reviewedBy: "", reference: "" });
});

test("origin does not come from a presentation default, plugin name, ID or verification flag", () => {
  expect(resolvePluginTrust({ toolkitId: "builtin.computer", toolkitName: "PuPu Official", verified: true, trustLevel: "verified" })).toEqual({
    origin: "unknown", status: "unverified", publisher: "", scope: [], reviewedAt: "", reviewedBy: "", reference: "",
  });
  expect(resolvePluginTrust({ toolkitId: "builtin.computer", source: "builtin" })).toEqual({
    origin: "official", status: "verified", publisher: "PuPu", scope: [], reviewedAt: "", reviewedBy: "", reference: "",
  });
});

test.each(["mcp", "mcp_registry", "local", "plugin", "skillpack"])("%s remains third-party without verification", (source) => {
  expect(resolvePluginTrust({ toolkitId: "example", source }).origin).toBe("third_party");
  expect(resolvePluginTrust({ toolkitId: "example", source }).status).toBe("unverified");
});

test("review pending never means verified", () => {
  expect(resolvePluginTrust({ ...entry, trustLevel: "needs_review" }).status).toBe("pending");
  expect(resolvePluginTrust({ ...entry, trustLevel: "external_approved" }).status).toBe("unverified");
});

test("a scoped application record is required; plugin self-attestation is ignored", () => {
  expect(resolvePluginTrust({ ...entry, verification: record, trustLevel: "verified", policySummary: { reviewed: true } }).status).toBe("unverified");
  expect(resolvePluginTrust(entry, [record])).toEqual({
    origin: "third_party", status: "verified", publisher: "example", scope: ["source_ownership", "permissions"],
    reviewedAt: "2026-09-12", reviewedBy: "Example reviewer", reference: "https://example.com/review/1",
  });
});

test.each(["toolkitId", "source", "version", "sourceRepo"])("same-ID/colliding evidence must match %s exactly", (key) => {
  const changed = { ...entry, [key]: "different" };
  expect(resolvePluginTrust(changed, [record]).status).toBe("unverified");
  const incomplete = { ...entry };
  delete incomplete[key];
  expect(resolvePluginTrust(incomplete, [record]).status).not.toBe("verified");
});

test.each([
  { status: "pending" }, { scope: [] }, { scope: ["everything"] }, { scope: ["content", "content"] },
  { reviewedAt: "2026-02-30" }, { reviewedBy: "" }, { reference: "javascript:alert(1)" },
  { reference: "https://user:secret@example.com" }, { unexpected: true },
  { subject: { ...entry, unexpected: true } },
])("malformed or extended verification record fails closed: %p", (change) => {
  expect(resolvePluginTrust(entry, [{ ...record, ...change }]).status).toBe("unverified");
});

test("real shipped catalog records receive no unsupported verified migration", () => {
  expect(PLUGIN_VERIFICATION_RECORDS).toEqual([]);
  for (const item of registry.entries) {
    const view = resolvePluginTrust(item);
    expect(Object.keys(view).sort()).toEqual(["origin", "publisher", "reference", "reviewedAt", "reviewedBy", "scope", "status"]);
    expect(view.origin).toBe("third_party");
    expect(view.status).toBe(item.trustLevel === "needs_review" ? "pending" : "unverified");
    expect(view.scope).toEqual([]);
  }
  for (const pack of curation.skillPacks) {
    expect(resolvePluginTrust(pack).origin).toBe("third_party");
    expect(resolvePluginTrust(pack).status).toBe("unverified");
    expect(resolvePluginTrust({ toolkitId: pack.id, source: "skillpack" }).status).toBe("unverified");
  }
});

test("repeat rendering and version changes do not retain prior verification", () => {
  const first = resolvePluginTrust(entry, [record]);
  first.scope.push("content");
  expect(resolvePluginTrust(entry, [record]).scope).toEqual(["source_ownership", "permissions"]);
  expect(resolvePluginTrust({ ...entry, version: "2.0.0" }, [record]).status).toBe("unverified");
  expect(resolvePluginTrust(entry).status).toBe("unverified");
});

test("bundled Agent Reach is third-party, while PuPu Core remains official", () => {
  expect(resolvePluginTrust({ toolkitId: "agent_reach", source: "builtin" })).toMatchObject({ origin: "third_party", publisher: "", status: "unverified" });
  expect(resolvePluginTrust({ toolkitId: "core", source: "core" }).origin).toBe("official");
});

test("listing provenance follows the owner's catalog classification independently of verification", () => {
  for (const item of registry.entries) {
    expect(resolvePluginListing(item)).toBe(item.toolkitId === "mcp.dev.bug-bounty-intelligence" ? "community_submitted" : "officially_curated");
    expect(resolvePluginTrust(item).status).not.toBe("verified");
  }
  for (const pack of curation.skillPacks) expect(resolvePluginListing(pack)).toBe("officially_curated");
  expect(resolvePluginListing({ toolkitId: "agent_reach", source: "builtin" })).toBe("officially_curated");
  const original = registry.entries[0];
  expect(resolvePluginListing({ ...original, sourceRepo: "https://github.com/other/project", listing: "officially_curated" })).toBe("");
  expect(resolvePluginListing({ ...original, source: "local" })).toBe("");
  expect(resolvePluginListing({ toolkitId: "unknown", source: "plugin", listing: "officially_curated" })).toBe("");
});

test("installed store skills retain listing classification without inheriting verification", () => {
  for (const pack of curation.skillPacks) {
    const installed = { toolkitId: pack.id, source: "skillpack" };
    expect(resolvePluginListing(installed)).toBe("officially_curated");
    expect(resolvePluginTrust(installed).status).toBe("unverified");
    expect(resolvePluginListing({ ...installed, sourceRepo: "https://github.com/other/pack" })).toBe("");
  }
});

test.each([
  { toolkitId: "core", source: "core" },
  { toolkitId: "plan", source: "builtin" },
  { toolkitId: "builtin.computer", source: "builtin" },
])("PuPu official plugins are verified by policy without fabricated audit evidence: %p", (plugin) => {
  expect(resolvePluginTrust(plugin)).toMatchObject({
    origin: "official", status: "verified", publisher: "PuPu",
    scope: [], reviewedAt: "", reviewedBy: "", reference: "",
  });
});
