# Zero-Context Implementation Brief

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
4. Apply the parent issue-refine-ticket skill authority and state-transition rules. This reference does not create an issue or grant additional permissions.
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
  (`npm test`, the PuPu Test API reference bundled with
  `issue-feature-audit` for a smoke run, manual checkpoints).
- **Impact / risk** — blast radius from impact; call out HIGH/CRITICAL explicitly.
