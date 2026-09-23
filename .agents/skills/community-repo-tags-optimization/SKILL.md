---
name: community-repo-tags-optimization
description: "Use when working on PuPu's GitHub topics/tags — 统计 tag 数据, 评估上次换 tag 的效果, 换/优化 tags, or when a growth report shows search-channel movement worth attributing to topics. Repo is haoxiang-xu/PuPu. Triggers: \"换 tags\", \"tag 统计\", \"优化 topics\", \"上次换 tag 有效果吗\", \"topic 数据记录\"."
---

# Community: Repository Tags Optimization

Optimize `haoxiang-xu/PuPu`'s topics with product fit, measured visibility and preserved growth evidence. Use [community-growth-analyst](../community-growth-analyst/SKILL.md) for traffic and installer accounting; reuse valid same-day snapshots.

## Owner's current operating rule — clarified 2026-09-22

- Keep exactly **20 unique live topics**, partitioned into **A: 10 and B: 10**. Both groups are on GitHub simultaneously. There is no permanent 15-topic core and no whole-set A/B alternation.
- Each group has a **14-day review/holding cycle**, with the two groups' review dates **seven days apart**. Every week only one group is eligible for optimization; the other group stays unchanged.
- Optimize only part of the due group: normally 1–3 substitutions, at most 5. Keep well-supported topics and allow zero changes when retention or insufficient evidence warrants it. Never replace an entire group merely because its review is due.
- The owner has authorized this recurring, evidence-based partial optimization, including selecting fresh relevant candidates at the scheduled review. Do not request the same permission again. This authority covers GitHub topics and growth records, not README, description, releases, issues or unrelated settings.
- Small or rarely used meaningful tags are allowed when they match shipped PuPu capabilities and give plausible visibility. Do not leave slots empty.

## Records

Use `.claude/archive/growth/` in this checkout. Preserve historical snapshots and append-only event history.

| File | Purpose |
| --- | --- |
| `topics-weekly-rotation.json` | Current simultaneous 10+10 membership, per-group revision, exposure evidence and next review dates. Despite the historical filename, this is staggered partial optimization, not whole-set rotation. |
| `topics-history.ndjson` | Append one measurement or policy event per run, including unchanged runs. Include live topics, volumes, metric collection time, A/B revisions and any change/retention decision. |
| `YYYY-MM-DD-topics-change.md` | Before each actual GitHub mutation, record old/new complete sets, due group, changed subset, rationale and rollback command. |
| Dated snapshots/reports | Raw views, clones, referrers, paths, repository totals, stargazer dates and paginated release counters with collection time, UTC coverage and errors. |

## Workflow

1. **Reconcile.** Read the cohort state and current GitHub topics. The expected live set is the disjoint union of the two ten-topic groups. If a prior write has an uncertain result, reconcile GitHub readback with its prepared change record before retrying or advancing state. For unexplained manual drift, retain evidence and ask for direction rather than overwriting it.
2. **Collect.** Preserve daily growth snapshots before GitHub's approximately 14-day traffic retention expires. Fetch topic ecosystem counts with `gh api "search/repositories?q=topic:$t&per_page=1" --jq .total_count`, pacing calls 2.5 seconds apart in batches no larger than 25; respect rate-limit reset times. Measurement runs collect all current volumes. A same-day policy/schedule-only update may reuse successful measurements, retaining their original timestamp and explicitly labelling reuse.
3. **Record before interpretation.** Append the snapshot/history event even if no topics change. Never overwrite valid evidence with an error or infer missing counts.
4. **Review only the due group.** Use its trailing two weeks and week-by-week joint cohort revisions. Protect at least 14 days of exposure for newly introduced topics before considering their replacement, unless the owner explicitly overrides. The other cohort's planned midpoint revision is part of this design: record it rather than pretending the reviewed cohort had an unchanged comparison group. Product fit and star-sort visibility are selection evidence; GitHub does not identify which individual topic generated a visit or star.
5. **Choose partial improvements or retention.** Explain why each due-group tag should stay or be replaced. Use fresh, relevant candidates if justified; retain good tags and permit zero swaps. Weak evidence is not proof of poor performance. Apply no more than five substitutions, preserve the other group's exact membership, and ensure two disjoint groups of ten with a total of twenty.
6. **Apply and verify.** Before a mutation, capture outgoing metrics/package counters and write the dated change/rollback record. Apply the full 20-topic union through the topics endpoint, then verify both count and membership with an independent readback. Only after success update the changed group's membership/revision and new tags' actual introduction timestamps. Retained tags keep their exposure history; the untouched group keeps its membership, revision and exposure dates. A no-change review records retention without a GitHub write or artificial revision bump.
7. **Advance the review schedule.** Every completed review, including retention, schedules that group for its next 14-day review; the other group is next at the one-week offset. Preserve actual timestamps and rebase a missed schedule if necessary to protect two-week exposure and avoid reviewing/changing both groups together. Do not do multiple catch-up group edits in one run. If execution fails, do not claim completion or advance an unverified mutation. Routine snapshots stay quiet; report meaningful changes, findings or required user decisions.

## Interpret the metrics

- Weekly view totals can be summed from dated daily counts. Record dated new-star evidence, net star change and verified pipeline-adjusted installer deltas. New stargazers who already unstarred may be unobservable; do not equate net change with all new-star events.
- Do not sum daily uniques into distinct weekly visitors or subtract rolling unique totals to manufacture weekly uniques. Rolling 14-day visitors, referrers and popular paths cover both simultaneous groups and often several joint revisions; they are contextual evidence, not isolated group conversion.
- Record release, README, promotion and bot/crawler effects, plus search-index carryover and small samples. Scheduled staggered changes alone do not invalidate the log, but the design cannot prove individual-topic causality. Compare repeated review cycles before making strong claims.
- Count only `.dmg`, Windows setup `.exe`, `.deb` and `.AppImage` release assets. Show raw downloads, deductions for verified successful workflows downloading those exact release assets, and the adjusted package estimate separately. Never deduct Actions artifact downloads. Reuse same-day verified workflow evidence if counts/releases are unchanged.

## Candidate selection

- Benchmark relevant leading projects such as `CherryHQ/cherry-studio`, `chatboxai/chatbox`, `menloresearch/jan`, `lobehub/lobe-chat` and `open-webui/open-webui`, resolving redirects when needed. Evaluate their meaningful niche variants (for example, `agent-harness` and `ai-harness`).
- Mix broad ecosystem association and smaller product-specific topics across all 20 slots. The old 6/8/6 tier split is only a heuristic; tags below 500 repositories are explicitly allowed.
- Repository totals measure ecosystem size, not keyword search volume. Estimate star-sort position using other repositories above PuPu's stars, bound ties, and disclose truncated results. Neither a rank projection nor a nearly empty topic proves real search demand.
- Candidates are a backlog for partial optimization, not a predefined alternate full set. Preserve relevance to shipped product capabilities and natural search intent.
