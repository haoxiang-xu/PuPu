---
name: topic-optimizer
description: "Use when working on PuPu's GitHub topics/tags — 统计 tag 数据, 评估上次换 tag 的效果, 换/优化 tags, or when a growth report shows search-channel movement worth attributing to topics. Repo is haoxiang-xu/PuPu. Triggers: \"换 tags\", \"tag 统计\", \"优化 topics\", \"上次换 tag 有效果吗\", \"topic 数据记录\"."
---

# PuPu Topic Optimizer

Iteratively optimize `haoxiang-xu/PuPu`'s GitHub topics with measurement, not taste. Companion to `growth-analyst` (traffic/download collection lives there — reuse its snapshots when today's already exist in `.claude/archive/growth/`).

**Core loop: measure → record → wait a full window → change few → repeat.** A tag change without a recorded before/after snapshot is wasted — GitHub traffic retains only 14 days, so unrecorded effects are unrecoverable.

## Data files (append-only, in `.claude/archive/growth/`)

| File | Content |
|---|---|
| `topics-history.ndjson` | One JSON line per run: `{date, topics:[...], volumes:{tag:repo_count}, traffic:{views14, uniques14, search_referrers:{src:{count,uniques}}}, stars, latest_release_dl}` |
| `YYYY-MM-DD-topics-change.md` | One per applied change: old set (= rollback set), new set, rationale, rollback command |

Every run MUST append a history line, even when no change is made — no-change runs are the control data.

## Procedure

1. **Collect** — current topics: `gh api repos/haoxiang-xu/PuPu --jq '.topics'`. Traffic: reuse today's growth snapshot files if present, else fetch views/referrers (needs push access).
2. **Volumes** — per-tag ecosystem size: `gh api "search/repositories?q=topic:$t&per_page=1" --jq .total_count`. Runs on every run, including no-change/PENDING runs — the history line requires it. ⚠️ Search API allows ~30 req/min: `sleep 2.5` between calls, batch ≤25, on 403 wait 70s then resume. Core API (`repos/...`) is not affected.
3. **Record** — append the history line BEFORE analyzing.
4. **Attribute** — compare against prior history lines relative to the last change date. Effect metrics, in order of trust: search-referrer uniques (Google/Yandex/Bing) → 14d visitor uniques → stars delta → downloads/day. **Minimum observation window: 14 days per change.** Inside the window, verdict is `PENDING` — never judge early, never overlap two changes.
5. **Propose** — after a full window, propose the next iteration: replace the worst performers with fresh candidates. **≤5 tag swaps per iteration** after the initial cleanup (2026-08-21, 15 swaps — that one-time reset is the baseline, don't repeat its size). Confirm with the project owner before applying; always write the change file (with rollback set) before `gh api -X PUT .../topics`.
   - If the project owner explicitly insists on changing tags inside an open window: apply it (project owner overrides), but first mark the interrupted change's verdict `CONFOUNDED` in its change file, and start a fresh 14-day window from today. Never silently merge two windows.

## Candidate selection

- Mix tiers: head (>20k repos, SEO association), mid (5k–20k), niche (500–5k where PuPu can actually rank on the topic page). Roughly 6/8/6 across 20 slots.
- Benchmark: `CherryHQ/cherry-studio`, `chatboxai/chatbox`, `menloresearch/jan`, `lobehub/lobe-chat`, `open-webui/open-webui` — `gh api repos/$r --jq .topics`.
- Prefer tags matching shipped features (provider names, mcp) and real search intent; drop tags under ~500 repos unless PuPu ranks top-page there.

## Common mistakes

- Judging a change in <14 days, or stacking a second change into an open window — attribution dies.
- Skipping the history append on "nothing changed" runs — you lose the control curve.
- Firing search-API queries in a tight loop — 403 storm; respect the 2.5s spacing.
- Reading topic-page rank ambition into head tags — with PuPu's current stars it ranks nowhere on `llm`; head tags are for keyword association only, niche tags are where ranking happens.
- Editing topics without writing the change file first — no rollback set, no attribution anchor.
