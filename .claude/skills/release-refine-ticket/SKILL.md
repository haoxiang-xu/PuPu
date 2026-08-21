---
name: release-refine-ticket
description: "Use when a PuPu board ticket needs full implementation detail before someone picks it up — \"refine #123\", before assigning a ticket to anyone (human or agent), or when a [DRAFT] ticket is scheduled to start. Upgrades an outline ticket into a zero-context onboarding brief."
---

# Release: Refine Ticket

Upgrade one draft ticket into a brief a zero-context human developer could execute. **Refining is mandatory before any assignment** — never assign a `[DRAFT]` ticket.

**Method:** this is the `create-issue` skill's methodology applied to an existing issue — read `.claude/skills/create-issue/SKILL.md` and follow its investigation workflow and body structure. GitNexus investigation (query/context/impact) is REQUIRED, not optional; a refine written from memory is a draft with extra words.
**Plumbing:** `.claude/skills/release-open-sprint/board-api.md`.

## Flow

1. Read the current issue (`gh issue view N`). Extract the founder's intent and outline acceptance — these are the contract; refinement expands them, it does not reinterpret them.
2. Investigate per create-issue: GitNexus flows, key symbols, upstream impact, relevant docs/ pages.
3. Rewrite the body in English with create-issue's structure: What & Why · Read this first · Architecture at a glance · Relevant files · Suggested development path · How to verify done. Remove the `[DRAFT]` marker line.
4. Re-check Size against what investigation revealed; adjust the board field if the gut-call was off.
5. Show the founder the new body; on confirmation `gh issue edit N --body-file ...`. Founder requests changes → revise and re-show (loop here, don't edit partially).
6. Sprint doc: set the ticket's 计划 row 状态 to `refined`, add a 变更记录 line (date, #N refined, size change if any).
7. If assignment was requested: `gh issue edit N --add-assignee <handle>` after the confirmed edit — ask for the GitHub handle if unknown. Never assign while the `[DRAFT]` marker is still on.

## When investigation contradicts the draft

Found it infeasible, already-done, or 10x the assumed size? **Do not silently reshape the scope.** Report to the founder with options (descope / split / close / push to a later sprint) and wait for the call. The founder owns scope; you own evidence. While waiting: 状态 stays `draft`, add a 变更记录 line `#N refine blocked — awaiting founder scope call`.

## Common mistakes

- Refining from memory or from the draft text alone — the brief's value is the investigation; no GitNexus, no refine.
- Reinterpreting intent ("what they really meant was...") — expand, don't redirect.
- Editing the issue before the founder saw the new body.
- Forgetting the doc row flip to `refined` — the doc is how open/close sprint know what's assignable.
- Refining tickets nobody scheduled — refine on demand (assignment or start), not in bulk.
