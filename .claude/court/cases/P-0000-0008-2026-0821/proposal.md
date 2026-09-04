---
case_id: P-0000-0008-2026-0821
boundary_revision_set: PENDING_OWNER_INTEGRATION
updated_at: 2026-08-21T17:20:00-07:00
---

# 方案草案

## P-0000-0008-2026-0821

- **主 owner**: code-owner-runtime
- **目标结果**: 把 Windows Active 的安全前提、candidate identity 与发布 gate 收敛为闭合、可验证的跨边界方案；先消除 clean-CI/default-off、build-output smoke、source-E2E、缺报告和 ruleset bypass 造成的假绿。
- **non_goals**: 不在 PS-001 授权 Windows Active、Windows Job Object、shell sink、computer input、registry registration 或 GitHub ruleset 写入；不以 artifact SHA、source checkout 或环境变量替代 capability admission；不以自测/Shadow 结果解除 Active gate。
- **实施范围**: W0 只保存支持/威胁矩阵、candidate/release contracts、红基线与后续 owner handoff 空白。W1 及以后才可在获准范围内实施 Windows launch/containment、candidate snapshot、installed E2E 和 release enforcement。
- **contract_set**: BC-001, BC-002, BC-003
- **W0 draft artifacts**: `contracts/windows-support-threat-matrix.v1.json` and `contracts/release-candidate-identity.v1.json`. Both are closed-schema DRAFT_ONLY inputs and do not stand in for an owner confirmation, revision pair, test result, ruling or closure.
- **owner slots**:
  - SLOT-001 | code-owner-runtime | W0 framing、Memory V2 lifecycle/containment contract skeleton、red evidence integration | FILLED | LEAD
  - SLOT-002 | code-owner-electron | Windows launch/control-channel and Job Object consumer contract | PENDING_HANDOFF | not yet opened
  - SLOT-003 | code-owner-devtools | clean-CI snapshot, report matrix, installed E2E and GitHub gate contract | PENDING_HANDOFF | not yet opened
- **关键实施约束**:
  1. 支持面暂定 Windows 10/11 x64；Windows ARM64 和 `computer_input` 在 pre-decrypt 阶段均不支持。Job Object 只可声明普通 `CreateProcess` 后代的合作式 lifecycle containment。
  2. `shell_secret_env`、`shell_secret_stdin` 与 `mcp_schema_secret` 在 W0 仅进入 threat review；若需要抵御 WMI、计划任务、服务或 parent-spoof broker escape，不能以 Job Object 单独宣称 supported。
  3. 受控 release profile 只能生成一次 exact snapshot bytes；deterministic、package、install 和 report job 必须复用同一输入。快照缺失、unknown mode、fingerprint 不同或 `executed_tests=0` 均 fail closed。
  4. Windows qualification 必须来自同一已安装 candidate 的 black-box proof；source Electron/E2E 和 build-output sidecar smoke 只能是辅助信号，不能替代 installed evidence。
  5. `Final Release QA` 的 mode-aware expected report set 与 GitHub required status/promotion gate 必须是闭合、显式且无 always-bypass 的后续裁定对象。
- **风险**: 把 cooperative process grouping 误当作敌意代码 sandbox 会泄漏 secret；各 job 自行物化 snapshot 会导致包与 smoke 模式不同；源码 E2E/sidecar green 会遮蔽安装包与 Active capability failure；规则集遗漏 check 或 always-bypass 会使任何 CI 结果非强制。
- **可逆性**: W0 不改变行为；后续候选仅可经 feature gate 回退为 Shadow/off。不得通过删除 guard、恢复默认 off fallback 或放宽 ruleset 来“回滚”安全约束。
- **回滚/补救方式**: 若任何 required boundary、support claim、candidate identity 或 installed proof 不成立，保持 Windows Shadow/off，撤回未发布 candidate，并保留 red evidence 与 artifact/report inventory 供修订。
- **验收标准**:
  - AC-001 | 冻结版本化支持/威胁矩阵，逐项列出 Windows 10/11 x64、ARM64、四类 sink、broker/control channel 与 unsupported/disabled 理由；不得把 Job Object 写成 OS-wide sandbox。
  - AC-002 | 同一 release profile 生成一个带 SHA-256 与 fingerprint 的 snapshot；任何 consumer 缺失、改写、重建或模式不匹配都停止 release。
  - AC-003 | package smoke 读取并核对该 snapshot；不得硬编码 `PUPU_FEATURE_MEMORY_V2=all`、`PUPU_MEMORY_V2_MODE=all` 或独立 store-owner admission。
  - AC-004 | release mode 的 expected reports 明确包括 Windows installed candidate 证据；source Electron、build-output sidecar、缺报告、空 artifact 和 `executed_tests=0` 均不能使 final aggregator passed。
  - AC-005 | repository/promotion gate 将稳定 aggregator 设为 required，且不存在可以绕过该安全 gate 的 always-bypass actor。
  - AC-006 | 保存能命中当前 revision 的 red-before-green evidence：forced Shadow、win32 pre-spawn rejection、decrypt-before-containment、clean snapshot default-off、hard-coded smoke mode、source-E2E、缺报告 false-green 与 live ruleset bypass；证据中不得出现 secret。
  - AC-007 | PS-001 及 W0 不改变 Windows Active guard、Vault decrypt/containment 顺序、Windows spawn path 或 GitHub ruleset；这些变更必须等待独立 ACTION ruling、closure 和对应 owner handoff。
- **boundary obligations**: BC-001, BC-002, BC-003
- **boundary N/A reason**: NOT_APPLICABLE
- **state sequence obligations**: SEQ-001, SEQ-002, SEQ-003
- **state sequence N/A reason**: NOT_APPLICABLE

### BC-001 | Windows capability plan 到 sidecar containment admission

- **producer**: Memory V2 capability planner emitted intent: `{platform, arch, sink, rollout_mode, candidate_identity, containment_profile}`.
- **producer owner**: code-owner-runtime
- **consumer**: Electron/Windows sidecar launcher and containment supervisor.
- **consumer owner**: code-owner-electron
- **consumer owner status**: PENDING_HANDOFF
- **canonical representation**: versioned, closed Windows capability profile. It must distinguish `off`, `shadow`, `candidate`, and `active`; `active` is inadmissible before an approved support/threat matrix and exact candidate identity.
- **consumer projection**: launcher accepts only a closed profile whose platform/arch/sink/control-channel requirements exactly match the installed candidate. It may create no child process before a reject decision is recorded.
- **admission policy**: CLOSED
- **admission details**: Windows 10/11 x64 is provisional; ARM64 and `computer_input` are disabled. A Job Object permits only cooperative normal-child lifecycle containment; WMI/task/service/parent-spoof escape resistance is not claimed without a successor security ruling.
- **unknown input behavior**: stable `windows_memory_v2_capability_unsupported`; no decrypt, no spawn, no registry/broker registration, and no Active fallback.
- **failure semantics**: retain Shadow/off, write content-free diagnostic receipt, and leave the candidate identity unavailable for promotion.
- **identity/version binding**: pending exact PuPu candidate digest + installed artifact digest; source revision alone is insufficient.
- **producer owner confirmation**: LEAD
- **producer confirmation scope**: framing only; no implementation/readiness evidence is confirmed.
- **consumer owner confirmation**: PENDING_HANDOFF
- **positive acceptance**: AC-001, AC-007
- **negative acceptance**: AC-001, AC-006, AC-007

### BC-002 | Release profile snapshot 到 build/package/install consumers

- **producer**: one deterministic release-profile snapshot generator.
- **producer owner**: code-owner-devtools
- **producer owner status**: PENDING_HANDOFF
- **consumer**: web build, Electron package, sidecar smoke, installed Windows E2E and final report jobs.
- **consumer owner**: code-owner-devtools
- **consumer owner status**: PENDING_HANDOFF
- **canonical representation**: exact bytes of a versioned closed snapshot plus SHA-256, rollout fingerprint, expected platform/mode matrix and producer log. The snapshot is uploaded once and reused without rematerialization.
- **consumer projection**: every consumer reads the exact artifact and independently checks byte digest and fingerprint before it executes its mode-specific test.
- **admission policy**: CLOSED
- **admission details**: no `.local` default, environment-only override or independently generated snapshot is a release input. Missing/malformed/unknown/mismatched input is a release failure.
- **unknown input behavior**: `release_snapshot_invalid` and no package/install promotion.
- **failure semantics**: fail closed before build/package/smoke/E2E; no default-off green and no forced-`all` smoke exception.
- **identity/version binding**: release candidate ID + snapshot SHA-256 + fingerprint + wheel SHA-256 + installed package digest.
- **producer owner confirmation**: PENDING_HANDOFF
- **consumer owner confirmation**: PENDING_HANDOFF
- **positive acceptance**: AC-002, AC-003
- **negative acceptance**: AC-002, AC-003, AC-006

### BC-003 | Mode-aware QA reports 到 final repository/promotion gate

- **producer**: deterministic, package, source-E2E and installed-candidate report producers with `mode`, `platform`, `candidate_identity`, `snapshot_fingerprint`, `executed_tests` and terminal outcome.
- **producer owner**: code-owner-devtools
- **producer owner status**: PENDING_HANDOFF
- **consumer**: Final Release QA aggregator and GitHub `main` ruleset/promotion check.
- **consumer owner**: code-owner-devtools
- **consumer owner status**: PENDING_HANDOFF
- **canonical representation**: a closed expected-report manifest per QA mode; release mode includes each required Windows installed-candidate report and rejects absent, duplicate, unknown or zero-execution reports.
- **consumer projection**: aggregator emits one stable required check only after every expected report matches the same candidate/snapshot identity and all required terminal outcomes pass.
- **admission policy**: CLOSED
- **admission details**: report presence is not inferred from artifact download; `always()` does not permit success after a missing dependent report; ruleset/promotion configuration must require the aggregator and disclose no bypass that escapes it.
- **unknown input behavior**: `release_report_manifest_invalid` or `release_report_missing`; result is failed/incomplete, never passed.
- **failure semantics**: do not promote, upload a content-free report inventory, and preserve failed job identity for retry.
- **identity/version binding**: release candidate ID + snapshot fingerprint + installed package digest + report manifest digest + required-check context.
- **producer owner confirmation**: PENDING_HANDOFF
- **consumer owner confirmation**: PENDING_HANDOFF
- **positive acceptance**: AC-004, AC-005
- **negative acceptance**: AC-004, AC-005, AC-006

### SEQ-001 | Windows containment admission before any secret or child process

- **owner**: code-owner-runtime
- **owner confirmation**: LEAD
- **owner confirmation scope**: framing only; no Active implementation is confirmed.
- **identity key**: `{candidate_identity, platform, arch, sink, request_id}`
- **initial state**: Windows runtime is forced to Shadow/off and has no admitted Active containment profile.
- **ordered events**: capability request -> platform/arch/sink support decision -> exact candidate/profile verification -> containment readiness -> decrypt -> spawn -> control/receipt -> tree drain -> cleanup.
- **expected observations**: unsupported Windows input stops before decrypt/spawn; Shadow never becomes Active; after a future Active admission every spawned child is covered by the declared cooperative containment profile and every secret is withheld until readiness.
- **persistence boundary**: candidate evidence envelope and content-free lifecycle receipt; secret plaintext is never persisted there.
- **boundary contracts**: BC-001
- **positive acceptance**: AC-001, AC-007
- **negative acceptance**: AC-001, AC-006, AC-007
- **first use**: REQUIRED | AC-001
- **repeat**: REQUIRED | AC-001
- **retry**: REQUIRED | AC-007
- **resume**: REQUIRED | AC-007
- **restart**: REQUIRED | AC-007
- **reset**: NOT_APPLICABLE | W0 does not authorize a Windows Active reset path
- **rollback**: REQUIRED | AC-007

### SEQ-002 | One release snapshot through build, package and installed candidate

- **owner**: code-owner-devtools
- **owner status**: PENDING_HANDOFF
- **owner confirmation**: PENDING_HANDOFF
- **identity key**: `{release_candidate_id, snapshot_sha256, snapshot_fingerprint}`
- **initial state**: no release snapshot has been accepted.
- **ordered events**: controlled profile -> one snapshot producer -> upload immutable bytes -> deterministic/package/install consumers download -> each validates identity -> corresponding report emits exact identity -> final merge.
- **expected observations**: every consumer sees byte-identical snapshot and matching fingerprint; missing or divergent input prevents that consumer and the final gate from passing.
- **persistence boundary**: CI artifact storage and report artifacts.
- **boundary contracts**: BC-002, BC-003
- **positive acceptance**: AC-002, AC-003, AC-004
- **negative acceptance**: AC-002, AC-003, AC-004, AC-006
- **first use**: REQUIRED | AC-002
- **repeat**: REQUIRED | AC-003
- **retry**: REQUIRED | AC-002
- **resume**: REQUIRED | AC-004
- **restart**: REQUIRED | AC-004
- **reset**: NOT_APPLICABLE | a release candidate is immutable; reset requires a new candidate identity
- **rollback**: REQUIRED | AC-007

### SEQ-003 | Required report collection and promotion decision

- **owner**: code-owner-devtools
- **owner status**: PENDING_HANDOFF
- **owner confirmation**: PENDING_HANDOFF
- **identity key**: `{release_candidate_id, expected_report_manifest_digest}`
- **initial state**: reports may be absent; repository gate is not yet proven mandatory.
- **ordered events**: mode selects expected report manifest -> each source/package/install producer publishes report -> aggregator validates exact closed set -> stable required context publishes -> ruleset/promotion evaluates context.
- **expected observations**: a missing source-E2E/installed report, `executed_tests=0`, failed report, identity mismatch, missing required context or applicable bypass all yield non-promotion.
- **persistence boundary**: GitHub Actions artifacts/reports and GitHub ruleset/promotion configuration.
- **boundary contracts**: BC-003
- **positive acceptance**: AC-004, AC-005
- **negative acceptance**: AC-004, AC-005, AC-006
- **first use**: REQUIRED | AC-004
- **repeat**: REQUIRED | AC-004
- **retry**: REQUIRED | AC-004
- **resume**: REQUIRED | AC-004
- **restart**: REQUIRED | AC-004
- **reset**: NOT_APPLICABLE | report set is bound to one immutable candidate
- **rollback**: REQUIRED | AC-007

### PS-001 | 2026-08-21T17:20:00-07:00

- **supersedes**: null
- **included contributions/amendments**: roadmap W0-01/W0-02/W0-03/W0-06/W0-09 framing and current repository/ruleset observations; no owner confirmation or stance is inherited.
- **changed blocks**: all initial framing, BC-001..BC-003, SEQ-001..SEQ-003 and AC-001..AC-007.
- **dependent review blocks**: all; material owner confirmations remain pending.
- **content hash**: sha256:8d01059b9000f9dd99baa42ffffd27be65772a0a287777e2d02d1a121bb4dea8
- **boundary object hash**: sha256:a60b1371a6387dea0829f3a6d92b55c10a0c0c4c115307b361f55affecfbde4f
- **governance status**: DRAFT_ONLY | W0 scope/support/evidence skeleton only. BC/SEQ consumer confirmations, immutable revision pair, content hash, RS, PLAN_RULING and CLOSURE are absent. No production action is authorized.
- **formed_by**: code-owner-runtime
