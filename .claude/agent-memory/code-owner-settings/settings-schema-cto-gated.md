---
name: settings-schema-cto-gated
description: The `settings` root is a shared artery owned by code-owner-shared-arteries, and since the SQLite migration completed it is a SQL table, not localStorage
metadata:
  type: project
---

The `settings` root is read/written heavily by my surfaces, but **its schema is a shared artery I do not own**.

**Two facts that go stale if not restated (both re-verified 2026-08-07):**

1. **It is no longer localStorage.** The settings→SQLite migration has landed and shipped. `settings_repository.js` is the single mode switch: SQL mode (Electron) reads an in-memory snapshot hydrated from `settings.db`, fallback mode (browser dev / Jest / degraded Electron) reads `localStorage["settings"]` on every call. On my machine `settings.db` `meta.legacy_migration_state = "complete"` — SQL is authoritative and the legacy root is ignored. The legacy import is **all-or-nothing over the whole root**, which is why "was namespace X ever persisted?" can be answered by looking at the `settings` table alone.
2. **The gatekeeper is `code-owner-shared-arteries`, not a CTO.** The org moved to the Quorum court; there is no `pupu-cto`. A schema change to the `settings` root crosses into `pupu:src/SERVICEs/**` shared-artery territory and, per the ironclad rules, needs a case — not a private edit.

**Why:** many surfaces depend on the shape of the `settings` root; a quiet change here ripples cross-surface. Getting the storage backend wrong in a report is worse than saying nothing — a court record in `0000-0002-2026-0807` still described a namespace of mine as a "durable localStorage namespace" long after it became a SQL row.

**How to apply:** I own how settings are *presented and persisted* (the UI and the per-namespace store modules). Any change to the `settings` root schema — adding, renaming, or removing a namespace — is a cross-boundary contract change. Never state the storage backend from memory in a report; read `settings_repository.js` and, when it matters, query `settings.db` read-only (`sqlite3 'file://…?immutable=1'`). See [[team-roster]], [[memory-agent-settings-orphaned]].
