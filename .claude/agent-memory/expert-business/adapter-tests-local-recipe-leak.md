---
name: adapter-tests-local-recipe-leak
description: MisoAdapterCapabilityCatalogTests 在隔离下挂,是因 stream_chat_events/_create_agent 都读本机 ~/.pupu/agent_recipes/Default.recipe,本地有 graph recipe 就把测试分流过 mock;另有 3 个 workspace 测试是陈旧 mock 的第二根因
metadata:
  type: project
---

**现象(2026-06-14 release triage)**:`tests/test_unchain_adapter_capabilities.py::MisoAdapterCapabilityCatalogTests` 里 9 个测试在本机失败,隔离单跑也挂。非回归、非 PuPu↔unchain 版本漂移。

**根因 A(测试隔离漏洞,占 6 个)**:`stream_chat_events`(unchain_adapter.py:5333)和 `_create_agent`(:4585)**都**会调 `_load_recipe_from_options`,空 options 时默认加载用户本机 `~/.pupu/agent_recipes/Default.recipe`。开发者机器上若存了 graph recipe,`_recipe_has_graph` 为真 → 代码分流进 graph 引擎、提前 return,**根本到不了被 mock 的 `_create_agent`/FakeAgent**,于是断言全错。该类每个碰 recipe 的测试本就 patch `_load_recipe_from_options→None`(:1684/1780/1874),graph 行为测试在别的类——即此类语义上就是"非 graph 路径"。

**已修(工作树,未提交)**:给 `MisoAdapterCapabilityCatalogTests` 加 class-level `setUp`,统一 `mock.patch.object(unchain_adapter, "_load_recipe_from_options", return_value=None)` + addCleanup,使全类对本机 recipe 状态 hermetic。9→3。

**根因 B(陈旧 mock,剩 3 个,未修)**:`test_create_agent_builds_multi_workspace_proxy_toolkit_*` / `_marks_selected_workspace_tools_requires_confirmation` / `_preserves_workspace_pin_execution_context` 的 `importlib.import_module`/`WorkspaceToolkit` mock 与重构后的 workspace 构建路径(`_resolve_workspace_toolkit_factory` :2802、`_build_workspace_toolkits` :3030、多 root proxy)**脱节**:recipe 分流修好后它们继续往下走,2 个断 `assertTrue ... requires_confirmation` False、1 个抛 `RuntimeError: Miso WorkspaceToolkit is unavailable`(:2812)。这是 test-vs-code drift,需 backend/llm 域知识更新 mock,owner=pupu-dev-backend(precedence 是否符合 spec 找 pupu-llm-expert 核)。

**待确认产品问题**:"本机有 graph recipe 就优先于普通 agent 路径"这个 precedence 是否是 spec。

**Why**: 这两簇都是 CI-hygiene、非 product blocker(coo 判 GO),但会反复误报;记清根因免得下次又怀疑版本漂移/回归。

**How to apply**: 这类 adapter 测试在隔离下挂、又没动 adapter 代码时,**先怀疑本机 ~/.pupu 状态泄漏**;新写经 stream_chat_events/_create_agent 的测试必须 stub recipe 加载。相关:[[registry-frontend-backend-shared-file]]、[[react-router-dom-jest-main-field]]。
