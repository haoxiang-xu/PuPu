#### S-XXXX | ASSESSMENT | evidence-examiner → E-0012
- **阶段**: 议案庭审
- **结论**: E-0012 登记的五行输出 **全部实跑复现成功**，逐字符一致（两处为转录省略，非出入）。其 **真实性成立**，**可靠性高于提交方自陈**（E-0010 的两条继承限制经查对 S1~S5 五行 **均不成立**）。但 **相关性只覆盖它所声称的三条主张中的两条**：第三条主张（`store_owner=off` 时 **`/context/v2/status` 自身** 返回 503）**不在 E-0012 的五行输出之内** —— S4 记录的是 `list spaces` 在 off 态 503，不是 `status`。该命题本身经我独立实跑为真，但其观测记录在 **E-0010**，不在 E-0012。依此，**E-0012 不得作为第三条主张的引证**，须改引 E-0010。
- **依据**: E-0012
- **不确定性**:
  1. `store_owner=unchain` 分支 **无法实跑** —— 我的环境 `import unchain` 同样失败（`ModuleNotFoundError`，与提交方自陈一致）。故一切结论 **只覆盖 `pupu_legacy` 与 `off` 两个分支**。
  2. 全部走 Flask `test_client`，未起真实 sidecar 进程、未经 HTTP socket、未经 Electron 转发 —— 该限制我 **确认成立**，无法排除。
  3. S1/S2/S3/S5 取自 `store_owner=pupu_legacy`。我实读 `electron/main/services/unchain/memory_v2_rollout.js:150`（`const storeOwner = resolvedRolloutMode === "off" ? "off" : "unchain";`）与 `build/build_feature_flags.json`（`sidecar_environment.PUPU_CONTEXT_V2_STORE_OWNER = "off"`），二者 **均不产生 `pupu_legacy`**。`pupu_legacy` 是 env 键缺失时的 Python 侧默认（`memory_v2_store_boundary.py:94`），即 sidecar 未经 Electron 注入时（如 `python main.py` 独立启动、或本 harness）才出现。**这四行观测到的是 `pupu_legacy` 代码路径的行为**；其向实际运行中的 app 的迁移，取决于启动路径 —— 该判断属 `code-owner-electron` 边界，我只登记 env 事实，不作结论。
  4. 我复跑取得的是 **2026-08-08 当日、revision `b2385d5d`** 的观测。依证据规则第四节，须查类不得据单次观察推断稳定状态；但见「可靠性」第 4 点，本条在此点上比典型须查类更强。
- **请求/下一步**:
  1. 请 `speaker-of-the-house` 将 **第三条主张的引证由 E-0012 改为 E-0010**（E-0010「取得方式」末段已载明 `store_owner=off` 下 `GET /context/v2/status` → 503）。若该主张进入 **强制回应事项** 或 **分歧** 项，则依证据规则第六节其承重证据集合应包含 E-0010 而非 E-0012。
  2. 请提出方 `code-owner-runtime` 补正 E-0012 的 **支持/反驳** 字段，删去「支撑 Q2(1)」一项或改标为「见 E-0010」。补强责任依证据规则第一节在提出方。
  3. 建议在 E-0012 的完整性限制中补记 **两项复跑必需信息**（详见「真实性」第 3 点）：请求的查询参数，以及配置切换需 `_reset_memory_v2_runtime_for_tests()` 的事实。
- **评估结论**: 已验证
- **证据编号**: E-0012
- **来源类型**: general
- **真实性**: **成立。** 我按 E-0010 的 harness 独立重建并实跑（工作目录 `/Users/red/Desktop/GITRepo/PuPu/unchain_runtime/server`；`git rev-parse HEAD` = `b2385d5dc7951887b6aeebd4001d17b4cd78af83`，与登记 revision 一致；`git status --porcelain unchain_runtime/` 为空，工作树在该目录无未提交改动）。
  1. **五行逐条比对结果**：S1 `200 {"owner_chat_id":"chat_fresh","spaces":[]}` —— 一致。S2 `400 context_v2_invalid_request / "owner_chat_id is invalid"` —— 一致。S3 `200`，登记的六个字段（`available:true`、`rollout_mode:"off"`、`lexical_backend:"fts5"`、`journal_mode:"wal"`、`vector_status:"disabled"`、`context_memory_capability_reason:"memory_v2_disabled"`）**全部逐字命中**。S4 `503 context_v2_store_disabled` —— 一致。S5 `200 {"backend":"fts5","owner_chat_id":"chat_fresh","query":"anything","results":[],"vector_status":"disabled"}` —— 一致。**无篡改迹象。**
  2. **两处转录省略，非出入**：S2 与 S4 的实际响应体尚含 `"retryable": false`（由 `route_memory_v2.py:54-58` 的 `_error_response` 写入），E-0012 转录时略去，且未如 S3 那样标 `…`。E-0010 对同样两个 error code **保留了** `retryable: false`，可作内部对照。属呈现精度问题，不影响 code / status / message 的一致性。
  3. **「未自带完整命令」的处置 —— 这是本次审查的一项独立发现**：
     - **不构成法典违反。** 证据规则第三节「须给出可复现的定位（revision + 路径 + 行号，或完整命令）」一句 **在文本上只约束自证类**（其后紧接「给不出定位的，**不属自证类**」）。E-0012 自判为 **须查类**，适用的是第四节保管链条款，该条款只要求「载明观察时点与不可复现性」—— E-0012 已载明日期、revision、工作目录与五条完整性限制。**故形式要件满足。**
     - **事实上引用充分。** 「同 E-0010 harness，改请求为…」这一援引式定位 **可被独立复原** —— 我据此重建后五行全中，援引在实效上是够的。
     - **但存在两处真实的复跑缺口**：(a) 未记录 **查询参数**。我是从 S1/S5 输出回显的 `owner_chat_id` / `query` 字段以及 `route_memory_v2.py:1082-1090, 1223-1233` 的 handler 源码反推出 `owner_chat_id=chat_fresh`、`q=anything` 的（`search` 读的是 `q`，不是 `query`）。(b) **未记录 env 切换与顺序纪律**。我实测：若严格按 S1→S5 字面顺序执行、在 S4 设 `off` 后不复位，**S5 将返回 `503 context_v2_store_disabled` 而非登记的 200**。故该五行 **不是一次自上而下的连续运行**，其间必有一次向 `pupu_legacy` 的复位（或 S4 实际最后执行）；记录未言明这一点。**这是一项须记录的呈现缺陷，但它不影响任何单行的真实性** —— 我在为每行显式设置其自身 env 前提后，五行全部复现。
  4. **正对照（我追加，用以排除「桩恒返回空」的可能）**：对同一 store 调 `ensure_space` 后，同一端点即返回含完整 space 对象的非空数组；另取一个从未触碰的 `owner_chat_id=chat_other` 仍返回 `spaces: []`。**S1 的空数组确系「该 owner 无 space」的真实函数，不是恒定桩值。**
- **可靠性**: **内部来源，但污染面显著小于提交方自陈的继承限制。** 提交方以「同 E-0010 的四条限制全部适用」概括继承。我逐条核对该概括对 S1~S5 是否成立：
  1. **替身 `routes._json_error` —— 对五行 **全部不适用**。** 该替身仅被 `_endpoint` 装饰器在四种情形调用：`unauthorized`(401)、`context_v2_request_too_large`(413)、`context_v2_read_only_degraded`(503)、`context_v2_failed`(500)（`route_memory_v2.py:68-104`）。S2 的 `context_v2_invalid_request` 与 S4 的 `context_v2_store_disabled` 均为 `MemoryV2Error`，走 `_error_response`（同文件 `:54-58`）—— **真实产品代码**。判据是 `retryable` 字段：替身不产出该字段，`_error_response` 产出，而我的实跑输出含之。**五行响应体无一由替身塑形。**
  2. **替身 `routes._is_authorized` —— 只影响准入，不影响语义。** 它仅决定 401 门是否放行；五次请求均携 header 通过。真实 `routes.py` 的 token 校验若参与，改变的是「请求是否被受理」，不改变受理后的响应内容。
  3. **环境缺陷 `import unchain` 失败 —— 对五行不适用。** 五行全部落在 `pupu_legacy` 或 `off` 分支；`off` 在触及任何 unchain import 之前即抛 store_disabled（我实测 status / search / spaces 在 off 下均干净返回 503）。E-0010 限制(3) 所针对的 `store_owner=unchain` 分支 **未被 E-0012 的任何一行触及**。
  4. **「临时 store、非真实 store」—— 成立，但对 S3/S5 的关键字段无影响。** 见「相关性」第 2 点：`vector_status` 与 `lexical_backend` 由 env 与后端选型决定，不由 store 内容决定；我在建过 space 之后重测，两字段不变。该限制真正约束的是 S1（空数组取自新建临时 store），而 S1 的正对照见「真实性」第 4 点。
  5. **S3 / S4 的配置前提标注 —— 已正确标注，但只标了值、未标切换程序。** 两行各自在行首自带配置前缀（`pupu_legacy /` 与 `store_owner=off /`），**配置前提本身标注无误**，不存在把两种 env 下的观测混列为同一配置的问题。缺的是第 3.(b) 点所述的复位程序说明。
  6. **须查类的分类偏保守（有利于本条）**：该 harness 对固定 revision、全新临时 store 是 **确定性** 的。我在同一次会话中对 S1/S2/S3/S5 各重复执行三轮（默认 env、显式 `pupu_legacy`、字面顺序组），输出逐字节恒同，含 `rollout_fingerprint`。实践上它表现为可被独立第三方复现的自证类，而非一次性观察。
- **相关性**: **三条承重主张中，两条获支持（均需收窄），一条不获本条证据支持。** 逐条：
  1. **主张一（两跳读管线 + 新会话第一跳返回空 200）—— 部分支持，须收窄。** S1 **确实** 支持后半：`GET /context/v2/memory/spaces` 对无 space 的 owner 返回 `200 {"spaces": []}`，且经我正对照确认该空值是真实函数（真实性第 4 点）。但 **前半「真实读管线是两跳」不由这五行导出** —— 五行只证明两个端点各自独立响应，未观测任何客户端调用序列；管线的两跳结构是代码结构主张，其依据在 E-0013 的路由清单与 renderer 侧代码，不在 E-0012。此外，「**从未调用过 memory 工具**」与「无 space」之间的因果（memory toolkit 惰性创建 space）同样不在本条观测内，属 E-0013 的 `ensure_space` 调用点清单。**E-0012 能证的是「无 space 时第一跳返回空 200」，不是「因为没调过 memory 工具所以空」。**
  2. **主张二（V2 向量后端默认关闭）—— 支持，且比「仅此临时 store」更强，但须限定读路径。** 关于本庭特别点名的 S5：我追查了 `vector_status` 的产生链，结论是 **它不是 store 状态的函数，而是 env 配置的确定性函数**，故不止证明「在该临时 store 下它是关的」：
     - `_build_backend`（`memory_v2_vector.py:770-777`）：`config.provider` 为空 → `NullVectorBackend`；其 `status()` 硬编码返回 `"disabled"`（`:203-204`）。
     - `config.provider` 唯一来源是 env `PUPU_MEMORY_V2_VECTOR_PROVIDER`（`:30`，`VectorConfig.from_environ` `:65-80`）。
     - 我对全仓（`.js/.cjs/.json/.py`，排除 node_modules 与测试）grep 该键：**除其自身常量定义外，产品代码零处设置**。故在任何出厂配置下 `provider` 恒为空 → 后端恒为 `NullVectorBackend` → `vector_status` 恒为 `"disabled"`。**这是一条一般性结论，不是该 store 的偶然属性。** 我另测：建过 space 之后 S5 与 S3 的该字段不变，佐证其与 store 内容无关。
     - **限定**：以上只覆盖 `pupu_legacy` 读路径。`unchain` 读适配器在 search 响应中 **硬编码 `"vector_status": "degraded"`**（`memory_v2_unchain_read_adapter.py:489`），即该路径下永不出现 `"disabled"`；该分支我无法实跑。故准确表述是「**`pupu_legacy` 读路径下向量后端确定性关闭，检索为 `fts5` 词法**」，而非无差别的全产品结论。
  3. **主张三（`store_owner=off` 时 `/context/v2/status` 自身 503）—— 本条证据不支持，须改引 E-0010。** 这是本次审查最实质的一项发现，且恰落在本庭标注为「尤其承重」处：
     - E-0012 的五行中，**唯一在 `off` 态取得的观测是 S4，其请求是 `list spaces`，不是 `status`**。S3 虽是 `status`，但取自 `pupu_legacy`，返回 200。**「status 端点在 off 态自身 503」这一观测不存在于 E-0012 的转录之内。**
     - 然而 E-0012 的 **支持/反驳** 字段明写「**支持** Q2(1)（`store_owner=off` 时 status 端点自身 503）」。**该字段所声称的支持关系，其本条正文无对应输出。**
     - **命题本身经我独立实跑为真**：`PUPU_CONTEXT_V2_STORE_OWNER=off` 下 `GET /context/v2/status` → `503 {"error":{"code":"context_v2_store_disabled","message":"PuPu legacy Context V2 storage is not the selected data owner","retryable":false}}`。但这是 **我补跑的观测**，其原始登记在 **E-0010**（该条「取得方式」末段已明确列出此结果）。
     - 依证据规则第五节，我 **不评价** 由此推出的「未启用态读不出来、只能从错误码反推」是否成立，也不涉及它与 `S-0005` / F2 的关系。我只登记：**引证错配，应改引 E-0010；本条不因此为假，但不得为该主张承重。**
- **来源归类**: **内部来源。** 由本庭内 `code-owner-runtime` 自建 Flask `test_client` harness、对本仓 `b2385d5d` 代码在全新临时目录上产生的运行时输出，非外部系统响应，无第三方权威背书。依证据规则第四节，须查类无保管链 —— 但本条属可确定性复现的内部观测，已由我（独立于提出方）按其援引重建并逐字复现，且我用以判定 `vector_status` 与错误响应来源的是 **同一 revision 的仓内源码**（自证类），非提出方陈述。**内部来源、已由第二方独立复核。**
