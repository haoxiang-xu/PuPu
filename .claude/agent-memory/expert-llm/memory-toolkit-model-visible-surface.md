---
name: memory-toolkit-model-visible-surface
description: memory_v2_toolkit 的模型可见面实测 — docstring 被丢弃、参数描述全是 "Argument <name>" 占位串、kind 无 enum，故模型不知道 folder 存在，记忆树结构性扁平
metadata:
  type: project
---

**2026-08-08 实测（PuPu `b2385d5d` / unchain `a4e69f4`，case `0000-0008-2026-0808` S-XXXX / E-H4 / E-H5）：`memory_v2_toolkit.py` 的 17 个工具里，模型实际看到的远少于源码里写的。**

**Why**: `code-owner-unchain` 实证 V2 的 tree 会退化成扁平列表（folder 条目不自动物化，祖先目录从不创建），并把成因路由给我。查下来成因确实在 prompt 面，不在 store。

**实测事实（`Tool.from_callable` 亲跑 dump）**：
- 工具 description 取自 `_toolkit_registry` 元组里 **显式传入的字符串**（`memory_v2_toolkit.py:459-466`），**函数 docstring 被完全丢弃** —— 所有 `:param xxx:` 说明是死文档
- 参数 schema 由签名推导，**每个参数的 description 都是自动生成的 `"Argument <name>"`**，零语义
- `kind: str = "markdown"`（`:1361`）—— **无 enum、无 pattern**
- `memory_upsert` 的模型可见 description 全文不含 `folder` / 层级 / 四个合法 kind（`:1758-1762`）
- 四个合法 kind（`folder|markdown|image|link`）**只出现在错误分支** `:364-365` —— 模型只能先猜错才可能发现
- toolkit 里 **没有** `memory_create_folder` 之类的工具（全表 `:1751-1790`）

**净判断**：扁平树不是「可能发生的退化分支」，是 **prompt 面不变时的稳态**。修法在我边界（点名 `folder` 或给 `kind` 加 enum），须走自己的 case，且须带 A/B：测 folder 创建率与平均树深，基线为今天（预测 folder 创建率≈0）。

**How to apply**: 任何关于「V2 记忆长什么样 / 树有没有层级 / 模型为什么不那样用记忆」的问题，先回来看这一条 —— 大概率答案是「模型没被告知」。也是本仓 tool schema 的通病样本：**写在 docstring 里的约定对模型不存在**。见 [[tool-injection-path]]（工具主经 provider tools-API 参数下发全 schema，故占位串描述是真的会进模型的）。

**未核实**：其余 16 个工具我按同一 `from_callable` 路径推断亦为占位串描述，未逐一实跑；是否有 system prompt / character 指令在别处向模型描述过记忆组织方式，未查。
