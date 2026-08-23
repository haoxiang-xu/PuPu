---
name: frozen-artifact-only-defect-class
description: 有一整类缺陷只在「PyInstaller 冻结产物 + 干净用户机」组合下现形,现有全部发布门(全在 dev 模式/构建机上跑)结构性测不到;2026-07-28 TLS 事故确立
metadata:
  type: project
---

**存在一类缺陷,现有发布门无论跑多少遍都得不到任何证据。**

2026-07-28 实证:sidecar 以 PyInstaller `--onefile` 打包,PyInstaller 会把构建机的 libcrypto 一起打进去,而 OpenSSL 的 OPENSSLDIR 是**编译期烧死的绝对路径**(python.org macOS framework build = `/Library/Frameworks/Python.framework/Versions/3.12/etc/openssl/cert.pem`)。该路径在构建机上真实存在、在用户机上不存在 → 冻结产物里每一次 stdlib TLS 调用加载到**零信任锚**。表现:干净 Mac 上 MCP toolkit 一个都装不上(`mcp_runtime_install_failed` + `CERTIFICATE_VERIFY_FAILED`),而聊天/LLM 全程正常(httpx 显式传 certifi)。

**为什么所有门都瞎了**:前端 jest / Electron jest / 后端 pytest / release-qa / deterministic soak / 付费 6-cell —— **无一例外跑在 dev 模式的 venv 解释器上,或跑在构建机上**。这两种环境里那条烧死的路径都是真的。开发机是特例;CEO 换一台电脑才撞出来。

**判别口诀(下次省几小时)**:同一台机器上 **httpx 通、urlopen 挂 = 缺信任根,不是网络问题**。httpx 显式传 certifi,stdlib 不传。

**推论,写进发版判断**:
- 凡改动只落在 `unchain_runtime/server/**` 且症状与打包/路径/原生库相关的,**重跑免费门等于零信息量**。别拿"免费门全绿"当修复已验证的证据 —— 那是分类错误,不是证据不足。
- 唯一能验的是「冻结产物 + 干净机」实测。这条不是流程洁癖,是该缺陷类的**唯一可观测面**。
- 干净机定义要严:必须是**没装过 python.org Python 3.12**(或装了但没跑 `Install Certificates.command`)的机器。免疫窗口极窄 —— Homebrew Python、3.11/3.13、纯净机全部会中。一台机器一旦跑过修复版就不再是干净机,标准环境应可重置(VM 快照优于第二台真机)。

**同类嫌疑面(将来动到就要触发同一条门)**:任何 PyInstaller `collect` 依赖(truststore/certifi 掉了会静默降级)、native lib 的编译期路径、以及一切"构建机上存在、用户机上不存在"的假设。`main.py` 的 boot trust 行(`source=... chain=... anchors=...`)就是为观测 collect 静默失效加的,支持日志第一行看它。

**未被此修复覆盖的部分(别对外说 TLS 全解决)**:Node 有自己编译进去的根证书,`SSL_CERT_FILE`/`SSL_CERT_DIR` 一概不读(实测:两者指向空文件/不存在目录时 `require('tls').rootCertificates.length` 仍为 120);且 `mcp` 1.26.0 的 `DEFAULT_INHERITED_ENV_VARS` 在 POSIX 上只有 `HOME/LOGNAME/PATH/SHELL/TERM/USER`,`NODE_EXTRA_CA_CERTS`/`HTTPS_PROXY`/`SSL_CERT_FILE` **到不了 MCP 子进程**。所以企业 MITM 环境下 `npx` → registry.npmjs.org 那一跳仍然挂,归 managed runtime v2。

关联 [[release-unchain-editable-source-coupling]]、[[release-license-bundling-boundary]]。
