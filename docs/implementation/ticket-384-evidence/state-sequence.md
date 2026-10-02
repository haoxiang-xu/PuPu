# #384 isolated state-sequence evidence

The actual ChatInterface composer `onStop` callback exercises the real useChatStream, V4 event store/projector/adapter and chat_storage; only the external transport/provider and presentation capture are mocked. The fixture is byte-identical accepted-wheel producer output, with explicit test-only session/run/call identity remapping. No model provider, live approval service, shared profile or running sidecar was used.

| Case | Result |
|---|---|
| Empty-body/tool-only response already visible at Stop | retained canceled assistant; original ordered arguments/results and ids remain |
| V4 call admitted but pending in 64 ms batch | red before drain; green after synchronous stop-only drain |
| Same-stack first call/result plus second in-flight call | both calls retained in original order; first observed result preserved, no fabricated second result |
| Same-stack pending interaction | call retained; exact interaction id captured in cancellation; pending UI cleared and no approval callback submitted |
| Already-projected result before Stop | own result and in-flight second call preserved |
| Repeated Stop | frame/status snapshot unchanged |
| Old handler after Stop and after same-chat successor starts | late call/result cannot alter stopped owner or successor; current successor call stays scoped |
| 64 ms timer/microtask after Stop | does not resurrect streaming status or append a stale result |
| Root and nested persisted frames | exact ids/payload extensions survive actual localStorage-backed module reset/reload |
| Closed message/frame versus open payload boundary | exact outer keys; unknown outer members removed; existing payload extension retained and strings bounded to 8,000 characters |

Independent root replay of the final timing tests against immutable pre-drain checkpoint `d713e258` has three expected failures (buffered call, same-stack result/second call, same-stack interaction) and two passing #384 cases. The production checkpoint’s six focused suites passed 109 tests; the final test-only review corrections pass six suites / 111 tests. The tests retain a FakeTimers diagnostic about clearing a native timer; it is recorded in the raw log rather than suppressed. Existing eight cancellation/turn-mutation/replay/storage suites passed 90 tests before the drain; the full final-source frontend run and isolated loopback rerun provide combined closure of 445 suites / 5410 passing / 5 skipped (not one all-green aggregate invocation). See aggregate-closure.json.

The new handle method is guarded by the existing current-run generation check. It synchronously drains only previously admitted events, flushes nested frame state and the existing message scheduler, then Stop captures interaction/attempt identity and tombstones the generation before asynchronous transport cancellation/disconnect. Legacy V2 handles are unchanged. Test API cancellation remains unchanged. Graph pre-edit HIGH/CRITICAL and dynamic-handle coverage limitations are recorded separately.

This proves isolated local presentation/storage behavior. Compiled consumer switch/remount evidence is pending. Real Electron Stop/reopen, MemoryV2 durable journal replay and cold sidecar restart remain NOT_RUN / ON HOLD; active rollout remains INCOMPLETE.

Review-2 test-only correction evidence: root independently replayed both added cases against immutable pre-drain `d713e258`. The buffered child case loses the assistant before storage; the second-interaction case cancels the stale first interaction (`interaction-path`) rather than `interaction-second-stop-384`. Both fail there and pass against unchanged production `ce9e434c`. The current nested case preserves completed and pending child calls in original order with the observed result; raw running metadata remains as provenance and the cancelled parent drives truthful renderer status. The second-interaction Stop case preserves the first observed answer/result, clears the second pending UI, cancels exactly that second id, and submits only the explicitly resolved first answer. These isolated assertions resolve the two state-cell coverage gaps, subject to independent review readback.
