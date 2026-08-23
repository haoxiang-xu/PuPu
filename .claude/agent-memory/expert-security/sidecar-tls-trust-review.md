---
name: sidecar-tls-trust-review
description: 2026-07-28 net_tls.py 出网 TLS 信任工厂安审 GO — env-first 顺序裁定合理、逃生开关 fail-closed、truststore 供应链通过
metadata:
  type: project
---

# Sidecar 出网 TLS 信任工厂（net_tls.py）安审裁决 — GO

2026-07-28，擎修复 PyInstaller onefile 冻结产物 OPENSSLDIR 烧死路径导致的 `CERTIFICATE_VERIFY_FAILED`（MCP runtime 安装失败）。新增 `unchain_runtime/server/net_tls.py` 作为唯一出网 SSL context 工厂。本人复核后放行上线。

**Why:** 冻结产物加载 0 个信任锚，全部 stdlib urlopen 出网点在用户机器上必挂；httpx 因显式用 certifi 不受影响。

**裁定要点（后续复审不要复议）:**
1. **env-first 顺序（SSL_CERT_FILE/DIR → truststore → certifi → system）安全**。理由：(a) 改动前 stdlib 默认路径经 OpenSSL `set_default_verify_paths` 本来就认这两个 env，httpx trust_env 也认 —— env 控制信任是既有基线，非新增能力；(b) 能给 PuPu 进程设 env 的本地攻击者等价于已拿到代码执行（DYLD_INSERT_LIBRARIES 等），"能设 env 的人已经赢了"；(c) 降级顺序也删不掉该向量（最终 system fallback 仍认同一 env），只会砸掉管理员合法 pin。
2. **`PUPU_TLS_TRUST_SOURCE` 无新增面**：五个取值全部产生 check_hostname=True + CERT_REQUIRED 的 context（truststore.SSLContext(PROTOCOL_TLS_CLIENT) 已实测同默认）；最弱可达状态是零锚 system context = fail-closed（对自己 DoS），不存在 fail-open 路径。
3. **truststore==0.10.4 供应链通过**：Seth Larson 维护（PSF Security DiR）、Tidelift 背书、pip 24.2+ 默认信任机制、无已知 CVE、精确钉版。接受 OS keychain root（含企业 MITM root）是刻意设计，与浏览器/pip 一致 —— 装 root 需要 admin，超出威胁模型。
4. **mcp_oauth.py URLError 分支**：TLS 失败仍是硬失败（start/refresh/exchange 三处均 502 typed error，refresh 失败不 expire/删 token），无静默继续；错误文案为通用常量+信任源描述，无 token/secret/code 泄漏；callback HTML 有 escape。
5. 覆盖面：全仓 8 个 urlopen + 6 个 httpx 出网点全部传了 context/verify；红线 grep（unverified/CERT_NONE/verify=False 等）唯一命中是 test_net_tls.py:302 的反向断言。

**How to apply:** 动 net_tls.py、任何出网点、或 PyInstaller collect 参数时按上述基线复检；新出网调用点必须走 `get_outbound_ssl_context()`（这是新的红线检查项）。QA 红用例（见 [[qa-red-case-pipeline]]）：干净机器冻结产物 (a) 正常 https 必须通、(b) 自签名证书必须拒 —— 双向验收。

低优先携带项（非阻断）：OAuth start/refresh 的 re-wrap 会吞掉 TLS 指引文案（route_mcp 用户只看到 generic 502），擎可选择让 TLS 注解穿透。
