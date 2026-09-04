# growth — PuPu repo-health snapshot library

Owner: `knowledge-owner-growth-metrics`. Inward only (PuPu's own repo). Outward market
intelligence lives in `.claude/archive/market`.

This library exists because **the GitHub API returns cumulative values as of now, not history.**
Every delta the founder cares about — stars/downloads this week, a release's first-N-day
downloads, new contributors, traffic older than 14 days — is computable *only* by diffing
dated snapshots. A missed patrol is a permanently missing data point.

## Retention tiers

| Tier | Files | Rule |
|---|---|---|
| **Irreplaceable** | `*-views.json`, `*-clones.json`, `*-referrers.json`, `*-paths.json` | GitHub retains traffic **14 days**. A lost snapshot is lost forever. **Never prune.** |
| **Irreplaceable** | `*-releases.json`, `*-overview.json` | Per-asset `download_count` and star count *as of a date* cannot be recovered. **Never prune.** |
| **Re-derivable** | `*-issues.json`, `*-pulls.json`, `*-contributors.json` | Issue/PR/contributor history is permanent server-side and re-fetchable any time. Keep slim; safe to regenerate. |

## Schema (keep these exact shapes — deltas depend on them)

`*-issues.json`, `*-pulls.json` are **NDJSON** (one object per line), sorted by descending number:

```
issues: {author, closed, created, num, state, title, labels[]}
pulls:  {author, created, merged, num, state, updated, title}
```

`*-releases.json` is a JSON array, drafts excluded:

```
[{tag_name, published_at, prerelease, assets:[{name, download_count, size, created_at}]}]
```

Release-note bodies are deliberately **not** stored — they are permanently re-fetchable and
were 95% of this library's former size.

`download-history.ndjson` is a **derived index**, rebuildable from the dated `*-releases.json`
files. One row per (snapshot, release): `{snapshot, tag, published, total, assets:[{name, dl}]}`.
Rebuild after adding a snapshot.

## Running a patrol

Use the `growth-analyst` skill — it encodes the collection commands, traffic-quality rules,
release normalization, and report format. Do not re-derive that methodology.

Three reading disciplines that this library keeps re-proving:

1. **Clone count is not user count.** Clones have run 400–12,000 per 14 days against ~50
   unique human visitors. The count tracks bots/mirrors/CI; only `uniques` is worth reading,
   and even that is noisy.
2. **Never rank releases by raw download total** — older releases accumulate longer. Compare
   releases **at equal age** using `download-history.ndjson` (cohort method), which is far more
   honest than lifetime `downloads ÷ days`, since lifetime rate is biased *toward* new releases
   still inside their launch burst.
3. **Traffic needs push/admin scope** and is 14-day-only. On 403 or empty, say "token lacks
   scope" and continue on public data — never drop it silently.

## Snapshot cadence

Roughly weekly. Traffic's 14-day window is the hard ceiling: **two consecutive missed weeks
punch an unrecoverable hole in the views/clones series.**

**The window is `D-14 .. D-1`, not "the last 14 days including today"** (measured 2026-08-14
across all nine snapshots — every one returns exactly 14 rows ending the day *before* the call).
Two consequences:

- The day you patrol is never captured by that patrol; it arrives in the next one.
- **The safe interval is strictly < 14 days, and 14 itself already loses a day.** The library's
  two permanent holes are exactly this: a 16-day gap (07-05 → 07-21) lost `07-05, 07-06`, and a
  17-day gap (07-21 → 08-07) lost `07-21, 07-22, 07-23`. Nothing else is missing between
  2026-05-25 and 2026-08-13.

## Verifying a claim built on this library

Daily traffic rows are a *union across overlapping snapshots*, so a claim about any single day
must name the snapshot it came from. Two scale traps, both hit in practice:

- **Aggregate vs daily ratios are different statistics.** `clones.count / clones.uniques` on the
  snapshot object is a 14-day aggregate; the per-day ratio from `clones[]` is not comparable to it
  and runs far lower. Never contrast one against the other.
- **A single day's ratio is not a level.** One release-day CI burst dominates the 14-day aggregate
  (2026-08-01: 416 of the window's 601 clones).

## History

- **2026-08-07** — library moved here from `~/.pupu-growth/` (the constitution forbids a second
  data area beside `archive/`).
- **2026-08-10** — normalized to the schema above. The 2026-08-07 issue/PR snapshots had been
  captured without the `--jq` projection (2.5 MB of full API objects); they were distilled to
  the library's existing slim shape, and the `-raw` suffix was dropped from the family name
  because it is what invited the raw dump in the first place. Release-note bodies dropped.
  Library went 3.6 MB → 456 KB with no loss of irreplaceable data.
- **2026-08-14** — patrol on a 4-day interval (shortest yet), taken to close the seam risk above.
  Nine files, schema-conformant. Established the `D-14 .. D-1` window boundary and the two
  ratio-scale traps documented above. `download-history.ndjson` was truncated by an interrupted
  rebuild during this patrol and regenerated from the dated `*-releases.json` files — the reason
  it is classified re-derivable held up under a real loss.

  Note on ages: snapshot files carry no capture timestamp, and their mtimes were all rewritten by
  the 08-10 normalization pass, so they cannot serve as one. Cohort ages therefore use the
  convention **historical snapshot = its date @ 12:00 UTC (±12 h), today's snapshot = actual
  capture time**. Any age older than the current patrol carries that ±12 h.
