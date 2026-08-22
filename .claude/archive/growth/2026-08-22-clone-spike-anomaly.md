# Clone spike 2026-08-21 — NOT attributable to the topics change

## Observation
The 14-day clone **count** jumped 134 → 425 between the 08-21 and 08-22 snapshots.
The 14-day clone **uniques** did not move: 83 → 83.

Per-day, 2026-08-21: `count=292, uniques=3`.
Every other day in the window is single- or low-double-digit count with count ≈ uniques.

## Why it is not organic
- 292 clones / 3 unique cloners ≈ 97 clones per actor in one day. Human cloning does not look like this.
- The repo's own GitHub Actions ran **0** workflows on 2026-08-21, so it is not internal CI.
- No release was published on 08-21 (latest is v0.1.9, 2026-08-01).
- Views on 08-21 were 52 count / 11 uniques — normal range (08-20 was 34/14). If a topic change had pulled in real traffic, uniques would move first, and they did not.
- Topic pages drive **views**, not clones. There is no mechanism by which a topic edit produces clones without producing visitors.

Most likely an external mirror / scraper / third-party CI that discovered the repo and began polling.

## Attribution rule applied
`count` is discarded as an effect metric for this window. Only **clone uniques** and **search-referrer uniques** count.
Neither moved.

## Effect of the 2026-08-21 topics change: PENDING
Day 1 of 14. Window closes **2026-09-04**.
Search referrers are flat (yandex 13→12 uniques, Google 9→9, Bing 2→3) — expected; search engines need days to weeks to reflect a topic edit.
Do not change topics again before 2026-09-04, or the change is CONFOUNDED.
