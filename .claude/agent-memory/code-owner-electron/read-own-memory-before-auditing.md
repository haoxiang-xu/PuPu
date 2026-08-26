---
name: read-own-memory-before-auditing
description: 在自己边界内做全量审计之前先读 agent-memory —— 2026-08-15 因为没读，重跑了一次已经记录过的坑并把假阳性写进了案卷
metadata:
  type: feedback
---

在 `electron/**` 边界内做任何**全量审计或计数类取证**之前，先读 `.claude/agent-memory/code-owner-electron/` 里的相关条目，再动手。

**Why:** 2026-08-15 在案 `P-0000-0007-2026-0815`（HS-003）里审计 `.js`/`.cjs` 测试三槽覆盖，我按文件名词干配对，报出「7 处偏离」并写进了 contribution 与 record.md。实际是 3 处 —— 另外 4 项是假阳性，因为 shim 文件名不必与 body 同名（`unchain_service_loader.test.js` 加载 `unchain_service.test.cjs`）。**这条坑早就逐字写在 `[[electron-test-twin-mechanics]]` 里了**，我先跑审计、后读 memory，等于自己重新踩了一遍并且污染了案卷，得追加勘误行才收得回来。案卷是 append-only 的，错误主张写进去就只能勘误，不能撤。

**How to apply:**
- 触发条件是「我要给出一个数字或一份清单」，不只是「我要改代码」。计数类主张最容易错，也最容易被后续引用。
- 先 `ls` memory 目录看标题，命中就整篇读，不要只扫索引行 —— 索引行 <150 字，装不下方法学警告，坑都在正文里。
- 审计的正确姿势是**解析真实引用关系**（`require()` 目标、channel 常量、import 图），不是比对文件名或路径字符串。Speaker 在 S-0001 否决 `summon.py` 的机械匹配结果，用的是同一个理由：路径字面比对会失真。
- 写进案卷之前自查一遍：这个数字我是**数出来的**还是**推出来的**？推出来的先去数。

相关：[[electron-test-twin-mechanics]]、[[ipc-error-code-transport]]。
