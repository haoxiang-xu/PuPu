---
name: decision-db-mcp-sqlite-yes-postgres-deferred
description: DB MCP servers — SQLite onboarded (local file, bounded), Postgres DEFERRED pending a CTO architecture call on prod-DB read-only enforcement
metadata:
  type: project
---

Decision (2026-06-12, Step 5 of the MCP onboarding round; security-expert adjudication + CTO call): **SQLite onboarded, Postgres deferred.** The split is principled, not a hedge.

**SQLite → onboarded.** `mcp-server-sqlite` (Python/uvx — official server is not on npm), `trustLevel: community`, version PINNED (per [[adr-mcp-version-pinning]]), gate `write_query` + `create_table`, leave `read_query` ungated, points at a local DB file the user chooses. Blast radius = one local file — same shelf as the filesystem workspace server already in the store. Clean install vector (single dep, no postinstall).

**Postgres → DEFERRED.** Not for lack of a package — because a **network-credentialed DB server is in the full-account/MTProto exfil-risk class** (see [[invariant-no-mtproto-userauth-mcp]]): one `SELECT *` dumps a possibly-production table, so *reading is exfiltration* and confirmation-gating the dangerous action doesn't help; the DSN is both a high-value secret AND an SSRF vector (host is attacker-influenceable). The archived official `@modelcontextprotocol/server-postgres` is verified-broken (documented read-only bypass via `COMMIT; DROP...`) — disqualified. The best maintained option (crystaldba) is only *best-effort* read-only with a self-disclosed bypass + a single raw `execute_sql`. No IQAI consistent-provenance fallback exists.

**The OPEN architecture question that gates Postgres (CTO must decide before any future onboarding):** do we (a) accept best-effort read-only against a potentially-production DB, or (b) mandate a read-only DB role + a DSN-host allowlist (egress control) before Postgres can enter the curated store? This is a one-way-door-ish trust call — not just "find a better package." CEO scoped Step 5 as lowest-priority and explicitly OK'd deferring, so this is parked, not rejected. Revisit when there's appetite for the DSN-allowlist / read-only-role enforcement work (likely bundled with the SSRF egress work that also closes [[accepted-risk-fetch-ssrf]] + markitdown).

**How to apply:** if asked to add Postgres (or any network-credentialed DB: MySQL, MongoDB, etc.), do NOT just pick a package — first resolve the open read-only-enforcement architecture question above. SQLite-class (local-file, no network, no credential) DB servers are eligible by the SQLite precedent.
