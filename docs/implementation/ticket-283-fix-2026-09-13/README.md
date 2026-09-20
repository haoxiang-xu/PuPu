# Ticket 283 — pure-skill invocation repaired

Both marketplace skills now complete real GPT-4.1 requests in the unsigned packaged application. Trail of Bits Audit Prep returned an audit preparation plan, its second chat turn returned `SECOND283`, and Vercel Web Review returned `VERCEL283`. All three persisted assistant messages have status `done`; both skill commands preserve their expanded template and source identity.

Two sequential failures were repaired:

1. The shared toolkit builder treated installed instruction-only `skillpack.*` identities as Python toolkit factories. It now checks the actual installed store and contributes no executable tools for a valid skill pack. Unknown/deleted identities remain blocked; MCP, builtin and generic toolkit behavior is preserved.
2. The first repaired package exposed `objective contains control characters`: Context V2 copied multiline skill text directly into the runtime's single-line, 32,768-character objective. PuPu now projects a normalized, bounded objective while retaining the complete original message artifact and its source reference. The strict Unchain validator and wheel are unchanged.

Validation: 129 backend attachment tests, 66 frontend command/provenance tests and 26 Context V2 bootstrap/graph tests passed (221 total), plus all five packaged sidecar smoke checks. New regressions failed against the original implementation before passing with the fixes. The lifecycle tests cover absent/wrong/deleted identities, repeated selection, reinstall, mixed tools, multiline/long inputs and persisted task-state recovery after restart.

The exact final package digest is `sha256:ac1b9a1296c572ab2820d121e5f825eed11b175fa298c201d4bfd7c0aa6cbcb8`. The single reused Unchain wheel digest is `sha256:f2e6ddeb85363f1ae54583c7c7ea9d9c6effb1f5c2cba5d7a39c0607d0bec9b7`; the actual imported runtime manifest matched `sha256:ab00567fe76a80e8661415eaea0ab57bba1d1c76ad19158153c51f1e64f2c6fc`. See `candidate-tree.json`, `source.patch`, `unchain-artifact.json`, `package-smoke.json`, `imported-runtime-status.json` and `results.json`. The package uses the existing unchanged frontend build and the two repaired sidecar source files; source base is `17d279c3` (its preceding commit differs only in audit documentation).

The synthetic chat evidence includes one intermediate failure from before the objective fix; `results.json` identifies that chat explicitly. The other two chats contain the three final successful responses. These checks prove invocation and persistence, not the correctness of generated advice, actual tool execution, full release qualification or plugin security certification. Paid MCP provider workflows and live durable interaction replay remain outside this repair's tested scope.

The isolated app was stopped and its entire profile, including the temporary encrypted provider credential copy, was deleted. The user's existing app and data were untouched. Changes are left uncommitted; a running development sidecar must be restarted to load them.
