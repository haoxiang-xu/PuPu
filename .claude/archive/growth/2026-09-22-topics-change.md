# Topics change 2026-09-22

## Old (rollback set)

agent-orchestration ai-desktop-app anthropic chatgpt claude claude-code deepseek desktop-ai desktop-app electron llm llm-client local-llm mcp mcp-client multi-agent ollama ollama-client openai self-hosted

## New

agent-orchestration anthropic deepseek desktop-app electron llm llm-client local-llm mcp mcp-client multi-agent ollama ollama-client openai self-hosted

## Rationale

After the completed 2026-09-08 experiment, the project owner requested a more credible product taxonomy. This five-topic iteration removes the clearest mismatches without replacing them merely to fill the 20-topic limit:

- `ai-desktop-app` and `desktop-ai` are very low-volume, artificial-sounding phrases (12 and 98 repositories at measurement).
- `claude-code` refers to a separate developer product rather than PuPu's user-facing app.
- `chatgpt` and `claude` imply product-level compatibility; `openai` and `anthropic` accurately describe the supported API-provider ecosystems.

The 2026-09-08 conclusion is recorded as **REVISE**, not causal failure: its exact prior-14-day traffic control expired from GitHub's rolling traffic API. This change begins a new, non-overlapping observation window. A seven-day check is directional only; the final attribution decision is not due before fourteen complete days.

## Rollback command

```sh
gh api -X PUT repos/haoxiang-xu/PuPu/topics --input - <<'JSON'
{"names":["agent-orchestration","ai-desktop-app","anthropic","chatgpt","claude","claude-code","deepseek","desktop-ai","desktop-app","electron","llm","llm-client","local-llm","mcp","mcp-client","multi-agent","ollama","ollama-client","openai","self-hosted"]}
JSON
```

## Same-day correction — fill all 20 slots

**Intermediate 15-topic verdict: CONFOUNDED / superseded.** The owner explicitly corrected the policy on 2026-09-22: every change must use all 20 slots, including meaningful niche variants of topics used by leading repositories. The 15-topic state above lasted less than a complete observation day and is not an independent experiment.

### Final 20-topic set — applied and verified at 2026-09-22 21:09:08 UTC

agent-orchestration agent-workspace ai-client ai-harness anthropic deepseek desktop-agent desktop-app electron llm llm-client llm-ui local-llm mcp mcp-client multi-agent ollama ollama-client openai self-hosted

### Added five topics

| Topic | Existing repositories before adding PuPu | Projected position at 35 stars | Product fit |
| --- | ---: | ---: | --- |
| ai-client | 68 | 6 | Local and cloud AI client |
| agent-workspace | 67 | 12 | Workspace files, context and tool execution |
| desktop-agent | 125 | 15 | Native desktop host for tool-using agents |
| llm-ui | 93 | 17 | UI for multiple local/cloud LLM providers; also used by Open WebUI |
| ai-harness | 141 | 17–18 | Unchain-powered agent execution, tool integration and context management |

Counts come from GitHub Search API queries on 2026-09-22, not keyword search-volume data. Position is a projection under descending-star sorting, computed as other repositories above 35 stars plus one, with ties bounded by repositories at or above 35 stars. The five selected queries returned enough results to calculate their bounds without truncation. Search indexing and topic-page filtering may differ. `harness` (2,081 repositories) and LobeHub's `agent-harness` (1,267) already have more than 50 repositories ahead of PuPu, so the established niche variant `ai-harness` is selected instead.

The final set is five substitutions relative to the original 20-topic rollback set: the five topics removed earlier today are replaced by these five. The owner authorized this correction within the new window. The original rollback command above remains the full, 20-topic rollback.

### Baseline and checkpoints

Raw metric payloads are preserved in [2026-09-22-topics-baseline.json](./2026-09-22-topics-baseline.json). They cover 2026-09-08–2026-09-21 UTC traffic, before this correction: 35 stars, 1,150 views, 94 unique visitors. v0.1.11 installer downloads: raw 31, verified successful pipeline readback deduction 5, adjusted estimate 26. v0.1.10: raw 42, deduction 5, adjusted estimate 37. Reuse same-day verified readbacks 35455547423 and 34298581702; installer counts exclude ZIPs, metadata, blockmaps and evidence JSON.

Exclude September 22 as a transition day. Final-set observation covers September 23–October 6 (UTC). Save daily raw traffic snapshots and dated cumulative package counts; September 30 is the seven-complete-day directional checkpoint, October 7 is the fourteen-complete-day assessment. Preserve earlier snapshots and label unavailable attribution; do not sum daily unique counts and call them distinct visitors. Repository count and ranking potential are hypotheses until visitor or download changes support them.

## Owner-approved weekly A/B rotation — supersedes the 14-day schedule

On 2026-09-22, after the final 20 topics were applied, the owner explicitly requested two groups shifting every week. This replaces the earlier minimum-14-day rule and the one-time October 7 conclusion. No topics change again today: the current 20-topic set becomes group A. A seven-day rotation is an operating choice; it does not establish causal superiority after one week.

Both sets are recorded in [topics-weekly-rotation.json](./topics-weekly-rotation.json). They share the 15 core topics from the earlier interim set. Group A adds `agent-workspace`, `ai-client`, `ai-harness`, `desktop-agent`, `llm-ui`. Group B adds `ai-workspace`, `desktop-assistant`, `local-ai`, `ollama-gui`, `ollama-ui`. Every A↔B switch is five substitutions and leaves exactly 20 unique topics.

| Group | Planned full UTC days | Next switch, Vancouver local time |
| --- | --- | --- |
| A | September 23–29 | September 29, 17:00 → B |
| B | September 30–October 6 | October 6, 17:00 → A |
| A | October 7–13 | October 13, 17:00 → B |
| B | October 14–20 | October 20, 17:00 → A, with four-week review |

Daily snapshots run at 17:00 Vancouver time, aligning with UTC midnight during daylight time. Report actual application timestamps and any late or mixed UTC day. Use dated daily view counts, star events/net star change, and package-counter changes after pipeline deductions for weekly comparisons. Rolling 14-day visitor/referrer/path aggregates span both groups and are context only; they cannot supply pure group-level weekly uniques or attribution. Repeat A/B before preferring a strategy; mark low-sample outcomes inconclusive and track releases, promotions and indexing carryover.

The existing automation has continuing authority to rotate only between these two recorded complete sets and to write growth evidence. It must capture the outgoing data, prepare the rollback record, apply the due set, verify readback and then advance rotation state. A manual metadata drift is a reason to reconcile with the owner rather than overwrite it. Routine collection remains quiet; each weekly switch and its concise review are reported. Do not delete the recurring rotation at the former October 7 checkpoint.

## Corrected owner intent — simultaneous staggered cohorts (current policy)

The preceding section titled “Owner-approved weekly A/B rotation” reflects the assistant's misinterpretation and is superseded. The owner clarified that A and B must be live together, each held/reviewed for two weeks, with the two groups' reviews offset by one week. A review replaces only a justified subset; good tags remain and zero changes is allowed. The repository's live 20 topics are unchanged by this correction.

Current state: [topics-weekly-rotation.json](./topics-weekly-rotation.json), schema version 2, mode `staggered-two-week-cohorts`. The historical filename remains to keep the existing automation's state reference stable.

**A (10):** agent-workspace, ai-client, ai-harness, desktop-agent, desktop-app, electron, llm, llm-ui, local-llm, mcp.

**B (10):** agent-orchestration, anthropic, deepseek, llm-client, mcp-client, multi-agent, ollama, ollama-client, openai, self-hosted.

A includes all five topics newly added at 2026-09-22 21:09:08 UTC, so its first review is after fourteen complete days, on October 7 UTC. All ten B topics were present in the September 8 applied record and later snapshots; therefore its initial September 30 review has historical exposure longer than two weeks. B's cohort bookkeeping begins today; no earlier group-creation timestamp is invented.

| Planned review, Vancouver | Optimize if justified | Hold unchanged |
| --- | --- | --- |
| September 29, 17:00 (September 30 UTC) | B subset | A |
| October 6, 17:00 (October 7 UTC) | A subset | B |
| October 13, 17:00 (October 14 UTC) | B subset | A |
| October 20, 17:00 (October 21 UTC) | A subset | B |

Each due review normally chooses 1–3 substitutions, never more than five. Preserve ten disjoint topics per cohort and twenty total. Both cohorts always remain live; there is no fixed 15-tag core, no scheduled removal of either whole cohort, and no forced introduction of the previously researched B candidate list. Retain original exposure timestamps for unchanged topics. Increment a group's revision only when its membership actually changes, but record and schedule no-change reviews too.

The weekly rhythm alternates which cohort is eligible, not which cohort is visible. A joint pair usually lasts one week when an optimization happens; if the evidence supports retaining all tags, the same pair can legitimately last longer. Aggregate traffic remains joint-cohort evidence, not a per-topic conversion measurement. Apply due partial improvements under the owner's standing authorization, with rollback, readback and daily snapshots.
