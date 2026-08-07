---
name: memory-v2-context-reference-double-gate
description: Security verdict on Memory V2 Context reference double gate (unchain semantic_refs contract + PuPu PupuContextReferencePolicy) — APPROVED with two pre-cutover hardening items
metadata:
  type: project
---

**2026-08-02: APPROVED**, not yet wired to production (confirmed by grep — only test files and the module itself import `memory_v2_context_adapter.py` / `memory_v2_context_reference_policy.py`; `route_chat.py`, `routes.py`, `route_memory_v2.py`, `unchain_adapter.py`, `main.py` do not reference it). This is the additive Context/Memory V2 layer, gated behind an explicit future cutover task.

**Files reviewed** (traced code, not just skimmed):
- `unchain_runtime/server/memory_v2_context_reference_policy.py` — the double-gate itself (`PupuContextReferencePolicy`)
- `unchain_runtime/server/context_memory_v2_repository.py` — `PupuExecutionJournal.append`/`.read`, `PupuRefCodec`
- `unchain_runtime/server/memory_v2_context_adapter.py` — host binding (`bind_pupu_context_module`)
- `unchain_runtime/server/memory_v2_workspace_adapter.py` — `PupuWorkspaceReferenceAuthorizer` (the exact-scope authorizer the gate delegates to)
- unchain worktree `src/unchain/context/semantic_refs.py` — provider-neutral slot contract
- both test suites (14 tests in `test_memory_v2_context_reference_policy.py`, 13 in `test_memory_v2_context_adapter.py`, 8 in unchain's `test_semantic_refs.py`)

**All 10 stated invariants verified true in code + test, with evidence**:
1. Exact semantic slots only, free text literal — `SemanticRefContract` validates ref-paths never nest inside `free_text_roots` at construction time; confirmed by roundtrip test.
2. Same-event declaration == exact-scope authorizer result — `_validate()` does symmetric-difference check (`semantic_set - declared_set`, `declared_set - semantic_set`) AND requires `authorizer.authorize(ref=ref) == ref` exactly.
3. Append validation precedes storage — `authorize_append()` runs before `self._store.append_semantic_event(...)` in `PupuExecutionJournal.append`; event counts verified unchanged across every negative test.
4. Unbound journal rejects nonempty refs — explicit check in `append()`, tested.
5. Read-side revalidates poisoned/legacy rows, marks Partial once, blocks — `PupuExecutionJournal.read()` calls `revalidate_read()` per row; `_read_partial_reported` flag+lock dedupes the sink call across repeated failing reads; confirmed by `test_poisoned_direct_store_event_marks_context_reference_partial_on_read`. **Caveat**: see finding below — this guarantee has a gap for one malformed-input shape.
6. Descriptor uri/ref/inline identity agreement — `_decode_ref()` collects all candidate identities and cross-checks; parametrized test covers both `uri` and `ref` containers.
7. Stable error taxonomy, no payload leak — closed 3-code set (`contract_invalid`/`unauthorized`/`authorizer_unavailable`), messages are schema-path strings not values, diagnostics truncate error code to 128 chars and never include payload.
8. Store-issued declarations trusted only after read authorization — `revalidate_read` re-runs full `_validate` (including a fresh `authorizer.authorize()` call) on every read, not just at append time.
9. No caller can choose another user/chat/generation/attempt — scope is an immutable `PupuExecutionScope` dataclass; `is_bound_to_execution` compares the *entire* scope tuple, not just chat id; cross-chat test confirms rejection.
10. No production assembly/routes changed — confirmed by grep (see above).

**Findings (both non-blocking for current additive state, both must be closed before the cutover task)**:

- **Medium** — `_decode_ref()` in `memory_v2_context_reference_policy.py` recurses into nested `"ref"` values with no depth bound (`candidates.append(("ref", _decode_ref(value["ref"], path=path)))`). A descriptor with deep `{"ref": {"ref": {...}}}` nesting at a declared semantic path raises Python's bare `RecursionError`, which the function's `except (TypeError, ValueError)` does **not** catch — so it escapes as an uncaught exception instead of the intended `PupuContextReferencePolicyError`. Traced both call sites:
  - At `authorize_append` (write path): still fails closed — the event is never persisted, since `_store.append_semantic_event` is only called after `authorize_append` returns normally — just with an ugly exception type instead of the clean taxonomy (invariant 7 technically violated for this one input shape).
  - At `revalidate_read` (read path): **worse** — the `except PupuContextReferencePolicyError` in `revalidate_read` doesn't catch `RecursionError` either, so `_report_read_partial_once` is never called. The read still fails/blocks (invariant 5's "blocks" holds), but the "marks Partial once" diagnostics guarantee is skipped for this shape — a real, traced gap against the stated invariant.
  - Not currently reachable through any live product surface (feature unwired), reachable today only by directly poisoning the SQLite row (same threat class the existing "poisoned" tests already cover deliberately) or by a future append-time caller that lets model/tool-influenced JSON populate a declared ref slot before validating its shape.
  - Fix: bound recursion depth in `_decode_ref` (e.g. max 4–6 levels — matches realistic uri/ref/inline nesting) and raise `PupuContextReferencePolicyError(code="contract_invalid")` on excess. Add a regression test alongside the existing malformed/poisoned-row tests.

- **Low, hardening note** — `_declared_refs()` in `context_memory_v2_repository.py` (repository layer, populates `JournalEvent.resource_refs`) silently **skips** malformed ref strings (`try: ... except ValueError: continue`), while `_stored_declared_refs()` in the policy layer (`memory_v2_context_reference_policy.py`) fails closed on the same raw `links.resource_refs` data. The fail-closed guarantee currently holds only because `revalidate_read` (strict path) always runs first whenever a policy is bound. If cutover ever adds a caller that reads via `PupuExecutionJournal.read()` without binding a reference policy (migration script, admin tool, a future feature that forgot the binding step), malformed/poisoned ref declarations would be silently dropped instead of raising — no live impact today since an unbound journal can never *write* `links.resource_refs` in the first place (checked at append time), so this only matters for externally/legacy-poisoned rows read through an unbound journal. Recommend making the repository-layer decode fail closed too, so the safety net doesn't depend on every future caller remembering to bind the gate.

**Architecture note (not a finding, confirms invariant 3)**: `DurableEventSink.__call__` in unchain's `journal/runtime.py` always routes writes through `journal.append(request=...)` — there is exactly one choke point for persisting events, so the reference policy cannot be bypassed by any alternate write path within the reviewed code.

**Not personally re-executed**: trusted the reported test-run counts (113 focused / 1395+3493 backend / 22 semantic contract) rather than rerunning the full suite myself; traced the specific test files listed above directly instead. If this decision is revisited, re-run before trusting stale counts.

See [[sec-investigation-001-accepted]] pattern in user's global memory for how prior "accepted, not yet fixed" findings are tracked — same discipline applies here: the two findings above are accepted-with-required-fix-before-cutover, not accepted-forever.
