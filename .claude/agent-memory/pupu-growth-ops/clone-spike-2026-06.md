---
name: clone-spike-2026-06
description: CEO 关注的 2026 年 5 月底/6 月初 clone 飙升——判定为噪声，及下次如何证实是否真增长
metadata:
  type: project
---

CEO 在 2026-06-08 前后反映「这几天 clone 数据好像涨了」。2026-06-09 快照（14 天窗口）：clones count=7608，uniques=201，2026-06-02..04 单日峰值 971-1134。但同窗口 views count=326、uniques=36；v0.1.6 安装包下载仅约 47。

**判定：几乎可以确定不是真实用户增长，是 bot/CI/镜像噪声。**

**Why:** clone（7608）比独立访客（36）和下载（约 47）高出 100 倍以上。真实桌面应用用户是访问页面→下载安装包，不会一天 git clone 上千次。这是 CI runner / 扫描器 / 镜像反复拉取的典型特征。独立 cloner 201 相对 36 个页面访客也明显虚高。把 clone 当用户数是教科书级错误。

同窗口唯一的真信号：2026-06-07 有一次 views 峰值（108）且合并了史上第一个外部社区 PR（#150 huangse199）——这是真实、可归因的小波动，与 clone 数字无关。

**How to apply:** 不要因 clone 数字而庆祝或决策。下次巡船时 diff `~/.pupu-growth/` 的 clone 快照：若 clone 持续高而 downloads/uniques 仍平，则确认为噪声。真正要看的是**独立访客 + 每日安装包下载**，不是 clone。若 CEO 想要来源——GitHub traffic 不按 referrer 拆分 clone，clone 本质不可归因。相关：[[snapshot-history]]。

**2026-06-14 复检（已证实为噪声）：** clone 仍维持每日 700-900（06-08..13 区间），14 天 count 反升到 11230，但同期 views uniques 仅 43、v0.1.6 下载 5 天只 +17。clone 持续高、人类信号持续平 → 按预案确认为 bot/CI/镜像噪声，符合「持续高而 downloads/uniques 平」的判据。结论锁定，CEO 不必再追这个数字。
