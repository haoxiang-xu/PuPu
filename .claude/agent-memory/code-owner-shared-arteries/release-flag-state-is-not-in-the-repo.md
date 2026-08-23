---
name: release-flag-state-is-not-in-the-repo
description: 回答「这个缺陷在已发布版本上可不可达」不能查 flag 快照（不入库、无历史），要扫 tag 上的 feature_flags.js
metadata:
  type: project
---

判断一个 feature-flag 后面的缺陷 **是否已经在用户手上**，本仓有一个反直觉的坑：**发布包烤进去的 flag 取值不由仓库决定。**

`scripts/build-web.cjs` 读 `<root>/.local/build_feature_flags.snapshot.json`（**在 `.gitignore` 里**），构建后另写 `<root>/build/build_feature_flags.json`（**也在 `.gitignore` 里**）。两个文件都无历史、都可被本机副作用覆盖。

**正确做法（跨两个 owner 各验证一次：`code-owner-devtools` 2026-08-07，本 owner 独立复跑 2026-08-08）**：

```bash
# 「已发布的包里有没有这个 flag」——扫 tag 上的源码，不查快照
for t in $(git tag); do n=$(git show "$t:src/SERVICEs/feature_flags.js" 2>/dev/null \
    | grep -c 'THE_FLAG'); echo "$t $n"; done
git tag --contains $(git log --format=%H -S 'THE_FLAG' --reverse -- src/SERVICEs/feature_flags.js | head -1)

# 「今天从本机构建会烤进什么」——只读，--print-flags 在 spawn 构建前 exit
node ./scripts/build-web.cjs --print-flags
```

**Why:** case `0000-0005-2026-0807` 立案时把一个缺陷定性为「发布配置下今天就在发生」，据以列为该批三案里唯一的在线缺陷。实测 `enable_memory_v2` 在 **全部 18 个 tag 上出现 0 次**、引入它的 commit 不被任何 tag 包含 —— **Memory V2 从未发布过**，缺陷只在 `dev` 上可达。定性错了一档，而它直接影响单向门的成本判断：**门后今天是空的，功能发出去那天才永久非空。**

歧义源头：前案证据里「发布配置」指的是 **V2 active 这个 rollout 取值**（相对 legacy 面），被后续庭审读成了 **出厂的产品**。**这两个意思在 Memory V2 语境下长得一模一样，写的时候要挑明是哪个。**

**How to apply:** 任何「这个缺陷用户今天就在遇到」的严重度主张，先跑上面第一段。本 owner 的持久化 schema 取舍尤其吃这一条 —— **未发布 = 存量为空 = 单向门此刻最便宜**，结论常常是「赶紧落」，不是「小心点」。

相关：[[memory-v2-trace-whitelist-topology]]
