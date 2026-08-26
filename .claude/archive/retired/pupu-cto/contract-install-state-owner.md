---
name: contract-install-state-owner
description: 跨面契约——MCP 工具安装态（安装/卸载/启停的 catalog + 本地落盘）唯一 owner/唯一写方是 toolkit 主面；settings 两处 MCP UI 仅只读消费 toolkitId 引用，绝不双写
metadata:
  type: project
---

**跨面契约：MCP 工具「安装态」唯一 owner = toolkit 主面（`pupu-dev-toolkit`）。**
状态：**已裁定**（2026-06-09，CEO 拍板 U1「归 toolkit 主面」，CTO 固化）。源自 [[meeting-mcp-launch-2026-06-09]] 未决项 U1。相关：[[adr-toolkitid-stability]]、[[contract-toolkit-catalog-shared-id-space]]。

## 裁定（边界讲死）

`pupu-dev-toolkit`（toolkit 主面）是 MCP 工具**安装态的唯一 owner 与唯一写方**——安装/卸载/启停状态的 catalog 与本地落盘，只有它能写。`pupu-dev-settings` 的两处 MCP UI（`mcp_toolkits_section` 已装管理 / `mcp_registries_modal` registry 导入）一律是**只读消费者**：只存 toolkitId 引用 + 用户开关，**绝不写安装态、绝不双写同一 localStorage 数据**。registry 导入产物须先经 curator schema 校验，再由 toolkit 主面入 catalog（settings 不直接入 catalog）。

## Why（为什么承重）

双写同一份安装态 localStorage 是最难查的一类 bug：两个面各写各的，读时谁赢取决于时序，催生幽灵安装态 / 卸载后复活 / 启停状态漂移。单一写方把安装态收敛成一条可审计的写路径，与 [[adr-toolkitid-stability]] 的「catalog 唯一写 owner = toolkit」、[[contract-toolkit-catalog-shared-id-space]] 的「settings 只存 toolkitId 引用+开关、不冗余元数据」严格同构——本裁定只是把这条原则从 catalog 元数据推广到安装/启停状态。

**它解除了 IPC 冻结的前置阻塞**：安装态写权归属一旦无歧义，同步点 1（catalog 写 owner 唯一性）与 4（IPC 通道契约）即可定型——IPC/通道契约现可进入冻结。

## How to apply

- **pupu-dev-toolkit**：实现安装/卸载/启停的写路径与本地落盘，作为安装态唯一来源；暴露读 API 供 settings 消费；接住 registry 导入（经 curator schema 校验后）入 catalog。
- **pupu-dev-settings**：两处 MCP UI 改为纯只读——读 toolkit 主面的安装态，本地只持久化 toolkitId 引用 + 用户开关（启停 intent 经 toolkit 写 API 落地，不自行写安装态 localStorage）；registry 导入交给 toolkit 主面落 catalog，不双写。
- **审查触发**：任何 settings 侧出现「直接写安装/卸载/启停 localStorage」或「绕过 toolkit 主面入 catalog」即违约，打回。
