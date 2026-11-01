# #357 / #356 — bundled Python automatic bytecode writes

Bounded repair discovered during the existing bundled-Code execution criterion. Frozen UI5f5b5af2, Core7b03e290, host1542cdbd, wheel447fe170 and sidecar8fa994a9 are unchanged. Work is in separate own-object clones; no new feature/schema/endpoint, dependency, package install or user-library operation.

## Actual producer evidence

The copied real packaged Python3.12.13 is discovered/probed by the actual frozen sidecar and runs a real managed Code source through the installed durable handler. Valid output and invalid-return/no-publication behave correctly. However, default interpreter imports create .pyc files under the owned Python resource copy. The installed application remains byte-identical. Both direct-Python launch sites use -I without -B; -I ignores the ambient PYTHONDONTWRITEBYTECODE variable. The initial pre-sign versus post-sign tree-hash assertion is a separate QA assumption corrected by read-only Mach-O/signature inspection, not a product failure.

## Boundaries

BC-CBP-01: SkeletonResourceStore._probe_runtime_profile → direct CPython subprocess. Keep -I, command, timeout, output limit and CLOSED version/implementation reply unchanged; add the interpreter's default no-bytecode flag. Cover both the direct probe and registration's reused method. AC-CBP-01 runs a real subprocess with a fresh explicit cache location, requires successful probe and zero new pyc files.

BC-CBP-02: SkeletonCodeRuntime._command → direct CPython Code worker → authenticated durable result. Keep the isolated worker protocol, schema, identity, source/environment hashes, stdout separation, errors and process handling unchanged. Add the no-bytecode flag only to direct Python launches, for both bundled and venv kinds. Host-wrapped multi-argument commands retain their existing exact invocation. AC-CBP-02 imports a fresh owned module in the real Code worker and requires unchanged module tree and correct result; AC-CBP-03 is the wrapper-command control.

SEQ-CBP-01: preserve the original resource snapshot; run probe/Code under a fresh HOME and owned workspace; compare resource inventory before/after. Actual source red/green tests precede product edits. Build one new wheel and sidecar pair after the two-line repair, reuse it for installed profile/worker success, invalid output, unavailable-resource and resource-immutability checks. Manifest/capability schema is unchanged because no wire shape or versioned feature changed; actual imported manifest and new artifact hashes are still recorded. AC-CBP-04 is that exact artifact pair.

## Pre-edit graph and limits

Private copies of recorded Oct27 indexes are bound to the two new workspaces; no frozen/source index is edited or rebuilt. _command initially used an incomplete UID and returned UNKNOWN/not found; context resolved the exact #3 UID. Exact impact is LOW (one production caller, Code __call__, no indexed processes). Host _probe_runtime_profile is LOW (registration/probe, routes, five upstream symbols). Text confirms the actual call sites. These are bounded preimage reads of older indexes, not a complete new-candidate all-clear.

No Main/App/Chromium startup, real API/provider/key or plugin process. Heavy jobs serial on the18GB host. Full release/Builder, human acceptance, Windows/Linux and current-account desktop isolation retain their prior status. A process-specific default against automatic bytecode is not a sandbox or a prohibition on trusted user code explicitly writing files or changing sys.dont_write_bytecode.
