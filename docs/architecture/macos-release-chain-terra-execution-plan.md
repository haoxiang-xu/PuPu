# macOS 签名、公证与完整发布链 Terra 执行计划

> 状态：`PLANNED / READY FOR TERRA / ROLLOUT INCOMPLETE`
>
> 计划基线：PuPu `dev@1e8e10ddf`（2026-08-25），工作树在本计划写入前 clean。
>
> 已有外部基线：Windows Signing Qualification
> [run 32919261743](https://github.com/haoxiang-xu/PuPu/actions/runs/32919261743) `PASS`。
>
> 上位路线图：[`github-actions-reorganization-roadmap.md`](./github-actions-reorganization-roadmap.md)。
>
> 本文是可直接交给 Terra 的零上下文实施计划。它不授权创建/移动 tag、创建 Draft、公开
> Release、删除本机凭据、改变 GitHub Project 字段或关闭 ticket。

## 1. 目标与完成定义

最终目标不是“Mac 能 build”，而是把下列链路逐层闭合：

```text
受保护的 Apple 凭据
  -> macOS arm64/x64 Developer ID 签名 + notarization + staple
  -> 最终 DMG/ZIP/latest-mac.yml 精确字节和严格 evidence
  -> sealed Release 1 candidate
  -> 四平台 fresh-installed qualification
  -> macOS arm64/x64 + Windows x64 的 signed N-1 -> exact N 冷更新
  -> strict Release 2 receipt
  -> Draft Stage -> Publish
  -> exact public N-1 经真实 GitHub feed 升级到 N
  -> 第二次检查 no_update
  -> README/版本收尾
```

本文分为六种里程碑，不能互相冒充：

| 里程碑 | 可下的结论 |
| --- | --- |
| M0 安全备份完成 | 凭据可恢复；还没有证明 CI 可用 |
| M1 standalone Mac qualification | Apple 凭据与双架构签名/公证 producer 可用；不能 Stage |
| M2 formal candidate + fresh install | exact candidate 可安装；还没有证明已有用户可升级 |
| M3 bootstrap baseline | 首个现代 manifest 版本可公开作为未来 N-1；升级链仍 `INCOMPLETE` |
| M4 strict N-1 -> N + production canary | 支持平台真实升级链闭合 |
| M5 Actions 整理收尾 | main、registry、命名、权限、文档和 ticket 一致 |

只有 M4 与 M5 都通过，完整发布链才可以标为 `COMPLETE`。

## 2. 当前事实与阻断

### 2.1 已完成

- Apple Developer Program 已激活，Developer ID Application certificate 已生成；
- `release-signing` 已存在 Apple 的五个 Secret 名称：
  `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID`、
  `APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`；
- `package.json` 已有 arm64/x64 release build，产出 DMG + ZIP；
- `_shared-release-package.yml` 已把上述凭据交给 electron-builder，并做基础
  `codesign`、`stapler`、`spctl` 检查；
- Release 1 已有 `macos-arm64`、`macos-x64` candidate slots；
- fresh-installed matrix 已有两个 Mac target；
- qualification feed、restart report validator 和通用 restart runner 已声明两个 Mac target；
- Windows standalone 签名链已在 exact `dev@1e8e10dd` 上通过。

### 2.2 当前不能声称完成的部分

1. 没有独立的双架构 Mac signing qualification workflow；
2. 正式 candidate 没有持久化、严格绑定最终 DMG/ZIP bytes 的 Mac trust evidence；
3. Release 2 只有 Windows restart producer，缺两个 Mac restart producers；
4. Mac updater relaunch 可能丢失 `--user-data-dir`，当前 sentinel 设计不能据此证明状态保留；
5. `pupu.restart-update-qualification.v1` 没有明确绑定最终 N 的原生签名/公证、
   Unchain wheel 和 runtime-manifest identity；
6. `v0.1.9` 公开 Release 无 `release-assets.v1.json`、updater metadata、Intel Mac asset 和
   immutable Unchain identity，不能作为 strict `from_tag`；
7. 当前 `release-signing` 同时服务 formal release 与 standalone Windows qualification，允许任意 ref、
   admin bypass；共享 package job 又把 `id-token: write` 给了所有平台；
8. 本机 Keychain 目前没有可用 codesigning identity；可恢复私钥仍只在仓库外的受保护临时材料中。

## 3. 角色和授权边界

### 3.1 Terra 可以做

- 修改计划声明范围内的 Markdown、JSON contract、JavaScript、YAML 和测试；
- 在编辑每个已有 function/class/method 前运行 GitNexus impact；
- 运行本地静态、单元、集成测试和 `detect_changes(compare main)`；
- 在用户明确要求后触发**非发布** qualification workflow；
- 读取 Actions run、下载清洗后的 evidence、报告 run ID/hash；
- 在实现 #218/#220 时细化它们的 issue body，但不能改 title、labels、Project status、parent、release
  membership 或关闭 issue。

### 3.2 只由项目 owner 做或明确批准

- 导入/备份 P12、填写或复制 Secret 值；
- GitHub Environment reviewer、branch/tag policy、admin bypass 的最终管理变更；
- 每次 `release-signing` / qualification / stage / publish Environment approval；
- 创建任何稳定 tag；
- 创建或更新 Draft、公开 Release、生产 canary 事故恢复；
- 决定首个现代 baseline tag，以及 0.2.0 的 Windows/Linux ARM64 scope；
- 删除仓库外的私钥、P12、密码或 app-specific password 临时材料；
- commit 和 push。仓库规则要求 Terra 留下 dirty tree 供 owner 审查提交。

### 3.3 Root/Codex 后续验收

每个里程碑由 root 独立检查 diff、测试、run provenance、evidence 和副作用，并给出：

- `PASS`：该里程碑声明的 AC 全部有证据；
- `INCOMPLETE`：实现可能正确，但真实 runner/人工 gate/后续版本证据未完成；
- `NO-GO`：已运行证据失败、schema/identity 漂移、签名错误或 Secret 泄漏。

## 4. 全程安全红线

Terra 必须遵守：

- 不读取、输出、摘要、hash、Base64 编码或记录任何 Secret 值；
- 禁止 `env`、`printenv`、`set -x`、`toJSON(secrets)` 和整 workspace 上传；
- Secret 不能进入 `$GITHUB_WORKSPACE`、cache、artifact、Docker layer、报告或 shell history；
- 不能上传 P12/PFX/PEM private key、Keychain、runner temp、Electron Builder cache 或原始认证 dump；
- qualification 只能 `workflow_dispatch`，不能由 PR/push 自动触发；
- qualification 不创建 tag、Draft、Release，也不上传可供 Stage 使用的 candidate artifact；
- 日志或 artifact 一旦出现 Secret 派生值即停止，轮换 Secret；私钥疑似泄漏则重新发证；
- 任何本机敏感材料清理前再次请求 owner 确认，且不能声称 APFS 上存在可证明的安全覆写。

## 5. 新增跨边界契约

本文补充上位路线图的 `BC-ACT-*`。所有对象采用 exact-key validator；不能用宽松 object、glob、
`toMatchObject` 或同一宽松 helper 互相证明。

### BC-MAC-001 — GitHub Environment -> electron-builder 签名/公证

- Producer：受保护 Environment 中的五个 Apple Secret；
- Consumer：exact SHA、exact target 的 electron-builder build step；
- Canonical representation：只按 Secret name 注入进程环境，不写文件、不进入 evidence；
- Policy：`CLOSED`。当前只允许 `CSC_LINK + CSC_KEY_PASSWORD` 和
  `APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID` 两组完整组合；
- Identity：workflow path、run ID/attempt、head SHA、target ID、package version；
- Failure：缺一项、来自错误 Environment/ref、在非 signing step 可见或被上传即失败；
- AC：`AC-MAC-001/002/003`。

### BC-MAC-002 — signed app -> final DMG/ZIP/latest-mac.yml

- Producer：electron-builder 完成 sign -> notarize -> staple 的 `.app`；
- Consumer：DMG/ZIP packager、updater metadata assembler、strict Mac evidence validator；
- Producer shape：唯一 `.app`、唯一 bundle/version/Team ID/arch、Developer ID leaf certificate；
- Canonical representation：最终 DMG、ZIP、ZIP blockmap、combined `latest-mac.yml` 和
  `pupu.macos-*-signing.v1` evidence；
- Policy：`VERSIONED + CLOSED`；
- Projection：分别从 build app、DMG 内 app、ZIP 内 app 独立读取信任信息，三者必须一致；
- Failure：多/少一个 app、ad-hoc signature、wrong Team/bundle/arch、无 hardened runtime、
  Gatekeeper/staple 失败、最终 bytes/hash/metadata 漂移或未知 evidence key 即失败；
- AC：`AC-MAC-004..008`。

### BC-MAC-003 — Mac evidence -> candidate/Stage/Publish

- Producer：两个正式 candidate package jobs；
- Consumer：candidate assembler、candidate verifier、Stage、Publish、README verifier；
- Canonical representation：固定文件
  `macos-signing-evidence-arm64.v1.json` 和
  `macos-signing-evidence-x64.v1.json`；
- Policy：`VERSIONED + CLOSED`；standalone qualification schema 永远不能被 promotion 接受；
- Identity：candidate run ID、tag/commit/version、target、DMG/ZIP names and hashes、certificate identity；
- Failure：缺任一 evidence、混 run、混 tag、final asset byte drift、schema/class 错误即失败；
- AC：`AC-MAC-009/010`。

### BC-MAC-004 — signed N-1 fixture -> loopback feed -> exact N

- Producer：exact public `from_tag` source + 其 published manifest/Unchain revision；
- Consumer：MacUpdater，经 runner-loopback feed 安装 candidate ZIP；
- Canonical representation：signed/notarized N-1 fixture、唯一允许的 `app-update.yml` 差异、
  exact candidate metadata/ZIP/blockmap、versioned fixture/restart evidence；
- Policy：`VERSIONED + CLOSED`；
- Identity：target + from tag/version/commit + candidate manifest digest + attempt；
- Failure：外部 URL、错误 arch、未签/未公证 fixture、candidate ZIP 漂移、重启后签名/资源/sentinel
  漂移、旧进程残留或 unknown key 即失败；
- AC：`AC-MAC-011..015`。

### BC-BOOT-001 — legacy GitHub Release API -> bootstrap policy projection

- Producer：GitHub Release API 的 open object；
- Consumer：`release-bootstrap-policy.v1` 和 legacy gap validator；
- Policy：API producer `OPEN`，canonical projection `VERSIONED + CLOSED`；
- Projection：只保留 legacy release ID/tag/tag commit/draft/prerelease 和 exact asset
  ID/name/size/SHA-256 inventory；API 新增无关字段忽略，canonical inventory 任何漂移都失败；
- Identity：当前 legacy baseline 为 `v0.1.9` 及其 exact public assets；
- Failure：Release 变 draft/prerelease、资产增删/替换、出现现代 manifest 或 policy digest 漂移即失败；
- AC：`AC-BOOT-001..003`。

### BC-BOOT-002 — four fresh reports -> bootstrap receipt -> promotion

- Producer：首个现代 candidate 的四个 fresh-installed reports；
- Consumer：bootstrap receipt builder、Stage、Publish、README verifier；
- Canonical representation：`pupu.release-bootstrap-qualification.v1`；
- Policy：`VERSIONED + CLOSED`，只能接受 owner 冻结的唯一 baseline tag；
- Restart 语义：`restart_targets=[]` 且 disposition 必须是 `NOT_RUN / legacy-source-not-admissible`，
  绝不能写成 passed；
- Failure：任一 fresh target 缺失/重复、candidate digest 漂移、receipt 用于其他 tag、错误 workflow
  provenance、同 run 冒充 candidate+qualification 或 unknown key 即失败；
- AC：`AC-BOOT-004..008`。

## 6. 状态序列

### SEQ-MAC-001 — 双架构签名/公证

```text
exact SHA + target
  -> preflight credential names/policy
  -> build app
  -> Developer ID sign
  -> notarize Accepted
  -> staple app
  -> package DMG/ZIP
  -> hash final bytes and validate latest-mac references
  -> independently inspect app in build/DMG/ZIP
  -> write sanitized evidence
```

Retry 必须使用同一 SHA/target 产生新的 run attempt；失败 attempt 不得与成功 attempt 混合。

### SEQ-MAC-002 — N-1 -> N restart update

```text
install signed/notarized N-1 fixture
  -> use default userData under isolated HOME
  -> persist non-sensitive sentinel
  -> checking -> downloading -> downloaded
  -> duplicate check/install rejected
  -> restart-to-install
  -> old process tree exits
  -> automatic N relaunch
  -> exact candidate resources + native trust + Sidecar
  -> exact sentinel retained
  -> controlled shutdown and cleanup
```

Mac 不得依赖 updater relaunch 保留 `--user-data-dir`。实现应在隔离 `HOME` 下使用真实默认路径
`$HOME/Library/Application Support/PuPu`，并写单元测试证明 Darwin launch args 不含
`--user-data-dir`。若 hosted relaunch 不继承预期 HOME，结论是 `NO-GO`，应修正真实边界，不能伪造 sentinel。

### SEQ-MAC-003 — error/retry/cleanup

- metadata、payload、签名或下载错误不能产生 complete report；
- retry 必须保持相同 `target + from identity + candidate digest`；
- cache 中 payload 在重用前重新按 metadata 验证；
- 每个 attempt 使用独立安装、userData、cache 和 feed namespace；
- job 结束关闭 feed，并按 explicit allowlist 清理测试目录，不执行 broad recursive delete。

### SEQ-BOOT-001 — 首个现代 baseline

```text
legacy v0.1.9 gap projection
  -> exact first-modern tag B candidate
  -> four fresh targets
  -> bootstrap-only receipt
  -> owner Stage approval
  -> Draft byte re-verification
  -> owner Publish approval
  -> public baseline B
```

状态只能是 `BOOTSTRAP_BASELINE_PUBLISHED`，不能声称 existing-client update complete。

### SEQ-STRICT-001 — 首次完整链

```text
public baseline B
  -> exact next tag N candidate
  -> 4 fresh + 3 restart reports using from_tag=B
  -> strict update receipt
  -> Stage -> Publish
  -> public B through production GitHub feed to N
  -> second check no_update
  -> README and release closeout
```

本计划不发模型消息或 provider interaction，因此 Memory/message normal、graph、subagent、retry 状态为
`N/A`；理由是该链只验证 packaged application、updater、Sidecar、snapshot 与非敏感 settings sentinel。
若 Terra 加入真实聊天操作，必须先扩展上位 cross-boundary 状态矩阵，未运行格保持 `PENDING`。

## 7. 分阶段实施

## Phase 0 — 恢复能力与最小权限准备

### Owner gate G0（Terra 不操作 Secret）

在删除任何临时材料前，owner 必须：

1. 把加密 P12 导入 login Keychain；
2. 验证 Developer ID Application identity 与 private key 成对；
3. 将加密 P12 保存到独立加密备份，P12 密码放在另一个安全位置；
4. 不把“P12 与相邻明文密码文件”视为备份；
5. 首次 hosted 双架构 PASS 前保留现有受保护临时材料。

### Terra 代码任务

1. 为 signing materials 增加精确 `.gitignore` 防护；不要用会遮蔽正常 fixture 的宽泛规则；
2. 新增待上传目录的 secret-material denylist scanner 与正/负测试：
   - 拒绝 `.p12`、`.pfx`、API private key、known password/private-key filename；
   - 拒绝真实 private-key PEM header；
   - 只报告违规路径/类别，不打印内容；
3. 将 standalone Windows qualification 计划迁到 `windows-signing-qualification` Environment；
4. Mac standalone 使用 `macos-signing-qualification` Environment；
5. 等两个 qualification Environment 配置完成后，formal `release-signing` 才限制为 `v*` tag；
6. 把 `id-token: write` 从 Mac/Linux job 移除，只保留给 Windows Azure OIDC；
7. checkout 在不需要 git push credential 的 signing jobs 使用 `persist-credentials: false`。

### Owner gate G1（Environment 配置）

| Environment | 凭据 | ref policy | reviewer | admin bypass |
| --- | --- | --- | --- | --- |
| `windows-signing-qualification` | 仅 Azure secrets/vars | `dev` | required | false |
| `macos-signing-qualification` | 仅 Apple 五个 secrets | `dev` | required | false |
| `release-signing` | formal Apple + Azure | selected `v*` tags | required | false |

单人项目可暂时保留 `prevent_self_review=false`；它只证明 owner 的发布意图，不是双人职责隔离。
不能只收紧 `release-signing` 而不先迁移 Windows standalone，否则会把现有资格入口阻断。

### Phase 0 acceptance

- `AC-MAC-001`：repo/status/artifact inventory 无 signing material；
- `AC-MAC-002`：三个 Environment 的 Secret **名称**、ref policy、reviewer、bypass 符合表格；
- `AC-MAC-003`：Mac/Linux 无 OIDC，qualification 无 Release 写权限，denylist negative test 为 red；
- 本阶段不要求 owner 删除临时材料。

## Phase 1 — 严格 Mac evidence 单一实现

### 新增文件

- `scripts/release-qa/macos-signing-evidence.mjs`
- `scripts/release-qa/macos-signing-evidence.test.mjs`

### 建议 schema

同一 validator 支持两个**不可互换**的 closed schema：

- `pupu.macos-signing-qualification.v1`
- `pupu.macos-release-candidate-signing.v1`

正式 candidate 固定输出：

- `macos-signing-evidence-arm64.v1.json`
- `macos-signing-evidence-x64.v1.json`

每份 evidence 至少 exact-bind：

- workflow/run ID/attempt、source ref/SHA、tag/commit（formal only）、version、target ID；
- bundle ID、CFBundle version、Team ID、architecture；
- Developer ID Application subject、leaf certificate SHA-256 fingerprint、certificate validity；
- hardened runtime flag；
- final DMG、ZIP、blockmap、metadata 的 exact name/size/SHA-256；
- updater metadata 对 ZIP 的 SHA-512/size reference；
- build app、DMG 内 app、ZIP 内 app 的相同 bundle/team/arch/code identity；
- `codesign --verify --deep --strict`、`stapler validate`、`spctl --assess` 的布尔结果；
- `status=passed`。

不得记录 Apple ID、P12/keychain path、认证命令、密码或 runner 临时绝对路径。

### 实现规则

1. DMG/ZIP 内必须分别解析到**恰好一个** `PuPu.app`；禁止 `find ... -quit` 取第一个；
2. 用 `hdiutil` 挂载 DMG、`ditto` 解 ZIP，finally 中确定性卸载/删除；
3. 证书字段从签名后的 app 独立提取，不从输入环境猜测；
4. `spctl` 必须证明 Notarized Developer ID，而不是只看退出码；
5. arm64 必须只接受目标允许的 arm64，x64 必须接受 `x86_64`；若未来 universal，先升 schema/contract；
6. 未知 key、空证书字段、ad-hoc signature、错误 Team/bundle/version/arch 必须负向失败；
7. qualification 与 formal package 都调用这一个 validator；YAML 不复制另一套解析逻辑。

### Phase 1 acceptance

- `AC-MAC-004`：两 schema 正向 fixture PASS，互换 schema/class FAIL；
- `AC-MAC-005`：missing/duplicate app、wrong arch/team/bundle/version、no runtime、no staple、Gatekeeper
  rejection、stale metadata/hash 和 unknown key 全部 FAIL；
- `AC-MAC-006`：validator 不读取 Secret 值，evidence denylist PASS。

## Phase 2 — Standalone 双架构 Mac qualification

### 新增文件

- `.github/workflows/macos-signing-qualification.yml`
- `scripts/release-qa/macos-signing-qualification-workflow.test.mjs`

### Workflow 约束

- display name：`macOS Signing Qualification`（W7 再统一最终名称）；
- only `workflow_dispatch`；
- required inputs：
  - `confirmation=SIGN_MACOS_QUALIFICATION`
  - exact full `expected_commit`
  - full 40-character immutable Unchain ref；
- matrix：
  - `macos-arm64` -> `macos-latest`
  - `macos-x64` -> `macos-15-intel`
- Environment：`macos-signing-qualification`；
- permissions：`contents: read`，必要时 `actions: read`；无 `id-token: write`、无 `contents: write`；
- 使用现有 exact arm64/x64 release build command 与 Phase 1 validator；
- 只上传每架构 sanitized JSON evidence，短 retention；不上传 DMG/ZIP、P12、Keychain、workspace；
- 任何一架构失败，workflow 整体失败；不生成 candidate、tag、Draft 或 Release。

### Owner gate G2

1. owner 审查 Terra diff 并 commit/push；
2. 从 exact `dev` SHA dispatch；
3. 核对 run inputs 后批准 `macos-signing-qualification`；
4. Terra 监控并只报告 run ID、job result、public certificate metadata 和 artifact names。

### Phase 2 acceptance

- `AC-MAC-007`：两个 hosted target 均 codesign/stapler/spctl/notarization PASS；
- `AC-MAC-008`：run head SHA/input 与选定 commit 一致，artifact 只有 sanitized evidence；
- `AC-MAC-009`：run 前后 GitHub Release/Draft/tag inventory 无副作用；
- standalone PASS 后只能声称 M1，不能声称正式 candidate 或 updater PASS。

## Phase 3 — 正式 candidate、promotion 和 fresh install 接线

### 修改范围

- `.github/workflows/_shared-release-package.yml`
- `.github/workflows/_shared-release-report.yml`
- `scripts/release-qa/assemble-release-candidate.mjs`
- `scripts/release-qa/verify-release-candidate.mjs`
- `scripts/release-qa/assemble-release-candidate.test.mjs`
- `scripts/release-qa/release-artifact-manifest.mjs`
- `scripts/release-qa/release-artifact-manifest.test.mjs`
- `.github/workflows/release-stage.yml`
- `.github/workflows/release-publish.yml`
- `.github/workflows/update-readme-download-links.yml`
- `scripts/release-qa/release-publication-workflow.test.mjs`
- `scripts/release-qa/installed-package-qualification.mjs`
- `scripts/release-qa/installed-package-qualification.test.mjs`
- `scripts/release-qa/build-release-qualification.mjs` 及 tests（仅在 schema version 需要时）。

### 实现步骤

1. formal Mac package 在最终 DMG/ZIP/metadata 完成后调用 Phase 1 validator；
2. package artifact 精确携带对应 candidate evidence；
3. candidate assembler 必须恰好收到 arm64/x64 两份 evidence，重验 final bytes 后封入 candidate；
4. Stage/Public Release 可以携带这两份 public certificate evidence，但必须先跑 denylist；
5. verifier、Stage、Publish、README 都重新验证 evidence -> manifest -> exact asset bytes；
6. standalone schema 明确被 promotion 拒绝；
7. fresh-installed Mac 从 retained DMG copy-install 后再次执行原生 trust 检查，并与 candidate evidence
   的 Team/bundle/arch/certificate identity 一致；
8. 如果给 CLOSED installed report 新增 native trust 字段，升级为
   `pupu.installed-package-qualification.v2`，不得静默扩展 v1；
9. Windows/Linux report 按明确 target union 校验；不能用 optional wildcard object 放宽 Mac。

### Owner gate G3

只有 standalone 双架构通过、release version scope 已冻结、local tests 全绿后，owner 才创建 exact
stable tag 并批准一次 formal `release-signing` candidate。失败 tag 不移动、不复用；是否采用下一 patch
作为 baseline 由 owner 决定。

### Phase 3 acceptance

- `AC-MAC-010`：formal candidate 内恰好两份 Mac release evidence，均绑定同一 candidate run/tag/commit；
- `AC-MAC-011`：四平台 candidate 通过独立 verifier，Mac final DMG/ZIP hashes 与 evidence/manifest 一致；
- `AC-MAC-012`：两个 fresh-installed Mac target 从 retained DMG 启动 renderer/Sidecar、原生信任通过、
  controlled shutdown/cleanup PASS；
- 缺任一 evidence 或安装后 trust 漂移时 Stage fail closed。

## Phase 4 — 双架构 Mac cold restart-update

### 新增文件

- `.github/workflows/_shared-release-macos-restart-update.yml`

### 主要修改

- `.github/workflows/release-qualification.yml`
- `scripts/release-qa/run-restart-update-qualification.mjs` 及 tests
- `scripts/release-qa/restart-update-fixture-evidence.mjs` 及 tests
- `scripts/release-qa/restart-update-qualification.mjs` 及 tests
- `scripts/release-qa/build-release-update-qualification.mjs` 及 tests
- `scripts/release-qa/release-artifact-manifest.mjs` 及 tests
- `scripts/release-qa/release-qualification-workflow.test.mjs`
- `scripts/release-qa/artifact-continuity-workflow.test.mjs`

### Schema 决定

在第一个真实三目标 restart receipt 产生前升级为：

- `pupu.restart-update-fixture-evidence.v2`
- `pupu.restart-update-qualification.v2`
- `pupu.release-update-qualification.v2`

v2 必须新增并严格绑定：

- 最终 N 的原生签名/公证 evidence digest；
- final executable/app.asar/Sidecar/snapshot hashes；
- exact Unchain wheel SHA-256、runtime manifest digest/revision；
- fixture Team/bundle/arch/certificate identity；
- candidate ZIP/metadata/blockmap exact identity；
- sentinel before/after hash、attempt、完整 event sequence 和 cleanup。

没有正式 v1 hosted receipt 可兼容，因此 promotion 应要求 v2；旧 v1 fixtures 只留单元测试历史，不能进入 Stage。

### Shared Mac workflow

按 closed tuple 接受：

- `macos-arm64 + macos-latest`
- `macos-x64 + macos-15-intel`

每个 job：

1. 从 exact candidate run 下载并重验 N；
2. 从 public `from_tag` manifest 解析 exact PuPu commit 与 immutable Unchain revision；
3. checkout exact N-1 source/Unchain；
4. 在签名之前生成唯一允许的 loopback generic provider config；
5. 构建、Developer ID 签名、公证、staple N-1 fixture；
6. 用 Phase 1 validator 证明 fixture trust，并生成 v2 fixture evidence；
7. 不上传 fixture DMG/ZIP，只上传 sanitized signing/feed/restart JSON；
8. 建立 per-target loopback feed，只服务 candidate manifest 中 exact metadata/ZIP/blockmap；
9. 运行 `SEQ-MAC-002`，以 candidate ZIP 解出的 N 作为最终 identity 基准；
10. 对重启后的 N 再跑 codesign/stapler/spctl，并验证 Sidecar、snapshot、Unchain 和 sentinel；
11. finally 关闭 feed、卸载 DMG、清理 exact test roots。

### Release 2 接线

- 添加两个 Mac restart jobs，与现有 Windows job并列；
- receipt job `needs` 三个 restart jobs；
- 下载三个 `restart-update-qualification-*` artifacts；
- 只有 4 fresh + 3 restart 全部 PASS 才生成唯一 v2 receipt；
- 任一 skipped/cancelled/failed target 使 receipt 和 Release 2 失败。

### Phase 4 acceptance

- `AC-MAC-013`：两个 Mac target 都观察到 checking/downloading/downloaded/install/exit/relaunch；
- `AC-MAC-014`：重启后的 N native trust、candidate ZIP identity、Sidecar、snapshot、Unchain 全一致；
- `AC-MAC-015`：default userData sentinel 完整保留，无旧进程/第二 installer/残留 feed；
- `AC-MAC-016`：wrong arch/team/metadata/payload/feed/from identity 和 interrupted download 不产生 PASS；
- `AC-CHAIN-001`：Release 2 缺任一 Mac/Windows restart report 时 v2 receipt builder FAIL；
- 本阶段在没有 admissible public N-1 时只能 local/static PASS，真实 M4 仍 `INCOMPLETE`。

## Phase 5 — 一次性 modern baseline bootstrap

### Gate G4 修订决定（project owner，2026-08-26）

`v0.1.10` 已锁定为未发布失败 tag：Release QA 在启动阶段因共享 workflow 的 OIDC 权限提升被 GitHub
拒绝，未运行 job、未生成资产，且该 tag 不移动、不复用。首个 modern baseline `B` 因此顺延为
**`v0.1.11`**。本版本只通过 bootstrap receipt 声明四目标 fresh-installed qualification，不声称
`v0.1.9 -> v0.1.11` 或 `v0.1.10 -> v0.1.11` 自动更新完成；第一次严格的现代版本间升级链使用
`v0.1.11` 作为 `from_tag`，目标版本安排到 `v0.2.0`。

`windows-arm64`、`linux-arm64` 继续保持 artifact contract 中的 `reserved / planned_release: 0.2.0`，
不进入 v0.1.11 bootstrap 的 required target set。该决定不冻结 #208 的其余产品 scope，也不自动关闭
#200；#200 只能在真实 `v0.1.11 -> N` production canary 后关闭。

### 新增文件

- `contracts/release/release-bootstrap-policy.v1.json`
- `.github/workflows/release-bootstrap-qualification.yml`
- `scripts/release-qa/validate-legacy-release-gap.mjs` 及 tests
- `scripts/release-qa/build-release-bootstrap-qualification.mjs` 及 tests
- `scripts/release-qa/qualification-provenance.mjs` 及 tests

### Bootstrap policy

policy 锁死：

- exact `B=v0.1.11`、confirmation `BOOTSTRAP_V0_1_11`、required fresh targets、`required_restart_targets=[]`；
- `v0.1.9` tag commit、GitHub Release ID、draft/prerelease state；
- 三个现有 public assets 的 exact ID/name/size/GitHub SHA-256 digest；
- reason：legacy release lacks versioned manifest/updater metadata/Intel Mac/immutable Unchain identity；
- `next_strict_from_tag=v0.1.11`。

不要下载、重建或补写 `v0.1.9` 来伪造历史证据。

### Bootstrap receipt

`pupu.release-bootstrap-qualification.v1` exact keys 至少包含：

```text
schema / status / scope=bootstrap-fresh-install-only
candidate_run_id / qualification_run_id / manifest_digest
release { tag, version, commit }
bootstrap { policy_digest, legacy_release, reason_code, next_strict_from_tag }
fresh_targets = 4 passed targets
restart_targets = []
restart_disposition { status=not_run, reason_code=legacy-source-not-admissible }
```

### Bootstrap workflow

- only manual dispatch on exact B tag；
- protected Environment 固定为 `release-qualification`：required reviewer `haoxiang-xu`、
  `prevent_self_review=false`、`can_admins_bypass=false`、只允许 exact tag `v0.1.11`，且不存放 Secret；
- exact confirmation `BOOTSTRAP_V0_1_11`；
- 验证 candidate provenance/retained bytes 和 legacy API projection；
- 复用四目标 fresh-installed workflow；
- 不构建、不签名、不跑 restart、不写 Release；
- 输出仍用 artifact `pupu-release-qualification` 和文件 `release-qualification.v1.json`，但 schema
  不能冒充 normal update receipt；
- costly matrix 前使用 protected operator approval；Stage/Publish 仍各自再次审批。

### Promotion 收紧

Stage/Publish/README 使用同一个 closed qualification policy：

- normal promotion：只接受 `pupu.release-update-qualification.v2` 和 normal Release 2 workflow path；
- one-time bootstrap：只接受 exact policy B 的 bootstrap schema/path/confirmation；
- old fresh-only receipt 永远不能 promotion；
- `qualification_run_id` required，删除 candidate run fallback；
- candidate run 与 qualification run 必须不同；
- receipt schema -> 唯一 workflow path；不接受任意 path/basename/latest run。

### Phase 5 acceptance

- `AC-BOOT-001`：legacy API canonical projection 与 frozen policy exact-match；
- `AC-BOOT-002`：asset missing/extra/replaced、draft/prerelease、出现 modern manifest 时 FAIL；
- `AC-BOOT-003`：policy digest 或 unknown key 漂移 FAIL；
- `AC-BOOT-004`：B 四个 fresh target 全 PASS，restart 明确 `NOT_RUN`；
- `AC-BOOT-005`：bootstrap receipt 用于其他 tag、normal receipt 来自 bootstrap path、或反向混用均 FAIL；
- `AC-BOOT-006`：Stage/Draft bytes 与 candidate 一致，流程无 rebuild/resign；
- `AC-BOOT-007`：release notes 明示 legacy 用户可能需要手动安装，不能宣称自动升级已验收；
- `AC-BOOT-008`：B 发布后状态仅为 `BOOTSTRAP_BASELINE_PUBLISHED`。

### Owner gates G5/G6

- G5：owner 创建 exact B tag、批准 Release 1、bootstrap qualification 和 Stage Draft；
- G6：owner 人工复核 Draft inventory/release notes 后输入 `PUBLISH` 并批准 Publish；
- Terra/root 都不得自动公开或在失败后自动 unpublish。

## Phase 6 — 首次严格 B -> N 全链路与收尾

### 前置

- B 已是 public stable modern baseline，含完整 manifest、双架构 Mac/Windows updater assets；
- #200 在实施 production canary 前先通过 `release-refine-ticket` 形成零上下文 contract；
- N 的 Release scope 已冻结，owner 创建 exact stable N tag。

### 顺序

1. Release 1：在 N tag 上 build signed candidate，批准 `release-signing`；
2. Release 2：显式 `from_tag=B`，运行 4 fresh + 3 signed restart；
3. root 独立验证 v2 receipt、run provenance 和 exact bytes；
4. Release 3：owner 批准 Stage，Draft 回下载复验；
5. Release 4：owner 输入 `PUBLISH` 并批准，只切换 public 状态；
6. production canary：下载 exact public B，不修改其 `app-update.yml`，通过真实 GitHub provider 升级到 N；
7. Mac arm64/x64 + Windows x64 都必须自动 relaunch exact N；
8. 第二次检查必须 `no_update`；
9. canary PASS 后才允许 README PR 和 release closeout；
10. canary FAIL 时标记 release `NO-GO`、保存现场、停止 README/closeout，不自动 unpublish/delete assets。

### Phase 6 acceptance

- `AC-CHAIN-002`：candidate、qualification、Stage、Publish 绑定同一 N tag/commit/candidate digest；
- `AC-CHAIN-003`：4 fresh + 3 restart v2 receipt PASS；
- `AC-CHAIN-004`：Draft/Public assets 与 candidate manifest byte-for-byte 相同；
- `AC-CHAIN-005`：public B -> N 三目标 canary + second `no_update` PASS；
- `AC-CHAIN-006`：README 只从已验证 public manifest 渲染；
- `AC-CHAIN-007`：B/N、run IDs、asset IDs/hashes、native trust 和 canary evidence 写回路线图/ticket。

## Phase 7 — W5/W6/W7 GitHub Actions 收尾

在 M4 之前不做公共 workflow rename。M4 后按上位路线图完成：

1. 将验收过的 release workflows 合入 `main`，核对 Actions registry；
2. 从 main 运行 non-publishing entrypoint，核对 required checks/Environment；
3. disable 旧 `.github/workflows/release.yml` registry entry，保留历史 runs；
4. 处理 Actions Node runtime deprecation；
5. 最小权限、并发、retention、job/check names 全部静态测试化；
6. Stage/Publish 共用 per-tag promotion concurrency，`cancel-in-progress=false`；
7. 完成最终公共名称迁移，先并行 evidence，再切 required checks，再 disable old wrapper；
8. 更新两份架构文档、#218/#220/#200 与 Release parent 的证据；
9. Project status、issue closure、release membership 只由 owner 明确要求后更新。

最终 Actions 命名需额外纳入：

- `Qualification · macOS Signing`
- one-time bootstrap workflow 使用明显的 `Bootstrap` 名称，并在 B 完成后 disable；
- Mac restart shared workflow 保持 `_shared-*`，不出现在公共 sidebar 作为发布入口。

## 8. Terra 每阶段开工规则

1. `git status --short --branch`，保留任何用户变更；
2. `node .gitnexus/run.cjs status`，stale 时刷新索引，但还原分析器自动改动的说明统计；
3. 对每个将修改的已有 symbol 运行：

```text
node .gitnexus/run.cjs impact -r /Users/red/Desktop/GITRepo/PuPu --direction upstream <symbol>
```

4. 向用户报告 direct callers、affected flows、risk；HIGH/CRITICAL 先停下；
5. 先写 red negative tests，再实施 green；
6. 不做无关重构，不新建 TypeScript；
7. 不 commit；
8. 每个 phase 单独交付，等待 root 验收后再进入下一个 costly/外部阶段。

## 9. 本地验收命令

Terra 至少运行：

```bash
node --test \
  scripts/release-qa/macos-signing-evidence.test.mjs \
  scripts/release-qa/macos-signing-qualification-workflow.test.mjs \
  scripts/release-qa/release-qualification-workflow.test.mjs \
  scripts/release-qa/run-restart-update-qualification.test.mjs \
  scripts/release-qa/restart-update-qualification.test.mjs \
  scripts/release-qa/restart-update-fixture-evidence.test.mjs \
  scripts/release-qa/build-release-update-qualification.test.mjs \
  scripts/release-qa/assemble-release-candidate.test.mjs \
  scripts/release-qa/release-publication-workflow.test.mjs

npm run test:release-qa:unit
git diff --check
node .gitnexus/run.cjs detect-changes \
  -r /Users/red/Desktop/GITRepo/PuPu \
  --scope compare \
  --base-ref main
```

并额外完成：

- 所有修改/新增 workflow 与 composite action YAML unique-key parse；
- actionlint（环境可用时）；
- updater `.js`/`.cjs` 对应测试保持同步；
- 任何修改过的 application/Electron test suite；
- Secret/artifact denylist 正向和 red-before-green 负向；
- `git status` 证明没有证书、private key 或 password file。

如果修改 Unchain Python，必须运行其 `run_tests.sh` 并提示 sidecar restart；本计划预期无需修改 Python。

## 10. Terra 交付给 root 的证据包

每一阶段最终回复必须包含：

1. base/head SHA、changed files、未触碰的用户修改；
2. 每个修改 symbol 的 GitNexus impact 摘要；
3. BC/SEQ/AC 对应的实现和测试文件；
4. exact test commands、pass/fail counts、`git diff --check`、`detect_changes`；
5. 所有 hosted run URL/ID/attempt、event、head SHA、inputs；
6. artifact names、schemas、hashes和**公共** certificate metadata；
7. Environment name/policy/reviewer 与 Secret **名称/更新时间**，绝不含值；
8. 证明 qualification 无 tag/Draft/Release 副作用；
9. 当前结论 `PASS / INCOMPLETE / NO-GO` 和下一 owner gate；
10. 不 commit、不 push，除非 owner 在该回合明确要求。

Root 验收不能只看绿色圆点；必须下载 evidence，独立重跑 strict validator，并核对 run provenance、
artifact inventory、promotion side effects 和 Secret 泄漏面。

## 11. 本机敏感材料最终清理（仅 owner 明确批准后）

满足以下全部前置：Keychain identity 可用、独立加密 P12 备份存在、双架构 hosted qualification PASS、
GitHub Secrets 已验证可用。然后按顺序：

1. 清空剪贴板；
2. 删除本地 app-specific-password 明文文件；
3. 删除 P12 密码明文文件；
4. 删除 P12 Base64 副本；
5. 删除裸 private-key PEM；
6. 删除临时 P12 和整个临时目录；
7. public `.cer`/CSR 可保留或删除；
8. 再验证 Keychain identity 和 repo/worktree 无 signing material。

GitHub Secret 不可回读，不能当恢复备份。清理后只记录“存在/不存在”和公共 certificate metadata。

## 12. 当前推荐的实际执行批次

为避免一次 diff 过大，交给 Terra 的顺序固定为：

1. **Batch A**：Phase 0 repo 防泄漏、Environment workflow 迁移、最小权限；
2. **Batch B**：Phase 1 strict Mac evidence validator + tests；
3. **Batch C**：Phase 2 standalone dual-arch qualification workflow；
4. **Owner/Root checkpoint**：push、approve、真实双架构 non-publishing run、验收；
5. **Batch D**：Phase 3 formal candidate/promotion/fresh-installed evidence 接线；
6. **Batch E**：Phase 4 two Mac restart jobs + v2 schemas；
7. **Root checkpoint**：完整 local/static acceptance；没有 modern N-1 时结论保持 `INCOMPLETE`；
8. **Owner scope gate**：冻结 B 与 ARM64 scope；
9. **Batch F**：Phase 5 exact one-time bootstrap policy/workflow；
10. **Owner/Root release gates**：B candidate -> bootstrap qualification -> Stage -> Publish；
11. **Batch G / #200**：Phase 6 normal B -> N + production canary；
12. **Batch H**：Phase 7 main/registry/runtime/naming/ticket 收尾。

Terra 现在应从 **Batch A** 开始，不越过任何 Owner/Root checkpoint。
