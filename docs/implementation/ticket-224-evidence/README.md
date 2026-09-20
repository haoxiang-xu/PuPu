# Historical evidence for PuPu #224

These are development/audit diagnostics from the first computer, preserved for the
next tester. Start with ../ticket-224-next-agent.md. No PASS is implied by this
folder; model/candidate verification remains pending. Local paths in logs identify
the original environment and need not exist on your computer.

- audit-2026-09-11: i18n, targeted reruns, graph and source-review identity.
- live-8b: real application output, screenshot, run bundle, no pending interaction.
- forced-8b: request/response comparisons and rendered prompt/template diagnostics.
- i18n-tooling: read-only snapshot of audit.mjs, keys.mjs, scan.mjs from the owner's
  release-feature-audit skill for repeatable full scanning on another computer.
- Root logs: selected red-before-green and final test results.

Only synthetic probe data is included. User profiles, cookies, credential stores,
venvs, installed dependencies and active application data are excluded. The old
development wheel was preserved outside the deleted clones on the original
computer; build ONE new candidate wheel from the pinned remote Unchain source
and use its recorded hash throughout the next verification as described in the
next-agent instructions.

Whitespace at line ends in copied test logs was normalized for Git; test results
and log content are otherwise unchanged. Original logs remain on the first host.
