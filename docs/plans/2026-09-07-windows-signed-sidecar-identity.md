# v0.1.10 Windows signed Sidecar identity repair

## Failure evidence

- Candidate [34183852321](https://github.com/haoxiang-xu/PuPu/actions/runs/34183852321), PuPu `a2539d5c2fe556cb9c587519bb069c855396e10f`.
- Bootstrap [34186854297](https://github.com/haoxiang-xu/PuPu/actions/runs/34186854297), Windows job `101938802877`: renderer starts, bundled Sidecar descendant times out. macOS arm64/x64 and Linux passed.
- Extracted the exact signed NSIS installer. Signed Sidecar SHA-256 is `5b4041d1208c302e44e7eb353a37a746278783425960b48be2c9082223da6ed4`. Both the ASAR identity and companion provenance still contain unsigned SHA-256 `bdfd3bf857a26569a20808cb144701c3f4bfc8cc6ca1c5aeedc68cb21e9981b3`.
- Production `resolveWindowsVaultRuntimeProvenance` rejects that mismatch; the Windows startup guard therefore does not launch Sidecar. This is not a process-name matching failure or evidence that a larger timeout would fix it.
- Preserve Unchain wheel `sha256:00e628346ccbc8161aa9296665b90d4b1a9c08f802613ee7851d47ac1a94bb56` and manifest `sha256:ab00567fe76a80e8661415eaea0ab57bba1d1c76ad19158153c51f1e64f2c6fc` in the artifact experiment. No mutable source rebuild substitutes for this pair.

## Repair / boundary contracts

BC-001 — Windows shared signing action → installed PuPu runtime, through signed PE files, app.asar and the companion JSON. CLOSED existing v1 schemas and exact key sets remain unchanged. Validate the unsigned payload with the production admission function before signing. Retain a closed local pre-sign receipt outside the payload binding archive, launcher, companion and original Sidecar digest. Sign dependencies first; verify Sidecar Authenticode; replace only Sidecar SHA-256 in the two records; update the ASAR file/block integrity and the launcher's ELECTRONASAR header binding; sign the launcher last. Then create/sign the installer and regenerate updater metadata. Fail closed on missing/mismatched records, changed wheel/manifest, invalid original integrity, unexpected keys or already-signed launcher. No runtime validator relaxation, new unsigned exception or feature-mode fallback. AC-001/002/003.

BC-002 — Signed installer → installed/upgrade qualification. Before launch, invoke the strict production admission function on the extracted ASAR and exact Sidecar and verify the launcher's ASAR binding. This exposes the identity failure before an unrelated child-process timeout. Other platforms retain their existing behavior. AC-001/004.

SEQ-001 — Per isolated payload: valid unsigned pair → pre-sign receipt → signed dependencies (old identity must fail) → resealed identity/ASAR/unsigned launcher (identity passes) → signed launcher → signed NSIS → installed bootstrap. Each attempt gets a fresh payload and receipt; prepare cannot overwrite a receipt; repeated seal or changed pre-sign records fail. Failed partial sealing discards the isolated job output; never resume it as a valid package. AC-002/003/004.

## Acceptance

- AC-001: reproduce rejection using the exact failed candidate and actual production consumer; do not weaken identity matching.
- AC-002: signing transition test; after reseal production admission and Electron ASAR integrity pass; wheel, manifest, unrelated packed/unpacked content and snapshot do not change.
- AC-003: reject unknown receipt fields/schema, changed ASAR/companion/launcher, wrong wheel/manifest, invalid file/block/header integrity, repeat prepare/seal and signed-launcher mutation; action contract enforces dependency signing → reseal → launcher signing → installer signing order and native Authenticode checks.
- AC-004: exact new candidate + its one reused wheel must pass Windows native signature, installed launch and bootstrap/upgrade checks on Actions before active rollout. Local tests or a repaired unsigned launcher on macOS are NOT this evidence.
- Message/interaction/provider/replay matrices: N/A; no chat/provider/persistence behavior changes. Cold launch and artifact-identity transition are covered by SEQ-001. Native post-fix Windows run: PENDING; release remains INCOMPLETE.

## Impact

GitNexus `inspectResources`: MEDIUM; five direct callers, installed qualification and restart-update qualification paths. Shared action called by formal candidate and Windows signing qualification. Test helper `assertSharedActionContract`: UNKNOWN in graph; text inspection confirms its single test caller. No production runtime function is modified.

## Local verification results (2026-09-07)

- AC-001 PASS: extracted the consumer module from the exact failed NSIS ASAR and executed its strict admission function. The original signed payload fails with `windows vault runtime provenance is invalid`. Packaged code matches source after CRLF/LF normalization.
- AC-002 PASS (artifact-level, not native launch): in a separate copy of that installer payload, restore the exact candidate's unsigned Sidecar and remove the launcher certificate to reproduce the pre-sign stage. Prepare the receipt, substitute the exact Azure-signed Sidecar from the installer, reproduce rejection, then reseal. The extracted production consumer and installed resource inspection both pass. No Unchain rebuild.
- All unrelated ASAR header entries are unchanged. Real launcher's non-resource PE sections, other resources and overlay are unchanged. Snapshot fingerprint remains `009b1495e0aabbfafd62947653fc35f8f8c372790ecf15ba99b5001684d7efe7`; snapshot SHA-256 remains `0f2d111c4d4ddadeac7d85a71d1149dd5af907683b32e6d8b50ea19356d110b3`. Memory V2 All and theme customization remain enabled.
- AC-003 PASS: 16 focused tests, including closed-shape/identity corruption, original ASAR integrity corruption, existing launcher certificate refusal, repeat attempts, packed/unpacked byte preservation and shared-action signing order.
- Release QA unit suite: 236 passed, 1 Windows-only skip on macOS. Long-run harness unit tests: 62 passed. Electron: 56 suites / 910 passed, 5 skipped.
- AC-004 remains PENDING: the locally repaired launcher is deliberately unsigned. Do not publish it or treat it as Windows Authenticode/native launch evidence. Commit/merge the fix, rebuild the exact v0.1.10 tag candidate through the protected release operator, then run Bootstrap Qualification. No release/tag/approval state changed by this repair.
