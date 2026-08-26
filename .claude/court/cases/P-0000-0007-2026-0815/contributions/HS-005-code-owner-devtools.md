# HS-005 · code-owner-devtools · SLOT-006 与 SEQ-007 交付

- **case**: P-0000-0007-2026-0815
- **handoff**: HS-005（record.md#S-0026），basis S-0025 / PS-005
- **交付人**: code-owner-devtools
- **返回**: code-owner-unchain（lead）
- **边界**: `pupu:scripts/**`、`pupu:.github/**`、`pupu:e2e/**`、`pupu:src/electron/**`、根构建配置
- **取证基线**: PuPu 工作树 `28b1e0ef`（`dev`），本件全部代码事实由本 owner 在本次交付中逐条自核，行号为核对时的实际行号
- **本件不改任何生产代码，不改 `proposal.md`，不新增 AC / BC / SEQ 编号，主树不 commit**

## §0 自核方法与一处方法学声明

本件的每一条代码主张都来自直接读源码或直接执行命令，不引用记忆、不引用其他 owner 的转述。凡引用其他 owner 交付件（HS-003）的数字，本 owner 另用**独立方法**复算一次并在文中标明两法结果，理由是 HS-003 自己记载过一次按文件名词干配对导致 4 项假阳性的方法学事故（`contributions/HS-003-code-owner-electron.md:7,145`）—— 对该来源的数字直接采信是不安全的。

跨边界只读引用两处，并在此显名：`unchain_runtime/scripts/build_unchain_server.sh` 与 `build_unchain_server.ps1` 属 `code-owner-runtime` 边界（`unchain_runtime/**`），本件只读取其内容作事实认定；**若本件提出的义务需要改动这两个文件，写入责任在 runtime owner 而不在本棒**，已在相应条目标注。

---

## §1 交付一 · AC-014 三处覆盖核对

### 1.1 结论（直接回答 S-0025 的提问）

**AC-014 要求的三处，"各自的自校验"齐备 3/3；但"三处之间的互校验"今天在报告上无法核验。**

精确表述：三个位置各自都会重算并核对自己手里那份 wheel 的字节与 manifest，**但三处观测到的值一条都没有进入 release report**。报告上今天唯一存在的一致性断言，比的是**同一份 evidence 文件被 CI upload / download 搬运后的两个副本**（deterministic job 与四个 package job），不是任何 runner 的观测值。因此：

- 若有人把契约矩阵那两步的 `UNCHAIN_ARTIFACT_PATH` / `UNCHAIN_ARTIFACT_EVIDENCE_PATH` 改指到**另一对自洽的 wheel + evidence**，矩阵会对着 wheel B 自洽通过，报告会印出 wheel A，`mergeReports` 会拿 A 比 A 判绿。**全绿，无一处变红。**
- 这条路径不是假想：`scripts/release-qa/run-with-unchain-artifact.mjs:46-48` 在 `UNCHAIN_ARTIFACT_PATH` 未设时**会就地从可变的相邻 checkout `../unchain` 重新构建一个 wheel**。它是本地打包链的正常入口，但也意味着"用第二个 wheel"在本仓是一条已铺好的代码路径，只差一个环境变量。

因此对 S-0025 的原问「是否已覆盖三处而非两处」，本 owner 的回答是：**既不是三处，也不是两处，而是"一条 evidence 副本一致性链 + 三处互不相通的自校验"**。下表是逐项核对。

### 1.2 逐位置核对表

| 位置 | 自校验（字节 / manifest） | 观测值是否进入 report | 与其他位置互校验 |
|---|---|---|---|
| **契约矩阵**<br>`run-context-v2-contract.mjs:34-48`<br>`run-run-bundle-contract.mjs:38-52` | **完整**。`verifyWheelRuntimeManifest`（`unchain-artifact.mjs:428-442`）先 `readAndVerifyUnchainArtifactEvidence`（:345-370，重算文件 SHA-256、比 size、比 basename），再 `inspectRuntimeManifestFromWheel`（:404-426，`sys.path.insert(0, <wheel>)` **真实 import**）并对 manifest 作 exact JSON 全等比较 | **否**。只把 `executed_tests` 写进 `GITHUB_OUTPUT`（:114-119 / :197-207）；sha 与 digest 只 `console.log`（:49-53 / :53-57） | **无** |
| **package smoke**<br>`package-sidecar-smoke.mjs:116-122` | **完整**。CLI 强制 `--artifact`（:214-217）→ `readAndVerifyUnchainArtifactEvidence` 重算下载物字节；再对**运行中打包 sidecar** 的 `/health` 投影作 manifest exact JSON 全等（`validateCompatibleRuntimeProjection:69-71`，调用点 :182 与 :191） | **否**。`GITHUB_OUTPUT` 里的 `runtime_manifest_digest`（:225-231）**无人消费**（实测 `grep steps.sidecar_smoke.outputs` 只命中 `executed_tests`，release-qa.yml:445）；`packaged-sidecar-smoke.json` 只被 `collectArtifacts` 按**文件名与大小**登记，内容从不解析 | **无** |
| **release report**<br>`write-job-report.mjs:56-94` + `reporting.mjs:377-415` | **部分（且正确）**。合并 job 不下载 wheel，故不重算字节；`unchainEvidenceFailures`（:147-189）校验 evidence 文档自洽 + manifest digest 可重算 | 值来自 `QA_UNCHAIN_ARTIFACT_EVIDENCE_PATH` 指向的 **evidence 文件本身**，不是任何 runner 的观测值 | **一条**：`mergeReports` 对四个 package 平台逐个比 `artifact_sha256` / `runtime_manifest_digest` / `source_revision`（:391-395），单测 `reporting.test.mjs:166-186` |

### 1.3 已经成立、值得记录的部分（避免补齐义务写重）

不是全盘缺失。下列机制今天已实现且强度足够，AC-014 正文应引用而不是重造：

1. **"只构建一次"有静态门。** `artifact-continuity-workflow.test.mjs:14-23` 断言 `build-unchain-artifact.mjs` 在 workflow 中出现**恰 1 次**、`repository: haoxiang-xu/unchain` 出现**恰 1 次**。
2. **构建器自身拒绝增量。** `build-unchain-artifact.mjs:74-79` 在输出目录已含 `.whl` 时直接抛错；:90-94 强制单 wheel；:65-73 拒绝 dirty 源。
3. **evidence 自带"一次构建"事实且被强校验。** `buildUnchainArtifactEvidence` 写 `build: {wheel_count: 1, built_once: true}`（:315-318），`validateEvidenceShape:337-340` 对任何其他取值抛错。
4. **`direct_url.json` 反顶替执行点已实现（三处调用）。** `validateInstalledUnchainProbe`（:444-476）拒绝 `dir_info.editable`、要求 `archive_info` 存在、比对已安装 wheel 的 basename 与 `evidence.artifact.name`、比对 `archive_info.hashes.sha256` 与 `evidence.artifact.sha256`。调用点：release-qa.yml:91-101（deterministic job，`pip install --force-reinstall --no-deps` 后 `--installed true`）、`build_unchain_server.sh:180-191`、`build_unchain_server.ps1:177-186`（后两者在 runtime owner 边界）。
5. **package job 重新哈希下载物。** release-qa.yml:366-380 用 `--bytes-only true` 对 `download-artifact` 拿到的 wheel 重算 SHA-256（`verify-unchain-artifact.mjs:38-41`）。
6. **本地门有工作树稳定性证明。** `run-local-gate.mjs:42,116-132` 用 `computeWorktreeFingerprint`（`worktree-fingerprint.mjs:19-50`，含 `git diff --binary HEAD` 与**全部未跟踪文件内容**）在 QA 前后各算一次。`/.release-qa`（`.gitignore:12`）、`/build` 与 `build/`（:15,:51）已忽略，故该检查不会被 QA 自身产物或 web build 扰动 —— 本 owner 实测确认 `prepare-build-version.cjs` **零写入**、`build-web.cjs:85` 的唯一写入落在 `build/build_feature_flags.json`（已忽略）。

### 1.4 缺口与补齐义务（V-1 至 V-4；全部为测试 / 脚本层面，零生产代码改动）

> **V-1 · 三处观测值必须可在报告上互核（阻断项，AC-014 字面要求的直接后果）**
>
> 分两部分，**两部分都必需**：
>
> **V-1a · 静态接线断言（关闭"改指到另一个 wheel"这条路径）。** 在 `scripts/release-qa/artifact-continuity-workflow.test.mjs` 内以既有的 `YAML.parseDocument` 解析 workflow，枚举 `deterministic-checks` 与 `package-matrix` 两个 job 的全部 step，断言：(i) `deterministic-checks` 内每一处 `UNCHAIN_ARTIFACT_PATH`、`UNCHAIN_ARTIFACT_EVIDENCE_PATH`、`QA_UNCHAIN_ARTIFACT_EVIDENCE_PATH`、以及 `Python backend tests` 的 `PYTHONPATH`，其值**逐字**为 `${{ steps.unchain_artifact.outputs.<对应字段> }}`；(ii) `package-matrix` 内同名变量逐字为 `${{ steps.artifact_verify.outputs.<对应字段> }}`；(iii) 两个 job 内不出现任何其他来源的 artifact 路径表达式。今天的该文件只断言 `steps.artifact_verify.outputs.*` 这一条模式**在文件中出现过**（:31-38），不枚举、不排他，故契约矩阵与 pytest 两步的接线**完全无保护**。
> **red-before-green**：把 `Context V2 boundary contract gate` 的 `UNCHAIN_ARTIFACT_PATH` 临时改为字面路径或改指 `steps.artifact_verify.*`，断言该测试变红；改回变绿。
>
> **V-1b · 观测值进入报告（关闭"报告上三个数只有一个"这条路径）。** (i) `run-context-v2-contract.mjs` 与 `run-run-bundle-contract.mjs` 在 `GITHUB_OUTPUT` 追加 `artifact_sha256=` 与 `runtime_manifest_digest=`，其中 digest **必须取自 `inspectRuntimeManifestFromWheel` 真实 import 回来的 manifest**，不得取自 evidence（取自 evidence 是同义反复，见 V-3）；(ii) `package-sidecar-smoke.mjs` 的返回值把 `runtime_manifest_digest` 改为 `/health` 投影里**观测到的** `projection.runtime_protocol_manifest.manifest_digest`，并把 `artifact_sha256`（`readAndVerify` 观测得到的值）一并加入返回与 `GITHUB_OUTPUT`；(iii) workflow 把这些值以 `QA_CHECKS_JSON` 的 check 字段带进 job report；(iv) `reporting.mjs` 在 `enforceRequiredChecks` 内新增一条判定：凡携带 `artifact_sha256` / `runtime_manifest_digest` 的 check，其值与本 job `unchain` 块的同名字段**不逐字相等即 `failed`**，details 写明两侧取值。
> **red-before-green**：在任一 runner 的 GITHUB_OUTPUT 里注入一个改过一位十六进制的 sha，断言报告该 check 变红且 details 同时打印两个值。

> **V-2 · `Python backend tests` 缺 `UNCHAIN_ARTIFACT_EVIDENCE_PATH`（阻断项，AC-014 运行时段今天无法实现）**
>
> AC-014 已写明：「AC-011 的 pytest 增加一条 session 级断言：被测进程内的 manifest digest 等于 **evidence 文件中的** `runtime_manifest.manifest_digest`」。但该 pytest 在**两处**运行环境里都拿不到 evidence 文件：
> - CI：release-qa.yml:142-148 只给 `PYTHONPATH: ${{ steps.unchain_artifact.outputs.artifact_path }}`；
> - 本地门：`local-gate-checks.mjs:28-33` 只给 `PYTHONPATH`。
>
> **补齐义务**：两处 env 各追加 `UNCHAIN_ARTIFACT_EVIDENCE_PATH`（CI 取 `${{ steps.unchain_artifact.outputs.evidence_path }}`，本地门取 `run-local-gate.mjs` 已解析的 `unchainArtifactEvidencePath`），并由 V-1a 的枚举断言把 CI 侧钉死。
> **这是 AC-014 运行时段（SLOT-002 交付）在本 owner 边界内的先决条件**：不补，AC-011 那条 session 级断言无法写出，AC-014 只能结论 `INCOMPLETE`。本条是本棒发现的最高优先级缺口。
> **red-before-green**：先只加 env 不加断言，确认 pytest 能读到该文件（`os.environ` 非空且 `json.load` 成功）；再由 runtime owner 写断言并用一个改过的 evidence 副本取红。

> **V-3 · package smoke 上报的 digest 是同义反复（应修）**
>
> `package-sidecar-smoke.mjs:198` 的 `runtime_manifest_digest: expectedManifest.manifest_digest` 取自 evidence 自身，不是观测值。今天它恒等于期望值，即使 `validateCompatibleRuntimeProjection` 日后被削弱，报告上的数仍然"对"。并入 V-1b (ii) 一并处置。

> **V-4 · `packaged-sidecar-smoke.json` 内容从不进入报告（应修）**
>
> 该文件由 :224 写出，经 `QA_ARTIFACT_GLOBS_JSON` 只被 `collectArtifacts`（`reporting.mjs:536-555`）登记 `name` / `path` / `size_bytes`。**补齐义务**：`write-job-report.mjs` 在 `QA_PACKAGED_SMOKE_PATH`（新 env）存在时解析该 JSON，把 `runtime_manifest_digest` / `artifact_sha256` / `executed_tests` 并入对应 check；解析失败即写 `failed`（与 :58-69 处理 evidence 读取失败同法，不得静默跳过）。

### 1.5 显名记录（不构成义务）

> **V-5 · playwright-electron job 完全无 artifact 绑定 —— 这是正确的，但必须写明。** 该 job（release-qa.yml:240-316）不设 `QA_UNCHAIN_ARTIFACT_EVIDENCE_PATH`，其 job report 的 `unchain` 块全为空串。`mergeReports` 按 `platform.name === "deterministic"` 选参照（`reporting.mjs:349-352`），`RELEASE_PACKAGE_PLATFORMS`（:49-54）不含 playwright，故它既不污染参照也不被要求 —— e2e 不启动带 wheel 的 sidecar，本就不在 AC-014 三处之内。**但 AC-014 正文必须显式写明这一点**，否则验收人会去找一条不存在的第四条链。
>
> **V-6 · "被 `direct_url.json` 证明的那个 dist"与"契约矩阵实际 import 的那个路径"不是同一个。** 契约矩阵与 pytest 都用 `PYTHONPATH=<wheel.whl>`（zipimport 直接吃 wheel 文件），而 `--installed true` 的 `direct_url.json` 检查作用在**系统 python 的已安装 dist** 上。二者字节同源（同一个文件），且 zipimport 直接吃不可变字节在强度上不弱于装出来的副本。**这不是缺陷**，但 AC-014 正文必须写清"哪一处证明什么"。

---

## §2 交付二 · AC-014 devtools 段可验收正文

> 以下为可粘贴块，供 lead 集成进 AC-014。它只补 artifact 侧，不触碰 AC-014 已有的运行时侧（SLOT-002）文字。

> **AC-014 · artifact 侧取证（SLOT-006 交付）。**
>
> **A. 一次构建、全程复用同一 wheel 的证明（四层，全部可机械核验）**
> 1. **构建次数**：`npm run test:release-qa:unit` 中的 `artifact-continuity-workflow.test.mjs` 断言 `build-unchain-artifact.mjs` 与 `repository: haoxiang-xu/unchain` 在 `.github/workflows/release-qa.yml` 中各出现**恰 1 次**。
> 2. **构建器拒绝增量**：`build-unchain-artifact.mjs` 在输出目录已含 `.whl` 时抛错、在源 checkout dirty 时抛错、在产出不等于 1 个 wheel 时抛错。
> 3. **evidence 自证**：evidence 的 `build` 块必须逐字为 `{"wheel_count": 1, "built_once": true}`，由 `validateEvidenceShape` 在**每一次**读取时强校验，任何其他取值即失败。
> 4. **跨 job 搬运不换字节**：deterministic job 以 `upload-artifact` 上传 wheel 与 evidence；每个 package job `download-artifact` 后以 `verify-unchain-artifact.mjs --bytes-only true` **重算下载物的 SHA-256** 并与 evidence 比对，不一致即失败。
>
> **B. 三处逐字核对的取证方法（每一处给出观测者、观测量、核对断言）**
>
> | 处 | 观测者 | 观测量 | 核对断言 |
> |---|---|---|---|
> | 契约矩阵 | `run-context-v2-contract.mjs` / `run-run-bundle-contract.mjs` | (i) `UNCHAIN_ARTIFACT_PATH` 文件的实算 SHA-256；(ii) `sys.path.insert(0, <wheel>)` 后**真实 import** `unchain.runtime.runtime_protocol.runtime_protocol_manifest()` 得到的 manifest 的 digest | 两者对 evidence 作 exact 比较；并把两个观测值写入 `GITHUB_OUTPUT`，由 job report 携带 |
> | package smoke | `package-sidecar-smoke.mjs` | (i) `--artifact` 指向文件的实算 SHA-256；(ii) 打包 sidecar `GET /health` 的 `context_memory_v2.runtime_protocol_manifest.manifest_digest`（**运行中进程的读数**） | 两者对 evidence 作 exact 比较；并把两个观测值写入 `GITHUB_OUTPUT` 与 `packaged-sidecar-smoke.json`，由 job report 携带 |
> | release report | `write-job-report.mjs` + `merge-reports.mjs` | evidence 文件的 `artifact.sha256` 与 `runtime_manifest.manifest_digest` | (i) 每个 job 内：凡携带观测值的 check，其值与本 job `unchain` 块**不逐字相等即 `failed`**；(ii) 跨 job：`mergeReports` 对四个 package 平台逐个比 `artifact_sha256` / `runtime_manifest_digest` / `source_revision`，不等即 `failed` |
>
> 三处的接线由 `artifact-continuity-workflow.test.mjs` 的**枚举式**断言钉死：`deterministic-checks` 内全部 artifact 相关 env 逐字取自 `steps.unchain_artifact.outputs.*`，`package-matrix` 内逐字取自 `steps.artifact_verify.outputs.*`，两个 job 内不出现任何其他来源。
>
> **C. 「不得以可变的相邻 checkout 顶替该 artifact」的执行点**
> 唯一执行点是**已安装 dist 的 `direct_url.json` 比对**：`verify-unchain-artifact.mjs --installed true` → `verifyInstalledUnchainDistribution` → `validateInstalledUnchainProbe`，四项断言 ——（i）`dir_info.editable` 为真即失败（editable / `pip install -e` 的可变 checkout 被拒）；（ii）缺 `archive_info` 即失败（非从 wheel 归档安装被拒）；（iii）`direct_url.url` 的 basename 必须逐字等于 `evidence.artifact.name`；（iv）`archive_info.hashes.sha256` 必须逐字等于 `evidence.artifact.sha256` 去掉 `sha256:` 前缀后的值。
> 调用点三处：deterministic job（`pip install --force-reinstall --no-deps` 之后立即执行）、`build_unchain_server.sh`、`build_unchain_server.ps1`（后两者位于 `unchain_runtime/**`，属 runtime owner 边界，本段只引用不修改）。
> 打包侧另有一道独立护栏：`validateCompatibleRuntimeProjection` 对运行中 sidecar 的 `unchain_runtime_source` 断言其**不匹配** `editable|checkout|/src/unchain/`，即打包产物不得指向源码树。
> **该段同时明示**：`source.repository` / `source.ref` / `source.revision` / `source.dirty` 与 `/health` 的 `unchain_revision` / `unchain_runtime_source` **只作 artifact provenance 与遥测**，不参与任何 runtime capability 或 admission 判据。取证脚本须有一条断言证明这一点（与 AC-014 运行时段的同名义务对称）。`verifyUnchainTestSourceProvenance`（要求 unchain 测试源 revision 等于 evidence 且工作树干净）属 **test-source 选择门**，与 runtime compatibility 无关，其失败信息必须自述为 provenance 失败而非兼容性失败。
>
> **D. 不在本 AC 三处之内的位置（显名，防止验收人找不存在的链）**
> `playwright-electron` job 不绑定任何 artifact，其 job report 的 `unchain` 块为空且不参与任何一致性比较 —— e2e 不启动带 wheel 的 sidecar。这是设计如此，不是缺口。
>
> **E. 「任一处不一致时结论为 INCOMPLETE 而非 GO」的机械表达**
> release report 的 `deterministic_result.status` 只有 `passed` / `failed` 两值，**没有 `INCOMPLETE` 这个字段值**；`INCOMPLETE` 是 `task-owner-release-certification` 的结论词汇，不是 job report 的 schema。因此本 AC 的验收约定为：任一处不一致时，(i) 相应 check 的 `status` 为 `failed` 且 `details` 逐字含 `(INCOMPLETE)`（由 `enforceRequiredChecks` 生成）；(ii) `deterministic_result.status !== "passed"`；(iii) `merge-reports.mjs --fail-on-deterministic-failure true` 以非零退出；(iv) workflow 的 `Enforce final deterministic result` 步失败。发布结论据此记为 `INCOMPLETE`，**不得**记为 `GO`。此外 `Unchain artifact continuity` / `Unchain runtime protocol manifest` / `Context V2 boundary contracts` / `RunBundle v1 boundary contracts` / `packaged sidecar protocol smoke` 五项在 `NONZERO_EVIDENCE_CHECKS` 内，`executed_tests` 为 0 或缺失即判 `failed`，即"没跑"与"跑挂了"同等阻断 —— 这正是 `NOT_RUN / PENDING` 不得冒充覆盖的执行点。
>
> **F. 本段的 red-before-green 义务**：V-1a（改指接线变红）、V-1b（注入错 sha 变红）两项必须保存记录。

---

## §3 交付三 · SEQ-007 owner confirmation 与七格逐格复核

### 3.1 确认结论

**`code-owner-devtools` 对 SEQ-007（Release artifact provenance 与 rollout 回滚）登记 `CONFIRMED_CONDITIONAL`。**

**唯一条件**：§1.4 的 **V-1 与 V-2 两条补齐义务被写入 AC-014 正文**（本件 §2 的可粘贴块已含 V-1；V-2 需 lead 在集成时一并纳入，因为它同时是 AC-014 运行时段的先决条件）。条件的实质理由：SEQ-007 的 `expected observations` 第一句「三处引用的 wheel SHA-256 逐字相同」**今天在报告上无法核验**（§1.1）。在该缺口有补齐义务之前确认这条 SEQ，等于确认一条没有执行点的观察。

条件之外，SEQ-007 的其余字段本 owner 全部确认与真实发布流程一致，其中 `expected observations` 第二句（`direct_url.json`）与第四句（回滚不删 journal 与证据）**今天已完全成立**，见 §1.3 第 4 条与 §3.2 rollback 格。

### 3.2 七个矩阵单元格逐格复核

| 格 | PS-005 现状 | 本 owner 复核 |
|---|---|---|
| **first use** | REQUIRED \| AC-014 | **成立**。首次发布的真实次序即 build → `pip install` + `--installed true` → 契约矩阵 → package → report，每一步都有执行点（§1.3） |
| **repeat** | REQUIRED \| AC-014 | **成立，且是本序列最扎实的一格**。同一个 wheel 被 4 个 package 平台各消费一次，`mergeReports` 逐平台比对三个字段（`reporting.mjs:377-415`），单测覆盖「其中一个平台 sha 不同」与「其中一个平台 smoke 零执行」两种失败（`reporting.test.mjs:166-186`）。这是真正的"第二次及以后使用" |
| **retry** | REQUIRED \| AC-014 | **成立，但取证方式必须写死，否则不可执行**。CI 重跑存在两种语义：单独重跑 `package-matrix` 会 `download-artifact` 取回**原** wheel（正确的 retry 语义）；而重跑 `deterministic-checks` 会**重新构建**一个 wheel。**建议 AC-014 把 retry 格的取证钉为前者**：对同一 run 重跑 `package-matrix`，断言其 `artifact_sha256` 与首跑逐字相同。该取证不依赖 `upload-artifact@v4` 的同名覆盖语义（见 U-24） |
| **resume** | NOT_APPLICABLE \| 发布构建是一次性不可变产出，失败后重新构建新 candidate 而不是恢复中断的构建 | **理由成立，且本 owner 能给出边界内的源码实证**：`build-unchain-artifact.mjs:74-79` 在输出目录已含 wheel 时**直接抛错**（`artifact output directory already contains a wheel`）—— 代码显式拒绝"接着上次继续"；`run-with-unchain-artifact.mjs:68-72,118-122` 每次 `mkdtempSync` 新目录并在 `finally` 里 `rmSync`，不存在可恢复的中间态。**建议把这两处写进 NOT_APPLICABLE 的理由里**，把"没有 resume 语义"从设计声明升级为源码事实（M-28） |
| **restart** | REQUIRED \| AC-014 | **成立，且已有天然取证**。`package-sidecar-smoke.mjs:126-142` 每次 `spawn` 全新进程 + `mkdtempSync` 的全新 `UNCHAIN_DATA_DIR`，本身即冷启动取证；`PYTHONPATH: ""` 与 `UNCHAIN_SOURCE_PATH: ""` 被显式清空，排除环境残留 |
| **reset** | NOT_APPLICABLE \| 已发布 artifact 不得 reset，只使用显式回滚 | **成立**。实测：`.github/workflows/` 内**无任何** `delete-artifact` 或 `overwrite` 用法（`grep` 零命中）；`upload-artifact` 的 `retention-days` 是过期而非 reset。理由与实现一致 |
| **rollback** | REQUIRED \| AC-014 | **成立，但今天无自动化执行点，须写明取证方式**。回滚在本仓是人工动作：以 `workflow_dispatch` 把 `unchain_ref`（release-qa.yml:24-27，默认 `dev`）指向前一版本重跑 release 模式，产出**新的** wheel 与 evidence。**建议 AC-014 把 rollback 格取证钉为**：回滚重跑一次后，断言 (i) report 的 `unchain.source_ref` 与 `artifact_sha256` 相对回滚前**已变化**；(ii) 变化后三处仍互等（V-1b 的断言继续成立）；(iii) `deterministic_result.status` 仍为 `passed`，即回滚本身不降级结论。**同时确认 SEQ-007 「回滚不删除任何 journal 或证据」今天成立**：release-qa 全流程零 journal 写入，package smoke 的数据目录是 `mkdtempSync` 临时目录并在 `finally` 中 `rmSync`（:126,:201-204），不触碰任何用户目录 |

### 3.3 对 SEQ-007 其余字段的复核

- **identity key** —— **有一处实质勘误，见 M-28**。现文含「evidence 文件 digest」，但**本仓不存在这个量**：没有任何脚本计算 evidence 文件自身的 SHA-256；`readAndVerifyUnchainArtifactEvidence` 只解析它并核对它所描述的 wheel。identity key 引用了一个不存在的可观测量。
- **initial state** —— 成立。无 evidence 文件时 `verifyWheelRuntimeManifest` 抛错，`run-local-gate.mjs:50-63` 记 `artifactFailure` 且 `checks` 为空数组，required checks 全部判 missing → `failed`。"结论为 INCOMPLETE"在初始态即 fail-closed。
- **ordered events** —— **少一步，见 M-29**。现文为「一次构建产出 wheel 与 evidence → 冻结 PuPu candidate → 契约矩阵 → package smoke → release report → active rollout → 回滚」，缺了紧跟构建之后的**安装与 `direct_url.json` 核对**（release-qa.yml:91-101）—— 而那正是 `expected observations` 第二句的唯一执行点。
- **persistence boundary** —— 成立。补一条本 owner 边界内的既有证据：本地门的 `release worktree remained unchanged`（`run-local-gate.mjs:116-132`）证明整个 QA 过程不改工作树。**CI 侧无对应检查**，见 §4 的 V-7。
- **boundary contracts: BC-001..BC-004** —— 成立。SEQ-007 是四个 BC 共用的部署 artifact 同一性底座，不专属任何一个。

---

## §4 交付四 · AC-012 位置 (D) fixture 的发布侧影响

### 4.1 fixture 在 release-qa 流程中的生成与校验落点

fixture 路径：`src/PAGEs/chat/hooks/__fixtures__/context_v2_rebase_error_envelopes.json`。**实测：该目录今天不存在**（`ls` 报 `No such file or directory`），符合"由本案实施期创建"的预期。

| 角色 | CI 落点 | 本地门落点 |
|---|---|---|
| **生成 + diff 校验**（AC-011 子例 6 的 pytest） | `deterministic-checks` job 的 **`Python backend tests`** 步（release-qa.yml:142-148），cwd `pupu/unchain_runtime/server`，`PYTHONPATH=<wheel>`。**这是 CI 中唯一会跑 pytest 的地方** | `local-gate-checks.mjs:28-33` 的 `python backend tests`，同法 |
| **消费**：位置 (A)(B)(C)(D) 与位置 (F) 的 G2/G3 | `Frontend tests` 步（:128-134，`react-scripts test`） | `frontend tests` |
| **消费**：位置 (E) 的 E2 | `Electron tests` 步（:136-140）**与** `Frontend tests`（经 S3 CRA shim） | `electron tests` + `frontend tests` |

**一条必须写进验收正文的顺序事实（实测自 YAML 行号）**：`Frontend tests`(128) 与 `Electron tests`(136) 都排在 `Python backend tests`(142) **之前**。因此**消费方先读入库的 fixture，生产方后重算并 diff**。两者都必须绿，正确性不受影响，但**fixture 漂移的失败会归因到 python 步而非前端步** —— 验收人与实施者都应预先知道，否则会在错误的位置排查。

### 4.2 CI 需要的 diff 校验义务（V-7，可验收描述）

K-17 把 diff 校验的责任放在 AC-011 子例 6 的 pytest 内（"重新生成并 diff 校验，diff 不一致即失败"）。**本地门今天已有一道独立的第二重保险，CI 侧完全没有。**

- **本地门：已足够，无需新增。** `run-local-gate.mjs:116-132` 的 `release worktree remained unchanged` 用 `computeWorktreeFingerprint` 在 QA 前后各算一次；该指纹含 `git diff --binary HEAD` 与全部未跟踪文件内容（`worktree-fingerprint.mjs:22-47`）。若 pytest 就地覆写 fixture 且内容有差，指纹必变 → 该 check 失败。
- **CI：缺。** `deterministic-checks` job 无任何工作树稳定性检查。若子例 6 自身的 diff 断言被写坏（例如退化为"写了就算过"），CI 不会发现。

> **V-7 · CI 侧工作树稳定性门（可验收描述）**
>
> 在 `deterministic-checks` job 内新增两步，复用既有 `scripts/release-qa/worktree-fingerprint.mjs`（已有单测 `worktree-fingerprint.test.mjs`），另加一个薄入口 `scripts/release-qa/worktree-guard.mjs`（本 owner 边界）：
> 1. **基线步**：位置在 `Install Node dependencies` 与 `Resolve QA version` **之后**、`Frontend tests` **之前**，写出 `.release-qa/worktree-baseline.txt`；
> 2. **核对步**：位置在 `Release QA script tests` 之后、`Write deterministic QA report` 之前（须 `if: always()`），重算指纹并与基线比对，不等即失败，失败时把 `git status --porcelain=v1 --untracked-files=all` 全文与 `git diff --stat HEAD` 打印到 `::error`；
> 3. 该 check 加入 `QA_CHECKS_JSON` 与 `QA_REQUIRED_CHECKS_JSON`，名称 `release worktree remained unchanged`（与本地门同名，使两处报告可直接对读）。
>
> **前置事实已核实（本义务不会恒红）**：`/.release-qa`（`.gitignore:12`）、`/build` 与 `build/`（:15,:51）已忽略；`prepare-build-version.cjs` **零写入**（实测 `grep writeFileSync|appendFileSync|mkdirSync|rmSync` 零命中）；`build-web.cjs` 的唯一写入落在 `build/build_feature_flags.json`（已忽略）。
> **red-before-green**：在基线步之后插入一条临时的 `echo x >> src/setupTests.js`，断言核对步变红且错误里逐字打印该路径；删除后变绿。
> **该义务同时守住的不止 fixture**：任何测试意外写工作树都会被它抓到。

### 4.3 生产侧哨兵缺失（V-8，跨 owner 协作项）

位置 (E) 的 E2 与位置 (F) 的 G2/G3 都明文规定「fixture 缺失、为空、缺 key 时**必须 FAIL 而非 skip**」——**消费侧有哨兵，生产侧没有**。fixture 的生产者今天只跑在 `Python backend tests` 这个 bulk 步里，而该 check：不在 `DETERMINISTIC_REQUIRED_CHECKS`（`reporting.mjs:16-19`），也不在 `NONZERO_EVIDENCE_CHECKS`（:42-48）。子例 6 被改名或删除时，没有任何机制会红（`pytest tests/` 仍会收集到其余用例并通过）。

> **V-8 · 把 AC-011 子例 6 的 pytest nodeid 纳入 `PUPU_ADAPTER_CONTRACT_TESTS`**
>
> 实施期由 runtime owner 给出子例 6 的精确 nodeid（形如 `tests/test_route_memory_v2.py::<Class>::<test>`），由 devtools 加入 `scripts/release-qa/context-v2-contract-matrix.mjs:18-28`。收益有二：(i) 它随之进入 `Context V2 boundary contracts` 这个**既是 required、又是 nonzero-evidence** 的门；(ii) `run-context-v2-contract.mjs` 以**精确 nodeid** 调 pytest，用例被改名或删除会立刻非零退出。这把 fixture 生产侧从"无哨兵"提到"精确 nodeid 哨兵"，与消费侧的 FAIL-not-skip 规则对称。
> **本条是跨 owner 协作项**：nodeid 由 runtime 提供，`context-v2-contract-matrix.mjs` 的改动在 devtools 边界。请 lead 在 PLAN_RULING 的实施排序中把它排在子例 6 落地之后。

### 4.4 对 RSP-2 的支持意见

Speaker 在 S-0027 的 RSP-2 记录了 U-18「把 fixture 路径视为稳定引用点」。本 owner 支持，并补一条**本边界内可执行的落实方式**：fixture 路径同时是 `.gitignore` 的**反向关切** —— 须确认 `src/PAGEs/chat/hooks/__fixtures__/` 不落入任何忽略规则，否则 K-17 的"入库"会静默失败而 CI 在 `Frontend tests` 阶段变红且指向错误原因。本 owner 已核对 `.gitignore` 现有条目不覆盖该路径，但该文件在实施期才创建，建议在 V-7 的核对步失败信息里包含未跟踪文件清单（已含），使"该写没写进 git"这一类失败可被直接读出。

---

## §5 交付五 · U-15 尾巴

**`NOT_APPLICABLE`。**

理由（一句话）：`intake/chief-directive.md` 全文未要求真实 Electron IPC（C4）证据 —— 其 14 条验收矩阵第 14 项只要求「新 wheel + PuPu candidate + runtime manifest 做 exact deployed-pair 验证」（即 AC-014，本棒已交付），lead 已在 PS-004 §I 定案不要求，Chief 至今无相反表态，故本棒不承接。

> **备查 · 若 Chief 日后要求，本 owner 的可行性与代价判断（不构成本次交付）**：真实 C4 证据只能来自 `e2e/**` 的 playwright Electron 用例，需要让主进程在受控条件下从 `ipcMain.handle` 抛出带 `[code] ` 前缀的错误，再在 renderer 侧断言 `parseContextV2ErrorCode` 的返回。**代价的要害不在 e2e spec 本身，而在那条注入通道**：本仓没有任何"在 e2e 模式下让主进程按指令抛特定错误"的既有机制，新增它是 `electron/main/**` 的**生产代码改动**，会把本案 write_set 从"一处纯注释"扩到跨两个 owner 的运行时开关。lead 原文只写了"不成比例"，本 owner 补上这个具体代价 —— 结论与 lead 一致，但理由比"单开 e2e 不划算"更硬：**为验证一个已被三处独立锁定的框架行为，去生产代码里开一个测试专用注入口，本身就是更大的风险面。**

---

## §6 Speaker flagged item 表态（S-0026）

**选 (a)：确认现状齐备，且实施期预期对 `src/electron/tests/**` 的改动为零；接受「若需改动再按程序补」。**

### 6.1 实测证据（本 owner 独立核对，不采信转述）

两组三槽逐路径 `-f` 测试，6/6 存在：

```
electron/tests/main/context_v2_service.test.cjs      OK   (S1 权威 body)
electron/tests/main/context_v2_service.test.js       OK   (S2 同目录 shim)
src/electron/tests/main/context_v2_service.test.js   OK   (S3 CRA shim)
electron/tests/main/ipc_channels.test.cjs            OK
electron/tests/main/ipc_channels.test.js             OK
src/electron/tests/main/ipc_channels.test.js         OK
```

四个 shim 逐字读取，内容全部正确：S2 为 `require("./<name>.test.cjs");`，S3 为 `require("../../../../electron/tests/main/<name>.test.cjs");`。

**槽位计数交叉验证**：本 owner 用 `find src/electron/tests -name '*.test.js' | wc -l` 得 **40**，与 HS-003 用 `react-scripts test --listTests | grep -c "/src/electron/tests/"` 得到的 **40** 一致。两法互不依赖（一个数文件系统，一个数 CRA 实际收集面），因此 AC-012 位置 (E) 执行步骤第 (2) 步里那个常量 **40 是对的，可以直接冻结**。

### 6.2 为什么预期改动为零

位置 (E) 采用"在既有 S1 文件内追加 `describe` / `test`"，新增内容全部落在 `electron/tests/main/*.test.cjs`（electron owner 边界）。S2 与 S3 是**单行 require**，与被 require 文件的内容无关 —— 只要不新建文件、不改文件名，shim 就不需要任何改动。这正是 HS-003 选择"追加而非新建"的收益，本 owner 复核后确认该收益成立。

### 6.3 请 lead 在集成时补一个机械触发器（M-30）

接受 (a) 的同时，本 owner 请求一个**零成本、不扩 write_set** 的保险，理由是"若需改动再按程序补"目前只靠实施者自觉：

> AC-012 位置 (E) 的执行与同步验证第 (2) 步今天写的是「`grep -c "/src/electron/tests/"` 的值与改动前一致（当前为 40）」。请把它的**语义**明确为：**该值若在实施后不等于 40，即判定为"需要新增或改动 S3 槽位"，实施必须就地停止并按程序向 devtools 补一棒，不得由实施者直接在 `src/electron/tests/**` 下写文件。**

这样"若需改动再按程序补"从一句约定变成一个有具体数值、跑一条命令就能判定的闸门。

### 6.4 一条边界归属勘误（M-31）

R9 记载的 3 处缺 CRA shim，本 owner 独立复核**属实**：`electron/tests/main/{chat_storage_lifecycle,ollama_service,settings_quit_coordinator}.test.cjs` 三者 S1 与 S2 齐备，`src/electron/tests/main/` 下**无对应 S3**。

**但 R9 的一句话归属写错了。** HS-003 称"修它会把 electron 的 write_set 从零扩到 3 个文件"——**不会**。补 S3 shim 的写入点是 `src/electron/tests/main/*.test.js`，那是 **`pupu:src/electron/**` = devtools 边界**，不是 electron 的。本 owner **同意本案不修**（非发布风险：CI 与本地门都同时跑 `test:frontend` 与 `test:electron`，这 3 处仍被后者执行，真实损失只在开发回路），但**归属必须写对**，否则日后为它立案会找错 owner，白走一轮路由。

---

## §7 修改意见（M-28 至 M-32）

- **M-28（SEQ-007 `identity key`；实质勘误）** —— 现文含「evidence 文件 digest」，本仓不存在该可观测量（无任何脚本计算 evidence 文件自身的 SHA-256）。**建议改为**「一次构建的 unchain wheel SHA-256 加 evidence 文件所载三元组（`artifact.sha256` + `runtime_manifest.manifest_digest` + `source.revision`）加 PuPu candidate revision 加 rollout 模式」。**不建议**真的引入 evidence 文件 digest：它会多出一个必须在三处传递的量，而检出能力不增加（evidence 的内容一致性已被三元组比对完全覆盖）。同时建议把 `resume` 格 NOT_APPLICABLE 的理由补上源码执行点（`build-unchain-artifact.mjs:74-79` 拒绝已含 wheel 的输出目录、`run-with-unchain-artifact.mjs` 每次 mkdtemp+rmSync），把设计声明升级为源码事实。

- **M-29（SEQ-007 `ordered events`；实质，补一步）** —— 现文缺紧跟构建之后的**安装与 `direct_url.json` 核对**这一步，而那是 `expected observations` 第二句的唯一执行点。**建议改为**：「一次构建产出 wheel 与 evidence → **安装该 wheel 并以 `direct_url.json` 核对已安装 dist 的归档 sha256 与文件名** → 冻结 PuPu candidate → 契约矩阵引用同一 evidence → package smoke → release report → active rollout → 需要时回滚」。另建议在 `expected observations` 末尾补一句写明 **rollout 与 rollback 在本仓是人工步骤**（改 `unchain_ref` 重跑），其可观察结果的载体是 `release-qa-report.json` 的 `unchain` 块与 `git` 块 —— 否则验收人会去找一个不存在的自动化 rollout 执行点。

- **M-30（AC-012 位置 (E) 第 (2) 步语义；程序性，零成本）** —— 见 §6.3。把 `40` 这个数从"记录值"升级为"判定阈"：不等于 40 即判定需要新增/改动 S3 槽位，实施停止并按程序补棒。

- **M-31（R9 的边界归属；勘误）** —— 见 §6.4。R9 的 3 处缺 S3 shim，其修复写入点在 `src/electron/tests/main/**` = **devtools 边界**，不是 electron 的 write_set。本案仍不修，但归属须更正。

- **M-32（AC-014 的 `INCOMPLETE` 表达；澄清）** —— job report schema 里**没有** `INCOMPLETE` 这个状态值，`deterministic_result.status` 只有 `passed` / `failed`。AC-014 现文「任一不一致时结论为 INCOMPLETE 而非 GO」若不加限定，验收人会去找一个不存在的字段。**建议按 §2 的 E 段写成四条可观察后果的约定**，并明确 `INCOMPLETE` / `GO` / `NO-GO` 是 release certification 的结论词汇而非报告字段。**本 owner 不建议为此改报告 schema** —— 增设第三状态会波及全部既有消费点，收益只是词汇对齐。

---

## §8 remaining unknowns（U-24 至 U-26）

- **U-24 · `upload-artifact@v4` 对同名 artifact 的行为** | code-owner-devtools 自持 —— 重跑 `deterministic-checks` 会重新构建一个 wheel 并尝试再次上传 `unchain-release-artifact`。本 owner **相信**（但未实测）v4 默认 `overwrite: false` 会使同名上传失败，从而 fail-closed；实测 `grep overwrite .github/workflows/` 零命中，即本仓未显式设置该项。**处置**：§3.2 已把 retry 格的取证钉为"重跑 `package-matrix`"，该取证**不依赖**这条未知，故它不阻塞 SEQ-007 确认。若 Chief 希望消除该未知，代价是一次真实 CI 重跑观察，属发布期动作而非本案。

- **U-25 · 位置 (D) fixture 是否被 pytest 就地覆写** | code-owner-runtime —— V-7（CI 工作树门）与本地门的 `release worktree remained unchanged` 的**行为完全取决于**子例 6 是写临时路径后比对、还是就地覆写后比对。若是前者，两道工作树门对 fixture 漂移**不产生任何信号**（漂移只由 pytest 自身断言捕获）；若是后者，两道门成为独立的第二重保险。**两种实现本 owner 都能接受**，但请 runtime owner 在 RS 时明示采用哪一种，因为它决定了 AC-014 与 AC-011 的验收正文该不该引用工作树门作为 fixture 的取证之一。**本 owner 的倾向是"就地覆写后比对"**：它让 fixture 漂移在两个独立机制下都可见，且失败时 `git diff` 直接给出人可读的差异。

- **U-26 · V-8 所需的 nodeid** | code-owner-runtime —— 把子例 6 纳入 `PUPU_ADAPTER_CONTRACT_TESTS` 需要精确 nodeid，而该用例尚未写。请在实施期提供。在此之前 V-8 只能作为义务描述存在，不能落地。

---

## §9 stance 预登记

本 owner 在 RS-001 冻结后，将对自身块（SLOT-006 / SEQ-007 / AC-014 artifact 段）登记 **AGREE**，**前提是 §3.1 的唯一条件成立** —— 即 V-1 与 V-2 两条补齐义务被写入 AC-014 正文。

若 V-2 被以"不处理"结案（即 `Python backend tests` 与本地门的 `python backend tests` 不补 `UNCHAIN_ARTIFACT_EVIDENCE_PATH`），本 owner 将改登记 **OBJECT**，异议仅限一条：**AC-014 的运行时段要求 pytest 比对 evidence 文件，而该 pytest 的两处运行环境都拿不到那个文件，该断言在物理上无法实现** —— 不涉本案任何实体设计。

另请 lead 在集成时把 **AC-014 列入本 owner 的 owned block**（本件为其撰写了 artifact 段正文），与 S-0027 的 RSP-1 对 AC-012 五方分段的处置同理，否则会出现"有人对自己撰写的正文无权登记 stance"。

## §10 recommended next handoff

**无。** 本件未发现任何落在其他 owner 边界、且本案尚未覆盖的新边界缺口：

- V-1、V-3、V-4、V-7 全部落在 `scripts/release-qa/**` 与 `.github/workflows/**` = devtools 边界；
- V-2 的两个写入点（release-qa.yml 的 env、`local-gate-checks.mjs` 的 env）同样在 devtools 边界，其**受益方**是 runtime 已交付的 AC-014 运行时段，不需要再开一棒 —— runtime owner 在 RS 窗口内即可对该条件表态；
- V-8 与 U-25 / U-26 是 runtime owner 在 RS 窗口内即可回答的事项，不构成新的交付面；
- §6 的 flagged item 已按 (a) 收口，不请求扩 write_set。

**建议：返回 lead 集成为 PS-006 后直接冻结 RS-001。**
