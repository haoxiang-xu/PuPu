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

---

## Addendum (second run, 2026-08-22) — the view spike too

The owner also read the **view** curve as improved. It is the same artifact class.

2026-08-21 views: `count=52, uniques=11`. Highest count in the window — but uniques *fell*
(08-20 was 34/14, 08-13 was 31/14). Count rose while uniques dropped: the same few people
loaded more pages. That is not new audience.

Composition, from `traffic/popular/paths`:
- `/graphs/traffic` — 10 count / **1 unique** (the owner reading the traffic page)
- `/pulse` — 6 count / **1 unique** (same)
- referrer `github.com` — in-site navigation, 33 count / 5 uniques

Owner self-traffic is counted by GitHub. Auditing your own traffic inflates the metric you
are auditing.

## Falsifying test: did the topic pages send anyone?

Topic-page visits arrive with referrer `github.com`. If the 15-swap change had worked, that
line must rise. It **fell**:

| referrer | 08-21 snapshot | 08-22 snapshot |
|---|---|---|
| github.com | 42 count / 4 uniques | **33 count / 5 uniques** |

## Why no topic could have delivered traffic — measured, not assumed

Topic pages sort by stars. PuPu has 36. Repos in each topic with `stars>=36`
(≈ PuPu's rank; ~30 repos per page):

| topic | ≈rank | ≈page |
|---|---|---|
| llm | 8072 | 269 |
| mcp | 4229 | 141 |
| claude-code | 4128 | 138 |
| ai-agents | 3835 | 128 |
| local-llm | 258 | 9 |
| agent-orchestration | 225 | 8 |
| mcp-client | 220 | 8 |
| ai-chatbot | 61 | **3** |

Best case is page 3. Nobody browses to page 3, let alone page 269. **No tag in the current
set can be the source of a traffic gain**, on day 1 or on day 14. Head tags were added for
keyword association in search engines, which needs days-to-weeks to index — and the search
referrers are flat (yandex 13→12, Google 9→9, Bing 2→3).

## Conclusion
Both the clone spike and the view spike are measurement artifacts:
non-human cloning (292 count / 3 uniques) and owner self-traffic. The 2026-08-21 topics
change remains **PENDING**, day 1 of 14, window closes **2026-09-04**. Ranking is
star-gated, so the realistic lever is stars and off-GitHub distribution, not more tag edits.
