#### S-XXXX | ASSESSMENT | evidence-examiner → E-0024

- **阶段**: 议案庭审
- **结论**: E-0024 **真实**，且其手抄件经机械比对确认与产品源 **零偏差** —— 本条的特殊风险（手抄失真）已排除。但它 **被引用的范围宽于它实际证明的范围**：它证明的是「`requireContextV2OwnerChatId` 这个纯函数对六种缺参输入抛 `context_v2_invalid_request`，且对 `character_foo__dm__main` 返回该串」；它 **没有观察** G5 中「请求不发出」那一半，也 **不足以** 支撑「main 层没有任何机制能挡住冒充」这一层级范围的否定命题。另发现其完整性限制 (1) 所述 **理由与事实不符**。
- **依据**: E-0024
- **不确定性**: 见下「相关性」第 3 点 —— 我为回答可靠性之问所做的补充 grep 恰好佐证了那条宽命题，但该佐证 **是我的调查，不是 E-0024 的内容**，不应被记为本条证据的证明力。
- **请求/下一步**: 提请 `speaker-of-the-house` 注意：E-0024 可采，但引用它时须按下列窄命题计算证明力。若 S-0010 需要「请求不发出」被 **实际观察**，仓内已存在一条严格更忠实且成本极低的路径（见「可靠性」第 3 点），由提出方补强即可，无需新建装置。
- **评估结论**: 已验证
- **证据编号**: E-0024
- **来源类型**: general

- **真实性**: **通过。** 我在 `b2385d5d`（= 当前 HEAD，`git diff b2385d5d -- electron/main/services/unchain/service.js` 为空，工作树对该文件干净）逐字复跑了登记的 `node -e`，**九行输出与登记内容逐条一致**，无一行差异。
  一处 **非实质瑕疵须记录**：登记块标题为「**实际输出**」，但其中的列对齐空格是提交方后加的排版，命令本身不产生（实跑为 `undefined -> THROW ...`，登记为 `undefined                   -> THROW ...`）。内容零差异，属美化而非篡改，不影响可采性；但「实际输出」应为逐字粘贴。

- **可靠性**: **手抄保真度：通过，且经机械独立确认。**
  1. **正则逐字比对**：产品源 `service.js:120` 的字面量与探针 `OWNER` 经 shasum 比对 **byte-exact 相同**（`c987b427…`）。
  2. **两个函数的等价性**：`read` 与 `:195-196` 的 `readContextV2String` 语义相同；`req` 抛出的错误对象与产品 `contextV2InvalidRequest("ownerChatId")`（经 `:186-193` 的 `createContextV2Error`）在 `.message` / `.code` / `.name` 三项上 **全等**（实测）。正则无 `g` 标志，`.test()` 无跨调用状态，不存在手抄引入的隐性差异。
  3. **不依赖手抄的独立复核**：我用 `fs.readFileSync` 把产品源 **第 118–204 行原始字节** 机械抽出并 `new Function` 求值（无任何人工转录），对同一组九个输入复跑，**输出与探针逐行相同**。手抄未引入任何偏差。
  4. **关于「手抄替代 import 是否降级」**：**结论上不降级**（等价性已由上述 1–3 排除），但 **该证据弱于本可达到的强度**，且其完整性限制 (1) 的 **理由陈述不准确**：
     - 原文称「`service.js` 是一个需要 `electron` 的工厂，无法在 node 裸环境实例化」。实测 **该模块在裸 node 下 `require` 完全成功**，导出 `createNodeStreamFetch` 与 `createUnchainService`。
     - 真实障碍是另外两条：(a) `CONTEXT_V2_OWNER_ID_PATTERN` 与 `requireContextV2OwnerChatId` **是模块私有、未出现在 `:5922` 的 `module.exports` 中**，无法直接 import；(b) 裸调 `createUnchainService()` 失败于 `Cannot destructure property 'app' of 'undefined'`。**结论（拿不到该函数）成立，理由（模块 import 不了）不成立。**
     - **仓内已存在更忠实的路径**：`/Users/red/Desktop/GITRepo/PuPu/electron/tests/main/context_v2_service.test.cjs:3` 直接 `require` 真实 `createUnchainService`，在 mock 装置下跑 **真模块**，且其断言形态同时覆盖了探针够不到的那一半 —— 该文件在 `:287` 与 `:1430` 有 `expect(fetchImpl).not.toHaveBeenCalled()`，在 `:469` 有 `expect(fetchImpl.mock.calls.length).toBe(callsAfterStart)`。即「抛出」与「请求不发出」在该路径下 **均为直接观察**。
- **来源归类**: **内部来源** —— 被测代码与复核脚本均在 PuPu 仓内，脚本由提出方 `code-owner-electron` 自撰。非外部来源，不适用权威性判断；其可信度完全来自可复跑性，而可复跑性已由我独立验证。

- **相关性**: **部分支持，须按窄命题计算。**
  1. **对 G5 —— 支持前半，未观察后半。** 六种缺参输入（`undefined` / `null` / `""` / `"   "` / `123` / `{}`）全部抛出且 `code=context_v2_invalid_request`，**这一半由本条实测直接支持**。但：
     - **「请求不发出」本条未观察。** 探针是一个孤立纯函数，全程 **未触及** `contextV2Request`、未触及任何 fetch。该半命题只能由 **call site 的静态阅读** 支撑（我核对了全部 17 处调用，`requireContextV2OwnerChatId` 均为方法体首条语句、位于 `contextV2Request` 之前，如 `:2089-2091`、`:2108-2112`），而静态阅读属 E-0025/E-0026 的证据形态，不是 E-0024 的产出。
     - **「同步抛出」在 API 边界上表述不精确。** 全部 17 处调用均位于 `async` 方法内（`deleteContextV2Chat` `:2089`、`getContextV2Tree` `:2108`、`listContextV2Entries` `:2118` 等），因此 **外部调用方观察到的是 rejected promise，而非同步 throw** —— 本仓自有测试正是以 `.rejects.toThrow(/context_v2_invalid_request/)` 断言的。函数 **内部** 确为同步抛出（本条属实），但这与「服务方法同步抛出」不是同一命题。
  2. **对 F3 / 关键事实 —— 完全支持。** `"character_foo__dm__main"` 通过校验并原样返回，`"character_foo__dm__main "` 经 trim 后同样通过。这正是 `code-owner-settings` F3 所需的那条事实，**本条独立、充分地支撑它**。
  3. **对「main 层没有任何机制能挡住冒充」—— 不足以支撑。** 这是一条对 **整个 main 层** 的否定存在命题；单函数探针在逻辑上无法证明一个层内不存在其它机制，最多证明「**这一个** 校验器不拦它」。本条支持的是后者。
     （补充调查，**记为我的调查而非本条证明力**：我对 `register_handlers.js` 与 `service.js` grep `ownerChatId` 及 owner 相关的 verify/authoriz/belongs/match/impersonat 模式，**未发现任何额外的归属交叉校验**。这与那条宽命题一致，但若该命题要承重，应由其提出方以独立证据登记。）
