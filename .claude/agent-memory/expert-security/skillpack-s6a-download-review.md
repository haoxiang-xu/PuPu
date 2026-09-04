---
name: skillpack-s6a-download-review
description: S6d review (2026-07-18) of S6a skill-pack download/extract channel @ acb70a7 — CONDITIONAL GO; tar CVE-2026-53655 pin bump is the one Medium; manifest-must-use-same-parser rule for S6c
metadata:
  type: project
---

S6d 轻审裁决:S6a(`electron/main/services/runtime/skill_repo_download.js` @ acb70a7,worktree agent-ad2dcbf1fb29226ab)**CONDITIONAL GO 合 dev**。r1.1 全部硬指标逐条核实为已实现且有测试;parse-only 条款成立(全模块只有 tar.Parser,tar 路径永不作 fs 写路径,写集 = manifest 命中 + sha256 验证后的 retained map,自构路径 + isPathWithin 双闸)。

**Why:** 该通道是新的不可信输入面(任意 GitHub tarball 进 main 进程解析),信任根 = 前端签名 bundle 里的逐文件 sha256 manifest。

**How to apply:**
- 唯一 Medium:pin 的 tar@7.5.13 命中 **CVE-2026-53655 / GHSA-vmf3-w455-68vh**(≤7.5.15,parser differential/file smuggling,tar.Parser 同样受影响;修复 7.5.16+,audit 推荐 7.5.20,满足 app-builder-lib ^7.5.7 dedupe)。含损:sha256 墙使走私字节装不进来(必须 hash 命中),且通道输入是 git-archive 生成的 tarball(攻击者无 raw tar 字节控制),故非 High;但一行修,建议合并前抬 pin。**若合并时未修,发版前必须修(记入 release gate)。**
- 派生规则(交 S6c/curator,r1.1 §4 增补):manifest 生成必须用与安装端**同一 node-tar 版本**解包取字节,禁 bsdtar/Python——parser differential 类漏洞使"同一 tarball"不充分,真不变量 = 同 tarball + 同 parser。
- 已核实的宽容姿态(勿再报):非 manifest 恶意条目 skip 不 abort 是安全的("恶意永不落盘"成立);skip 条目字节仍被炸弹闸计数。REPO_RE 放行纯点段(`../..`)只会在 codeload 域内塌缩路径,host 无法逃逸(已用 new URL 实测),Low 卫生项。
- 已知非阻塞项:watchdog 只 abort fetch 不 reject extract promise(main 侧 promise 可能悬挂,renderer 190s 兜底);60s download 定时器不在下载完成后取消 → 有效总预算实为 60s 非 180s(fail-closed 方向,功能性偏差);manifest 数组长度无上限(被攻陷 renderer 本地 DoS,SEC-001 姿态内)。
- 成功路径 temp 目录刻意留给 renderer 消费(测试有断言),spec 说安装完即删 → **删除责任在 S6b,S6b 审查时要验证**;启动清扫是兜底且抗 symlink 种植(dirent lstat 语义)。
- 通道滥用面结论:相对既有 READ_FILE/WRITE_FILE 任意读写 + renderer 自由 fetch([[sec-001-accepted-posture]]),此通道对被攻陷 renderer **零新增能力**;r1.1"载数据 payload"权衡接受。真正的门 = S5 审读 + 签名 bundle 内 manifest,执行点在 renderer(S6b),与整体 IPC 姿态一致。
- 关联:[[skillpack-import-security]](S4)、[[release-security-gates]]。
