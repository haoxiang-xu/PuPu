# Record

## S-0001 | 2026-08-21T17:20:00-07:00

- **case**: P-0000-0008-2026-0821
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: FRAMING
- **target**: case
- **basis**: Chief directive 2026-08-21 “开始按照计划执行”; `docs/architecture/memory-v2-rollout-and-legacy-retirement-roadmap.md` W0.
- **decision effect**: Open a distinct drafting case for Windows Memory V2 containment, candidate identity and release-gate work. This framing neither changes a runtime guard nor grants production authority.
- **核心问题/目标**: Define the Windows support/threat boundary, candidate lineage and release evidence needed before a future Active proposal can be considered.
- **non_goals**: No Active enablement, secret/decrypt/spawn ordering change, Job Object implementation, registry/broker mutation, GitHub ruleset mutation or P6 deletion-scope change.
- **主 owner**: code-owner-runtime
- **选择依据**: Memory V2 lifecycle/capability containment is the central integration result; Electron and release gate boundaries remain explicit pending material handoff.
- **选择不确定性**: The actual Windows launcher/control channel and CI/ruleset consumers require their responsible owners' later confirmation.
- **初始已知范围**: Windows rollout/containment, build snapshot, package smoke, source E2E, final report and live main ruleset.

## S-0002 | 2026-08-21T17:20:30-07:00

- **case**: P-0000-0008-2026-0821
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: NOTICE
- **target**: rollout-disposition
- **basis**: P-0000-0008-2026-0821#PS-001
- **decision effect**: Preserve the existing Windows Shadow/off disposition while W0 captures red baseline evidence.
- **notice kind**: ROLLOUT_BLOCK
- **condition**: Windows Active lacks an approved support/threat matrix, exact installed-candidate identity chain, required report manifest, mandatory repository gate and acceptance evidence.
- **release conditions**: Independent ACTION PLAN_RULING + CLOSURE for this case, followed by the approved acceptance sequence; no W0 drafting evidence can substitute for either.
- **current permitted disposition**: Shadow/off only.

## S-0003 | 2026-08-21T17:34:00-07:00

- **case**: P-0000-0008-2026-0821
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: NOTICE
- **target**: baseline-evidence
- **basis**: E-0001, E-0002, E-0003, E-0004, E-0005, E-0006
- **decision effect**: Preserve W0 red-before-green observations and explicitly retain the drafting/ruling block.
- **notice kind**: W0_RED_SAVED
- **observed scope**: current source default-off fallback, hard-coded smoke mode, decrypt-before-containment order, source-only E2E, final-report dependency gap, live ruleset bypass, forced Shadow/pre-spawn reject and absent local Windows candidate.
- **non-authority statement**: Evidence is neither a PLAN_RULING nor CLOSURE and does not permit a runtime or GitHub configuration change.
