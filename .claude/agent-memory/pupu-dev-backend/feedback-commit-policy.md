---
name: feedback-commit-policy
description: When to git commit — the CEO standing exception that refines the "NEVER git commit" backend ironclad rule for isolated-worktree feature branches. Read before deciding whether to commit slice work.
metadata:
  type: feedback
---

On isolated-worktree feature branches (the scratch worktrees dispatched for
sliced feature work, e.g. `feat/computer-control`), **dev agents SHOULD self-commit
regular, well-formed slice commits — and NEVER push.**

**Why:** CEO ruling 2026-07-13 (relayed via CTO on the computer-use C2 task). The
backend ironclad "NEVER git commit — leave the dirty tree for the CEO" exists to
protect the **main working tree** (so the CEO controls what lands on dev/main). An
isolated feature worktree is a staging ground the CEO reviews and merges; leaving it
uncommitted just loses clean history. Precedent: C1 was committed there by its dispatch;
I initially deferred C2's commit citing the ironclad rule, and the CEO resolved the
conflict by making the exception standing.

**How to apply:**
- Isolated worktree + dedicated feature branch (not `main`/`dev`, not a shared tree) →
  **commit** the slice with a regular message + the `Co-Authored-By` trailer. Split into
  logical commits or squash to one per judgment. **Never `git push`.**
- Main working tree (the primary checkout) → the ironclad "never commit, leave dirty for
  CEO" still holds, unchanged.
- If unsure whether a tree is "isolated feature worktree" vs "main tree": treat as main
  (don't commit) and ask.

Related: [[computer-control-module]] (C2 committed 778e805 under this exception).
