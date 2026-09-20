# PuPu Verified implementation plan — proposed, not yet implemented

## First decision: three independent axes

- Availability: whether Store lists/installs the item. The owner's 2026-09-13 instruction enables Microsoft Learn, Brave, Tavily and Firecrawl without a review gate.
- Origin: PuPu official / third-party / unknown. Upstream Microsoft or Brave being official does not make it PuPu-authored.
- Verification: unverified / verified / expired-or-revoked, derived from a matching application-owned record. Availability approval does not count as verification evidence.

Reserve the full Verified claim for the selected version/configuration passing every applicable v0.1 control. Identity-only or observed-hosted-service checks appear as scoped evidence details, not a blanket security badge. State clearly that the label records checks and scope, not a guarantee of no vulnerabilities.

## Current code to reuse

In PuPu dev, `src/SERVICEs/plugin_trust.js:resolvePluginTrust` projects display status from `plugin_verification_records.js`. It already ignores plugin-supplied verification objects and separates source from verification. The evidence table is empty. Matching currently uses only toolkitId/source/version/sourceRepo; allowed scope codes are publisher_identity/source_ownership/permissions/content. This does not yet represent artifact/dependency hashes, five-control completeness, expiry, revocation or signed record integrity. It can display Verified for partial approved scopes; do not use it unchanged for a stronger full-security meaning.

Store `plugins_categories_page.js` hides needs_review entries, and `mcp_install.js` plus Python `mcp_toolkits.py` gate installation. Skill packs use immutable commits/manifests and `skill_pack_store_install.js`; installed catalogs must preserve verification subject fields, otherwise trust must fall back to Unverified. Avoid mixing admission changes into evidence matching.

## Deliverable sequence

1. **Skill pilot and policy calibration.** Run this skill against one selected instruction-only pack and one MCP. Start with Vercel Web Review (including its mutable fetched-guideline constraint), Trail of Bits Audit Prep, and Microsoft Learn's bounded hosted scope. Produce actual reports, analyze false positives and measure duration. Do not give a full badge to all examples just to demonstrate the UI.
2. **Evidence schema and adapters.** Add a closed, versioned application-owned attestation schema with subject and configuration digests, policy version, required control completion, evidence digests and reviewer. Scanner adapters preserve original result and failures. Bind record authenticity to the trusted catalog release initially; signed remote attestations require a configured verification key/root, not a key supplied by the plugin. Keep optional hosted observation records distinct from immutable executable attestations.
3. **Product binding.** Carry exact subject data from download/install through persistence and catalog. Match installed bytes/dependency closure/configuration against the record, enforce revoked/superseded state before displaying Verified, and show scope/date/version/report in the existing badge details. Unknown schema, missing subject, bad signature where enabled, missing evidence or mismatch cannot yield Verified. Permission changes must invalidate the applicable record.
4. **Lifecycle and operations.** Hook new candidate/release changes into verification reports. Extend the existing weekly discovery process only when authorized to include advisory/metadata rechecks; deduplicate by subject digest + policy version, and retain historical reports. Define record revocation independently from disabling installation; the owner may leave an unverified package available. No silent permanent endorsement by toolkitId.

## Product boundary contracts to refine before code changes

PV-BC-01: official repository/package -> acquisition -> immutable subject manifest. CLOSED file/digest manifest; reject missing paths, unexpected executable files and mismatched bytes. Use original artifacts and negative hash/path/identity cases.

PV-BC-02: scanner/agent observations -> schema validator -> application-owned evidence record. VERSIONED report schema and policy. Distinguish FAIL/INCOMPLETE/scanner errors. Negative tests: forged plugin record, wrong version, empty mandatory checks, inaccessible evidence and unsupported schema.

PV-BC-03: record + actual installed subject -> backend catalog -> frontend badge. CLOSED identity fields with explicit schema evolution. SEQ: not installed -> install matching artifact -> Verified -> altered artifact/config -> Unverified -> revoked record -> revoked/unverified detail -> validated new version -> fresh record. Test persistence, restart, second read and data refresh. Keep unrelated chat retry/graph paths N/A only with a demonstrable reason.

For actual PuPu code changes, follow its GitNexus impact and current cross-boundary rules. Verify the real producer/consumer and record propagation with the candidate/runtime artifacts required by that work. This skill's creation is not an acceptance PASS for #283 and does not waive the outstanding feature-level functional evidence.

## Scope controls

Start with the report pipeline and explicit record projection; do not build a separate security center, invent a certification score, require five scanners, or block all open-source packages because upstream lacks enterprise paperwork. API-key workflows need disposable test credentials when exercised; absent credentials limit scope. For opaque hosted services, disclose what can be observed and avoid full backend certification. Personal skill installation provides an operating procedure, not an implemented sandbox service or badge backend.
