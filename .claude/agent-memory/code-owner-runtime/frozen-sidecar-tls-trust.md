---
name: frozen-sidecar-tls-trust
description: 打包后的 PyInstaller sidecar 继承构建机的 OPENSSLDIR 绝对路径，导致所有 stdlib TLS 出网在用户机上必然失败；开发机永远看不见这个 bug
metadata:
  type: project
---

# 冻结 sidecar 的 TLS 信任根断裂 (2026-07-28 定位并修复)

**事实：** PuPu 的 Python sidecar 是 PyInstaller `--onefile` 产物。它打包了构建机 python.org framework 的
`libcrypto.3.dylib`，而 OpenSSL 的默认信任路径 `OPENSSLDIR` 是**编译期烧进那个 dylib 的绝对路径**
(`/Library/Frameworks/Python.framework/Versions/3.12/etc/openssl/cert.pem`)。这个路径在用户机上不存在 →
`ssl.create_default_context()` 加载 **0 个信任锚** → 所有 stdlib `urllib.request.urlopen` 出网报
`CERTIFICATE_VERIFY_FAILED: unable to get local issuer certificate`。

**Why：** CEO 在第二台 Mac 上装 MCP toolkit 报此错，开发机完全正常。开发机之所以正常，是因为
python.org 安装器跑过 `Install Certificates.command`，在那个路径建了一个指向 site-packages
`certifi/cacert.pem` 的符号链接。**这是一个开发机结构性看不见的缺陷类别** —— 构建机总是满足条件。

**关键非对称（诊断这类问题的第一判据）：** 聊天/LLM 调用一直正常，只有 MCP 安装失败。因为 httpx 显式
`ssl.create_default_context(cafile=certifi.where())`，而 stdlib urllib 不看 certifi。
**"httpx 路径能通、urlopen 路径不通" = 信任根缺失，不是网络问题。**

**信任顺序 = 兼容性契约（2026-07-28 随 0.1.9 冻结）：** `env → truststore → certifi → system`。
env 第一是因为 OpenSSL 本来就优先读它，降级会悄悄推翻管理员钉的 bundle；truststore 高于 certifi
是因为它是唯一能吃到企业 MITM 代理根证书的来源（装在 OS keychain，不在任何 Python bundle 里）。
**改顺序 = breaking change**，不是重构 —— 它改变的是已装机器上的实际信任行为。已被
`test_net_tls.py::TrustOrderContractTests` 钉死；理由全文在 `docs/architecture/outbound-tls-trust.md`。

**How to apply：**
- 新增任何出网调用，一律走 `unchain_runtime/server/net_tls.py` 的 `get_outbound_ssl_context()`，
  不要裸 `urlopen` / 裸 `httpx`。红线：任何形式的关闭校验都不接受。
- `tests/test_outbound_tls_guard.py` 是全仓 AST 棘轮，会自动拦截漏传 context/verify 的新调用。
  **它没有 `# noqa` 逃逸口**（一行就能绕过的守卫等于没有），唯一出口是文件内 `REVIEWED_EXEMPTIONS`
  带 reason 的条目。静态判不出 URL 的一律要求传 context —— 因为 `f"{base_url}/x"`（OLLAMA_HOST，
  可以是远端 https）正是靠猜会漏掉的形状。守卫自带 mutation 测试防止它自己变成空转。
- 新增 Python 依赖若含运行期数据文件 (如 CA bundle)，必须同时改 **两个** 构建脚本
  (`build_unchain_server.sh` 和 `.ps1`)，否则只有一个平台的产物是对的。
- `THIRD_PARTY_NOTICES.txt` 是 gitignore + 构建期生成的，`pip-licenses` 枚举的是**复用的构建 venv**。
  往 `.venv-unchain-build` 临时装任何东西 (例如 pytest) 都会污染 notices —— 用完必须卸掉再重新生成。
- 验证这类环境依赖缺陷的手法：`SSL_CERT_FILE` 指向不存在的文件 + `SSL_CERT_DIR` 指向空目录，
  即可在开发机上精确复现用户机的零信任锚状态。

**第二断点：Python 侧的修复救不了 Node（2026-07-28 已取证，未修，属 managed runtime v2）。**
Node 有自己编译期烧进去的根证书库，**完全无视 `SSL_CERT_FILE`/`SSL_CERT_DIR`**。实测：
`SSL_CERT_FILE=/tmp/empty.pem node -e "require('tls').rootCertificates.length"` → 仍是 120。所以
`mcp_managed_runtime` 自己下 Node tarball 那一跳已被修好，但之后 `npx <pkg>` 拉 npm registry 那一跳
在企业 MITM 下照样挂，需要 `NODE_EXTRA_CA_CERTS`（PuPu 目前哪儿都没设）。
**而且就算设了也到不了子进程**：MCP python-sdk 的 `stdio_client` 用
`{**get_default_environment(), **server.env}` 拼环境，`DEFAULT_INHERITED_ENV_VARS` 在 POSIX 上只有
`HOME/LOGNAME/PATH/SHELL/TERM/USER`（mcp 1.26.0 实测），`NODE_EXTRA_CA_CERTS`、`HTTPS_PROXY`、
`HTTP_PROXY`、`NO_PROXY`、`SSL_CERT_FILE` 全被剥掉。唯一能到 MCP 子进程的通道是 PuPu 在
`mcp_toolkits.py` / `mcp_managed_runtime._node_env` 里显式构造的 env dict（现在只有 PATH + npm cache）。
**推论：任何"给 MCP 子进程传环境变量"的需求都必须走那个显式 dict，靠继承一定失败。**

相关：[[team_roster]]（MCP 安全裁量归守）
