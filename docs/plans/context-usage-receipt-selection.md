# Context usage receipt selection

Target release: 0.2.0, direct child #454 of Release #208. Fix the composer
reporting 396% despite compaction.

Observed in the running development app:

- Selected model: `ollama:qwen3:32b`, composer window 32,768.
- Latest completed bundle: Hyperspace Claude, 38 calls. Its recorded metrics
  report 12 context compactions. The later Qwen3 attempt was cancelled without
  a new usage receipt.
- The UI selected iteration 7 (129,650 input tokens) because its opaque receipt
  ID sorted last, then divided by the unrelated selected Ollama window: 396%.
- The latest call by timestamp is iteration 37: 158,474 / 200,000 = 79%.

Implementation:

- Select the latest usable input receipt by full start time, iteration and retry;
  keep graph-step receipts eligible and avoid mutating the serialized set.
  Preserve microseconds and normalize equivalent UTC offsets before tie breaks.
- Strictly validate that receipt's existing Context Composition extension and
  prefer its recorded window. Invalid/missing composition leaves accounting
  available. No window may be borrowed from another receipt.
- When no recorded window exists, a composer/catalog fallback is usable only
  for the same provider/model. Otherwise show absolute tokens without a ratio.
- Pass the selected model into the view builder. Preserve the existing picker
  behavior for legacy same-model receipts without a recorded window.

Boundary gate: **NOT_APPLICABLE**. This is a renderer-only projection of existing
receipts. Provider calls, canonical schemas, protocol, persistence and runtime
compaction behavior are unchanged. The existing strict extension validator
continues to enforce its closed schema; no new wire fields are admitted.

Acceptance:

- AC-001: shuffled/hash-sorted receipt arrays select the latest call, including
  graph child ownership and retry ties; recorded data remains unchanged.
- AC-002: the observed iteration 37/7 and 200k/32k mismatch renders 79%, not396%.
- AC-003: malformed/wrong-version extensions and unknown windows cannot create
  a percentage from another model's budget; absolute accounting remains usable.
- AC-004: the panel and ring agree on the recorded window through model/window
  changes and historical replay.

GitNexus: PuPu index refreshed at HEAD `937b4c14`; changed usage selectors,
view builder and composer callback have LOW upstream impact. The callback's
value dispatch is a graph lower bound; its ChatInterface integration test is
included. The panel test file has UNKNOWN file impact and is confirmed by
text search to be a test-only module.

Regression evidence: new accounting tests failed before the fix (8 failures).
Review then identified loss of microsecond precision; three additional failing
regressions reproduced it before the final comparator fix. The four focused
accounting/composition/ring suites now pass all 86 tests. The ChatInterface
integration suite also passed, including the legacy same-model window picker.
Isolated Chromium replay of the observed receipts reports 79% with no console
errors or warnings. The running user's window is left intact; refreshing it
recomputes the existing memoized view with the new selector.

Delivery verification for #454 uses an independent regular clone at
`/Users/i770092/git_repos/pupu-454`, branch
`codex/ticket-454-context-usage-receipts`, based on `dev` at
`965aad52697b9e3b0a51434e36d604b538963747`. The clone's four focused suites
passed all 86 tests, and its ChatInterface integration suite passed all 172.
The full i18n scan found no missing/orphan keys, placeholder mismatches or
code references missing from English; 87 existing dead keys and 50 dynamic
references remain report-only findings. Plain `npm ci` rejected the existing
lockfile's missing optional peer `yaml@2.9.1`; `npm ci --legacy-peer-deps`
installed the clone's own dependencies without changing either package file.
Targeted clone impacts are LOW. Aggregate graph change analysis is HIGH because
it includes the enclosing ChatInterface and nine flows; the integration suite
passed, and the graph result is complete (`partial=false`, `truncated=false`).
