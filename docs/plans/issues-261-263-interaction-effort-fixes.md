# Issues #261–#263: interaction continuation, Stop, and model effort

Scope: preserve conversations after confirmation or cancellation failures; admit only supported model effort values. No release rollout or issue closure is included. After local verification, the project owner requested that all implementation changes be committed in PuPu and Unchain.

## Boundary contracts

- **BC-261 (CLOSED)**: confirmation HTTP producer → durable host receipt → Context V2 ingress → live waiter. HTTP carries confirmation_id/session_id/approved/reason and optional modified_arguments. Host receipt preserves the actual submitter; canonical resolution uses actor `user` consistently with initial acceptance and cold resume. Identity is execution + source attempt + interaction; duplicate identical answers must replay one event, conflicting answers must fail. Failure must not wake the waiter or hide the actionable card. The existing runtime manifest gate remains authoritative. AC-261/262/263.
- **BC-262 (CLOSED)**: renderer Stop → preload/HTTP cancellation → durable execution control. Exact owner_chat_id/session_id/attempt_id plus pending interaction_id, optional source_attempt_id/request_id, reason/idempotency_key. Missing live identity may be recovered only from a validated pending record for the same session and attempt; foreign targets fail closed. Failed cancellation persists a tombstone, bounded retry state and one visible error; it must not reattach the stopped execution. AC-264/265/266.
- **BC-263 (OPEN catalog, CLOSED effort)**: imported Unchain model catalog → PuPu model picker/preferences → provider payload. Catalog extension fields retain existing normalization; gpt-5.3-codex efforts are exactly low/medium/high/xhigh, default medium. Built-in provider/model identity selects the ladder; stale unsupported preferences fall back to default, custom providers retain their own protocol. No unknown effort is forwarded. Provider rejection gets an actionable error. AC-267/268/269. Source: https://developers.openai.com/api/docs/models/gpt-5.3-codex .

## State sequences and acceptance

- **SEQ-261**: first interaction → durable acceptance → live resolution → repeat identical submission → second interaction in the same attempt. **AC-261**: exactly one resolution per interaction and waiter continues. **AC-262**: injected persistence exception is logged with traceback, card stays retryable, retry succeeds without changing accepted response. **AC-263**: restart/resume/replay retains the accepted answer and rejects foreign identity/conflicting answers.
- **SEQ-262**: live pending interaction → Stop → exact cancellation → idle → next message in same chat. **AC-264**: outgoing cancellation includes the live interaction ID and a second message is accepted. **AC-265**: missing-target response causes one validated lookup and retargeted retry; wrong session/attempt fails. **AC-266**: repeated transport/permanent failures terminate automatic retries with a visible error; restart retains the stop tombstone.
- **SEQ-263**: select Codex with saved minimal → request → subsequent request and switched model. **AC-267**: real catalog supplies only supported levels. **AC-268**: strict provider payload admits every offered effort and maps stale preferences to medium. **AC-269**: provider effort rejection surfaces actionable text.

## Validation matrix

Local implementation verification completed on 2026-09-09:

| Sequence / contract | Evidence | Verdict |
| --- | --- | --- |
| AC-261: first and second interaction, identical replay | Real Context V2 ingress tests for tool, human and budget interactions; one canonical resolution event each. The original tests reproduced `JournalConflictError` before the actor fix. | PASS |
| AC-262: failed persistence and retry | Injected storage failure retains the actionable card; the same answer can be retried. HTTP regression checks traceback logging and excludes internal exception details from the response. | PASS |
| AC-263: crash/restart, replay, foreign identity | Fixed-wheel host, graph resume and acceptance crash matrix suites, including strict ingress validation and existing descendant-approval fail-closed behavior. | PASS |
| AC-264: live pending interaction → Stop → next send | Hook integration plus real Sonnet run `unchain-1788971167080-05e7417071c63`: UI Stop cancelled interaction `interaction_6b7200a804c1b6657f25ac7025a2fe58`, prevented the write, and the same chat subsequently completed `AFTER_STOP_OK`. | PASS |
| AC-265/266: missing ID, wrong target, permanent/transport failure, restart | Exact cancellation payload, same-attempt recovery only, bounded retries, persistent stop tombstone, visible final error, and failed retry-counter writes. | PASS |
| AC-267/268: catalog → UI preference → strict provider payload | All four Codex values low/medium/high/xhigh accepted by strict payload tests; stale minimal/none/max mapped to medium. Actual graph-step model wins over parent options; recipe migration/save/round-trip tests pass. | PASS |
| AC-269: provider effort rejection | Actionable supported-effort/Default/resend error tested. | PASS |
| Real provider smoke, ordinary messages and confirmation continuation | Sidecar restarted before probes. GPT-4.1 completed `OK`; Codex completed successive messages and an approved write (`SECOND`). Sonnet completed two approved writes (`A`, `B`) in one run. Actual file contents and terminal run states verified; probe files/chat removed and original chat restored. | PASS, development app |
| Every offered Codex level against live provider | Strict consumer tests cover all levels; live smoke exercised the working selected/default effort only. | NOT_RUN for all-level live matrix |
| Packaged PuPu + the exact wheel smoke | No packaged candidate was built or launched in this task. | NOT_RUN |

Final targeted suite results: **297 backend tests + 40 subtests**, **71 frontend/Agent Builder tests (8 suites)**, and `git diff --check` pass. The Python suite used both `UNCHAIN_SOURCE_PATH` and `PYTHONPATH` pointing to the extracted wheel, preventing the adapter from silently importing the mutable sibling checkout. The real running development app used the restarted source sidecar; it is separate behavior evidence, not packaged-artifact evidence.

Evidence is preserved locally under `.release-qa/issues-261-263/`: test logs, red-before-green diagnostics, real-app run snapshots, the complete graph result, i18n scan, source candidate digest, and wheel/manifest identity. The source candidate digest is a deterministic hash of the explicit implementation/test file list; it is not a packaged application digest.

- Reused wheel: `unchain-0.2.0-py3-none-any.whl`, SHA-256 `410cc5d787dd566de619154a2eb7c2efb568fa85857c06059926bb6c605fffb4` (one successful build).
- Actual imported runtime manifest: `sha256:ab00567fe76a80e8661415eaea0ab57bba1d1c76ad19158153c51f1e64f2c6fc`.
- Feature consistency: model × Agent Builder compatible; no new UI primitive, IPC path, storage writer, router, style or locale key introduced. Full i18n scan reports pre-existing unrelated command-organizer translation gaps; they were not changed in these bug fixes.
- Release certification / active rollout remains **INCOMPLETE** until the packaged pair and outstanding applicable live matrix are verified. This task does not claim feature-audit PASS, publish or close tickets.

## Impact baseline

PuPu `/Users/red/Desktop/GITRepo/PuPu`, branch dev, HEAD c380c62; index refreshed before edits. `_make_interaction_resolution_writer`: LOW, 3 direct callbacks, tool-confirm flow. `_build_payload`: MEDIUM, 5 direct callers/6 upstream symbols, normal and graph execution. `_normalize_stream_error`: LOW, 4 upstream symbols, stream generators. HTTP handlers and bridge methods have dynamic callers verified in source. The large frontend streaming file has no indexed symbols (UNKNOWN); Stop/recovery/outbox callers were explicitly inspected and require integration coverage. Unchain `/Users/red/Desktop/GITRepo/unchain` index refreshed before catalog edits; resource file has no resolved callers (UNKNOWN), confirmed consumed by runtime capability loader and PuPu catalog.

Graph change analysis after implementation reports 27 symbols and 20 affected execution flows across 9 then-tracked changed files, aggregate risk **CRITICAL**; the user was warned before further changes. Full underlying MCP output has no partial/truncated flag. This is blast-radius evidence, not proof that unresolved frontend/resource callers are safe. At that point, new untracked tests and this plan were outside Git diff graph detection; a fresh check including staged additions is required before the owner-requested commits. Unrelated concurrent command-organizer work was preserved.
