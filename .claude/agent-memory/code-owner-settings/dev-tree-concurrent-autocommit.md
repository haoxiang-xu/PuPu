---
name: dev-tree-concurrent-autocommit
description: Work-in-progress in the PuPu main tree can be committed by a concurrent process even when I was told not to commit — verify tree state before reporting
metadata:
  type: project
---

A concurrent process operating on the same PuPu main tree (branch `dev`) can
`git add`-and-commit my uncommitted work while I am still editing. On
2026-07-31 the Ollama pull-button fix was swept into commits `dfb7a57` /
`97eda02` together with pupu-cto's parallel `api.ollama.js` SIZE_RE work and
unrelated `unchain_runtime` backend changes — under a commit message I did not
write, despite an explicit "do not commit" instruction.

**Why:** the CEO runs several agent sessions against the same working tree. My
"do not commit" discipline only controls *my* git calls; it cannot keep the tree
uncommitted.

**How to apply:** (1) When a task says "do not commit", run
`git status --porcelain` + `git log --oneline -3` right before reporting and
say explicitly whether the tree was committed out from under me — a silent
"I did not commit" is misleading if the code already landed. (2) For any slice
expected to run long or overlap another dev's files, ask for an isolated
worktree up front rather than sharing the main tree. (3) Never assume the
working tree still holds only my changes; re-read files before diffing.

Related: [[team_roster]]
