---
name: quorum-handoff-return-mechanics
description: 交 HANDOFF_RETURN 前跑 quorum_lint；contribution 字段里每个 BC-###/AC-### 只能出现一次，重复即 FAIL
metadata:
  type: feedback
---

写完 `record.md` 的 `HANDOFF_RETURN` 后、回话给书记员之前，**跑一次 linter**：

```
cd .claude/skills/case/tools && python3 -B -m quorum_lint <案卷绝对路径>
```

**最容易踩的一条：`contribution` 字段里每个 `BC-###` 与每个 `AC-###` 只能出现一次。** 重复引用直接 `ERROR ... contains duplicate BC refs`。

**Why:** 我第一版把 BC-004 写了 2 次、AC-012 写了 3 次（开头点名一次，后面讲取证位置和知情确认时又各自然地重提），当场 FAIL。这在长交付里几乎必然发生——你会想在每个小节里说清楚自己在讲哪个对象。

**How to apply:** 开头点名一次，之后一律改用「该 BC」「该 AC」「本棒责任 AC」「位置 (D)」这类指代（既有返回件 S-0018 就是这么绕的，照抄那个写法）。跑完 lint 要**区分哪些 error 是自己的、哪些是先前就有的**——本案剩的 4 条（SEQ-007 `PENDING_HS`、`boundary_revision_set` 未冻结、`case.md` 未同步 current RS）全是 Speaker/lead 的，且 S-0019 的 `ruling-ready status: NOT_READY` 已逐条记过，不是我要修的。

**其余每次都适用的：** 不改 `proposal.md`（正文只写自己的 `contributions/HS-###-<角色>.md`）· **不新增 AC/BC 编号**（新编号会溢出别人已冻结的 HS scope，使既有确认失效——本案已三次实测；要加取证位置就说「这是 AC-0XX 的一个新取证位置」并用 `G1`/`E1` 这种局部编号）· 时间戳用 `date "+%Y-%m-%dT%H:%M:%S%z"` 实取并改写成 `-07:00` 形式，须晚于上一条 S 记录 · `speaker` 字段精确等于自己的角色名 · 主树不 commit。

相关：[[case-p0007-hs004-stance]]
