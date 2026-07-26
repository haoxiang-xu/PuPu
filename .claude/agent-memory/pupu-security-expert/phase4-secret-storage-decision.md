---
name: phase4-secret-storage-decision
description: Settings-SQLite Phase 4 敏感凭据迁移的安全签字门——选 safeStorage(方案B)、Linux fail-closed、dual-keep 回滚、注入移主进程=CTO ADR、MCP/OAuth defer
metadata:
  type: project
---

Settings→SQLite 迁移 Phase 4（provider secret 迁移）安全签字门裁决（2026-07-25，守出具）。
计划：`docs/architecture/settings-sqlite-migration-plan.md` §3.7/§6-Phase4/§5.5。报告初稿在会话 scratchpad（不入库）。

**结论：GO（有条件）。推荐方案 B（Electron `safeStorage` 加密 BLOB 存 settings.db 专表）。**

**Why 选 B 非 A：** safeStorage 是 Electron 40 内建、零新依赖；方案 A 触达 OS vault 需原生模块（keytar 已 archived），会扩大我主管的供应链/发布完整性面。safeStorage 的密钥本就由同一批 OS 库（mac Keychain / Win DPAPI / Linux libsecret|kwallet）托底——A 相对 B 的"进真 vault"优势对 PuPu 是幻觉。机器绑定密文天然防备份外带（T3）。

**七门裁决（How to apply，动到 Phase 4 代码时照此复核）：**
1. 方案=B，密文入 `provider_credentials` 专表，绝不进 `settings.model_providers` value_json。
2. **门3 Linux fail-closed**：`isEncryptionAvailable()===true` 且 `getSelectedStorageBackend()∉{basic_text,unknown}` 才算可用；**禁 `setUsePlainTextEncryption`**；不可用则不迁移、secret 留 localStorage、报 degraded、绝不落明文 SQL（零回归）。safeStorage 须 app ready 后用（现 init 在 whenReady 内，满足）。
3. **门4 回滚 dual-keep**：发布 N 写密文 SQL + 往返验证(`decryptString(BLOB)===原文`) + localStorage 明文**只读保留一周期**（SQL 读权威、legacy 兜底）；secret-only 一周期双写保回滚不陈旧；**N 不删 legacy，删除是 N+1 独立变更**（计划 §5.5 已要求可解密验证后才删）。
4. **门5 注入移主进程（架构承重，须 CTO ADR）**：safeStorage.decryptString 是主进程 API→现状 `api.unchain.js` 在 renderer 同步读 secret 组装请求的链不可原样保留。裁定 (a) 注入移 main（renderer 永不见原始 key，只经 bootstrap 的 `configured:boolean` 做门控），(b)（renderer 经 scoped IPC 取 secret）会重开 R1 口、更弱。若 CTO 择 (b)→Phase 4 降级 at-rest-only、对运行时 XSS 外泄(R1)无改善。secret 值须字节等价（payload characterization 测试，llm-expert 会签模型可见字段）。owning dev：main handler=dev-electron，布尔快照=dev-settings。
5. **门6 MCP/OAuth OUT**：`~/.pupu/mcp_secrets.json`、`mcp_oauth_tokens.json` 是 backend-owned 明文 JSON(0600)、另一进程够不到 Electron safeStorage → 不纳入 Phase 4，**defer 为独立 backend 工作项**（owner pupu-dev-backend，守定级）。在册残余，非永久接受。
6. **门7 红线九条**（全部→[[qa-red-case-pipeline]] 红用例）：密文不进 settings 表/bootstrap/日志/错误/测试 fixtures；`configured` 布尔是 renderer 唯一 secret-相邻信号；custom 走专用命名通道非通用 api_key；basic_text stub 断言拒写。

**接受的残余风险（签字附带）：** R1（仅当门5取(b)才保留）；R2 同用户+代码执行的恶意软件仍可解 Win/Linux 密文（本地桌面无硬件令牌不可根除）；R3/R4 运行时 key 入请求/内存（超范围）；Linux 无头 minority 保持现状明文（fail-closed，绝不更糟）；MCP/OAuth 明文（defer）。

**关联：** 收口 [[sec-001-final-verdict]] 接缝 B（RC-6 明文 key + 一次注入偷全部）；触发 sec-investigation-001-accepted 的"动到相关区域须重评"；发版触发 [[release-security-gates]]（动 IPC channel/register_handlers 自动复审）。现状勘察：全仓无 safeStorage/keytar，Electron ^40.6.0，secret adapter=`src/SERVICEs/settings_secret_adapter.js`（三字段唯一读写口）。
