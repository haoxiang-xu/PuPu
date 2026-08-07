---
name: license-agpl-switch-review
description: 2026-07-21 AGPL-3.0 换证评读定案:硬门 PASS、CLA §4 已覆盖 relicense、建议 0.1.9 放大发布前换、unchain 保持 Apache
metadata:
  type: project
---

# AGPL-3.0 换证评读(2026-07-21,CEO 拍板待定)

结论:建议换 AGPL-3.0,0.1.9 放大发布(Show HN)**之前**完成;unchain 独立仓库保持 Apache-2.0。
本次 CEO 豁免 Codex 转手,推理留 Fable 5。

**Why:** COO 变现备忘录(Cherry Studio 模式:AGPL 核心+付费商业豁免)。核查后三个硬事实:
1. **依赖硬门 PASS**:npm 1412 包全许可型(唯一 GPL 字样 node-forge 是 BSD/GPL 双许可);pyinstaller 实为 `GPL-2.0-or-later WITH Bootloader-exception`(notices 内文核实,允许任意 license 打包);pynput LGPL-3.0 兼容 AGPLv3;certifi/tqdm MPL-2.0 兼容。无 CC-BY-NC、无 GPL-2.0-only、无 SSPL。
2. **贡献者问题不存在**:license 三段史 = 2025-02-11 MIT → 2026-03-11 Apache-2.0+CLA(d19caf0)。**docs/CLA.md §4 明确授予 relicense/dual-license/commercial/proprietary 权利**,覆盖 CLA 后全部外部贡献;CLA 前只有 skywalker007-cpu(+228 行,主要文件已删)和 tianyi8(只提交过 DMG 二进制),都在 MIT inbound=outbound 下,许可型可自由并入。无需追认、无需重写。
3. **真正的单向门不是 license 文本,是 CLA 管线**:只要未来贡献继续过 CLA,owner 保有全量 relicense 权 → MAS 专有版可发、Teams 闭源模块可组合、甚至未来还能再换证(对 owner 可逆)。接受一笔未过 CLA 的外部贡献才是不可逆锁死。

**How to apply:**
- 若 CEO 拍板执行:清单 = LICENSE + public/LICENSE.txt + package.json license 字段 + NOTICE + README badge + docs/CLA.md §3(outbound Apache→AGPL)+ scripts/generate-third-party-notices.cjs 硬编码头部行(L112 "PuPu itself is licensed under Apache-2.0")+ CONTRIBUTING 措辞;换证 commit 注明历史 tag 仍 Apache/MIT;礼节通知 6 位外部贡献者(非法律必需)。
- unchain 保持 Apache(Grafana 先例:核心 AGPL、库保持 Apache;SDK 靠许可型换采用;AGPL PuPu 嵌 Apache unchain 无兼容问题;期权保留)。
- 已标注不确定项:MAS×AGPL 是通说+VLC 先例非成文法,真上架前过律师;Cherry Studio 现为标准 AGPL+商业豁免(当日核实 repo)。
- 备选排序:AGPL+CLA > GPLv3(桌面等价但堵不住托管 PuPu 后端当服务的口子)> Apache 现状(变现杠杆为零)> FSL/BUSL(非 OSI,Show HN 叙事降级,对桌面 app 过度武装)。

关联:[[onboarding-contract]] [[roadmap-predesigns-019-020]]
