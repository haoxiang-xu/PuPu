---
name: distribution-pipeline-broken
description: 发布产物靠手工上传（没有任何 build script 带 --publish、仓库无 release workflow），这一条根因同时造成自动更新瘫痪、AppImage 缺失、intel dmg 时有时无
metadata:
  type: project
---

**根因（2026-08-10 端到端核实，读产品代码得出，不是从下载数推的）：**

1. `package.json` 的 `build.publish` **配置是对的** —— `{provider: github, owner: haoxiang-xu, repo: PuPu, releaseType: release}`。
2. `build.mac.target = ["dmg", "zip"]`、`build.linux.target = ["AppImage", "deb"]` —— **zip 和 AppImage 本来就会被构建出来**。
3. `electron-updater ^6.6.2` 已装；`electron/main/index.js` require 它，`services/update/service.js` 设 `autoUpdater.autoDownload = true` 并调 `checkForUpdates()`。没有 `setFeedURL`，即走 build 时烧进去的 `app-update.yml`（指向上面那个正确的 GitHub 源）。
4. **但 `package.json` scripts 里 "publish" 出现 0 次** —— 每条都是裸 `electron-builder --mac --arm64` 之类，产物只落在本地 `dist/`。
5. `.github/workflows/` 里**没有任何 release/build workflow**（只有 enforce-merge-source / release-qa / update-readme-download-links / validate-mcp-registry）。

→ **产物是人手挑着传上 GitHub Release 的。** 手传只会挑安装包，于是：

- **`latest-mac.yml` / `latest.yml` / `*-mac.zip` 从来没被上传** → 客户端每次开机探更都 404 → **自动更新对所有平台、所有版本全瘫**。逐版核实：带更新清单的只有 **v0.1.2**（mac+win）和 **v0.1.4**（仅 mac）；v0.1.3 和 v0.1.5–v0.1.9 全缺。
- 关键补正：**探更看的是「当前 latest release」有没有清单**。v0.1.9 没有 → 连当年装了 v0.1.4（自带可用 updater）的人也一样更不了。**搁浅面 = v0.1.0 起的全部安装，累计下载 412**，不止 CEO 记忆里的 v0.1.5+ 的 ~260。
- **AppImage 自 v0.1.1-republished（2026-03-16）起再没上传过** —— 而 linux 是 PuPu 下载量第一的平台（发版首周约 60%），`.deb` 只覆盖 Debian/Ubuntu。这是白丢的量。
- **intel dmg 时有时无**（v0.1.8 有、v0.1.9 没有）—— 取决于那次谁在哪台机器上构建。

**讽刺的一笔：** 外部贡献者 zzmjeremy 的 PR #138「Issue116: in app update for windows」2026-05-08 已合并。**代码侧的自动更新是有人做过的，坏的一直是发布动作。**

**同类脆弱点：** README 的下载按钮把版本号写死在 `releases/latest/download/PuPu-0.1.9-arm64.dmg` 这种 URL 里，靠 `update-readme-download-links.yml` 每次发版改写。目前是对的，但它一旦失败，**所有平台的下载按钮同时 404** —— 和上面同一个病：发布产物靠约定而不是靠工具保证。

**Why 这条重要：** CEO 最看重"有没有人真在装"。这是唯一一个**已确诊、修起来很小、却在持续复利损失**的增长漏洞 —— 每发一版就多一批永远留在旧版的用户。且它是纯工程修复，不需要曝光/运营配合。

**How to apply:** 每轮巡船先看最新 release 的资产清单，缺 `latest*.yml` 就说明自动更新仍然瘫。判定修好的标志：某版资产里同时出现 `latest-mac.yml` + `latest.yml` + `*-mac.zip` + `.AppImage`。别只看下载数曲线去猜自动更新活没活 —— 资产清单是直接证据。相关：[[install-signal-2026-06]]、[[exposure-ceiling-channels]]。

**2026-08-14 复查：P0 未被执行，五项判据全不满足，全部根因仍在。** v0.1.9 至今只有 3 个资产
（`PuPu-0.1.9-arm64.dmg` / `PuPu.Setup.0.1.9.exe` / `PuPu_0.1.9.deb`），没有 `latest-mac.yml`、
没有 `latest.yml`、没有 `*-mac.zip`、没有 `.AppImage`、没有 intel dmg。根因侧同样零变化：
`package.json` scripts 里 `publish` 仍出现 **0 次**，`.github/workflows/` 仍是那四个
（enforce-merge-source / release-qa / update-readme-download-links / validate-mcp-registry），
**仍无任何 release/build workflow**。全库 15 个 release 里带更新清单的依旧只有 v0.1.2 与 v0.1.4。

→ **自动更新已连续瘫痪 5 个版本（v0.1.5 起）**，搁浅面随每次发版继续复利。这条 P0 不能摘，
且它是本库里唯一「已确诊 + 纯工程 + 不需要曝光配合」的漏洞。
