---
case_id: 0000-0001-2026-0807
updated_at: 2026-08-07T16:06:00-07:00
---

# 证据台账

`验证历史` 只能追加。状态至少区分 **已验证**、**未验证** 与 **相矛盾**；`Witness` 证言对应使用 **已佐证**、**未佐证** 与 **相矛盾**。

### E-0001 | repository
- **来源定位**: `docs/architecture/memory-v2-claude-handoff-2026-08-07.md`（757 行，PuPu 工作树）
- **取得方式**: 当前 checkout 只读检查
- **提交发言**: S-0002
- **支持/反驳**: 支持 S-0002（本案议案依据）
- **完整性限制**: **文件 untracked**（`git status --porcelain` 输出 `?? docs/architecture/memory-v2-claude-handoff-2026-08-07.md`），不在任何 commit 中，无法以 SHA 固定；且 `docs/**` 依 [A-009](../../../codex/adaptations.md#a-009--显式无-owner-清单) 显式无 owner，**无 owner 为其内容真实性背书**。文档为单一作者的交接自述，其中的完成度百分比为主观自评（§1 明示）。引用其内容的具证明力主张必须自行核对到代码、命令或 DB
- **验证历史**:
  - S-0002 | 已验证 | 文件存在于工作树且为 untracked；§10 的 DB 行数与 §2 的仓库锚点已由 E-0002 / E-0003 独立复核一致；文档正文其余部分未逐条验证

### E-0002 | repository
- **来源定位**: `~/Library/Application Support/PuPu/memory_v2/context_v2.sqlite3`（official store，immutable 只读快照）
- **取得方式**: `sqlite3 'file:/Users/red/Library/Application%20Support/PuPu/memory_v2/context_v2.sqlite3?immutable=1' "select count(*) ..."`，2026-08-07T16:05-07:00
- **提交发言**: S-0002
- **支持/反驳**: 支持 S-0002 的「跨会话闭环未证明」已知缺口
- **完整性限制**: immutable URI 只能用于快照观察，不能作在线一致性判断；读取时应用可能正在运行，WAL 中未 checkpoint 的写入不可见。仅反映本机 dev 环境，不代表任何其他安装
- **验证历史**:
  - S-0002 | 已验证 | 实测 `executions=1`、`events=17`、`spaces=2`、`entries=0`、`artifacts=4`、`candidates=0`、`consolidation_jobs=0`、`promotion_proposals=0`，与 E-0001 §10 表格逐行一致

### E-0003 | repository
- **来源定位**: PuPu `git rev-parse HEAD`、unchain `git rev-parse HEAD`、`unchain_runtime/unchain-core.lock.json`、`git diff --stat cd56dc0f..HEAD`
- **取得方式**: 只读 git 与文件读取，2026-08-07T16:05-07:00
- **提交发言**: S-0002
- **支持/反驳**: 支持 S-0002 的「E-0001 代码锚点对本次庭审仍然成立」
- **完整性限制**: 只证明 PuPu 侧自 `cd56dc0f` 起产品代码未变，不证明 unchain 侧工作树干净，也不证明未提交的工作树改动不存在
- **验证历史**:
  - S-0002 | 已验证 | PuPu HEAD `14ca3ccc`；unchain HEAD `a4e69f41`；lock revision `a4e69f41`、`context_memory_contract: 1`，握手一致。`cd56dc0f..HEAD` 仅一次提交（组织改制），排除 `.claude/**` 后仅 `CLAUDE.md` 变更 6 行，产品代码零变更

### E-0004 | repository
- **来源定位**: `.claude/agents/pupu/code-owner-settings.md` 的「所有权边界声明」段；文件系统 `src/COMPONENTs/memory-inspect/`（含 `memory_inspect_modal.js`、`memory_inspect_modal.test.js`）与 `src/SERVICEs/memory_agent_settings.js`
- **取得方式**: 只读读取 charter + 文件存在性检查，2026-08-07T16:10-07:00
- **提交发言**: S-0004
- **支持/反驳**: 支持 S-0004（`code-owner-settings` 的补行传唤依据）
- **完整性限制**: 只核实了两处直接命中；该 owner 边界声明中的其余条目（`settings/**`、`workspace/**`、`diff/**`、`feature_flags.js` 等）是否也命中，留由其本人在 `ASSESSMENT` 中判定
- **验证历史**:
  - S-0004 | 已验证 | 边界声明含 `pupu:src/COMPONENTs/memory-inspect/**` 与 `pupu:src/SERVICEs/memory_agent_settings.js` 两条；两处路径均存在于工作树

### E-0005 | repository
- **来源定位**: `unchain_runtime/server/route_memory_v2.py`（1503 行，30 个 `@api_blueprint` 路由，末个在 1490）
- **取得方式**: `grep -n "@api_blueprint\.\|^def " route_memory_v2.py`；`grep -n "task_state\|taskState" route_memory_v2.py` → **零命中**；`grep -n "artifact" route_memory_v2.py` → **零命中**；`awk 'NR>1490 && /@api_blueprint\./'` → 空
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005 的 Q6（task-state 路由确不存在）、Q7（artifact 列表确不存在）、Q5（无独立 admission 路由）
- **完整性限制**: 只覆盖 `route_memory_v2.py`；不排除其他 blueprint 存在同类路由（另查 `route_projection.py`，无）
- **验证历史**:
  - S-0005 | 未验证 | 由 `code-owner-runtime` 在其边界内取证，Speaker 未独立复核

### E-0006 | repository
- **来源定位**: 探针脚本（scratchpad，非项目内）；根因在 `unchain_runtime/server/route_memory_v2.py:96-104` 与 `memory_v2_unchain_read_adapter.py:65`
- **取得方式**: `cd unchain_runtime/server && PYTHONPATH=/Users/red/Desktop/GITRepo/unchain/src:. ../../.venv/bin/python <脚本>`。实测输出：`PupuUnchainMemoryV2ReadError is a MemoryV2Error subclass: False`；`GET /context/v2/content -> 500 {'code': 'context_v2_failed'}`；`GET /context/v2/.../tree -> 500 同上`；`GET /context/v2/.../entries (empty, healthy) -> 200 {'entries': [], 'has_more': False}`。另 `grep -rn "context_v2_failed\|== 500" tests/test_route_memory_v2.py` → 零命中
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005 的 Q8；**部分反驳** E-0001 §12 的措辞（不只是「部分 content read 错误」，`get_tree` 等全部读路径同病）
- **完整性限制**: 用 mock reader 复现，非真实 unchain store 上的端到端；但根因是类型继承 + `except Exception`，与 reader 实现无关。脚本只读，未落文件到项目内
- **验证历史**:
  - S-0005 | 未验证 | 由 `code-owner-runtime` 取证；脚本位于 scratchpad，Speaker 未复跑

### E-0007 | repository
- **来源定位**: `unchain_runtime/server/route_memory_v2.py:288-312`（code→status 映射）、`:113-211`（`_context_v2_chat_state_exists_read_only` 只读探针）、`:236-247`（OFF 分支）、`:1057-1067`（路由）；`src/SERVICEs/bridges/context_v2_bridge.js:105`
- **取得方式**: 直接读取 + `grep -rn "_context_v2_chat_state_exists_read_only"`（仅 113/237/292 三处，未被独立路由）
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005「Q5 分流不需要新契约」；支持「503 not_ready 第三态今天无 UI 落点」
- **完整性限制**: **未实测 `session_id` 为空时的行为** —— 若 Inspector 场景下无 session_id，此判据可能不可直接复用
- **验证历史**:
  - S-0005 | 未验证 | 由 `code-owner-runtime` 取证，Speaker 未独立复核

### E-0008 | repository
- **来源定位**: `unchain_runtime/server/memory_v2_unchain_read_adapter.py:48-62`（4 条 URI 正则）、`:505-515`（`_route_resource_uri`）、`:517-530`（`_route_json_value` 递归翻译）、`:532-568`（`_route_entry`）、`:217-296`（`read_scoped_content` 四路解析）
- **取得方式**: 直接读取
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005 的 Q7「不新增 `listArtifacts`」
- **完整性限制**: 未端到端验证真实 event payload 中确有 artifact ref（本机 `artifacts=4` 但 `entries=0`，见 E-0002）；机制成立，实际覆盖率未测
- **验证历史**:
  - S-0005 | 未验证 | 由 `code-owner-runtime` 取证，Speaker 未独立复核

### E-0009 | repository
- **来源定位**: `unchain_adapter.py:7605`、`:7150-7163`、`:5734/5761`、`:960/9646`；`memory_v2_store_boundary.py:96`、`:341/365/380`；`electron/main/services/unchain/memory_v2_rollout.js:150`；依赖者 `memory_v2_context_adapter.py:26`、`memory_v2_task_state_adapter.py:11`、`memory_v2_context_reference_policy.py:21`、`context_memory_v2_repository.py:670/706`、`tests/export_memory_v2_contract_fixtures.py:42/48/517`
- **取得方式**: `grep -rn "<module>" unchain_runtime/server --include="*.py" | grep -v /tests/ | grep -v __pycache__`，逐模块跑
- **提交发言**: S-0005
- **支持/反驳**: **更正** E-0001 §13 与议案 Q10 的「旧 fallback」措辞；证明 Q10 清单漏两个非测试依赖者 + 一个 fixture 导出器
- **完整性限制**: 只做静态引用分析，**未跑 GitNexus impact**（E-0001 §12 记载索引落后 HEAD）；未证明历史版本是否产生过 `pupu_legacy` DB
- **验证历史**:
  - S-0005 | 未验证 | 由 `code-owner-runtime` 取证，Speaker 未独立复核

### E-0010 | repository
- **来源定位**: `src/PAGEs/chat/hooks/use_chat_stream.js:6483`；`src/SERVICEs/runtime_events/memory_v2_trace_presenter.js:283/290/291`；`src/SERVICEs/memory_agent_settings.js:22`；`memory_v2_unchain_agent_selection.py:51/250/364/433` 等；`memory_v2_unchain_agent_factory.py:17`
- **取得方式**: `grep -rn "memory_agent|MemoryAgent|Memory Agent" unchain_runtime/server --include="*.py" | grep -v /tests/ | wc -l` → **620**，跨 **12** 个非测试文件；renderer 侧同名 grep
- **提交发言**: S-0005
- **支持/反驳**: 反驳「Q9 是命名债务」这一定性 —— 至少四类是契约而非名字
- **完整性限制**: 620 是行命中数不是符号数；未逐条区分内部符号与契约，但已举出四类中每类至少一个确证实例
- **验证历史**:
  - S-0005 | 未验证 | 由 `code-owner-runtime` 取证，Speaker 未独立复核

### E-0011 | repository
- **来源定位**: `unchain: src/unchain/persistence/sqlite_read_v2.py`（`grep task_state` → **零命中**）；`unchain: src/unchain/persistence/sqlite_memory_v2.py:463`（`bind_task_state(binding_id=, state_id=)`）、`:259-265`（`task_state_heads` / `task_state_revisions`）；`PuPu: memory_v2_unchain_read_adapter.py:570-650`；`PuPu: memory_v2_task_state_adapter.py:11`
- **取得方式**: 两仓 grep + 直接读取
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005「Q6 是 5 层不是 4 层，第 0 层在 unchain」；支持「`bind_task_state` 返回写能力仓储，不能塞进读路由」
- **完整性限制**: 提交人只查了 `sqlite_read_v2.py` 与 `sqlite_memory_v2.py`；**不排除 unchain 别处有未找到的只读 task-state 面** —— 提交人本人要求由 `code-owner-unchain` 确认
- **验证历史**:
  - S-0005 | 未验证 | 由 `code-owner-runtime` 跨仓取证；**Speaker 已将本条交 `code-owner-unchain` 对质（见 S-0006 线程）**，验证状态待其回应后追加

### E-0012 | repository
- **来源定位**: `unchain_runtime/server/route_memory_v2.py:1160-1162`（`GET .../entries/<entry_id>`）；`electron/shared/channels.js:120-145`（契约注释 + 18 个 `CONTEXT_V2` channel，无 `GET_ENTRY`）；`src/SERVICEs/bridges/context_v2_bridge.js:96-122`（19 个方法，无 `getEntry`）
- **取得方式**: 三层清单逐一 grep 后对差
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005 的 Q4-A；佐证 E-0001 §7.3 关于 renderer 能力的描述 **在 renderer 层为真**，但收窄发生在 Electron/preload，**不在 Flask**
- **完整性限制**: 未核实 `listEntries` 的返回是否已含 provenance 字段；若已含，Q4-A 的紧迫度下降但不消失
- **验证历史**:
  - S-0005 | 未验证 | 由 `code-owner-runtime` 取证；**已交 `code-owner-electron` 与 `code-owner-shared-arteries` 对质**（清单差落在它们边界内）

### E-0013 | repository
- **来源定位**: `unchain_runtime/server/route_projection.py:69-70`（`_empty_projection_payload`）、返回点 `:393/:397/:401/:448/:452/:480/:493`、路由 `:406`
- **取得方式**: 直接读取
- **提交发言**: S-0005
- **支持/反驳**: 支持 S-0005 的 Q2（V2 chat 看到的是「格式完好的空成功」而非错误）
- **完整性限制**: 静态读取，未跑真实 Qdrant 故障场景
- **验证历史**:
  - S-0005 | 未验证 | 由 `code-owner-runtime` 取证，Speaker 未独立复核

### E-0014 | repository
- **来源定位**: `cd unchain_runtime/server && PYTHONPATH=/Users/red/Desktop/GITRepo/unchain/src ../../.venv/bin/python -m pytest -q tests/test_context_memory_v2_capability.py tests/test_memory_v2_capability_admission.py tests/test_runtime_contract_health.py tests/test_route_memory_v2.py`
- **取得方式**: 实际执行，输出 `49 passed, 3 subtests passed in 2.14s`
- **提交发言**: S-0005
- **支持/反驳**: **独立佐证** E-0001 §11「PuPu Python sidecar: 49 passed, 3 subtests passed」；为 Q8/Q10 改动提供回归基线
- **完整性限制**: 只覆盖 4 个 focused 文件，不是 sidecar 全量。E-0001 §11 的 unchain 侧 `2824 passed` **未被复核**
- **验证历史**:
  - S-0005 | 已验证 | 由 `code-owner-runtime` 在其边界内实跑，命令与输出均已给出，可复现

### E-0015 | repository
- **来源定位**: `unchain_runtime/server/memory_v2_unchain_ownership_adapter.py:6-7` —— 原文「the P0 production gate remains closed and shadow preparation has no model/tool surface」
- **取得方式**: 直接读取；与 E-0009 的 `official_context_v2_active` 活路径对照
- **提交发言**: S-0005
- **支持/反驳**: 佐证 E-0001 §12 该条；但 **加重其定性** —— 这是关于「本模块有无模型/工具面」的断言，会误导安全评审，不是普通注释债
- **完整性限制**: 只核了该文件顶部 docstring，未全仓扫描同类失效注释
- **验证历史**:
  - S-0005 | 未验证 | 由 `code-owner-runtime` 取证，Speaker 未独立复核
