---
name: community-repo-issue-polling
description: Monitor GitHub issues, pull requests, comments and reviews; maintain a deduplicated community inbox, assess items one by one, and coordinate assignments and agreed follow-up actions. Use for repository triage, community inbox checks, or daily repo management; use release skills for release planning and delivery.
---

# Community: Repository Issue Polling

Turn repository activity into a small, evidence-backed decision queue. Default repository in this workspace: `haoxiang-xu/PuPu`, checkout `/Users/red/Desktop/GITRepo/PuPu`, maintainer `haoxiang-xu`. Verify the remote before use; for another repository derive its configuration instead of copying PuPu's maintainer. Respond in the user's language.

## Modes

- **巡检 / scan:** Collect changes, assess new actionable signals, update the local inbox. Scheduled runs use this mode. Notify only for new actionable activity, material changes, completion, failure, or a newly required decision. Keep unchanged pending items without repeating their notification every day.
- **逐项评判 / triage:** Show a short ordered queue, then work through the first item with the user. Give the evidence, your recommendation, and the one decision needed. Carry forward their answers and move to the next item after completing the agreed action. Do not ask all questions at once.
- **执行 / act:** Carry out the specific action already authorized in this conversation or recorded standing rules. Re-read the current item immediately before writing, verify the result, and record it. Do not ask again for an action already authorized.

For collection and durable inbox details, read [references/inbox.md](references/inbox.md).

## Assess the actual item

Read the full issue/PR and relevant conversation, including maintainers' later replies. Group a linked issue, PR and comments into one decision where they concern the same outcome. Distinguish outside human contributions, maintainer activity, and bots; a comment from an outsider on a maintainer-created issue still belongs in the community inbox. Bot review findings may be actionable; routine bot noise need not be surfaced. Author association is context, not proof that a contribution is correct.

For each actionable item record its URL, author, what changed, current status/assignees, supporting evidence, recommended next action, and whether user input is needed. Prioritize reported security/data-loss or release-blocking problems, misleading/incomplete PRs, contributors waiting for direction, then ordinary bugs/features/questions. Calibrate these claims against evidence rather than the submitter's title.

- **Issue:** Clarify the requested outcome and available reproduction evidence; check for duplicates and existing implementation/release work before suggesting a new ticket. Missing evidence supports a targeted question, not an automatic rejection.
- **PR:** Inspect the actual diff, base branch, exact head SHA, linked issue, current checks and reviews. Explain whether the diff delivers the promised behavior. A passing check or `Fixes #N` is not evidence that the issue is solved. Mark initial triage as initial triage; do not claim full review or runtime verification without performing it. Do not execute contributor code/install commands just to triage.
- **Comment/review:** Identify a concrete question, correction, new reproduction, blocker, or useful implementation suggestion. Read subsequent replies before declaring it unanswered. Draft a reply if useful, but do not post it without messaging authorization.

## Assignment and action boundaries

The setup request authorizes suitable assignment, not arbitrary assignment. An existing user-approved item-to-person mapping or standing routing rule can be executed without reconfirmation. Verify the GitHub username is eligible and still appropriate; preserve existing assignees unless replacement was authorized. A contribution or offer to help is evidence for a recommendation, not automatically a new assignment rule. If the recipient is unclear, recommend a person with a reason and resolve it in the one-item discussion.

Keep GitHub assignees (people), requested reviewers, Codex tasks, and Release membership distinct. Do not assign a contributor to an issue merely because their PR mentions it. Do not create or message another Codex task unless the user authorized that coordination; only create a new task when explicitly requested.

Do not infer authorization to publish comments/reviews, close issues/PRs, merge, change release scope, or request reviewers from a request to monitor. Prepare a concrete proposed action first when authorization is missing. Record later user approval with its exact scope, then execute without asking again. If a write fails ambiguously, inspect live state before retrying; stop blind retries after one failed retry and report the unresolved action.

For PuPu, respect current AGENTS.md. Route release intake/planning to the smallest applicable release skill. Existing assignee does not establish implementation responsibility. Do not revive retired court/case/owner-routing mechanisms. If actual code work is requested, use the repository's impact and boundary-contract workflow; this monitoring skill does not itself authorize implementation.

## Output

For a meaningful scan, give a concise Chinese queue ordered by actionability: item link, what happened, recommendation. Expand only the first decision. Say when coverage is partial or blocked. On manual scans, a brief no-change result is fine; on scheduled scans, remain quiet when unchanged/non-actionable. Persist pending decisions locally even when no notification is warranted.
