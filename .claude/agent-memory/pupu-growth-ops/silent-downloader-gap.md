---
name: silent-downloader-gap
description: PuPu 几乎所有 issue 都是维护者自己开的——用户是沉默下载者，存在反馈/触达缺口而非使用缺口
metadata:
  type: project
---

截至 2026-06-14：85 个 issue 中 **83 个由 haoxiang-xu 本人开**，外部仅 2 个（Max-jzyan、zxp19821005 各 1）。同时安装包在持续被下载（v0.1.6 在加速，见 [[install-signal-2026-06]]）。

**判定：用户是「沉默下载者」——在用，但不反馈。这是触达/反馈缺口，不是使用缺口。** issue 列表本质上是维护者的自用 backlog，不能当社区活跃度读。

**外部参与的真实亮点（稀少但真）：**
- PR #150（huangse199，2026-06-07 合并）= 史上第一个外部社区代码 PR，且伴随当天 views 峰值 108。
- 重复外部贡献者：Max-jzyan、ehz2、zzmjeremy 各有多个 PR；contributor 名单高度集中于维护者，bus factor = 1。

**2026-06-26 更新：** issue 仍 86/88 由维护者本人开（外部仅 Max-jzyan、zxp19821005 各 1，自 06-14 无新增外部 issue 作者）→ 沉默下载者缺口未改善。但贡献者 roster 6→7：**新增外部贡献者 skywalker007-cpu（1 PR / 4 contributions）、tianyi-xia1（2 contributions）**，且 Copilot agent 贡献 9 个 PR。PR 卫生极佳：69 个 PR、64 merged、0 open、0 stale。社区火苗在 PR 侧（代码贡献）持续、在 issue 侧（反馈）仍冰封——反馈入口仍是最该补的运营缺口（has_discussions 仍 false）。

**2026-07-05 更新：** 缺口依旧——issue 88 总 / 86 由维护者自开（外部仍仅 Max-jzyan、zxp19821005），32 个未关 issue 全部龄化~113 天=维护者自己的路线图 backlog 在发霉,不是用户求助没人理(关闭率 64%、中位关闭 10 天,响应侧健康)。PR 侧亮点确认:**5 位外部人类 PR 贡献者**(zzmjeremy/Max-jzyan/ehz2/skywalker007/huangse199)+ Copilot,0 open/0 stale。反馈闭环仍哑(has_discussions 仍 false)——补反馈入口是持续第一运营缺口。

**2026-07-21 更新：出现久违的新外部 issue 作者。** issue 总数 88→108(+20,几乎全是维护者自开的 0.1.9 收敛期路线图 backlog,open 32→47),但非维护者作者从 2→**3:新增 holistis(1 issue)**——自 06-14 以来首个新外部 issue 作者,沉默下载者缺口出现第一道细缝。PR 侧仍无懈可击:77 总 / 71 merged / **0 open / 0 stale**,5 位外部人类贡献者(zzmjeremy/Max-jzyan/ehz2/skywalker007/huangse199)+Copilot 10。has_discussions 仍未开(open_issues API=47 为纯 issue,非含 PR)。反馈入口仍是持续第一运营缺口,但 holistis 证明只要有人来、他们会开 issue。

**Why:** CEO 想知道社区健不健康。raw issue 数会误导成「社区活跃」，实则全是自己开的。
**How to apply:** 报社区健康度时务必拆「谁开的 issue」。要缩小该缺口的运营动作：在 app 内/README 放轻量反馈入口、good-first-issue 标签、开 Discussions（当前 has_discussions=false）。把「首个外部 PR」「重复外部贡献者」当作要呵护的早期社区火苗。相关：[[install-signal-2026-06]]。
