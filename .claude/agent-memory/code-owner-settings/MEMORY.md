# pupu-dev-settings — Memory Index

- [Team Roster](team_roster.md) — gatekeeper=pupu-cto; standing sync roster; peer dev owners and who to coordinate with
- [Settings schema is a shared artery](settings-schema-cto-gated.md) — `settings` root is SQL now (migration complete), owned by code-owner-shared-arteries; never state the backend from memory
- [memory_agent_settings 是孤儿](memory-agent-settings-orphaned.md) — 有读者无写者；Builder 卡片 2026-08-04 被删、Settings 替代面从未建；改名零数据零收益
- [production build 不读持久化 flag](feature-flags-production-readonly.md) — Dev 开关在打包应用里写得进读不回；发布态 flag 来自不入库的 `.local` 快照
- [Secret-link security](secret-link-security.md) — api_key 明文存 renderer localStorage 的根本风险；修复方向=移出 renderer+keychain；workspace root/dev gate 认知（SEC-001）
- [Custom Model Providers feature](custom-model-providers-feature.md) — 切片划分、twin-mapping 决策 rationale、S4a=我的设置 UI、S5 占位钩子已留
- [Computer Use 启用路径 B3](computer-use-enable-path-b3.md) — 独立 localStorage key、enable_controller 单一 facade 调用点不变量(grep 测试)、boot resync 挂 App.js 跨 lane
- [Ollama cloud 标记语义](ollama-catalog-cloud-tag-semantics.md) — cloud tag ≠ 不可拉取；cloud-only 判据必须是 tag + sizes 为空，否则回归 5 个可用模型
- [Inspector 不给 V2 造投影](memory-inspect-no-v2-projection.md) — 两案已判死散点图；V2 用 path 树；两个挂载点非对称（settings 侧=G9 未决）；getStatus 必须先于 getTree
- [dev 主树会被并发进程提交](dev-tree-concurrent-autocommit.md) — 「不要 commit」管不住别的会话；汇报前查 git status/log 并如实说明落库状态
