---
name: create-issue
description: "Use when the user wants to turn a rough task idea into a GitHub issue for someone with zero project context. Investigates the codebase with GitNexus and writes an English onboarding brief, then files it via gh. Triggers: \"create an issue for X\", \"write up a task to add Y\", \"file an issue so a new dev can build Z\"."
---

# Create Issue — Zero-Context Onboarding Brief

## When to Use

- "Create an issue for adding an export-chat button."
- "Write this up as a GitHub issue a new dev could pick up."
- Any time a rough task needs to become a GitHub issue that assumes the
  assignee has never seen this project.

## Assume the reader knows nothing

The assignee is a fresh human developer with zero context on PuPu. The issue
must carry them from zero: what to read first, the relevant architecture,
which files matter, a development path, and how to know they are done.

**The issue body is written entirely in English**, even when talking to the
user in another language.

## Workflow

```
1. Frame the task from the user's description. If none was given, ask what to build.
2. Investigate with GitNexus (mandatory method, not ad-hoc grep):
   - query({search_query})  -> related execution flows
   - context({name})        -> callers/callees + which flows a key symbol is in
   - impact({target, direction: "upstream"}) -> blast radius + risk level
   - Read relevant docs/ files for the big picture.
3. Draft the issue body (structure below), in English.
4. Show the draft to the user. Only after explicit confirmation, file it with gh.
```

## Issue body structure (English)

Produce these sections, each tailored for a zero-context developer:

- **What & Why** — one paragraph: what to build, why, the user value it serves.
- **Read this first** — CLAUDE.md, docs/DEV_GUIDE.md, the relevant architecture
  docs, and environment/start commands (e.g. `npm start`).
- **Architecture at a glance** — only the slice relevant to this task (e.g. the
  Chat Streaming request flow if streaming is involved).
- **Relevant files** — files/symbols surfaced by GitNexus, each with a one-line
  "what it does and why you'll touch it".
- **Suggested development path** — step-by-step: what to change first, then next,
  and how to self-check each step.
- **How to verify done** — explicit acceptance criteria + verification means
  (`npm test`, the pupu-test-api skill for a smoke run, manual checkpoints).
- **Impact / risk** — blast radius from impact; call out HIGH/CRITICAL explicitly.

## Filing the issue

- Show the full drafted body first. Never create the issue silently.
- On confirmation, run:
  `gh issue create --repo haoxiang-xu/PuPu --title "<title>" --body "<body>"`
- Default target repo follows the current git remote (haoxiang-xu/PuPu).
- Do not add labels or an assignee unless the user asks during the draft stage.

## Checklist

- [ ] Task framed (asked the user if the description was missing)
- [ ] GitNexus query/context/impact run; relevant files + blast radius gathered
- [ ] All seven sections drafted, in English
- [ ] HIGH/CRITICAL risk called out if impact flagged it
- [ ] Draft shown and user confirmed before `gh issue create`
