---
name: managed-runtime-pinning-verdict
description: 2026-07-29 CEO 亲自提出的 managed runtime 发布物信任缺口：同源 SHA 定级 Medium，方案=pin 进 PuPu 发布物+pin 时签名验证；v2 输入不进 0.1.9
metadata:
  type: project
---

# Managed Runtime 发布物完整性裁决（2026-07-29，CEO 亲自发现）

**结论：CEO 判断正确且此前两轮确实漏了。定级 Medium（Node 同源 SHA）+ Medium（uv latest 浮动窗口），不构成 0.1.9 阻断；方案已定为 v2 下限。**

**Why:** `mcp_managed_runtime.py` 当前 SHA 与 tarball 同源同信道，实际信任锚 = nodejs.org TLS + 其分发设施 / GitHub releases + TLS。传输层损坏能防，"发布物不可替换"防不了。且 PuPu 的 TLS 信任工厂支持 env 注入 CA（见 [[sidecar-tls-trust-review]]），受信任企业代理 MITM 可同时替换 tarball+SHA——这是最现实的失效场景，不是纯理论。

## 定级要点（复述用，细节以当时代码为准）
- Node：安装时取 latest LTS（不钉版）+ SHASUMS256.txt 同源无签名验证。**实证确认** nodejs.org/dist 每版本目录有 `SHASUMS256.txt.asc`/`.sig`，密钥环在 nodejs/release-keys——现成强保证放着没用。
- uv：`releases/latest/download/*.sha256` 双重弱——checksum 自引用 + latest 浮动（攻击者拿到 repo release 权限即全量新装机即时中毒）。uv 比 Node 略弱：攻击面=repo 维护者/CI，且无离线密钥可锚（有 GitHub artifact attestations/sigstore，但需在线验证）。
- latest 不钉版独立成险：供应链时间窗 + 不可复现（两台机器装出不同 runtime）。
- 非 darwin 透传用户机 npx/uvx（L443）：非我们引入的面，责任上更轻、保证上更弱，PATH 劫持需本地已沦陷=Low。v2 统一管，非紧急。
- 正面确认：`_safe_extract_tar` 有 traversal/symlink/hardlink 防护；出网已走 `get_outbound_ssl_context()`。
- 顺带缺口：①最大的其实是 MCP 包层（npx pkg 只受 npm registry 信任）——商店钉版本政策（[[mcp-store-security-baseline]]）是现有缓解，继续执行；②`~/.pupu/mcp_runtime/manifest.json` 无签名可本地篡改=Low；③`_parse_checksum_for_file` 的 64 字符兜底解析过松=Low（方案落地后消失）；④uv 还会再下 python-build-standalone，钉 uv 版本即间接约束，深钉不做。

## 已定方案（v2 下限，How to apply）
1. **钉版清单进发布物**：`mcp_runtime_pins.json` 随 PuPu 签名发布物内置（schema: node/uv → version + per-platform-arch {filename, sha256}）。运行时**零元数据请求**：删 index.json 与 releases/latest，URL 由钉定版本构造，下载后直接比对内置 sha256。
2. **pin 时消费强保证**：升级脚本（dev 侧）拉 SHASUMS256.txt 并用 nodejs/release-keys 钉定密钥环 gpgv 验签；uv 用 `gh attestation verify`。签名验证发生在发版工程时，用户端零 gpg 依赖。运行时不做 GPG——哈希已钉后运行时验签无增益，只在保留动态版本时才有意义（我们不保留）。
3. **fail-closed**：校验失败抛 `mcp_runtime_checksum_failed`，错误信息只报事实+建议升级 PuPu，禁止提供任何 skip/override env；明确不得新增跳过校验的开关。
4. **升级流程**：bump = 改 pins 文件的 PR，diff 小可审，安全侧对该 diff sign-off（列入 [[release-security-gates]] 的触发面）。
5. **分级**：下限=钉版+钉哈希+fail-closed（必须）；上限=随安装包预置 Node/uv（CEO 倾向，+约 50MB 体积，连 nodejs.org 可用性依赖都消除，由 CTO 按安装包体积预算裁）。中间廉价先手：uv 从 latest 改钉定版本 URL 是一行常量改动，可作 v2 第一刀。
6. 不进 0.1.9 的理由：exploit 前提=nodejs.org/GitHub 发布设施沦陷或受信 CA MITM，Medium 不够阻断线；且 0.1.9 候选已冻结。
