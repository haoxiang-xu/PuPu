# GitHub Actions 整理、发布链闭合与统一命名路线图

> 状态：`PLANNED / INCOMPLETE`
>
> 基线：PuPu `dev@1aa5b14d688c78baf5d99e31506680783dbfa2ce`，
> `main@51cbbc594e094c9a48f4e5af08db7dc15f7f864a`（2026-08-23）
>
> 已有外部证据：Windows Signing Qualification
> [run 32666539645](https://github.com/haoxiang-xu/PuPu/actions/runs/32666539645) `PASS`
>
> 执行原则：后续工作按本文 W1 → W7 顺序推进。完成以精确 artifact、Actions run、
> 安装验收凭据和受保护 Environment 证据为准，不以 YAML 已存在或单个绿色 job 为准。

## 0. 决策摘要

本路线图不推倒当前发布架构。现有的“构建候选 → 安装验收 → Draft → Publish → README”
分层是正确的，整理重点是消除实现漂移、缩小单个 workflow、统一入口语义并让 `main`、
仓库文件和 GitHub Actions 页面三者一致。

冻结以下决定：

1. **先修正式发布路径，再做结构重排。** 独立 Windows 签名资格验收已经通过，但正式
   `release-candidate` 仍使用旧签名顺序；这是 W1 的 P0。
2. **候选构建、安装验收、升级验收、暂存和发布继续分离。** Release 2 同时包含
   fresh-install 与 restart-update（`N-1 → N`）两个矩阵；Stage/Publish 不得重新构建，也不得
   用 mutable checkout 替代 retained candidate bytes。
3. **`windows-active-qualification` 模式退役。** 安装后资格由独立
   `release-qualification.yml` 负责；Windows Active 所需证据应扩展该安装报告，而不是在
   `release-qa.yml` 中维护一个没有 producer 的报告槽。
4. **结构稳定以前不改公共名称和路径。** GitHub required checks、历史 run provenance、
   workflow path allowlist 和 Actions 页面注册都依赖名称或路径；最终统一命名放在 W7。
5. **Windows 签名必须只有一个实现。** 独立 qualification 和正式 candidate 最终调用同一
   本地 composite action/严格脚本；不得继续复制两套 PowerShell 顺序。
6. **所有 release artifact 边界保持 closed/versioned。** 不允许用宽泛 glob、任意 workflow
   path、最新成功 run 或人工重命名文件进入 Stage。
7. **本路线图不自动授权公开发布。** W1–W7 可以构建、签名、保留候选并运行安装验收；
   创建/更新 Draft 或公开 Release 仍按对应阶段和明确用户指令执行。
8. **升级链采用发布前 gate + 发布后 canary。** GitHub Draft 对生产 updater 不可见，因此
   Release 2 使用隔离 qualification feed 验证 exact candidate；Release 4 公开后，再让 exact
   public `N-1` 通过真实 GitHub feed 升级到 `N`。两类证据不得互相冒充。

## 1. 范围与非目标

### 1.1 范围内

- `.github/workflows/` 中由 PuPu 仓库维护的 workflow；
- 与 workflow 强绑定的 `.github/actions/`、`scripts/release-qa/`、artifact schema、报告拓扑、
  GitHub Environment、required checks 和发布文档；
- PuPu → Unchain immutable wheel、GitHub artifact、Azure Artifact Signing、Apple signing /
  notarization、updater metadata/feed、Draft Release 和公开 Release 的边界；
- `electron-updater` 状态机单元测试、三目标 restart-update matrix、升级 receipt 和发布后
  production update canary；
- workflow display name、文件名、job name、输入名称、Actions 页面排序和旧 workflow 退役。

### 1.2 范围外

- GitHub 托管的动态 workflow：Copilot、Copilot code review、Copilot cloud agent、
  Dependency Graph；它们不由仓库 YAML 定义，本路线图不重命名；
- #235 中“让 Tcl/Tk 上游 DLL 本身可 Authenticode 签名”的长期工作；在其完成前保留两条
  精确例外，不能扩大目录或通配符；
- 改变 PuPu 产品功能、Memory V2 rollout policy 或发布版本内容；
- 为 Linux 声明应用内更新支持；当前产品只支持 macOS 与 Windows；
- 自动创建 tag、自动公开 Release 或删除历史 Actions runs/artifacts。

## 2. 当前事实清单

### 2.1 `dev` 中的 8 个仓库 workflow

| 当前文件 | 当前显示名称 | 触发 | 责任 | 持久输出 |
| --- | --- | --- | --- | --- |
| `enforce-merge-source.yml` | Enforce Merge Source | PR → `dev/main` | 限制进入 `main` 的 source branch | 无 |
| `validate-mcp-registry.yml` | Validate MCP Registry | path-filtered PR / `main` push | registry schema 与 validator 测试 | 无 |
| `release-qa.yml` | Release QA | PR、`v*` tag、manual | deterministic、Playwright、package、签名、candidate assembly | 多类 QA/candidate artifacts |
| `windows-signing-qualification.yml` | Windows Signing Qualification | manual confirmation | 非发布 Windows Artifact Signing 资格验收 | 30 天 JSON evidence |
| `release-qualification.yml` | Qualify Installed Release Candidate | manual candidate run + tag | 四平台真实安装包生命周期验收 | 30 天 qualification receipt |
| `release-stage.yml` | Stage Verified Release Candidate | manual run IDs + tag | 验证并上传 exact bytes 到 Draft Release | Draft Release |
| `release-publish.yml` | Publish Verified Draft Release | manual tag + `PUBLISH` | 重验 Draft 并只切换公开状态 | Public Release |
| `update-readme-download-links.yml` | Render README Download Links from Verified Release Manifest | reusable/manual | 重验公开资产并创建 README PR | documentation PR |

`dev` 中上述 YAML 共 1,982 行；其中 `release-qa.yml` 为 958 行，承担了绝大多数复杂度。

### 2.2 `main` 与 GitHub 页面当前不一致

截至基线：

- `origin/main` 只有 `enforce-merge-source.yml`、`release-qa.yml`、
  `update-readme-download-links.yml`、`validate-mcp-registry.yml`；
- `origin/dev` 另有 Stage、Publish、Installed Qualification 和 Windows Signing Qualification；
- GitHub workflow registry 仍显示已经从当前分支树移除的旧 `Release`
  (`.github/workflows/release.yml`，基线 workflow ID `256713399`)；
- Windows qualification 已从 `dev` 成功运行，但 Actions 页面显示文件路径而不是友好名称；
- 新的 Stage/Publish/Installed Qualification 尚未形成 `main` 上稳定、可发现的公共入口。

因此“文件存在于 dev”“GitHub 页面已注册”“main 可安全 dispatch”必须作为三个不同状态记录。

### 2.3 当前 `Release QA` 四种模式

| 模式 | 当前行为 | 结论 |
| --- | --- | --- |
| `lite` | deterministic + Linux Playwright；PR 默认 | 保留，但最终拆成清晰的 PR 入口 |
| `release` | 三平台 Playwright + 四平台 unsigned package | 保留，改为 Diagnostic QA 入口 |
| `release-candidate` | exact tag + immutable Unchain revision + signing + sealed candidate | 保留，改为 Release 1 入口 |
| `windows-active-qualification` | 要求额外 `windows-installed-qualification` report | 退役；当前没有 workflow job 生产该 report |

### 2.4 当前 artifact 生命周期

| Artifact | Producer | Consumer | 当前 retention |
| --- | --- | --- | --- |
| immutable Unchain wheel/evidence | deterministic checks | 四平台 package jobs | repository default |
| Memory V2 build snapshot + digest | deterministic checks | 四平台 package jobs | repository default |
| Playwright evidence | Playwright matrix | 人工诊断 | 14 天 |
| platform package artifacts | package matrix | candidate assembler | 7 天 |
| `pupu-release-candidate` | candidate assembler | installed qualification / stage | 30 天 |
| `pupu-release-qualification` | installed qualification | stage / publish verification | 30 天 |
| `windows-signing-qualification` | standalone Windows qualification | 人工/工程验收 | 30 天，仅 JSON |
| Draft/Public Release assets | stage / publish | 用户与 README renderer | Release 生命周期 |

## 3. 当前与目标发布拓扑

### 3.1 必须保留的发布链

```text
exact PuPu tag + exact Unchain revision
                  │
                  ▼
Release 1 · Build Signed Candidate
  ├─ immutable Unchain wheel + runtime manifest
  ├─ immutable Memory V2 build snapshot
  ├─ macOS arm64/x64 signed + notarized packages
  ├─ Windows x64 Azure-signed package
  ├─ Linux x64 packages
  └─ sealed manifest/report/candidate run identity
                  │ exact retained bytes
                  ▼
Release 2 · Qualify Installed Candidate
  ├─ fresh install: macOS arm64/x64 + Windows x64 + Linux x64
  ├─ restart update: macOS arm64/x64 + Windows x64 (`N-1 → N`)
  └─ exact candidate + lifecycle + persistence reports
                  │ strict receipt
                  ▼
Release 3 · Stage Draft
  └─ verify run provenance, tag, commit, manifest and every byte
                  │ re-download and verify
                  ▼
Release 4 · Publish
  ├─ no rebuild, no upload; only draft=false
  └─ post-publish production update canary (`N-1 public → N public`)
                  │
                  ▼
Release 5 · Update Download Links
  └─ re-download public bytes, verify, open documentation PR
```

### 3.2 独立资格入口

`Qualification · Windows Signing` 保持非发布性质，用于：

- 新 Azure account/profile/identity credential 的首次验证；
- Windows signing action、Electron Builder 或 payload 内容变化后的快速回归；
- 正式候选尚受 macOS credential 阻断时，独立证明 Windows producer → signer → verifier；
- 输出证据而不上传可分发安装包。

它不能替代 Release 1 的 exact candidate，也不能替代 Release 2 的 installed candidate。

### 3.3 Restart-update 两层模型

“构建 `N` 后直接安装并启动”只证明 fresh-install；它不能证明已安装的 `N-1` 能发现、下载、
安装并重启到 `N`。正式升级验收固定分成两层：

1. **发布前 Release 2 gate**：在隔离、临时的 qualification feed 上，用显式 `from_tag` 的
   signed `N-1` fixture 消费 Release 1 的 exact `N` metadata/payload。fixture 只允许 feed
   configuration 与 public `N-1` 不同；差异、fixture digest 和 signer identity 必须进入报告，
   fixture 不得上传到 Draft/Public Release。
2. **发布后 Release 4 canary**：从 GitHub 下载未修改的 exact public `N-1`，通过 PuPu 当前
   GitHub production feed 发现刚公开的 `N`。这是唯一能证明真实生产 discovery path 的证据；
   因发生在 `draft=false` 之后，失败时结论为发布事故 `NO-GO`，不得自动删除或改写 Release。

Release 2 的 strict receipt 是 Stage 的前置 gate；Release 4 canary 不是首次 Publish 的前置条件，
但必须是版本收尾与路线图 `COMPLETE` 的前置条件。`from_tag` 必须由 dispatch 显式给出并验证
`from_version < candidate_version`，禁止从“latest”、最近成功 run 或 mutable branch 推断。

## 4. 跨边界契约

本计划适用 `.claude/rules/cross-boundary-contract-gate.md`。所有未完成 AC 均使对应 rollout
保持 `INCOMPLETE`；签名失败、identity 漂移或 artifact mismatch 为 `NO-GO`。

### 4.1 Boundary contracts

| ID | Producer → consumer | Policy 与 canonical identity | Failure / admission |
| --- | --- | --- | --- |
| `BC-ACT-001` | dispatch/tag → source checkout | `CLOSED`。PuPu `vX.Y.Z`、tag commit、package version、candidate run SHA 必须一致；Unchain 使用 full 40-character revision。 | branch、mutable ref、版本或 SHA 漂移在构建前拒绝。 |
| `BC-ACT-002` | deterministic job → package jobs | `VERSIONED + CLOSED`。同一 wheel bytes/evidence/runtime manifest 与同一 build snapshot bytes/digest 被所有平台下载复用。 | 任一平台重建 wheel、使用 sibling source、digest 不同或 snapshot 缺失即失败。 |
| `BC-ACT-003` | Windows unpacked payload → Azure signing → NSIS | `CLOSED`。精确 `.exe/.dll` catalogue；`elevate.exe` 在 catalogue 前注入；两条 Tcl/Tk 例外按完整相对路径和 SHA 记录；installer 与全部 signable payload 必须 `Valid`。由于 Authenticode 会改变 installer bytes，签名后必须重建 `.blockmap` 并刷新 exact `latest.yml` 的 SHA-512/size。 | 多/少一个例外、只读文件、catalogue 漂移、helper 被重写、签名无效或 signer identity 缺失，或签名后 metadata/blockmap 未刷新即失败。 |
| `BC-ACT-004` | package matrix → candidate assembler | `VERSIONED + CLOSED`。四个目标槽、canonical filenames、bytes、SHA-256、签名后 updater SHA-512、QA report、tag/commit/run ID 进入 sealed manifest。 | missing/extra/renamed/byte-changed asset、错误 updater metadata 或零测试报告即失败。 |
| `BC-ACT-005` | sealed candidate → installed qualification | `VERSIONED + CLOSED`。每个 target 只消费 manifest 内 exact installer；报告绑定 manifest digest、package form、renderer、sidecar、shutdown 和 cleanup evidence。 | 不是 retained bytes、错误安装形式、identity 漂移、零测试或生命周期不完整即失败。 |
| `BC-ACT-006` | candidate + qualification → Draft Release | `CLOSED`。candidate run、qualification run、workflow path、tag commit、manifest digest 和所有 bytes 必须互相绑定。 | “latest run”、任意 workflow path、混合两个 candidate、缺 receipt 或 Draft 回下载漂移即失败。 |
| `BC-ACT-007` | Draft → public Release → README PR | `CLOSED`。Publish 只能切换 Draft 状态；README 只从重新下载并验证的 public manifest 渲染。 | Publish 中出现 build/upload、public asset 漂移或 README 猜测版本/文件名即失败。 |
| `BC-ACT-008` | workflow rename → provenance verifier / required checks | `VERSIONED + CLOSED`。候选记录唯一 top-level producer workflow identity；旧/新路径过渡使用显式有限集合或 schema version，不接受任意 path。 | rename 后历史 candidate 被误接受、required check 出现空窗或旧 workflow 仍可写 Release 即失败。 |
| `BC-ACT-009` | Release 1 metadata/payload → qualification feed → signed `N-1` updater | `VERSIONED + CLOSED`。按 target 绑定 candidate manifest digest、metadata filename/hash、payload filename/SHA-512、`from_tag`、fixture digest/signer 和 feed contract version；feed 只监听 runner-local/隔离地址。 | 任一 metadata/payload 混批、未知 key/schema、错误 target/arch/version、非 exact candidate、任意外部 URL 或 fixture 差异未登记即失败。 |
| `BC-ACT-010` | `N-1` userData/update cache → installed `N` → upgrade report | `CLOSED`。隔离 userData 内建立非敏感 sentinel；报告绑定 target、from/to version、candidate digest、事件序列、最终 binary signature、sidecar/runtime identity 和 sentinel digest。 | 未重启、版本未变化、签名/sidecar/Memory snapshot 漂移、用户状态丢失、残留旧进程或报告缺字段即失败。 |
| `BC-ACT-011` | public GitHub Release `N` → exact public `N-1` updater → production canary | `VERSIONED + CLOSED`。只接受 manifest 中已公开的 metadata/assets 和未修改 public `N-1`；记录 Release URL、asset IDs/hashes、from/to tags、runner target 和最终签名。 | Draft/prerelease 被当 stable、资产回下载漂移、非 public `N-1`、错误 channel/arch 或 updater 未发现 `N` 即 `NO-GO`。 |

### 4.2 Stateful sequences

| ID | 顺序 | 必须观察的结果 |
| --- | --- | --- |
| `SEQ-ACT-001` | PR opened → synchronize/retry → required checks | 新提交取消或取代同 PR 的旧 diagnostic run；结果只绑定当前 head SHA，旧 artifact 不参与合并。 |
| `SEQ-ACT-002` | tag → candidate → qualification → stage → publish → README | 每一步绑定同一 tag commit 和 selected candidate identity；Stage/Publish 不重建。 |
| `SEQ-ACT-003` | candidate failure/rerun → new run ID → selected promotion | 重跑可产生新 candidate identity；Stage 只能使用显式选中的 successful run，不混合旧报告或平台 artifact。 |
| `SEQ-ACT-004` | partial Stage → retry | Draft 可以幂等验证/更新，但失败 Draft 不得 Publish；重跑后必须再次下载并校验 exact inventory。 |
| `SEQ-ACT-005` | old workflow → parallel new workflow → required-check switch → old workflow disable | 新入口先在相同 revision 产出等价 evidence，再切 branch protection；历史 run 保留，旧写权限入口最后禁用。 |
| `SEQ-ACT-006` | signed `N-1` fixture installed → sentinel persisted → app cold start → check → download → downloaded → user restart/install → relaunch `N` | 逐步观察 updater stage、PID/exit/relaunch、精确 `N` resource identity、签名、sidecar 和 sentinel；Windows 以继承的隔离 `APPDATA` 保留 userData，不能依赖 NSIS 会丢弃的任意启动参数。三个 supported target 各自产生严格报告。`no_update` 由 `SEQ-ACT-008` 证明。 |
| `SEQ-ACT-007` | update download interrupted/error → same identity retry → downloaded → restart | 首次失败不能生成 complete report；重试不得换 candidate/from_tag，缓存 payload 仍须按 metadata 重验；恢复成功与失败原因都进入报告。 |
| `SEQ-ACT-008` | Publish `N` → install exact public `N-1` → production discovery/download/install/relaunch → second check | canary 必须通过真实 GitHub provider，并以 `no_update` 结束；成功关闭生产升级链，失败标记 release `NO-GO` 并保留现场，不自动 unpublish。 |

#### 4.2.1 Restart-update 状态矩阵

| Sequence | Identity key / initial state | Repeat、retry、restart | Persistence boundary | 关联 contract / AC |
| --- | --- | --- | --- | --- |
| `SEQ-ACT-006` | `target + from_tag + candidate_manifest_digest`；干净安装 `N-1`、空 updater cache | 第一次检查必须下载；安装重启到 exact N；重复点击 install 不得启动第二安装器 | app `userData`、updater cache、安装目录、Memory snapshot/runtime manifest | `BC-ACT-009/010`；`AC-ACT-011`、`AC-W2-006..011` |
| `SEQ-ACT-007` | 与首次尝试完全相同的 identity；在下载中断/metadata 错误状态开始 | retry 可恢复但不可换 bytes；reset 必须清除隔离 cache；错误 metadata/payload 必须 fail closed | updater cache 与 qualification report journal | `BC-ACT-009/010`；`AC-W2-009/010` |
| `SEQ-ACT-008` | `public from_tag + public to_tag + release asset IDs`；exact public `N-1` | canary 可用同一 identity 重试并记录 attempt；不得用 staging fixture 替代 | public GitHub Release、真实 app userData、安装目录 | `BC-ACT-011`；`AC-ACT-012` |

Memory/message interaction 基线在本计划中为 `N/A`：升级验收不发起模型消息或 provider interaction；
它通过既有非敏感状态/sentinel 验证持久化边界。若实施时加入真实聊天操作，则 normal/graph/retry/
sidecar cold-restart 的适用单元格必须在 W2 plan 中补为 `PENDING` 并取得证据，不能继续标记 `N/A`。

### 4.3 全局 acceptance criteria

| ID | Acceptance | 证据 |
| --- | --- | --- |
| `AC-ACT-001` | 所有 YAML unique-key parse、release QA 单元测试和 `git diff --check` 通过。 | local test log |
| `AC-ACT-002` | standalone Windows qualification 对 36 个 signable payload 文件和 1 个 installer 验签通过，两条例外精确。 | successful run + JSON artifact |
| `AC-ACT-003` | 正式 Release 1 Windows job 使用同一实现并进入 sealed candidate。 | candidate run + manifest |
| `AC-ACT-004` | 四平台 candidate slots、报告拓扑、文件名和 updater metadata 全部严格闭合。 | `pupu-release-candidate` verifier |
| `AC-ACT-005` | 四个 fresh-install target 与三个 restart-update target 全通过，生成唯一 strict qualification receipt。 | Release 2 run |
| `AC-ACT-006` | Stage 下载、上传、再下载后 bytes 和 manifest 不变。 | Release 3 run / Draft evidence |
| `AC-ACT-007` | Publish workflow 中无 build/upload，public bytes 复验通过并创建 README PR。 | Release 4/5 run |
| `AC-ACT-008` | `main`、仓库文件和 Actions registry 的公共入口一致，旧 `Release` 不再 active。 | `git ls-tree` + `gh workflow list` |
| `AC-ACT-009` | required checks 在命名迁移前后无空窗，所有新 check 至少在 `main` 上成功一次。 | branch protection + runs |
| `AC-ACT-010` | Actions runtime 弃用警告清零；并发、最小权限和 retention policy 有静态测试。 | run annotations + workflow tests |
| `AC-ACT-011` | Release 2 在 macOS arm64/x64、Windows x64 完成 signed `N-1 → exact N`，并证明重启、版本、签名、sidecar、Memory snapshot 和状态保留。 | three-target upgrade reports + strict receipt |
| `AC-ACT-012` | Publish 后 exact public `N-1` 通过真实 GitHub feed 升级到 public `N`，随后第二次检查为 `no_update`；canary 绑定 public asset IDs/hashes。 | Release 4 production canary artifact |

## 5. 七个实施工作流

## W1 — P0：同步正式 Windows candidate 签名链

状态：`IMPLEMENTED / REAL CANDIDATE RUN PENDING`，standalone qualification 已 `PASS`。

### 目标

将已经在 `windows-signing-qualification.yml` 实证通过的顺序同步到
`release-qa.yml` 的正式 `release-candidate/windows` 分支。

### 必须实施

1. Electron Builder 先向 exact unpacked payload 注入 `resources/elevate.exe`；
2. 注入后再枚举 `.exe/.dll`，建立 exact signing catalogue；
3. 两条 unsigned exception 只能是：
   - `resources\mcp_runtime\python\DLLs\tcl86t.dll`
   - `resources\mcp_runtime\python\DLLs\tk86t.dll`
4. 例外集合必须 exact-match，缺失、增加或路径变化都失败；
5. 所有 signable 文件先清除 read-only，并验证没有残留 read-only；
6. Azure action 使用 `files-catalog`，不使用递归 `files-folder`；
7. 最终 repackage 设置 `packElevateHelper=false`，防止覆盖已签 helper；
8. installer 签名后，对 payload + installer 做全量 Authenticode `Valid` 验证；
9. candidate report 中保存 signable count、例外 path/hash/reason、signer subject/thumbprint 和 installer hash；
10. 新增 parity guard，确保 qualification 与 candidate 的核心顺序不能再次漂移。

W1 先做最小同步，不在同一变更里拆分 958 行 orchestrator。

### W1 acceptance

- `AC-W1-001`：现有 standalone run 32666539645 继续作为 red-before-green 后的 Windows 基线；
- `AC-W1-002`：静态测试证明 helper injection < catalogue < payload signing < repackage；
- `AC-W1-003`：candidate 路径不再包含 `files-folder`，且有 exact exception guard；
- `AC-W1-004`：人为恢复旧 repackage 或扩大例外时，测试必须 red；
- `AC-W1-005`：`BC-ACT-003` 的正式 candidate producer 与 strict verifier 使用实际产物。

### 当前实施证据（2026-08-23）

- formal candidate 已实现 helper → exact catalogue → Azure payload signing → no-overwrite
  repackage → installer signing → full verification；
- `windows-signing-evidence.v1.json` 与 candidate run、tag commit、version、installer SHA-256、
  helper、例外集合及 signer identity 严格绑定，并随 sealed candidate、Draft/Public Release 重验；
- local release-QA unit tests 通过；GitHub 上的首次完整 `release-candidate` run 仍是 W1 最后缺少的
  外部证据，未通过前本路线图整体保持 `INCOMPLETE`。

### 回滚

只回滚 W1 workflow commit；不删除 Azure account/profile，不修改已上传证据，不运行 Publish。

## W2 — 正式 candidate 与安装链验收

状态：`IN_PROGRESS`。

### 目标

证明 W1 不只在专项 qualification 中成立，而是在完整 Release 1 candidate 中与 macOS、Linux、
immutable Unchain wheel、snapshot 和 candidate assembler 一起闭合；同时证明用户不是只能全新安装，
而是可以从 signed `N-1` 下载 exact candidate、重启安装到 `N` 并保留持久状态。

### 当前实施证据（2026-08-23）

- 已新增 `pupu.restart-update-qualification.v1` 的 strict report validator：它 closed-bind
  candidate manifest、stable `from_tag < to_tag`、runner-loopback qualification feed、exact metadata/
  payload hashes、fixture signer、restart event sequence、final installed identity 和 sentinel bytes；
- validator 的正向与 fixture/feed/sequence/unknown-field 负向测试已通过；
- updater state machine 已补齐 packaged Windows 状态转移、error recovery、persisted preference、重复
  check 和重复 install 防护的 Electron tests；
- qualification feed builder 已验证 sealed candidate 后，只复制一个 target 的 exact metadata、payload 和
  blockmap，并以 versioned manifest 重新验证 inventory 与 bytes；runner-local server 只绑定
  `127.0.0.1`，不提供目录列举、外部 redirect 或任意文件读取，并写出 readiness 与脱敏 request log；
- fixture build-config generator 已锁定唯一允许的 source config 差异：将既有 GitHub updater provider
  换为一个 exact `http://127.0.0.1:<port>/` generic provider，其他 Electron Builder setting 保持 byte-for-byte
  等价；该 config 必须在 package/sign 前生成，禁止事后修改已签名包；
- fixture package validator 已要求生成后的 `app-update.yml` 仅含 generic provider、exact runner-loopback
  URL 和既有 `pupu-updater` cache identity；生产 GitHub provider、URL drift、channel 或未知 key 均拒绝；
- Release 2 dispatch 的 `from_tag` 已是 required input；preflight 只接受存在的 stable tag、其 tag 内
  `package.json` version 与 tag 一致、lower-than candidate，且记录该 tag 的 full immutable commit；
- `pupu.release-update-qualification.v1` receipt builder 已要求四个 fresh-install 与三个
  restart-update report 同时齐全，并要求每个 restart report 绑定 dispatch 的同一 `from_tag/version/commit`；
  Release 2 现已下载两类报告并只生成该 complete receipt。Stage、Publish 与 README 重新验证均要求
  complete schema，fresh-only receipt 不能再被 promotion 接受；
- 已新增 fixture evidence contract：它把实际 fixture installer 的 SHA-256、显式 `from_tag/version/commit`、
  target、signer identity 和唯一 `app-update.yml` 差异绑定为单一 versioned document；fixture bytes 一旦变化即拒绝；
- 已新增 restart-update lifecycle runner：它先独立安装 exact `N` 取得最终 identity，再安装 signed `N-1`，
  读取已签名包中的 loopback `app-update.yml`，写入真实 userData settings sentinel，并经应用自己的
  `appUpdateAPI` 发起 check/download/restart-to-install；它要求 duplicate check/install 被 product state
  machine 拒绝、旧 PID tree 退出、NSIS 自动启动的 `N` root + bundled Sidecar 出现、final `N` 的 exact
  resource/snapshot hashes 与 independently installed candidate 相同，以及 sentinel bytes 不变。Windows 初始
  fixture 使用隔离 `APPDATA/LOCALAPPDATA`，所以 N 与 N-1 共享 durable userData；重启后不依赖已丢失的
  remote-debugging 参数；
- qualification feed server 现在可以使用 fixture build 前已固定的 loopback port，避免对已签名 fixture
  进行事后配置写入；runner 将 feed server log 与 restart report 分别保留；
- Windows restart-update 已接入 Release 2：它从 `from_tag` 的 published manifest 解析 immutable Unchain
  revision，checkout exact source，构建只含 loopback `app-update.yml` 差异的 N-1 payload，经共享 Azure
  Artifact Signing action签名并作为 fixture 运行；它只上传 fixture/signing/feed/restart evidence，不上传
  fixture package、不 Stage、不 Publish。其失败会令 Release 2 workflow 失败；
- Linux x64 已按现有产品边界收尾：公开资产严格为 `AppImage + deb`，两种 retained candidate bytes 都在
  `ubuntu-latest + xvfb` 上执行 renderer、bundled Sidecar、controlled shutdown 与 process cleanup；Linux
  没有 updater channel，`build.linux.publish=null`，应用在调用 provider 或创建 startup timer 前即拒绝
  in-app update。Linux 因此不进入三目标 restart-update receipt，也不以伪造 `latest-linux.yml` 冒充
  已支持的自动升级。该闭包复用 `BC-ACT-004/005`；历史自动升级序列为 `N/A`，因为生产入口在 provider、
  cache 与安装器边界之前 fail-closed。`AC-LNX-001..004` 分别要求 exact 两资产合同、双形式 installed
  lifecycle、无 Linux updater metadata，以及平台门不触发 provider/timer；真实 hosted-runner 报告仍须由
  首次 Release 1/2 Actions run 提供；
- macOS arm64/x64 仍待 Apple Developer Program enrollment、Developer ID certificate 与 notarization credentials
  完成后接入；complete-update receipt 也必须等三条 restart reports 齐全才替换当前 fresh-install receipt。
  因此当前发布 admission receipt 仍只代表 fresh-install，不能被解释为完整升级验收完成。
- 已核查历史 `v0.1.9` public release：它只含 DMG/EXE/DEB，没有 `release-assets.v1.json`，故不能从
  release evidence 恢复其 immutable Unchain revision。它**不得**作为新 Windows job 的 strict `from_tag`；
  job 会在该缺口 fail-closed，而不是用今日 `dev` 重建并冒充生产 `N-1`。首次可完整通过的 Windows
  restart-update 将以包含 manifest 的新式 public release 为 `from_tag`。

### 前置条件

- W1 local/parity tests 全绿；
- exact PuPu `vX.Y.Z` tag 与 `package.json` version 一致；
- dispatch 显式提供已存在的稳定 `from_tag`，并验证 `from_version < candidate_version`；
- full immutable Unchain commit；
- `release-signing` Environment reviewer protection；
- Azure credential/profile 可用；
- macOS signing/notarization credential 可用。Apple enrollment 未完成时，本阶段只能保持
  `INCOMPLETE`，不能用 Windows-only qualification 冒充完整 candidate；
- updater 状态机的 `.js`/`.cjs` 单元测试覆盖 packaged/platform gate、默认与禁用 preference、
  checking/downloading/downloaded/error、只允许 downloaded 后 install，以及重复 check/install 防护；
- qualification feed 方案通过安全审计：只允许 runner-local/隔离 endpoint，不在 production build
  暴露任意 feed override，不记录 secret，不接受外部重定向。

### W2 已决设计：exact `N` 的第二次 `no_update`

已确认存在一个非实现性约束：signed `N-1` fixture 可以在 signing 前把自己的 `app-update.yml` 绑定到
runner-loopback feed，并升级到 sealed exact `N`；但 exact `N` 保留正式 GitHub provider。因为 Draft
Release 不对 production updater 可见，`N` 重启后无法在 Release 2 阶段通过同一 local feed 诚实地产生
第二次 `no_update`。不得通过修改 N、hosts/DNS/HTTPS interception 或伪造 event 来绕过。

**决定（2026-08-23）：方案 1。** Release 2 保持 exact N、无 production override，证明发现、下载、
安装、旧进程退出、exact N 重启、签名/sidecar/sentinel；第二次真实 `no_update` 只在 Release 4 的 public
GitHub canary 中验证。`AC-W2-011` 仅保留清理/重复安装器断言，`no_update` 转入 `AC-ACT-012`。

已拒绝方案 2：不向 production binary 添加 qualification feed override，不论其是否仅允许 loopback。

### 执行

1. 对 exact tag dispatch `release-candidate`；
2. 审批 `release-signing`；
3. 验证四平台 package、three-OS Playwright、sidecar smoke、native signing；
4. 下载 `pupu-release-candidate`，独立执行 candidate verifier；
5. dispatch Release 2 installed qualification，并显式传入 candidate run ID、tag 与 `from_tag`；
6. 运行 fresh-install matrix：macOS arm64/x64、Windows x64、Linux x64 从 retained candidate 安装，
   验证 renderer、sidecar、runtime identity、shutdown 和 cleanup；
7. 为 macOS arm64/x64、Windows x64建立短生命周期 qualification feed：
   - feed 只服务 Release 1 manifest 中的 exact `N` metadata、payload 和 blockmap；
   - signed `N-1` fixture 由 exact `from_tag` 派生，只允许 feed configuration 发生已登记差异；
   - Windows/macOS fixture 与 `N` candidate 的签名 identity 必须分别验证；
   - fixture、feed inventory 和 server log 只作为资格证据保留，不进入 Release assets；
8. 在隔离安装和 userData 中执行 restart-update matrix：
   - 安装并冷启动 `N-1`，写入非敏感 settings/Memory sentinel；
   - 观察 `checking → downloading → downloaded`，并核对进度和 `latestVersion=N`；
   - 通过真实产品入口触发 “Restart to install”，观察旧 PID 退出和 `N` 自动重启；
   - 验证 `app.getVersion()=N`、native signature、renderer、sidecar、runtime manifest、Memory
     snapshot 和 sentinel；
   - 验证没有旧进程、第二安装器或未清理测试状态；第二次 `no_update` 由 Release 4 public canary 验收；
9. 至少运行一次 fail-closed 负向用例：篡改 metadata/payload、错误 target/arch 或错误 candidate
   identity 必须在安装前失败；下载中断/retry 使用相同 identity，不能暗中换 bytes；
10. strict receipt 只有在四个 fresh-install reports 和三个 restart-update reports 全部通过且绑定
    同一 candidate manifest digest 后才生成；
11. 本阶段不 Stage、不 Publish。首次 public 后由 Release 4 运行 `SEQ-ACT-008` production canary。

### W2 acceptance

- `AC-W2-001`：`AC-ACT-003/004` PASS；
- `AC-W2-002`：Windows installer 和 candidate manifest 内 hash 相同，`elevate.exe` signer 有证据；
- `AC-W2-003`：Release 2 Windows runner 从 retained candidate 安装并完成 renderer/sidecar/quit/cleanup；
- `AC-W2-004`：唯一 strict receipt 同时包含四个 fresh-install target 与三个 restart-update target，
  满足 `AC-ACT-005`；
- `AC-W2-005`：任何 fresh-install 或 restart-update target 失败时不生成可 Stage 的 complete receipt；
- `AC-W2-006`：三个 supported target 都从显式 signed `from_tag` 经 restart-update 到 exact `N`；
- `AC-W2-007`：三个 target 都观察到一次退出/安装/重启，最终版本、签名和 candidate manifest 一致；
- `AC-W2-008`：settings/Memory sentinel 在升级后保留或完成受支持 migration；升级后的 snapshot
  digest、Unchain wheel 和 runtime manifest 必须匹配 exact `N` candidate；
- `AC-W2-009`：metadata/payload/target/identity 的负向测试在正确边界 fail closed；
- `AC-W2-010`：下载失败或中断不产生 complete receipt；相同 identity retry 成功后记录 attempt，
  不复用未验证 cache；
- `AC-W2-011`：升级后没有旧进程、重复 installer 或未清理测试状态；
- `AC-W2-012`：qualification feed/fixture 与 production `N-1` 的差异是 closed、可复核的集合，
  且这些测试专用 bytes 未进入 Draft/Public Release；
- `AC-W2-013`：receipt validator 对缺少任一 upgrade target、未知字段、错 schema、错 `from_tag`、
  错 candidate digest 或混合 attempts 的 fixture 必须失败。

### W2 发布后补充验收

Release 4 将 Draft 切为 public 后立即启动 production canary：下载 exact public `from_tag` 安装包，
不修改其 `app-update.yml`，通过真实 GitHub feed 升级到 `N`，随后第二次检查必须为 `no_update`。成功证据
绑定 Release URL、asset ID、asset hash 和最终签名；失败时保留 app/updater/installer logs，标记该 release `NO-GO` 并停止 Release 5，
但不自动 unpublish、删除资产或回退用户数据。

### 回滚与清理

- Release 2 失败只作废 qualification run/receipt，不修改 immutable candidate；
- 每个 runner 使用独立安装目录、userData、updater cache 和 feed namespace，结束后按 allowlist 清理；
- qualification feed 必须随 job 结束关闭，禁止留下公开 endpoint；
- production canary 失败的恢复动作另行明确授权；自动化只能阻止 Release 5 并保存证据。

## W3 — 退役重复/未闭合的 mode

状态：`IMPLEMENTED / LOCAL VERIFICATION PASS`。

### 决定

删除 `windows-active-qualification` 作为 `Release QA` mode。其现有 topology 要求
`windows-installed-qualification`，但 workflow 没有对应 producer；独立 Release 2 已经提供更严格的
四平台 installed candidate contract。

### 必须实施

- 从 workflow input options、mode manifest、report topology、tests 和文档移除该 mode；
- Windows Active 所需的产品级断言若仍缺失，加入
  `installed-package-qualification.mjs` 的 `windows-x64` 报告，不另建旁路 report；
- `release` 继续表示 unsigned diagnostic；
- `release-candidate` 继续表示可 Stage 的 signed candidate；
- standalone Windows signing qualification 保留为 credential/signing diagnostic，不进入 Stage receipt；
- 更新 Stage 输入描述，移除硬编码 `#218`，改为稳定的“installed qualification receipt”。

### 当前实施证据（2026-08-23）

- `release-qa.yml` workflow dispatch、closed report topology 与 mode resolver 已移除
  `windows-active-qualification`；旧 dispatch 现在 fail closed；
- 原先无 producer 的 `windows-installed-qualification` report slot 已删除；Windows 安装验收的唯一
  authority 保持为 Release 2 的 `windows-x64` installed/restart reports；
- historical Memory V2 roadmap 保留为过去事实，不反向改写。

### W3 acceptance

- `AC-W3-001`：未知或旧 mode dispatch fail closed；
- `AC-W3-002`：Release 2 缺 Windows report 时 receipt builder 必须失败；
- `AC-W3-003`：没有两条不同路径可以对同一 candidate 声称 installed qualification complete；
- `AC-W3-004`：Memory V2 Windows Active 的证据引用 Release 2 的 exact `windows-x64` report。

## W4 — 缩小 `release-qa.yml`，建立单一实现

状态：`LOCAL IMPLEMENTED / EXTERNAL PENDING`（现有 Release 1/2 workflow 已拆为 Windows signing action 与 shared deterministic、Playwright、package、fresh-install qualification、final-report；真实 restart-update execution 仍是 W2 的功能接线缺口）。

### 目标

在暂时保持公共文件名、display name、trigger 和 mode 不变的前提下，把实现拆到内部 reusable
workflows/composite action；W4 不做最终命名。

### 目标内部组件

| 内部组件 | 责任 | 关键输出 |
| --- | --- | --- |
| `_shared-release-deterministic.yml` | wheel、snapshot、Jest/pytest/contracts/build | immutable artifacts + deterministic report |
| `_shared-release-playwright.yml` | 按输入 OS 运行真实 Electron smoke | platform report + evidence |
| `_shared-release-package.yml` | 单个平台 package、sidecar smoke、native signing | platform package + report |
| `_shared-release-update-qualification.yml` | 当前：四平台 fresh-install qualification；后续：qualification feed、`N-1 → N` 重启升级与 production canary runner | fresh-install evidence；后续 per-target upgrade report |
| `_shared-release-report.yml` | 拓扑合并、candidate assembly | final report / sealed candidate |
| `.github/actions/windows-artifact-signing/action.yml` | helper injection、catalogue、Azure sign、repackage、verify | signed installer + evidence |

### 输入/输出规则

- reusable workflow 只能接收明确 versioned inputs：mode、target ID、tag、commit、Unchain identity、
  artifact names、candidate run ID 与显式 `from_tag`；不得接收任意命令字符串、任意 feed URL 或
  arbitrary artifact glob；
- secrets 只由需要签名的 caller job 显式传入；PR workflow 不获得 signing secrets；
- artifact name 保持 W4 前后相同，避免同时改变 topology 与实现；
- candidate provenance 绑定 top-level caller workflow，不把 reusable callee 误当发布入口；
- Windows qualification 与 formal candidate 调用同一 composite action，但分别决定是否上传 installer。
- restart-update shared workflow 必须区分 `qualification-feed` 与 `production-github` 两种 closed mode；
  production mode 只能由 Release 4 在 public asset 验证后调用。

### 当前实施证据（2026-08-24）

- 新增 `.github/actions/windows-artifact-signing/action.yml`；它是 Azure login、精确 catalogue、
  payload signing、repackage、installer signing、Authenticode 验证与两种既有 evidence schema 的唯一实现；
- `release-qa.yml` 与 `windows-signing-qualification.yml` 保持各自的 trigger、Environment、artifact
  名称和 evidence filename，只向该 action 传入 closed 路径、schema 与 protected caller 的 Azure inputs；
- static tests 检查两个入口各调用一次 action，且 workflow 内不再保留 Azure/Authenticode 第二实现；
  `test:release-qa:unit` 114/114。真实 Windows Artifact Signing run 仍待凭据可用时执行。
- 新增 `_shared-release-package.yml`；顶层 `package-matrix` 保留四个 target、公共 job 名称、依赖与
  artifact/report 名称，但只传递 closed mode、target/platform tuple、Unchain ref、caller ref/SHA/tag；
  shared job 在内部选择 `release-signing` 或 `release-qa` Environment，并在执行前 fail closed 校验
  所有输入，不接受 caller supplied command、runner 或 artifact glob。
- 新增 `_shared-release-deterministic.yml`；顶层 `deterministic-checks` 保留原 job 名、后续 `needs`
  与 artifact 名称，只传递 closed mode、Unchain ref、caller ref/SHA/tag；shared job 在执行前校验 caller
  identity、mode 与 source identity，仍只构建一次 immutable Unchain wheel 与一次 Memory V2 snapshot。
- 新增 `_shared-release-playwright.yml`；顶层 `playwright-electron` 保留原 matrix selector、job 名、
  后续 `needs`、report/evidence 名称与 retention，只传递 closed mode、closed runner selector、caller
  ref/SHA/tag；shared job 只接受 Linux 上的 `lite`，以及 Linux/macOS/Windows 上的 release/candidate，
  并在执行前 fail closed 校验 identity 与 tuple。
- 新增 `_shared-release-update-qualification.yml`；顶层 `installed-package-matrix` 保留四个
  fresh-install target、job 名、后续 receipt 依赖和 evidence 名称，只传递 exact candidate run、tag/
  commit、target 与 closed runner tuple；shared job 重新验证 tag identity 与 retained candidate bytes。
  restart-update 的 feed/fixture/receipt validator 已存在，但真实安装、重启与报告 producer 尚未接入，
  不得将此次 fresh-install shared extraction 当成 upgrade qualification 通过。
- 新增 `_shared-release-report.yml`；顶层 `final-report` 保留原 job 名、`needs`、always 条件、
  candidate/report artifact 名称与 retention，只传递 closed mode、caller ref/SHA/tag、三个上游 job
  result 和严格限定的可选 analysis flag。可选 analyst 的 OpenAI/Anthropic secrets 由 caller
  显式传入，shared workflow 不继承全部 secrets；candidate assembly 仍绑定当前 run ID。
- `test:release-qa:unit` 114/114、七份相关 W4 workflow YAML unique-key parse 和 `git diff --check` 均通过；
  真实 Actions run 尚未执行，不能据此声称 W4 或正式 candidate 已验收完成。

### W4 acceptance

- `AC-W4-001`：同一 commit 的旧结构基线与新结构生成相同 report platform set；
- `AC-W4-002`：artifact name、schema、target IDs 和 retention 不漂移；
- `AC-W4-003`：Windows signing 核心逻辑只存在一个实现，静态测试拒绝第二份复制；
- `AC-W4-004`：PR/fork 上无法读取 release signing secrets；
- `AC-W4-005`：所有 reusable inputs 缺失、未知 target 或错 mode 时 fail closed；
- `AC-W4-006`：任意 feed URL、隐式 previous release、unsupported Linux update target 或混合 candidate
  digest 被 reusable boundary 拒绝。

## W5 — 让 `main`、Actions registry 与保护设置一致

状态：`NOT_STARTED`。

### 目标

把已验收的结构合入默认分支，使手动 release workflow 不再依赖 `dev` 上的隐藏状态。

### 激活顺序

1. 在 `dev` 完成 W1–W4 静态和 real-run 验收；
2. 核对 `release-signing`、`release-qa`、`release-stage`、`release-publish` 四个 Environment；
3. 合入 `main`，确认所有仓库公共入口在 Actions 页面注册；
4. 从 `main` 对非发布入口至少运行一次；
5. 核对 required checks，没有缺失或同名歧义；
6. 在 W7 完成新命名前，保留当前公共入口兼容性。

### W5 acceptance

- `AC-W5-001`：`git ls-tree origin/main .github/workflows` 包含所有当前公共入口；
- `AC-W5-002`：`gh workflow list --all` 的 active 仓库 workflow 与计划一致；
- `AC-W5-003`：四个 release Environment 都有 reviewer protection，preflight PASS；
- `AC-W5-004`：没有 workflow 因只存在 `dev` 而无法从默认分支发现或 dispatch；
- `AC-W5-005`：main activation 不创建 Draft/Public Release。

## W6 — 退役旧 `Release` workflow 与历史 UI 噪声

状态：`NOT_STARTED`。

### 目标

清除 GitHub workflow registry 中已没有对应文件、却仍显示 active 的旧 `Release` 入口，避免误触。

### 必须实施

- 通过 path/ID 核对旧 workflow 确实是 `.github/workflows/release.yml`；
- 核对 branch protection、Environment、README 和文档不再引用旧 check/workflow；
- disable 旧 workflow，而不是删除历史 runs/artifacts；
- 保留历史 release evidence 的可读性；
- 如果 Actions UI 仍缓存名称，记录 GitHub registry 状态，不通过创建同名空 workflow“覆盖”。

### W6 acceptance

- `AC-W6-001`：旧 `Release` 不再 active/dispatchable；
- `AC-W6-002`：历史 runs 仍可查看，已发布 Release bytes 不变；
- `AC-W6-003`：required checks 没有引用已禁用 check；
- `AC-W6-004`：唯一具备 Release 写权限的入口是 Stage、Publish 和 README renderer 的最小步骤。

## W7 — 维护收口与最终统一命名

状态：`NOT_STARTED`。只有 W1–W6 完成后执行公共重命名。

### 7.1 先完成维护项

- 升级产生 Node.js 20 runtime deprecation annotation 的官方 actions，并用真实 run 验证；
- 所有 workflow 显式设置最小权限；`validate-mcp-registry` 不依赖仓库默认 token 权限；
- MCP validator 改为 lockfile-backed deterministic install，避免临时 `npm install --no-save` 漂移；
- 为 PR/diagnostic 增加可取消并发；candidate/stage/publish 使用不可取消、按 tag 隔离的并发；
- 统一 artifact retention 常量/文档：diagnostic 短、candidate/qualification 30 天、Release 长期；
- 统一 step/job 名称，矩阵名称必须显式包含 OS/architecture/签名性质。

建议并发语义：

| 类型 | Group identity | cancel-in-progress |
| --- | --- | --- |
| PR CI | PR number | `true` |
| diagnostic release QA | ref | `true` |
| signed candidate | tag | `false` |
| installed qualification | candidate run ID | `false` |
| stage/publish | release tag | `false` |
| production update canary | public release tag + target | `false` |
| paid Windows signing qualification | ref + commit | `false` |

### 7.2 最终公共名称和文件名

完成结构整理后，公共 Actions sidebar 统一采用“领域 · 动作”命名；正式发布链再加顺序号。

| 当前入口/模式 | 最终显示名称 | 最终文件名 |
| --- | --- | --- |
| Enforce Merge Source | `Policy · Merge Path` | `policy-merge-path.yml` |
| Release QA / `lite` | `CI · Pull Request` | `ci-pull-request.yml` |
| Validate MCP Registry | `CI · MCP Registry` | `ci-mcp-registry.yml` |
| Release QA / `release` | `Release · Diagnostic QA` | `release-diagnostic.yml` |
| Release QA / `release-candidate` | `Release 1 · Build Signed Candidate` | `release-1-build-signed-candidate.yml` |
| Qualify Installed Release Candidate | `Release 2 · Qualify Installed Candidate` | `release-2-qualify-installed-candidate.yml` |
| Stage Verified Release Candidate | `Release 3 · Stage Draft` | `release-3-stage-draft.yml` |
| Publish Verified Draft Release | `Release 4 · Publish` | `release-4-publish.yml` |
| Render README Download Links… | `Release 5 · Update Download Links` | `release-5-update-download-links.yml` |
| Windows Signing Qualification | `Qualification · Windows Signing` | `qualification-windows-signing.yml` |

最终会从 8 个当前文件形成 10 个清晰公共入口，因为原 `Release QA` 的三个语义被拆开；共享实现
仍在 `_shared-*` reusable workflow 和 local composite action 中，不复制业务逻辑。

### 7.3 Job/check 命名规则

- workflow display name：`Domain · Action` 或 `Release N · Action`；
- job display name：`Action · Platform Architecture`，例如 `Package · Windows x64`；
- required check 只绑定明确稳定的 CI job，不绑定 matrix 自动生成的含糊名称；
- confirmation input 使用动作词：`SIGN_WINDOWS_QUALIFICATION`、`PUBLISH`；
- artifact 名称继续使用机器稳定的 lowercase kebab-case，不跟随 UI display name 改动；
- Environment 名称保持 `release-signing`、`release-qa`、`release-stage`、`release-publish`，
  避免同时迁移 secrets/reviewer policy。

### 7.4 安全迁移顺序

1. 新入口以最终名称落地，但旧入口暂时保留为无写权限兼容 wrapper；
2. 在同一 revision 运行旧/新入口，比较 report topology、artifact hashes 和 result；
3. 更新 provenance verifier 的 closed workflow identity；
4. 更新 branch protection required checks；
5. 验证新 check 在 `main` 成功；
6. disable 旧入口；
7. 等待所有仍可 Stage 的旧 candidate 被使用或明确作废后，再删除旧文件；
8. 禁止使用任意 path、basename-only 或“最近一次成功”作为 rename 兼容策略。

### W7 acceptance

- `AC-W7-001`：`AC-ACT-008/009/010` 全部 PASS；
- `AC-W7-002`：Actions sidebar 只显示可理解的公共入口，internal workflow 明确带 `Shared`；
- `AC-W7-003`：旧/新 workflow 并行证据等价，切换 required checks 无空窗；
- `AC-W7-004`：历史 candidate 的接受规则是显式 closed mapping，不扩大 provenance admission；
- `AC-W7-005`：最终 Release 1 → 2 → 3 → 4 → production update canary → 5 至少完成一次真实版本闭环。

## 6. 最终目标目录

```text
.github/
  actions/
    windows-artifact-signing/
      action.yml
  workflows/
    policy-merge-path.yml
    ci-pull-request.yml
    ci-mcp-registry.yml
    release-diagnostic.yml
    release-1-build-signed-candidate.yml
    release-2-qualify-installed-candidate.yml
    release-3-stage-draft.yml
    release-4-publish.yml
    release-5-update-download-links.yml
    qualification-windows-signing.yml
    _shared-release-deterministic.yml
    _shared-release-playwright.yml
    _shared-release-package.yml
    _shared-release-update-qualification.yml
    _shared-release-report.yml
```

内部 shared workflow 不拥有 release write permission；Stage/Publish 的写权限继续只存在于精确 job。

## 7. 验收矩阵

| 阶段 | Local/static | GitHub non-publishing | Protected/mutating | 结论门槛 |
| --- | --- | --- | --- | --- |
| W1 | YAML parse、parity tests、97+ release QA units | Windows qualification | 无 | qualification + candidate static parity |
| W2 | updater state unit、receipt/feed negatives、candidate verifier | Release 1 + Release 2 fresh-install + `N-1 → N` | signing Environment approval | 四个 fresh + 三个 upgrade target PASS |
| W3 | mode/topology negative tests | diagnostic runs | 无 | 单一 installed qualification authority |
| W4 | reusable input/output contract tests | same-SHA old/new comparison | signing approval only where needed | artifact/report equivalence |
| W5 | branch tree/registry audit | main non-publishing dispatch | Environment preflight | main/registry/protection 一致 |
| W6 | reference audit | workflow registry audit | disable old workflow | 无旧可写入口 |
| W7 | naming/provenance/concurrency tests | new entrypoints on main | real release + production update canary only with explicit direction | Release 1→4→canary→5 闭环 |

每轮至少运行：

```text
node --test scripts/release-qa/*.test.mjs
npm run test:release-qa:unit
git diff --check
GitNexus detect-changes against expected scope
```

修改应用或 release verifier symbol 时，仍须在编辑前逐 symbol 运行 GitNexus impact；HIGH/CRITICAL
必须先报告。只修改 YAML/Markdown 且没有索引 symbol 时，记录“no indexed symbol”而不是伪造低风险结论。

## 8. 风险、费用与回滚原则

### 8.1 主要风险

- reusable workflow 的 `github.workflow_ref`/caller identity 被错误用于 provenance；
- rename 导致 Stage 无法验证历史 candidate，或反过来接受任意旧 path；
- required check 名称变化形成合并保护空窗；
- Windows qualification 与 candidate 再次复制并漂移；
- tag push 的 unsigned `release` 与 manual signed candidate 重复消耗 runner；
- macOS/Windows runner、notarization 和 Azure signing 的付费或额度消耗；
- qualification feed 与 production GitHub feed 行为不同，误把 staging 证据当真实用户升级证据；
- updater download/install/relaunch 跨进程且写入安装目录、cache 和 userData，失败可能留下旧进程或
  半完成测试安装；
- GitHub Draft 对 updater 不可见，首次公开前无法取得 exact production discovery 证据；
- GitHub retained artifact 到期后无法再完成 Stage。

### 8.2 费用控制

- PR 默认只跑 Linux lite；
- macOS/Windows matrix 只在 diagnostic/candidate/qualification 显式入口运行；
- restart-update 复用同一 Release 2 run 的 candidate，不为每个 target 重建 `N`；fixture/feed 证据
  使用短 retention，production canary 每个正式版本只运行一次完整矩阵；
- paid signing workflow 不自动由 PR 或 push 触发；
- candidate/stage/publish 不自动 retry；
- 同一失败先读取 log，再决定是否重跑，避免消耗签名次数。

### 8.3 回滚

- workflow/reusable/composite 改动使用普通 Git revert；不得删除历史 run 作为“回滚”；
- Environment、secrets、Azure account/profile 和 Apple credential 不随代码回滚删除；
- 已生成 candidate immutable；有缺陷时作废其 run ID，不能在原 artifact 上覆写；
- Stage partial failure保持 Draft，禁止 Publish；修复后以选定 candidate 重新验证；
- restart-update 失败先销毁隔离安装/userData/feed，再用相同 identity 新 attempt；不得从失败 cache
  拼接成功证据；
- production canary 失败不自动 unpublish、不删除公开资产、不覆盖用户数据；停止 Release 5 并请求
  明确的 release incident 决策；
- naming migration 若失败，先恢复 required checks/旧 wrapper，再回滚新入口；不放宽 provenance。

## 9. 总体完成定义

只有以下全部成立，本路线图才可从 `INCOMPLETE` 改为 `COMPLETE`：

1. W1–W7 的 AC 全部有可定位证据；
2. formal Windows candidate 使用与 qualification 相同的签名实现；
3. 四平台 exact candidate、四个 fresh-install target 与三个 `N-1 → N` restart-update target 完整通过；
4. `main`、Actions registry、required checks、Environment 和文档一致；
5. 旧 `Release` workflow 已禁用，历史证据仍可读；
6. `windows-active-qualification` 不再是无 producer 的公共 mode；
7. 所有公共 workflow 使用最终命名，内部 shared workflow 明确标识；
8. 没有 Node runtime deprecation annotation、隐式高权限或无并发策略的付费入口；
9. 真实版本完成 Release 1 → 2 → 3 → 4 → production update canary → 5，公开资产与候选
   manifest bytes 一致，exact public `N-1` 能通过 GitHub feed 重启升级到 `N`；
10. #235 可继续保持 v0.2.0 后续项，但两条临时例外必须仍是 exact、可审计、不可扩大的集合。

## 10. 执行记录

| 日期 | 工作项 | Revision / run | 状态 | 证据摘要 |
| --- | --- | --- | --- | --- |
| 2026-08-23 | Baseline inventory | `dev@1aa5b14d` / `main@51cbbc59` | PASS | dev 8 个仓库 workflow；main 4 个；旧 Release registry entry 仍 active |
| 2026-08-23 | Standalone Windows signing | run `32666539645` | PASS | 36 signable payload files + installer Valid；两条 exact Tcl/Tk exceptions；含 signed `elevate.exe` |
| 2026-08-23 | Reorganization roadmap | 本文 | PASS | W1–W7、BC/SEQ/AC、最终目录和命名已冻结 |
| 2026-08-23 | Restart-update roadmap expansion | 本文 | PASS | W2 增加四目标 fresh-install、三目标 `N-1 → N`、隔离 feed、strict receipt 与 Release 4 production canary |
| 2026-08-23 | W1 formal Windows parity | local / candidate run pending | IMPLEMENTED / EXTERNAL PENDING | formal candidate 复用 exact signing evidence validator；parity/static tests PASS，尚无 signed macOS candidate run |
| 2026-08-23 | W2 restart-update static boundaries | local / uncommitted | LOCAL PASS / EXTERNAL PENDING | explicit `from_tag`/commit preflight、strict restart report、sealed per-target feed、`127.0.0.1` server、pre-sign fixture config 与 independent complete-update receipt；`test:release-qa:unit` 114/114；尚未产生 signed `N-1` 或真实 restart report |
| 2026-08-23 | W3 mode cleanup | local / uncommitted | LOCAL PASS / EXTERNAL PENDING | Retired mode, its topology, and the Stage workflow’s historical ticket wording removed; requires one main/Actions run after merge. |
| 2026-08-23 | W4 shared Windows signing action | local / uncommitted | LOCAL PASS / EXTERNAL PENDING | Shared composite action now owns Azure login, exact catalogue, payload/installer signing, repackage and Authenticode evidence; both callers preserve their existing public contracts. |
| 2026-08-24 | W4 shared package workflow | local / uncommitted | LOCAL PASS / EXTERNAL PENDING | `package-matrix` delegates four closed platform tuples to `_shared-release-package.yml`; the callee owns Environment selection, fixed package-command mapping, signing and unchanged artifact/report contracts. |
| 2026-08-24 | W4 shared deterministic workflow | local / uncommitted | LOCAL PASS / EXTERNAL PENDING | `deterministic-checks` delegates closed caller/source identity to `_shared-release-deterministic.yml`; immutable wheel, Memory V2 snapshot and report names remain unchanged. |
| 2026-08-24 | W4 shared Playwright workflow | local / uncommitted | LOCAL PASS / EXTERNAL PENDING | `playwright-electron` delegates the existing OS matrix to `_shared-release-playwright.yml`; the callee admits only fixed mode/runner tuples and preserves Playwright report/evidence contracts and retention. |
| 2026-08-24 | W4 shared installed qualification workflow | local / uncommitted | LOCAL PASS / EXTERNAL PENDING | `installed-package-matrix` delegates four closed fresh-install target/runner tuples to `_shared-release-update-qualification.yml`; tag/commit and retained candidate verification remain closed. This is not restart-update execution evidence. |
| 2026-08-24 | W4 shared final report workflow | local / uncommitted | LOCAL PASS / EXTERNAL PENDING | `final-report` delegates topology enforcement and candidate assembly to `_shared-release-report.yml`; upstream result identity and optional analyst secrets are explicit, candidate run identity remains current-run bound. |
| 2026-08-24 | W4 intermittent acceptance | local / uncommitted | LOCAL PASS / EXTERNAL PENDING | 10 workflow YAML + 1 composite action parse PASS；release QA 114/114；updater CJS 2/2；dependency/artifact topology intact；`git diff --check` PASS；GitNexus low risk。No real Actions/package/sign/install run in this checkpoint. |
| 2026-08-24 | W2 Windows restart-update integration | local / uncommitted | LOCAL PASS / EXTERNAL PENDING | Fixture-evidence contract, fixed loopback feed port, and actual `N-1 → N` runner are now called by a protected Windows Release 2 job; its fixture/signing/feed/restart evidence is retained but never published. macOS and the complete three-target update receipt remain pending Apple enrollment. |
| 2026-08-25 | Linux x64 release closeout | local / uncommitted | LOCAL PASS / EXTERNAL PENDING | Linux remains a manual-update target by closed contract: exact AppImage + deb assets, both retained package forms in installed qualification, no updater metadata/provider, and the product gate rejects in-app update before provider/timer use. Dedicated static/runtime contract tests added; first hosted Ubuntu candidate/qualification report remains pending push and Actions execution. |
| 2026-08-25 | W1/W2 promotion-chain repairs | local / uncommitted | LOCAL PASS / EXTERNAL PENDING | `BC-ACT-003/004`: Windows signer now rebuilds blockmap and refreshes `latest.yml` after Authenticode; stale-metadata red/green test passes. `BC-ACT-010/SEQ-ACT-006`: Windows restart runner uses inherited isolated AppData and validates relaunched root/Sidecar/exact identity instead of a lost CDP argument. Release 2 now seals complete fresh + restart receipt; Stage/Publish share per-tag concurrency and reverify both Actions runs. Hosted signed candidate/restart evidence remains pending. |
| — | W5 main activation | — | NOT_STARTED | — |
| — | W6 ghost workflow retirement | — | NOT_STARTED | — |
| — | W7 maintenance + final naming | — | NOT_STARTED | — |

后续每完成一步，都在本表追加 revision、Actions run URL、artifact identity、测试数量和剩余阻断；
不得只把状态改成 DONE 而不记录证据。
