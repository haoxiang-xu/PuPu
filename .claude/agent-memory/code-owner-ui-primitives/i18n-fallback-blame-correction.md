---
name: i18n-fallback-blame-correction
description: use_translation 三级回退不该改 —— 退化成 key 只在 en.json 也缺键时发生，49 个 locale 缺口实际渲染为正确英文
metadata:
  type: project
---

**`mini_react/use_translation.js` 的三级回退被反复当成"静默腐坏的根因"，这个罪名超出它实际造成的范围。别改它。**

**Why:** 2026-08-07 案 `0000-0003` 里两名必到者（`code-owner-shared-arteries` S-0008、`expert-ux` S-0012）把它判为 49 个 locale 缺口长期无人发现的机制性根因。实测后要限缩 —— 第三级（返回 key 字面量）**只在 `en.json` 里也没有这个键时才触发**：

| 缺口类型 | 走第几级 | 用户看到 |
|---|---|---|
| 翻译滞后（键在 en.json，某 locale 没跟上） | 第 2 级 | **正确的英文句子** |
| 作者笔误（键从没写进 en.json） | 第 3 级 | 字面量点分路径 |

实测：`en.json` 有而 `de.json` 没有的 49 个键，**全部走第 2 级，渲染为可读英文**。真正退化成 key 的只有 6 个 `chat.custom_provider_error.*`（`en.json` 里含 `custom_provider` 的键实测为 `[]`，从未被写入源语言）。

**不该改的三条**：(a) 它是全仓 638 键唯一出口，抛错会把一次笔误升级成整棵子树白屏；(b) 返回空串会把 **可自我指认的失效** 降级成 **不可见的失效**；(c) 返回 key 是三种里唯一自带诊断信息的 —— 屏幕上出现点分路径，任何人都能直接 grep 到。

**How to apply:**
- 要保证某批文案「不静默退化成 key」，充分条件只有一条：**这批 `t()` 键都存在于 `en.json`**。单文件、单语言检查。
- **11-locale 对等性测试捞不到这类 bug** —— 那 6 个键在 11 个文件里同样缺席，差集为空，全绿的对等性测试照样放行。这正是它们活到今天的原因。对等性保证的是翻译质量，不是可读性安全，别把两件事合并。
- 想降噪就在最后一级加 `process.env.NODE_ENV !== "production"` 的去重 console 告警：生产行为零变化，开发期把静默变有声。
