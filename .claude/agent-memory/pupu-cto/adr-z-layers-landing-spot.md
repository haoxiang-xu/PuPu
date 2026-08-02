---
name: adr-z-layers-landing-spot
description: z-index canonical scale 应落 BUILTIN_COMPONENTs 而非 SERVICEs——理由是 mini_ui 回港路径，不是「像不像 service」
metadata:
  type: project
---

issue #178 把全 app z-index 收敛成单一 canonical scale。落点决策：**放 `src/BUILTIN_COMPONENTs/`（建议 `layers/z_layers.js`），不要放 `src/SERVICEs/z_layers.js`。**

**Why:** 表面理由（「常量表不是 service」）不成立——SERVICEs 里已经有 `toolkit_id_aliases.js` / `feature_flags.js` / `system_prompt_sections.js` / 若干 .json，纯数据表有先例。真正的理由是依赖方向：

- 62 个含 zIndex 的文件里 33 个在 BUILTIN_COMPONENTs，是占比最大的一层。
- BUILTIN_COMPONENTs 目前只有 9 处 import SERVICEs，且**全是运行时行为**（toast_bus / console_logger / progress_bus / window_state_bridge），没有一处是为了拿常量。
- mini_ui 是 BUILTIN_COMPONENTs 的上游源头，其 BUILTIN_COMPONENTs **零处** import SERVICEs。让 33 个原语为了一个常量表反向依赖 SERVICEs，等于把这些组件钉死在 PuPu，回港/移植路径断掉。
- 已有同类先例在正确的位置：`src/BUILTIN_COMPONENTs/theme/theme_manifest.js`（+ `shell_background_guard.test.js` 守它）。

**How to apply:** 判断「某个常量表放哪」时，先问它的最大消费方在哪一层、以及会不会制造 primitives→services 的反向边；不要只问「它是不是 service」。另建议不要塞进 `BUILTIN_COMPONENTs/theme/`——那是颜色轴且 ux-designer 在活跃编辑，z-index 是独立的堆叠轴，单开 `layers/` 更干净。

现状基线：160 处 zIndex，值域已失控（出现 2147483647 / 999999 / 99999 / 10000×4 / 9999×3），逃逸值本身就是没有 canonical scale 的症状。
