---
name: contract-download-skill-repo
description: S6 unchain:download-skill-repo 通道契约裁定 — 错误码枚举/facade>main 超时规则/字节权威 hash/skip-vs-abort 已裁毕
metadata:
  type: project
---

S6a `unchain:download-skill-repo`(2026-07-18 联签冻结,实现 `electron/main/services/runtime/skill_repo_download.js`):

- **Payload 载数据不载引用**:`{repo, sha, manifest}` 扁平形状(不像兄弟方法包一层)。原因:策展 JSON 在前端 bundle,main 无法解析条目 ID。可逆。
- **错误码枚举(冻结)**:`invalid_payload|network|timeout|not_found|too_large|malformed|integrity|fs`。归类学:invalid_payload=调用方形状错(网络前 fail-fast,含 manifest 非 .md);malformed=tarball 结构违规(symlink/路径形状,无法进入内容比对);integrity=内容不符 S5 凭证(hash 失配/manifest 路径缺失,带首个失配 path 不带内容)。spec 原文的 `bomb` 已并入 `too_large`(无消费方区分)。
- **facade timeout 必须 > main TOTAL_TIMEOUT_MS**(190s>180s)。Why: 外层先超时会孤儿化 main 任务且结构化错误码到不了 renderer。别被"统一成 30s 族例"翻掉。
- **hash = strip 前缀后原始解出字节,零规范化**;S5/策展生成 manifest 必须从同一 codeload tarball 算,禁 git checkout(EOL smudge 漂移会全线误炸 integrity)。约束比对端(S6a)+生成端(S6c)。
- **非 manifest 违规 entry skip 不 abort 是 spec 原判**(architect 裁决 3),非实现宽容:manifest 外字节永不保留,全 abort 会让上游无关 symlink 砖掉审读子集。已有测试锁定,勿在评审时重开。
- **tar 提升 dependencies 是硬前提非卫生**:electron-builder 只收 production deps,不提升则 dev 正常打包后 require("tar") 必炸。精确 pin 7.5.13 无 caret。
- 60s download 计时器实际罩住 download+extract(并发管道),180s 为写盘留余量。

**How to apply**:审 S6b/后续消费方时,UI 错误文案按此枚举;任何动 SKILL_REPO_LIMITS 冻结块的 PR 须过 security。相关:[[adr-toolkitid-stability]]、[[freeze-gate-ipc-parity-manifests]]。

另记一个复用判断模式:GitNexus 对 UI 壳层入口函数的 upstream 评级天然虚高(渲染树整棵可达);裁误报看两条——真实调用方枚举 + 行为增量是否 additive(S3 `deletePluginToolkit` CRITICAL/208 实为 1 调用方,先例)。
