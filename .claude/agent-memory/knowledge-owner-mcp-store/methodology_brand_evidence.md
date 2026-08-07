---
name: methodology-brand-evidence
description: Brand facts (logo shape, official colors, license) are only valid from the publisher's own served resources — never third-party icon/color aggregator sites
metadata:
  type: feedback
---

品牌事实**只认发布方自己服务的资源**：官网自身返回的 markup/SVG、发布方仓库的 raw 文件、发布方 docs 站的资产。**不认**第三方图标站 / 配色聚合站（simpleicons 的 hex、mobbin、colorarchive、colorswall、brandcolorcode、Wikimedia 的 legacy 资产）。

**Why:** 2026-07-29 我审 plugin store 图标归属时，断言 Figma 那条的五个 hex「全错」并写进了给 CEO 的清单。依据是 WebSearch 对配色聚合站的摘要——那些站收录的是 Figma **2019 年旧版**调色板（`#0ACF83/#A259FF/#F24E1E/#FF7262/#1ABCFE`）。而 figma.com 自己 header logo 的 markup 里是 `#FF7237 #FF3737 #874FFF #24CB71 #00B6FF`，与 registry 完全一致。**registry 是对的，我是错的**，我把二手聚合站当成了一手品牌依据。CEO 已被告知这是我的方法错误。

**How to apply:**
- 判断"这是不是官方标/官方色"之前，先 `curl` 发布方官网或 raw 仓库文件，从返回内容里直接读 `fill=`。
- simple-icons 可以用来做**形状同源比对**（path 逐字节 diff，证明"这个字形取自 X 的标"），但它记录的 hex **不能**当作官方品牌色的依据。
- 聚合站和 Wikimedia 的品牌资产经常滞后一整个改版周期。旧调色板看起来"很官方"正是陷阱。
- 形状比对可以渲染后肉眼核对：`qlmanage -t -s 256 -o /tmp x.svg` 生成 PNG 再看图（本机无 rsvg/cairosvg/inkscape/magick）。

关联：[[icon-brand-attribution-doctrine]]
