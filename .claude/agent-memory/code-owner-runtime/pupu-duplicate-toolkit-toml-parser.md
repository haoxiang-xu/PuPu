---
name: pupu-duplicate-toolkit-toml-parser
description: toolkit.toml 被解析两次（unchain registry 与 PuPu adapter 各一份），PuPu 生效路径不走 unchain registry——manifest 新段只改一处等于没有协议
metadata:
  type: project
---

toolkit.toml 今天被解析两次：`unchain/src/unchain/tools/registry.py` 有一套完整 manifest 解析 + summary；PuPu 的 `unchain_runtime/server/unchain_adapter.py`（catalog 构建处，`_read_toolkit_toml`）**又自己读了一遍同一个 toml**。`[display]` 的 category/order/hidden 在 PuPu 里生效走的是 PuPu 这份解析，不是 unchain registry 的输出。核实：2026-08-03，unchain dev@a54050d。

**Why:** 这决定了"给 toolkit 加 `[hosts.*]` 段"的真实成本与真实收益。只改 PuPu 那份 = 今天就能跑通、零 unchain 改动，但 unchain registry 依旧丢弃该段（白名单构造，见 [[unchain-drop-silently-whitelists]]），第三方 host 拿不到任何东西，"跨 host 协议"名存实亡。2026-08-04 CEO 已授权把"同 PR 删掉 PuPu 第二解析器"绑进 hosts.* 透传那一刀。

**How to apply:** manifest 层任何新段（hosts.*、schema_version），要么两处解析同时改、并在同一 PR 把 PuPu 那份改为消费 unchain registry summary，要么明确承认它是 PuPu-only 私有字段、不对外宣称是协议。实施前置见 [[unchain-externalization-charter]]。
