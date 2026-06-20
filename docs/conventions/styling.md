# Styling Conventions

## 外壳/背景颜色：只用语义色

App 外壳与任何区域背景（顶层、侧栏、卡片、输入、弹窗、面板）禁止裸 hex/rgb，
必须用 `var(--pupu-background)` / `var(--pupu-sidebar)` / `var(--pupu-surface)`
或对应语义 token。新增 modal / UI 选背景色一律从语义色板取，不得发明新色。

- Owner：pupu-ux-designer（调色板权威）。
- 机器闸：`src/BUILTIN_COMPONENTs/theme/shell_background_guard.test.js` 扫白名单外壳文件，
  发现裸不透明背景色即失败；合法例外加进 `shell_background_allowlist.js` 并注明理由。
- 半透明中性叠加 `rgba(..., 0.x)` 仍可保留（无损叠加政策）。
