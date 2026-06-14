---
name: snapshot-history
description: Where PuPu growth snapshots are persisted and which dated baselines exist for week-over-week deltas
metadata:
  type: reference
---

Growth snapshots live in `~/.pupu-growth/` as dated JSON (`$DATE-overview.json`, `-releases.json`, `-views.json`, `-clones.json`, `-referrers.json`, `-paths.json`, `-contributors.json`).

**Why:** GitHub API returns cumulative totals, not history. Traffic (`/traffic/*`) is retained only 14 days. The only way to compute weekly deltas (stars/downloads this week, a release's first-7-day downloads, traffic >14d) is to diff today's snapshot against a prior dated one.

**How to apply:** At the start of every patrol, `ls ~/.pupu-growth/` to find the most recent prior snapshot and diff against it. If none exists for the comparison window, the delta is uncomputable — say so, never invent it.

Baselines on file:
- 2026-06-09 — first full snapshot (no prior baseline; all weekly deltas marked "baseline saved, compare next week").

Token note: `haoxiang-xu` gh token has `repo` scope, so traffic API works (no 403). See [[clone-spike-2026-06]].
