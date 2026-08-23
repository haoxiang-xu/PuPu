---
name: measurement-recipes
description: 已验证 2+ 次的测量路径 — 三层样板分离 / 唤醒类型分解 / 复制漂移证伪 / 相关性分母
metadata:
  type: project
---

# 有效信息比例 — 可复用测量路径（org-court 001 案验证, 2026-08-04）

## 1. 样板有三层, 只测一层会低估

`founding-methods.md` 的 boilerplate 案只覆盖 **第一层**。实测另有两层:

| 层 | 形态 | 测法 |
|---|---|---|
| L1 harness memory 模板 | `# Persistent Agent Memory` 到文件尾 | 与 harness 注入 diff（7 变体, 见 founding-methods） |
| L2 CLAUDE.md 复制 | charter 重述 always-injected 的项目规则 | 逐条 `grep -ci` 打到 `CLAUDE.md` + `.claude/CLAUDE.md` |
| L3 兄弟 charter 共享模板 | 同一批 agent 的公共段 | 行级 `grep -Fx -f <兄弟并集>` |

L3 配方（实测可跑, 注意别用 `$VAR` 装多文件名——会把整串当单文件名, awk 会挂）:

```bash
# 每份先抽 net role body: 去 frontmatter, 到 "# Persistent Agent Memory" 截断, 去空行
for b in ...; do : > _o; for o in ...; do [ "$o" = "$b" ] || cat $o.net >> _o; done
  sort -u _o > _o2; grep -Fx -f _o2 $b.net | wc -w; done
```

**001 案结果**: 6 份 dev charter 扣掉 L1 之后, 剩余 net role content **仍有 59–66% 与兄弟逐行相同**（electron 43%, 因它有 L2/L3 变体）。所以"净 role content 704–777 词"这个数本身要再打一次折, 真正 per-dev 独有只有 207–399 词。**报"净 role content"前先问: 扣的是哪一层。**

## 2. 唤醒类型分解 —— 同一份 charter 有多个信噪比

信噪比不是文件属性, 是 **(文件 × 唤醒类型)** 的属性。dev charter 至少三类唤醒:

- **写码型**: 铁律 / 工作方式 / DoD 全部在线
- **评估型**（被问"这是不是你的活"): 只有 身份 + 边界 在线; 铁律/工作方式/DoD 全是噪音
- **不相关型**（答"不是我的活"): 只有 身份 + 边界 在线, 且答完即止

001 案实测（6 份模板 dev, 分母 = 章节正文词数和 556–639）:
- 评估型有效占比 **50–57%**; 写码型专属段占 43–50%
- 不相关型有效占比 **21–28%**（分母换成 charter 全文 2731–2804 词则为 **4.4–6.0%**）

**推论**: 任何引入"非写码唤醒"的流程变更（议会/评审/会签）都会把 charter 的边际有用比例砍半, 因为现有 charter 是按写码型优化的。评这类提案必须先做唤醒类型分解, 不能只报一个总占比。

## 3. 复制漂移证伪 —— "精确度 vs 体积"之争的决胜证据

复制 always-injected 内容进 charter, 会把**被维护的真话变成不被维护的假话**。测法:

```bash
git log -1 --format='%ad' --date=short -- <charter>      # charter 上次改
git log -1 --format='%ad' --date=short -- .claude/CLAUDE.md   # 注入面上次改
grep -c "<被复制的断言>" <charter 们>                      # 复制份数
git log -1 --date=short -- <推翻该断言的代码/测试>          # 事实何时变的
```

**001 案实证**: 6 份 dev charter 的「铁律 / Ironclad Rules」段写死 "no central theme file — palettes defined per component"; ux-designer charter 写了两处。但 `src/BUILTIN_COMPONENTs/theme/semantic_tokens.js` 存在、42 个文件用 `--pupu-background|--pupu-surface`、`shell_background_guard.test.js` 是 CI 硬门（2026-06-20 落地 57ce69d4）。dev charter 最后一改 2026-07-04（晚于该门 14 天仍原样带过）, ux charter 停在 2026-06-10。同期 `.claude/CLAUDE.md` 已更新到当日并写明 "禁止裸 hex, 用 var(--pupu-...)"。

→ **7 份 charter 在标题写着「铁律」的段落里, 常驻注入一条被 CI 证伪的事实。** 这是负信号, 不是零信号。凡遇"charter 该更细还是该更短"的争论, 先跑这条——它一次性证明问题在精确度且指出机制。

## 4. 相关性分母 —— 全员传唤的浪费系数

问"n 个 agent 里几个真相关"时, 用 co-change 按 ownership 路径映射, **单位要声明**（谓词先行）:

- **按 commit**（n=315, since 2026-05-01）: 77.8% 只触 1 个 dev surface
- **按 scope-tag×周**（n=76 有 tag 的）: 中位 **1**, 均值 1.68, p75=2, max 6; 64.5% 只触 1 个

两个数都对, 单位不同。3 个月粒度的 scope-tag（memory=6/mcp=6）是长期纲领不是单个 feature, 会高估。

判别"谁算 dev": charter 里有没有排他路径清单（`你只在这些范围内改代码`）。7 个 dev 有; qa/curator/security 无; ux-designer 有路径但与 5 个前端 dev **重叠且非排他**（`src/PAGEs/` `src/COMPONENTs/`）——所以"每个代码区块分给对应 scope 的 agent"这类执行规则对 ux 无解。

## 5. 组织记忆的过期是索引级噪音

`team_roster.md` 在 20 个 agent 的 memory 里, 13 份声明"共 18 个 agent"、17 份指 `pupu-hr-head` 为真相源。实测: 编制已 24, `pupu-hr-head.md` charter 已不存在。且 7 份 dev roster 描述的 3 组 lead 层法官已判"从未存在"。

**测法**: `grep -l "<真相源 agent 名>" .claude/agent-memory/*/team_roster.md` 后 `ls .claude/agents/**/<名>.md` 验存在性; 编制数直接 `find .claude/agents -name "*.md" ! -name "HYBRID*" | wc -l` 对账。

**为什么算噪音**: MEMORY.md 索引行常驻, 条目本体按需读——所以过期 roster 的唤醒成本是 1 行索引, 但**被问"这是不是你的 scope"时它正是最可能被读的那条**。评估型唤醒越多, 这层过期越致命。
