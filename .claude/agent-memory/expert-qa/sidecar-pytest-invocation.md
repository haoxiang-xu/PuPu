---
name: sidecar-pytest-invocation
description: How to actually run unchain_runtime/server/tests — only the unchain repo's venv collects, and PuPu declares no invocation anywhere
metadata:
  type: project
---

**`unchain_runtime/server/tests/**` 只在 `/Users/red/Desktop/GITRepo/unchain/.venv/bin/python` 下 collect 得动。** PuPu 自己的 `.venv` 与系统 python3（anaconda）都在收集阶段就死：`ModuleNotFoundError: No module named 'unchain'`。

```bash
cd /Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server
/Users/red/Desktop/GITRepo/unchain/.venv/bin/python -m pytest tests/<file>.py -q
```

实测（2026-08-08，PuPu `b2385d5d`）：`test_memory_v2_context_reference_policy.py` → 20 passed / 1.23s；`test_memory_v2_context.py -k partial` → 1 passed / 0.06s；`test_unchain_adapter_capabilities.py --collect-only` → 111 tests / 0.41s。

**Why:** PuPu 仓内 **零声明** —— 无 `conftest.py`、无 `pytest.ini`、无 `pyproject.toml` / `setup.cfg`（深度 ≤3，排除 node_modules）、`package.json` 无 pytest 脚本、`unchain_runtime/scripts/` 只有两个构建脚本。`unchain` 包只装在另一个仓库的 venv 里（python3.12，`unchain-0.2.0.dist-info`）。**故这条跑法是一条未写下来的跨仓事实**，第二个人无法从仓库推出来 —— 这直接影响任何落在 `unchain_runtime/` 的改动能否交出可复现的验收证据。

**How to apply:** 任何要求跑 sidecar 测试的场合，先用上面这条命令，别用 `python3` 也别用 PuPu 的 `.venv`。若要出具验收证据，**必须在证据里写明解释器路径**，否则不构成「可复现定位」。若哪天该 venv 消失或 unchain 版本变了，重新定位：`ls -d /Users/red/Desktop/GITRepo/unchain/.venv/lib/python*/site-packages/unchain*`。

**注意一条常被误用的铁律**：「`.py` 改完不重启 sidecar 不生效」约束的是 **经运行中应用作出的观察**；**pytest 直接 import 模块，不受该陷阱约束**。验收报告要把这两半分开写。

相关：[[repo-admission-assertions-are-blind]] · [[sidecar-degradation-test-idioms]]
