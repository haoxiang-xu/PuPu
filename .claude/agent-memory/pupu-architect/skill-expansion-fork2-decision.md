---
name: skill-expansion-fork2-decision
description: 2026-07-18 open skill ecosystem import 岔口2定案:裁D(A契约+渲染折叠),否决B隐藏注入(单向门);content=模型可见真相是承重不变量
metadata:
  type: project
---

# open skill ecosystem import — 岔口 2 定案(2026-07-18)

裁决:**D = A 的数据契约 + 渲染层折叠**。否决 B(隐藏注入)与 C(按长度分流)。本次 CEO 豁免 Codex 管线(2026-07-13 常设指令,推理留 Fable 5),同 [[computer-use-hybrid-design]] 先例。

**Why:** spec 把"body 是否为消息真实 content"(数据契约)和"body 是否全文铺开"(呈现)捆绑成了 A/B 之争;拆开后长 skill 撑爆气泡纯属呈现问题。B 被否的四条硬理由:
1. 打破承重不变量 **`content` = 模型可见真相**。五个消费方:buildHistoryForModel(use_chat_attachments.js L151-229,memory-off 重建)、retryHistory(~L4566)、edit 重发(reuseUserMessage)、导出/回放、后端 long_term_extractor。B 落地后所有消费方永远查隐藏字段 → V3 消息 schema 单向门。
2. 两条 memory 路径语义撕裂:memory-on 时 history=[](use_chat_stream.js L2416-2422,后端 thread memory 拥有历史)。before_model turn-scoped 注入 → 下轮模型丢 skill body,背离 Claude skill 生态"body 常驻会话上下文"的既定语义(superpowers 方法论 skill 跨多轮起作用);若持久进后端 thread 则"模型看到≠用户看到"成永久 trace 负债。
3. B 开新 prompt-injection 面必须过 security;D 下 body 仍= 用户粘贴等级,零新增。
4. fyi interject 的 sidecar 先例(assistant.interjections[] + FYI_HISTORY_WRAPPER)证明 sidecar-on-message 模式成立;且 D 比 fyi 更轻——模型侧零变化,trace 零解释。

**定案形状:** 用户消息加 optional additive sidecar `composer: {v:1, rawText, commands:[{name,sourceToolkitId}], templateLength}`;气泡渲染 chip+模板默认折叠(阈值=渲染常量,C 的好处免费拿);edit/预览优先 rawText;重发重新 expandCommands(skill 更新则用新版,与 regenerate 一致)。**可逆**:停写停读即回 A,content 未动。

**单向门边界(写死防相对化):** composer 模式 = 持久可见内容;`phase:"always"` 模式(未来 spec)= before_model 临时隐藏注入,届时才做 security 联署。两种触发两种上下文语义,不回头改 composer 路径。

**How to apply:** 任何"模型看的和用户看的分家"的提案,先撞这条不变量;skill 相关 token 成本优化走 always 模式,不砍历史。台阶门槛:P0 策展上架以 S2(气泡折叠)落地为前提(0.1.9 第一印象决议)。切片 S1(chat-core sidecar)/S2(chat-bubble 折叠)/S3(importer, toolkit dev)/S4(security 轻审:safe YAML、symlink 逃逸、URL 校验、token 字符白名单)/S5(P0 策展)。spec 修改:策展准则(d)改 64KB 技术上限;importer 加 body 文内引用检测(references/scripts/跨 skill 引用)→ degraded 不静默;P0 命令数预算 ≤30 否则 menu 搜索提前;验证纯 skill plugin 不触发 MCP 连接 + normalizeToolkitIdAlias 对 skillpack.<slug> 的行为。

**seam 契约已冻结(2026-07-18)**:`docs/superpowers/specs/2026-07-18-composer-sidecar-contract.md`(本地不入库)。要点:composer sidecar 原子性(任何异常整体忽略,fail-open 到 A)、唯一写入方 sendNewTurn(非 programmatic + commands>0)、content 改写必须重算或删 composer(宁删勿 stale)、禁读方点名 buildHistoryForModel/payload 装配、sourceLabel 和模板本体刻意不存(防第二真相源)、零 V3 schema/ops 动作(消息是不透明 JSON blob,单向门不碰)、chat_export 是透传方且人类可读导出必须以 content 为正文。破坏契约七条红线在契约 §6,须回 architect 重裁。

**r2 修订(2026-07-18,S1 交付上报收口,S1 b81edb4/S2 f190b4e 均判合约零返工)**:①r1 §5"存储全链透传零动作"在 renderer 层与事实不符——`chat_storage_sanitize.js` sanitizeMessage 是字段白名单重建,composer 不入门会被静默剥离;已收编 S1 的 `sanitizeComposer`(必需形状校验 + JSON 往返整体克隆保未知 v:1 成员 + 违规原子丢弃,templateLength 以清洗后 content 长度为界)为**唯一存储门**,禁止对 composer 内部做白名单重建。②`commands[].name` 标准形态 = registry 原样**含前导斜杠**("/plan",command_registry L13/L94 注册不变量),存储=显示,S2 零改动。③§2 铁律补"字节等同继承"备案(content 逐字节相同时可原样继承 composer)。教训:写"透传"断言前要逐层核——renderer sanitize 白名单这层是我 r1 漏勘的。

**S6 store 一键安装裁决(2026-07-18,快审,CEO 已批骨架)**:spec 在 `docs/superpowers/specs/2026-07-18-s6-store-skillpack-install.md`(本地)。核心:策展条目放前端 plugin_store_curation.json 新 skillPacks 区(凭证随签名 bundle,比后端运行时文件硬);main 新 IPC DOWNLOAD_SKILL_REPO(shared artery,CTO 联签),`tar` v7 parse-only 内存流式解析、**tar 内路径永不作为 fs 写入路径**,codeload.github.com 域名白名单;**过滤真相 = 逐文件 sha256 manifest**(subset 目录清单仅审读记录/UI)——GitHub tarball 字节不稳定(2023-01 checksum 事变)故不 pin 整包 hash,信任根收敛到 S5 审读时刻内容,任一不匹配整体 abort;炸弹硬指标(32MiB 压缩/256MiB 解出/10k entries/单文件 256KiB/保留 8MiB/60s+180s);`tar` 从 devDep 传递(electron-builder 链)提升为 pinned dependencies。派工 S6a electron/S6b toolkit/S6c curator/S6d security 轻审;**S3 冒烟不阻塞 S6 动工、但阻塞 S6b 集成合入**(未冒烟地基不叠层)。

关联:[[listener-node-and-boulders]](before_model/事件语义)、[[roadmap-predesigns-019-020]](skills hybrid 渐进披露)。
