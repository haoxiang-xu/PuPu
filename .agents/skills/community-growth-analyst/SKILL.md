---
name: community-growth-analyst
description: Analyze PuPu's growth, GitHub traffic, installer downloads, release performance, community and contributor health; produce a founder-facing weekly COO report or a light release-planning baseline. Use for growth analysis and reporting; route GitHub tags changes to community-repo-tags-optimization.
---

# Community: Growth Analyst

Explain whether PuPu is growing, what the evidence says about installation intent, whether releases and the community are healthy, and what to prioritize next. Default to `haoxiang-xu/PuPu`; verify the checkout's Git remote, or use the repository explicitly requested by the user. Reply in the user's language and connect each major judgment to dated evidence.

## Modes

- **Light baseline:** For release planning, reuse today's snapshots and report exposure, installer demand, release quality, external feedback and the latest tags verdict in one screen. Do not repeat a full collection unnecessarily.
- **Full / weekly:** Use the last seven complete days and compare with the prior seven when the required history exists. An explicitly requested date range takes precedence.

## Collect reliable data

Prefer connected GitHub tools or `gh api`; public pages and supplied exports can fill documented gaps. Check authentication before using `gh`. If a source is unavailable, explain its error and continue with the evidence available; never substitute remembered or estimated counts.

Collect and paginate:

| Area | GitHub REST source | Interpretation |
|---|---|---|
| Repository | `repos/OWNER/REPO` | Stars, forks, subscribers; `watchers_count` is not true subscribers. |
| Traffic | `repos/OWNER/REPO/traffic/views`, `/traffic/clones`, `/traffic/popular/referrers`, `/traffic/popular/paths` | Views, unique visitors/cloners, referrers and popular pages; traffic access requires suitable repository permission and only exposes a short rolling history. |
| Releases | `repos/OWNER/REPO/releases` | Tag, publication time, per-asset names and cumulative download counts. |
| Issues | `repos/OWNER/REPO/issues?state=all&per_page=100` | Exclude entries containing `pull_request`; the repository's `open_issues_count` includes PRs. |
| Pull requests | `repos/OWNER/REPO/pulls?state=all&per_page=100` | Creation, updates, merge timestamps, author and review state. |
| Contributors | `repos/OWNER/REPO/contributors` | Lifetime contribution totals; weekly/new/returning activity needs dated activity or history. |

A 403 is an access failure; an empty successful result is not proof of missing permission. Distinguish unavailable, partial, empty and zero. Fetch comments/reviews when response-time analysis is requested or material to the decision; record the measured subset if coverage is bounded.

## Preserve snapshots and history

Continue using `.claude/archive/growth/` in the analyzed checkout for dated growth snapshots and reports. This is the existing data store, not a skill directory. Do not reset it during a skill rename. Reuse valid same-day snapshots; preserve raw results, collection time, repository, date coverage and API errors. Never overwrite a valid snapshot with a failed or empty error response. Paginate releases before saving the complete collection.

Current cumulative counts cannot reconstruct past weekly star/download deltas or a release's first 7/14/30-day performance. Use compatible dated snapshots; otherwise label the window unavailable and save a baseline. GitHub traffic exposes only the recent rolling window (normally 14 days), so capture it before it expires. Do not sum daily unique visitors and label the sum as distinct people across the whole window.

Keep tags history and change windows under [community-repo-tags-optimization](../community-repo-tags-optimization/SKILL.md). It owns `topics-history.ndjson`; reuse its results rather than maintaining a second tags ledger.

## Interpret the evidence

1. **Exposure and channels:** Compare views, visitors and supported star deltas. Classify referrers as Search, Social, Community, Direct or Developer ecosystem. Connect README/docs/release-page interest to subsequent installer demand; ratios across aggregate counts are signals, not tracked user conversion.
2. **Installation intent:** Count user-facing installers by platform separately from updater metadata, blockmaps, evidence files and other assets. Downloads indicate interest, not confirmed installs or active users. Where verified release workflows re-download those same release assets, show raw installer downloads, evidenced pipeline deductions and the adjusted estimate separately. Actions artifact downloads are not release-asset downloads. Do not invent a deduction without an identifiable successful readback.
3. **Clone quality:** Clones far above downloads may come from bots, mirrors, CI or scanners; never equate clones with users. Concurrent rises in visitors, installer demand and external issues support a stronger traction inference. Downloads above stars can be healthy for a desktop app.
4. **Release performance:** Compare matched post-release windows when snapshots exist. Otherwise use cumulative downloads divided by release age, clearly labeled as a lifetime rate, and account for platform coverage and very young releases. Identify packaging gaps and subsequent bugs; association alone does not establish a release caused the change.
5. **Community and contributors:** Separate maintainer-authored, external-human and bot activity. Compare issues opened/closed and PRs opened/merged for the selected window. Report median close/merge duration for the stated cohort; define the denominator of any closure rate. First response requires actual comment timestamps. Use >14 days without an update as an initial PR attention flag and >30 days as stale; inspect context before recommending action. Maintainer-only issue activity suggests a feedback gap, not proof nobody uses the app. Assess contribution concentration and returning contributors only from sufficient evidence.

## Founder report

Lead with a short business conclusion, then a compact metric table showing current value, comparable baseline, change and data limitations. Give key wins, risks and prioritized P0/P1/P2 actions; each action explains why, expected impact and effort. Do not force three findings when fewer are supported.

For a requested growth score, use one consistent rubric: Exposure 25%, Installation intent 35%, Community activity 20%, Contributor health 20%. Judge each dimension against PuPu's own recent trend: 0 = declining, about 50 = flat, about 80 = improving, 100 = accelerating; the weighted total is out of 100. Show the components and confidence. Missing evidence is unavailable, not zero or flat; report no defensible total when important dimensions cannot be assessed. Do not compare this weighted score directly with historical reports using four equal weights without recomputing them.

A full weekly report covers Traffic, Downloads, Community, Releases, Contributor Health, Risks and Recommendations. End with the highest-priority action for the next week in the user's language. Keep raw counts separate from interpretation, and distinguish observations from hypotheses.
