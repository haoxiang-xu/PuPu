# Styling Conventions

## 外壳/背景颜色：只用语义色

App 外壳与任何区域背景（顶层、侧栏、卡片、输入、弹窗、面板）禁止裸 hex/rgb，
必须用 `var(--pupu-background)` / `var(--pupu-sidebar)` / `var(--pupu-surface)`
或对应语义 token。新增 modal / UI 选背景色一律从语义色板取，不得发明新色。

- Owner：pupu-ux-designer（调色板权威）。
- 机器闸：`src/BUILTIN_COMPONENTs/theme/shell_background_guard.test.js` 扫白名单外壳文件，
  发现裸不透明背景色即失败；合法例外加进 `shell_background_allowlist.js` 并注明理由。
- 半透明中性叠加 `rgba(..., 0.x)` 仍可保留（无损叠加政策）。

## 层级（z-index）：只用命名层

全 app 的堆叠顺序由 `src/BUILTIN_COMPONENTs/layer/z_layers.js` 单一定义。任何
body portal 或 `position: fixed` 的浮层都必须从那里取值：

```js
import { Z } from "../layer/z_layers";
style={{ zIndex: Z.POPOVER }}
```

层序（从下往上）：`CONTENT_RAISED` → `APP_CHROME` → `APP_CHROME_TOP` → `MODAL`
→ `TOOLTIP` → `POPOVER` → `TOAST` → `DRAG_GHOST` → `TOP_PROGRESS` → `BOOT`。
每层为什么在那个位置，写在 `z_layers.js` 的头注释里 —— 每条都指向一个真实场景，
不是审美排序。

- 禁止裸数字。机器闸：`layer/__tests__/z_layers_guard.test.js` 拦截任何 >= 1000
  的裸值，以及测试里硬编码的层级比较值（`toBeLessThan(99999)` 这类断言在层级
  调整后会静默失效，比裸字面量更危险）。
- 纯局部的 `0/1/2` 级数值不在此列 —— 只跟自己容器内的兄弟节点竞争的，保持字面量。
- 新增一层：加到 `z_layers.js` 的对应位置，在头注释里写清它必须高于/低于谁**以及
  为什么**（要指向一个真实场景），并在 `z_layers.test.js` 里补一条不变量断言。
- **已知欠账**：这里定义的是视觉顺序。**行为**顺序（谁是 top layer、Escape 和外部点击
  先关谁）PuPu 目前没有统一机制 —— `modal.js:47`、`context_menu.js:53`、`tooltip.js:805`
  各自挂自己的 Escape 监听。上游 mini_ui 的 `BUILTIN_COMPONENTs/layer/layer_stack.js`
  有这套栈，尚未移植；目录名用单数 `layer/` 就是给它留位置。移植之后，两套顺序需要
  互相对齐。
