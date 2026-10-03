# Review 1 resolution

The medium nested-status finding is corrected: canceled parents project unfinished child metadata to canceled status consistently in the visible label, recursive trace and enclosing branch. Completed results remain present and keep their existing completed projection. Ordinary done/error generic call rendering retains the baseline behavior.

Additional scope checks reject infrastructure/unknown frames and malformed non-visible payloads as reasons to retain an otherwise empty assistant placeholder. Meaningful supported root or nested visible history still retains the original frames without fabricated body/results.

Corrected regression tests were replayed against the immutable first source checkpoint `f3d3fd6b` in an independent no-hardlinks task-local clone. The clean red run (`correction-red.log`) has five expected failures and 58 passes: stale visible running label and four root/nested infrastructure/unknown-frame retention cases. An earlier local test attempt also had one erroneous expected summary for normal error status; that assertion was corrected and is not counted as defect evidence. The correction green run (`correction-green.log`) has four suites / 76 passes. `git diff --check` passes.

The graph timing exception for getSubagentTraceStatus is disclosed in graph-summary.md. Result timing, actual pending-approval stop, repeated stop, successor ownership and cold storage/remount still require the next state-sequence slice. No live app or shared profile was used.
