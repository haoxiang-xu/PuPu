---
name: source-reliability
description: Which sources are reliable for what in AI-client market intelligence — primary vs SEO-blog cross-citing
metadata:
  type: reference
---

**Primary / trustworthy (cite directly):**
- GitHub REST API (api.github.com/repos/...) — live star/fork/push data. Watch for anomalies (Witsy returned 6 stars vs web ~1.8k this cycle — reconcile before trusting).
- GitHub issues/discussions — primary user sentiment, dated, with reaction/comment counts. Best source for "what users complain about."
- Hacker News Algolia API — primary, points/comments verifiable.
- Anthropic/OpenAI official blogs, TechCrunch/VentureBeat/InfoQ — for funding rounds, product launches.
- Sacra, Tracxn, Crunchbase — funding/revenue (Tracxn good for "funded vs unfunded" status; revenue figures often estimates).
- Company pricing/enterprise pages (primary for pricing).

**Weak / secondary (directional only, do NOT cite as audited fact):**
- SEO/content-marketing blogs: digitalapplied, coasty.ai, valueaddvc, chatforest, whatllm.org — cross-cite each other. MCP scale stats, OSWorld exact scores, "80% wrappers die" all trace here.
- Benchmark numbers (OSWorld) conflict wildly (38-86%) across variants/dates/models — never cite a single number as authoritative.

**Could-not-reach this environment:**
- reddit.com fetch is BLOCKED; WebSearch doesn't index subreddit thread bodies. For r/LocalLLaMA / r/ollama primary quotes, need a different channel. Don't claim Reddit sentiment without it.

**Access notes:** WebFetch upgrades HTTP->HTTPS, returns cross-host redirects to re-fetch, 15-min cache.
