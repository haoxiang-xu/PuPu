# The niche-tag ceiling — measured, 2026-08-22

## The proposal
"If the current tags don't work, switch to niche tags where PuPu ranks #1."

## Why this is already answered
**We ran exactly that experiment for all of August.** The pre-08-21 tag set was almost
entirely micro-topics where PuPu could not *not* be on page 1:

| old topic | repos in topic | PuPu's necessary rank |
|---|---|---|
| build-your-agent | 1 | #1 |
| llm-gui | 6 | top 6 |
| multios | 7 | top 7 |
| openclaw-ui | 7 | top 7 |
| llm-webui | 23 | page 1 |
| ollama-webui | 54 | page 1–2 |
| ollama-chat | 66 | page 1–3 |

## What page-1 ranking actually delivered

Topic-page visits land as referrer `github.com`. That line, across the whole niche-tag era:

| snapshot | github.com count | github.com **uniques** (14d) |
|---|---|---|
| 2026-08-07 | 26 | **4** |
| 2026-08-10 | 52 | **4** |
| 2026-08-14 | 50 | **5** |
| 2026-08-21 | 42 | **4** |
| 2026-08-22 | 33 | **5** |

**Never above 5 unique visitors per 14 days** — and that number also contains in-site
navigation and the owner's own browsing (`/graphs/traffic` and `/pulse` are each 1 unique =
the owner). So the true external topic-page yield is ≤ 4 people per fortnight.

Compare the same windows:
- yandex.com: 9 → 13 → 14 → 13 → 12 uniques
- Google: 18 → 12 → 11 → 9 → 9 uniques

Search engines deliver **2–4× more unique visitors than all of GitHub's in-site surface
combined**, including every topic page PuPu ranked #1 on.

## The finding
Ranking #1 on a topic with 1–7 repos is ranking #1 on a page nobody opens. Topic-page
supply for a repo of PuPu's size is a hard ceiling of roughly **4 unique visitors per 14
days**, and no rearrangement of tags raises it — the ceiling is *traffic to the topic page
itself*, not PuPu's position on it.

Corollary: the 2026-08-21 head-tag swap cannot "fail" in the way the owner fears, because
the channel it competes in is worth ≤5 people/fortnight either way. Head tags were added for
search-engine keyword association — the channel that is actually 2–4× larger — and that is
also the only channel where the change can pay off. It needs the full window to index.

## What actually moved in August
14-day **view uniques**: 51 → 55 → 72 → 87 → 90. Steadily up, and rising *before* the tag
change — not attributable to tags at all.
14-day **clone uniques**: 165 → 114 → 83 → 83. Down.

## Recommendation
Stop treating GitHub topics as a growth lever; it is a ≤5-people/fortnight channel that is
already saturated. Do not revert to micro-topics — that is a measured dead end, not an
untried option. Keep the current set through 2026-09-04 for the search-indexing effect,
then judge on search-referrer uniques only.
