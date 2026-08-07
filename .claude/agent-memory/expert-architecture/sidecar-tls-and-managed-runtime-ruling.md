---
name: sidecar-tls-and-managed-runtime-ruling
description: 2026-07-28 双层裁决(rev2.1,回喂已合入):擎net_tls保留随0.1.9(已提交298f3ed);v2=钉版+签名产物内嵌pins+预置Node;实测=env继承永不达MCP子进程(显式env dict是唯一通道);验签在构建期消费用户端零gpg;TOFU钉包=P7
metadata:
  type: project
---

# Sidecar TLS 信任 + MCP managed runtime 双层裁决 (2026-07-28, rev2)

> **rev2 (2026-07-28 当日): CEO 审阅后修订。** 主体结论不变;三处表述按 CEO 纠正校准(标注 [CEO-rev]);「预置 Node」由押后**改判为纳入 v2**(我重评后同意,非单纯服从);v2 切片按「固定版本+发布时固定 SHA-256+倾向预置」重排;发布门加「企业代理网络」维度。修订原则(CEO 定,永久适用):**每条否决必须区分 物理不可能 / 代价不值 / 当前不推荐——把"不该做"写成"做不到"会污染后来者的决策。**
>
> **rev2.1 (同日): 两项回喂合入(标注 [取证] / [守])。** 优先级排序不变。CEO 已接受三处校准并认可预置改判。第一层已提交 dev `298f3ed`(未 push,1039 passed,detect-changes low);三 cell 发布门已送 COO 裁定归属与执行。

背景:冻结产物在干净 Mac 上 MCP 安装全挂(`SSL: CERTIFICATE_VERIFY_FAILED`)。根因:PyInstaller onefile 打包构建机 libssl,OPENSSLDIR 烧死为 python.org 3.12 绝对路径,用户机不存在→0 信任锚。stdlib urlopen 中招,httpx(显式 certifi)一直没事。

## 第一层裁决:擎的 net_tls.py 修法 = 保留 + 提交 + 随 0.1.9

- 解析链 env→truststore→certifi→system,单点工厂,14 出网点全改,`PUPU_TLS_TRUST_SOURCE` 逃生口。守已 GO。
- **半单向门:auto 解析顺序一旦随版发布即兼容性契约**(调序改变 MITM 机器行为),须写 docs 冻结。其余可逆。
- 否决的替代方案(不复议;每条标明否决性质):
  - **Electron 做所有出网 —— 当前不推荐(架构判断,非能力判断)** [CEO-rev]:技术上可以加 IPC/RPC 桥让 Flask 回调 Electron 出网,但会把 Flask、Electron IPC、下载与 OAuth/模型请求耦合在一起,且 14 出网点仅 3 个是下载,LLM/OAuth/embeddings 语义上属于 sidecar。复杂度不值得。条件变了(如出网点收敛到纯下载)可重评。
  - **打包期烧 SSL_CERT_FILE —— 代价不值且机制性有害**:env 是解析链第 1 优先,会永久遮蔽 truststore、杀死企业 MITM 覆盖,且 env 漏进子进程。机制真实,判断成立,维持。
  - **链系统 libssl —— 当前不可依赖(无受支持路径,非物理不可能)** [CEO-rev 同类自查]:macOS 不提供稳定公开的 libssl ABI(自带 LibreSSL 仅 CLI,无 SDK 头文件/无兼容承诺);硬链接系统私有库技术上可 hack,但 OS 升级即碎,不能作为受支持路径。原表述"死刑"过度,校准为:无受支持 ABI,不可依赖。
- 补强切片:S2 启动日志 trust source(观测 truststore collect 静默失效);S3 AST 守卫测试禁无 context 出网(抗回归正解);S4 发布门(见下节,**rev2 加企业代理维度**);S5 OAuth re-wrap 吞指引(Low,发布后)。
- `truststore.inject_into_ssl()`(pip 24+ 默认做法)= unchain core web_fetch MITM 遗留项首选候选,同进程零跨仓改动,post-0.1.9 挂 flag 实验。

## 发布门 S4 (rev2):冻结产物 + 干净机 + 企业代理网络

CEO 加了第三维度。我们**没有常备企业代理环境**,所以门的可操作形态是本地模拟,不是真企业网:

- **Cell A(直连)**:冻结产物,干净机/干净账户,直连网络,MCP 安装+聊天全流程。
- **Cell B(模拟企业 MITM)**:同机上跑 mitmproxy,把 mitmproxy CA 装进系统钥匙串(模拟"企业已正确部署根证书"),设系统代理,再跑同一流程。验证点:sidecar TLS 经 truststore 拿到代理 CA(S2 日志可证);**聊天全流程须打通 provider SDK 出网**(openai/anthropic 自建 transport 不受 AST 守卫覆盖,此 cell 是它们唯一的每版实测面,rev2.1);npx/uvx 路径在 P4 落地前**预期失败**——失败必须是清晰报错而非静默挂死,且已知失败清单随版本记录。
- **Cell C(可选负例)**:代理 CA 不入信任库→必须 fail-closed 且报错可读。
- 执行:脚本化配方(mitmproxy 起停+CA 装卸+代理设定)一次写好入库,pupu-release-full-test 执行,配方由 security-expert+擎供稿。每个动过 网络/TLS/runtime 代码的候选版必跑;因已脚本化,建议每版都跑。

## 第二层裁决 (rev2):managed runtime v2 = 固定版本 + 发布物内嵌 SHA-256 + 预置进安装包

- **Electron 内置 Node(ELECTRON_RUN_AS_NODE)—— 否决,定性:兼容性不可控,不能作为受支持的运行时** [CEO-rev]:风险真实(ABI/NODE_MODULE_VERSION 差异可断原生模块 MCP server;无 npm/npx 需自 vendor;Node 版本被 Electron 升级绑架),但是否断取决于 Electron 的 Node 版本、运行方式与具体包的原生依赖——不是"全断"。正确理由:我们无法承诺其兼容面,故不能把它当受支持运行时(代价不值+不可控,非物理不可能)。Bun 同理。
- **预置 Node 进安装包 —— 改判:纳入 v2(原押后判决撤销)** [CEO-rev]:原判用"npx 仍需 registry,买不来离线"否决——指标选错。预置买的是:供应链闭环(不下载=无替换面)、确定性版本(发布门能认证随版 runtime)、去掉安装期对 nodejs.org 的依赖(企业网常见断点)。40-50MB 相对整包可承受。诚实边界:**预置不修 npx→npm registry 断点**,不得在发布沟通中冒充全解。
- **CEO 独立发现的供应链洞(三轮评审均未提出)**:Node 的 SHASUMS256.txt 与压缩包同 origin(mcp_managed_runtime.py L330-333);uv 的 checksum 是 `{archive_url}.sha256` 字面自引用(L396-398)。现有校验只防传输损坏,不防发布物替换。**版本与哈希必须写进 PuPu 发布物**。守定级 Medium×2,不进 0.1.9 [守]。
- 现状四缺陷(取证于 mcp_managed_runtime.py,维持):darwin-only(L443 非 darwin 透传用户机)/版本不钉(latest LTS+GitHub latest)/惰性物料化(首聊 npx 失败暴露在对话中)/企业断点(npx 走 Node 自带 CA,见 P4)。

### 回喂坐实的关键事实 (rev2.1)

- **[取证] Node 不读我们的任何信任配置**:根证书编译进二进制(rootCertificates=120,无视 SSL_CERT_FILE/SSL_CERT_DIR);唯一入口是 `NODE_EXTRA_CA_CERTS`,PuPu 全仓未设。
- **[取证] env 继承在 MCP 子进程上结构性失效**:`mcp` 1.26.0 `stdio_client` 以 `{**get_default_environment(), **server.env}` 起子进程,POSIX 白名单仅 HOME/LOGNAME/PATH/SHELL/TERM/USER——HTTPS_PROXY/NO_PROXY/NODE_EXTRA_CA_CERTS/SSL_CERT_FILE 五项实测全部到不了。**即使在 sidecar 设了也无效。**唯一通道 = PuPu 显式构建的 env dict(`mcp_toolkits.py` 与 `_node_env` 合并处,今天只带 PATH+npm cache)。
- **[取证] `_uv_env` 同样不带 SSL_CERT_FILE**→ uvx 类 Python MCP server 也拿不到逃生口,纳入 P4 scope。
- **v2 设计约束(擎提出,采纳为不变量)**:任何需要到达 MCP 子进程的配置,必须走显式 env dict;**继承永远视为失效**,不得依赖。
- **[守] P1 形状定案——验签在构建期消费,用户端零 gpg**:哈希钉进 PuPu 签名发布物后,信任锚从上游 TLS 迁到 PuPu release 签名(codesign+notarization 覆盖 app 内文件),运行时再做 GPG/sigstore 验证无增益。上游验签(Node PGP SHASUMS256.txt.asc / uv GitHub Attestations,均已实证存在;uv 0.11.9 曾漏发须容忍断档并 fail-closed)放进**构建流水线的 pin 生成时刻**。我采纳:这是正确的信任锚迁移,P1 按此定形。
- **[守] 上一层未钉面**:npx 拉的 MCP server 包只受 npm registry 信任——同类问题在包层复现。现有缓解=商店条目钉版本政策;增强=TOFU 钉包(首装记录 integrity,变更告警)→ 立为 P7。
- **[守] 廉价先手**:uv 从 `releases/latest` 改钉版 URL 一行常量;是否搭 0.1.9 顺风车归 COO,不影响本切片结构。
- **[取证] AST 守卫不覆盖 provider SDK(openai/anthropic/qdrant_client 自建 transport)——我的裁定:不加用户机启动期断言**。启动期做真实 TLS 握手违反离线启动,静态检查断言不了第三方内部行为;正确落点是**发布门 Cell A/B 的聊天全流程本来就走 provider SDK 出网**——把"它们的行为"变成每版实测事实,而非我方不变量。已在 Cell B 验证点中显式列入。记录为已知 gap,不糊。

### v2 切片 (rev2 重排)

| # | 切片 | Owner | 依赖 | 门性质 |
|---|------|-------|------|--------|
| P1 | 固定版本 + **`mcp_runtime_pins.json` 随 unchain_runtime 打进签名产物**;运行时**零元数据请求**(删 NODE_INDEX_URL 拉取段与 UV_LATEST_BASE_URL,URL 由钉版构造只下 tarball);删 `_parse_checksum_for_file`(64 字符 token 兜底过松);fail-closed,**不得新增任何跳过校验的 env**;上游验签(Node PGP / uv attestation,容忍断档 fail-closed)在**构建流水线 pin 生成时**消费,用户端零 gpg | 擎(runtime 侧)+ build 管线(pin 生成+验签) | 守的 manifest 方案(已到) | **政策性单向门**:停止信任运行时自取 checksum 后不得退回(退回=重开供应链洞) |
| P2 | **预置 Node+uv 进 macOS 安装包**(darwin 先行,与现状 darwin-only 对齐);物料化=解压非下载;签名/公证入 build | 擎 + electron/build(release 工程) | P1 钉版 | 可逆(保留 P1 pins 下载作为退路) |
| P4→**提级与 P1 同显著** | **MCP 子进程信任/代理透传**——修法已由取证定形:在 `_node_env` **和 `_uv_env`** 的显式 env dict 中注入 `NODE_EXTRA_CA_CERTS`(指向 net_tls 解析出的 trust bundle)、`SSL_CERT_FILE`(uv/Python 侧)及 HTTPS_PROXY/HTTP_PROXY/NO_PROXY;**禁止依赖继承**(stdio_client 白名单实测只放行 HOME/PATH 等 6 项)。**发布沟通必须写明:0.1.9 TLS 修复后,企业 MITM 网络的 MCP 安装仍不可用,直到本切片落地** | 擎;沟通措辞归 release/COO | 取证已到;trust bundle 落盘形态与 net_tls 对齐 | 可逆 |
| P3 | 安装点击时物料化(toolkit UI 配合);P2 落地后此步退化为解压/链接,变小 | 擎 + dev-toolkit | P2 | 可逆 |
| P5 | Win/Linux 补齐(0.2.0 量级) | 擎 + client-platform(若编制获批) | P1/P2 模式定型 | 可逆 |
| P6 | unchain core web_fetch 遗留(truststore.inject 实验) | 擎 + 我双签 | 0.1.9 发出后 | 可逆 |
| P7 | **TOFU 钉包**(npm 包层未钉面):首装记录 integrity,变更告警;现有缓解=商店条目钉版本政策 | 擎 + 守 + mcp-store-curator | P1 落地后 | 可逆 |

优先级:P1 与 P4 并列最高(P1 是供应链正确性,P4 是用户可感的残留断点+沟通义务)→ P2 → P3 → P5 → P6 → P7。全部 post-0.1.9(守定级 Medium×2 不进 0.1.9,一致);第一层随 0.1.9 不变(dev `298f3ed` 已提交)。uv 钉版一行常量是否搭 0.1.9 归 COO。

关联:[[computer-use-hybrid-design]] [[roadmap-predesigns-019-020]]
