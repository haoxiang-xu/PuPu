# New Chat Model Tags 限制数量 + 定时轮换显示

## Summary
在 `src/PAGEs/chat/chat.js` 的 new chat 空白视图中，model chips 当前会显示所有可用模型（ollama + openai + anthropic）。当模型数量很多时会占用过多空间，且用户无法快速浏览所有选项。

本方案在 chips 渲染前增加一个 **滑动窗口** 逻辑：
- 总模型 ≤ 24 → 全部显示，行为不变
- 总模型 > 24 → 只显示 24 个，每 5 秒 offset 前移 **4 个**，序列化轮换
- 当前选中的 model 始终 pin 在显示列表中（不会被轮走）
- 轮换时加入淡入动画，平滑过渡

## Goal
当 new chat 页面下方的 model tags 数量超过 24 个时，只显示其中 24 个，并每 5 秒按顺序轮换（向前移动 window offset），确保所有模型依次获得展示机会。当前选中的 model 始终显示。

## Constraints
- - 最多显示 24 个 model tags
- 超出时每 5 秒定时轮换，使用顺序 offset 方式（不是纯随机）
- 当前选中的 model 始终保持显示
- 不改变已有的 chip 渲染样式和点击行为

## Steps
- [pending] 1. [pending] 新建 `src/PAGEs/chat/hooks/use_rotating_model_chips.js`
   - 参数：chips[], limit=24, step=4, intervalMs=5000, selectedModelId
   - useState(offset) 起始为 0
   - useEffect + setInterval: 每 5s => offset = (prev + step) % chips.length
   - useMemo: 用循环取 window 从 offset 开始的 limit 个 chips（wrap around）
   - 如果 selectedModelId 对应的 chip 不在窗口中，将窗口最后一个替换为 selected chip
   - chips 数组变化时重置 offset 为 0
   - chips.length <= limit 时直接返回全部，不启动 interval
- [pending] 2. [pending] 修改 `src/PAGEs/chat/chat.js`
   - import useRotatingModelChips
   - 在 IIFE 中调用 hook，将 chips.map 改为 visibleChips.map
   - 由于 hook 不能在 IIFE 内调用，需要将 chips 计算和 hook 调用提到组件顶层级别（或提取为子组件）
   - 最小化改动：将 chips 计算 + hook 调用提到组件 render 前（useMemo），IIFE 只负责渲染
- [pending] 3. [pending] 为轮换出现的 chip 添加淡入动画
   - 使用 React key 确保新出现的 chip 触发 mount 动画
   - 在 button style 中加 animation: fadeIn 0.3s ease
- [pending] 4. [pending] 运行现有测试确认不破坏

## Key Changes
- ["新增文件：`src/PAGEs/chat/hooks/use_rotating_model_chips.js` — 滑动窗口轮换 hook", "修改文件：`src/PAGEs/chat/chat.js` — 在 model chips IIFE 中调用新 hook，只渲染返回的可见 chips"]

## Assumptions
- ["modelCatalog.providers 中的模型列表在页面生命周期内可能动态变化（如 Ollama 模型新增），hook 需要响应 chips 数组变化时重置 offset", "当前选中的模型可能不在前 24 个中，需要将其 pin 到可见列表", "24 个限制已足够，无需做响应式计算"]

## Open Questions
- []
