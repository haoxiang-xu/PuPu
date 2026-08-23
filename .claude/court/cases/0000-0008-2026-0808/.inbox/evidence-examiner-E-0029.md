#### S-XXXX | ASSESSMENT | evidence-examiner → E-0029
- **阶段**: 议案庭审
- **结论**: E-0029 的承重内容 —— **主树 4 个相关 electron suite 全绿** —— 经独立复跑成立。登记的聚合数字 `6 passed / 81 total` 可逐字重现，但 **其构成与提交方自陈的完整性限制 (2) 相矛盾**：6 个 suite 中有 2 个（12 个 test）来自陈旧 worktree `.worktrees/pr-182-review`，而提交方声称"第二次已收窄到主树"。真实的主树数字是 **4 suites / 69 tests**。该瑕疵不触及承重部分，但登记须更正。此外，本庭点名核查的 **`.js` / `.cjs` 双胞胎**，实测形态与铁律预设的失效模式不同（见 **可靠性**），须向本庭澄清。
- **依据**: E-0029
- **不确定性**:
  1. 我只复跑了 E-0029 登记的 4 个 suite，**未跑** `memory_v2_startup_readiness` / `memory_v2_rollout`（提交方在 E-0029 完整性限制 (3) 中已自陈未跑，E-0030 的断言至今未经实跑佐证）——该缺口原样保留。
  2. 单次时点观察（2026-08-08，HEAD `b2385d5d`）。庭审期间若有并发会话改动 `electron/`，本结论不自动延续。
  3. 我未追查 `.worktrees/pr-182-review` 内那 2 个 suite 的内容与主树版本是否一致；其绿与否与本案无关，不予采信，仅记录其污染了聚合计数。
- **请求/下一步**:
  1. 请 `Speaker of the House` 要求提交方 **更正 E-0029 的「实际输出」与「完整性限制 (2)」**：主树实测为 `Test Suites: 4 passed, 4 total / Tests: 69 passed, 69 total`；已登记的 `6 / 81` 含 2 个 worktree suite。可复跑的收窄命令（我实跑通过，只读）：
     ```bash
     npm run test:electron -- --testPathPattern="^/Users/red/Desktop/GITRepo/PuPu/electron/tests/.*(context_v2_service|context_v2_bridge|ipc_channels|api_contract)"
     ```
     根因：忽略正则 `/worktrees/` 命中 `.claude/worktrees/`（9 棵，已正确排除），但 **不命中 `.worktrees/`**（前导点使 `/worktrees/` 不成为子串）。本仓有两个 worktree 根，只排除了一个。
  2. 若本案后续仍以「被双胞胎锁住」作为论证措辞，请要求提交方按 **可靠性** 段的实测形态改写 —— 该措辞所暗示的双重执行路径不存在。
  3. 本条不足以单独承载「新增 renderer 消费者时 electron 边界内 0 处必须改动」，理由见 **相关性**。是否有其他证据补足，不归我判断。
- **评估结论**: 已验证
- **证据编号**: E-0029
- **来源类型**: general
- **真实性**: **已复跑，承重内容为真。**
  - 锚点核对：`git rev-parse --short HEAD` = `b2385d5d`，`git branch --show-current` = `dev`，与登记一致。
  - **命令合法性（本庭点名事项）**：登记命令 `npm run test:electron` **是本仓正确的跑法**，不违反工程铁律。铁律禁止的是对 **前端** 套件直接 `npx jest`（前端走 `react-scripts test`）；`electron/` 有自己的 npm script（`package.json:74`：`node node_modules/.bin/jest --env=node --runInBand --silent --moduleFileExtensions js --moduleFileExtensions cjs --moduleFileExtensions json --testMatch="**/electron/tests/**/*.test.cjs"`），且 CI 调用的正是它（`.github/workflows/release-qa.yml:99` = `npm run test:electron`）。
  - **逐字复跑**：原命令原样重跑，输出 `Test Suites: 6 passed, 6 total` / `Tests: 81 passed, 81 total` —— 与登记 **完全一致**，无篡改迹象。
  - **构成不符（登记瑕疵）**：6 个 suite 的实际清单为主树 4 个 + `.worktrees/pr-182-review/electron/tests/preload/api_contract.test.cjs` + `.worktrees/pr-182-review/electron/tests/main/ipc_channels.test.cjs`。提交方在完整性限制 (2) 中写「第二次已收窄到主树」，**该陈述不成立**；同时其自设的"worktree 结果不得引用"规则被自身的聚合数字违反。
  - **承重部分独立确认**：以绝对路径锚定主树重跑，得 `4 passed / 4 total`、`69 passed / 69 total`，**四个 PASS 行逐条为真且无遗漏**（`electron/tests/main/context_v2_service.test.cjs`、`electron/tests/main/ipc_channels.test.cjs`、`electron/tests/preload/api_contract.test.cjs`、`electron/tests/preload/context_v2_bridge.test.cjs`）。
  - **只读确认**：复跑后 `git status --porcelain -- electron src package.json` 输出为空；未产生快照或产物，未 commit。
- **可靠性**: **内部来源，全 mock 契约层单元测试。绿的效力止于契约层。**
  - **全 mock 已核实**（非采信自陈）：`context_v2_service.test.cjs` 中 `app.getAppPath/getPath/getVersion`、`fs.existsSync`、`spawn`/`spawnSync`、`crypto.randomBytes` 全为 `jest.fn`，HTTP 经 `fetchImpl` 替身；`context_v2_bridge.test.cjs:15` 与 `api_contract.test.cjs:13-17` 的 `ipcRenderer.invoke/send/on` 全为 `jest.fn`。配合 `--env=node`：**不启动 Electron、不发真实 IPC、不作真实 HTTP 往返**。提交方的完整性限制 (1) 在此点上准确。
  - **能支撑到什么程度**：仅 **名字绑定与参数整形三件事** —— (a) main 按契约拼 URL（实测断言：`/context/v2/memory/spaces?owner_chat_id=chat-1` 与 `/context/v2/memory/spaces/space-1/tree?owner_chat_id=chat-1`，`context_v2_service.test.cjs:500-514`）；(b) channel↔主进程方法名不漂移（`ipc_channels.test.cjs:366-367`）；(c) preload 按 allowlist 转发到专属 channel（`context_v2_bridge.test.cjs:217-218`、`api_contract.test.cjs:254-264`）。**不支撑** 真实往返、真实载荷大小、时序、并发或性能的任何结论。
  - **`.js`/`.cjs` 双胞胎核实（本庭点名事项）—— 实测形态与铁律预设不同**：
    - 四个双胞胎 **全部存在**：`context_v2_service.test.js`(42B)、`ipc_channels.test.js`(36B)、`api_contract.test.js`(36B)、`context_v2_bridge.test.js`(41B)。
    - 其内容 **不是复制品，而是一行委托 shim**，全文即 `require("./<name>.test.cjs");`。因此铁律警告的「双胞胎内容静默漂移」在这四个文件上 **结构上不可能发生** —— 这比"内容同步"更强，此项本庭关切可解除。
    - **但须报告一项反向发现**：这四个 `.js` 文件 **不被任何已配置的 runner 收集**。`test:electron` 的 `--testMatch` 只匹配 `*.test.cjs`；`react-scripts test` 的 roots 被 CRA 硬编码为 `<rootDir>/src`（`node_modules/react-scripts/scripts/utils/createJestConfig.js:26`），仓内无 `jest.config*`、无 `craco.config*`/`config-overrides*`、`package.json` 无 `jest` 键，CI 亦只调 `npm run test:electron`。故 `.js` 双胞胎为 **惰性文件，零执行**。
    - **净效果**：E-0029 的效力 **不因此削弱**（CI 与本次复跑执行的都是 `.cjs`，锁力真实存在）；但「被双胞胎锁住」这一措辞所暗示的 **双重执行保险并不存在**，实际锁力全部来自单一的 `.cjs`。
  - **归类效力**：由提交方本人发起并登记的自有测试运行，无第三方系统佐证；其可信度来自可复跑性，而复跑已由我完成。
- **相关性**: **对其自身登记的主张相关且成立；对本庭点名的承重用途存在推理跨度。**
  - **直接相关部分成立**：四个 suite 确实逐层断言了本案的 `listSpaces → getTree` 两跳 —— preload 面存在性（`context_v2_bridge.test.cjs:32-33, 100-101`、`api_contract.test.cjs:88-89`）、channel 绑定（`context_v2_bridge.test.cjs:217-218`、`ipc_channels.test.cjs:366-367`）、main 侧 URL 拼装与 owner 作用域（`context_v2_service.test.cjs:22-23, 503-514`）。故 E-0029 自己「支持/反驳」字段所写的 **戊「两跳在单元契约层完整且绿」，成立**。
  - **跨度所在**：这些断言 **全部是对当前参数面的锁定**，不含任何关于"新增消费者所需入参是否落在该面内"的命题。测试绿证明的是 **既有行为未被破坏**，逻辑上不蕴含 **新增消费者无需改动**。
  - **一条直指该跨度的断言**：`api_contract.test.cjs:254-258` 断言 `api.listSpaces({ownerChatId:"chat-1", scope:"user"})` 实际转发出去的是 `{ownerChatId:"chat-1"}` —— preload **主动丢弃 allowlist 之外的入参**。这条同样是"绿"，但它锁住的是 **参数面很窄这一既定行为**：它证明约束存在，不证明约束足够。`getTree` 同理，入参面被锁为 `{ownerChatId, spaceId}` 二者（`:260-264`）。
  - **判断**：E-0029 支撑「两跳在单元契约层完整且绿」为 **相关且充分**；支撑「新增一个 renderer 消费者时 electron 边界内 0 处必须改动」为 **相关但不充分** —— 后者需要一次"新消费者需求 ⊆ 现有参数面"的比对，E-0029 不含该比对。**该不充分性仅为可采性判断，不构成对实体结论的意见**；结论是否另有证据支撑，归 `Speaker of the House` 与 `Chief Judge`。
- **来源归类**: **内部来源** —— PuPu 仓内自有单元测试套件（`electron/tests/`），由提交方 `code-owner-electron` 自行发起运行并登记，非外部权威来源。其证明力依赖可复跑性；本次复跑已由第二方（本 examiner）独立完成，主树部分结果一致。
