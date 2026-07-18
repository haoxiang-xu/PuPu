# pupu-dev-settings — Memory Index

- [Team Roster](team_roster.md) — gatekeeper=pupu-cto; standing sync roster; peer dev owners and who to coordinate with
- [Settings schema is CTO-gated](settings-schema-cto-gated.md) — localStorage `settings` schema is a shared artery; schema changes must be reported + trigger sync meeting
- [Secret-link security](secret-link-security.md) — api_key 明文存 renderer localStorage 的根本风险；修复方向=移出 renderer+keychain；workspace root/dev gate 认知（SEC-001）
- [Custom Model Providers feature](custom-model-providers-feature.md) — 切片划分、twin-mapping 决策 rationale、S4a=我的设置 UI、S5 占位钩子已留
- [Computer Use 启用路径 B3](computer-use-enable-path-b3.md) — 独立 localStorage key、enable_controller 单一 facade 调用点不变量(grep 测试)、boot resync 挂 App.js 跨 lane
