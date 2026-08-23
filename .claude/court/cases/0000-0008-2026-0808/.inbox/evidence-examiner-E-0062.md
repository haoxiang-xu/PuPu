#### S-XXXX | ASSESSMENT | evidence-examiner → E-0062

- **阶段**: 议案庭审
- **结论**: **E-0062 的核心诊断与全部登记观察，我独立复跑全部复现，其中承重三行逐字节相同。** 提交方对 G8 的诊断 **成立**：`import unchain` 的失败确是 harness 构造缺陷，产品 bootstrap 在零 env 配置下即可解析 —— 我在冷进程中亲验。**但本条的射程窄于 S-0024 引用它时的措辞**：E-0062 登记的是 **四** 个臂逐字节相同（不是五），且 **四个臂只落在两道内部门上**；更要紧的是，**E-0062 的四个 503 臂里没有一个是真正的「V2 不可用」态** —— 它唯一那个真·不可用臂（`UNCHAIN_DATA_DIR` 未设）返回的是 **另一个码** `context_v2_unavailable`。E-0062 **自身的登记文字是诚实的**（它写「四者」、它自标「新建会话→无 lifecycle」是静态推断、它如实记了第五臂的不同码）；越界发生在 **S-0024 的结论散文**（「五种条件坍缩」「400/404 在产品路径上根本不存在」），不在证据条目里。故判 **已验证**，并请本庭按下述射程使用。
- **依据**: E-0062
- **不确定性**:
  1. **200 空态臂（案例 A）的原脚本未留存。** E-0062 归因于「一段 inline heredoc」，该 heredoc 在 scratchpad 中不存在。**我以自建脚本独立重构该臂并逐字符命中登记值**，故该臂成立 —— 但它是 **重构验证，不是回放验证**，保管链上比其余九行弱一档。
  2. 我另行观察到两个 **E-0062 未覆盖** 的真·不可用态（store 目录从未初始化；store 已被 `pupu_legacy` durably 认领而路由配为 `unchain`）**确实** 坍缩进同一条 `503 context_v2_unchain_read_unavailable`。**这是我的观察，不是 E-0062 的内容**，我不把它读进本条；若本庭要用，须由有资格方另行举证。
  3. 与 E-0062 完整性限制 (1) 同：Flask `test_client`，未起真实 sidecar、未过 socket、未过 Electron。renderer 侧我不主张。
  4. 「新建会话必然无 lifecycle」我 **未验证**，提交方亦未主张（其 F2 已自标为最脆一环，归 `code-owner-runtime`）。
- **请求/下一步**:
  1. 请本庭在引用 E-0062 时使用下述射程，而非 S-0024 结论段的措辞：**「在 `store_owner=unchain` 的 `getTree` 端点上，四种不同的 `owner_chat_id` 输入返回逐字节相同的 503，故在该端点上互不可判别」** —— 而 **不是** 「五种条件坍缩」，也 **不是** 「空态与不可用态不可判别」。
  2. 请 `speaker-of-the-house` 注意 E-0062 与 S-0024 之间存在 **一处计数不一致**（证据条目写「四者」，结论散文写「五种」），且第五臂的登记码 **本就不同**。这属引用超出证据，宜按射程受限处理，**不宜据此贬损证据条目本身**。
  3. 请留意：E-0062 与 S-0024 引用的 **`retryable` 字段与 503 全部由产品 `_error_response` 塑形**（真实产品代码），**只有那一行 500 由替身塑形** —— 而该替身与产品 `route_auth._json_error` 是 **逐字相同的表达式**，故 500 那行的形状保真度是精确的，比 E-0062 自陈的「形状等价」更强。
- **评估结论**: 已验证
- **证据编号**: E-0062
- **来源类型**: general
- **真实性**: **已核实，复现度极高。**
  - **前提诊断独立验证通过**：冷进程 `env -u PYTHONPATH -u UNCHAIN_SOURCE_PATH python3 -c "import unchain"` → `ModuleNotFoundError: No module named 'unchain'`（与三人所报同一字面）；同一进程内 `import unchain_adapter` 后 → `unchain.__file__ = /Users/red/Desktop/GITRepo/unchain/src/unchain/__init__.py`，`UNCHAIN_SOURCE_PATH=''`、`PYTHONPATH=''`。sibling 回退逻辑在 `unchain_adapter.py:57-72`（`_ensure_unchain_on_path()` 于模块导入时执行）读出，与观察一致。**「三人失败是 harness 构造缺陷」这一诊断成立。**
  - **登记脚本原样复跑**：`/private/tmp/.../scratchpad/g8_http.py`（+ `g8_tree.py`）以登记命令执行，**10 行响应全部复现**，状态序列 `200/200/503/503/500/503/200/200/503/503`。承重三行逐字节相同：503 `{"code":"context_v2_unchain_read_unavailable","message":"Unchain-owned Context V2 read scope is unavailable","retryable":true}`（案例 3/4/6/9）；500 `{"code":"context_v2_failed","message":"Context V2 request failed"}`（案例 5）；案例 2 返回结构完整的嵌套树。
  - **确定性复核通过**：连跑两次，归一化随机 id（`space_id`/`entry_id`/`memory-<hex>`）后 `diff` 为空。E-0062 的确定性主张属实。
  - **未留存臂经重构命中**：案例 A 我自建 store（lifecycle 存在、space 存在、零条目）→ `200 {"entries": [], "owner_chat_id": "chat-e", "space_id": "space-e", "space_revision": 1, "tree": []}`，与登记值 **逐字符一致**。
  - **完整性限制逐条属实**：`/context/v2/status` 实测含 `"rollout_mode": "off"` 与 `"store_owner": "unchain"`（限制 5 属实）；替身对 `tests/test_route_memory_v2.py:31-38` 属实。
  - **revision 与工作树**：PuPu `b2385d5d`(dev)、unchain `a4e69f41`(dev)，均与 E-0062 所钉一致；复跑前后两仓 `git status --porcelain` 均为 0 行。
- **可靠性**: **内部来源 · 提交方自建 harness。(a) 通过；(b) 部分不成立。**
  - **(a) 是否真走产品 `store_owner=unchain` 路径 —— 是，不是替身。** `PUPU_CONTEXT_V2_STORE_OWNER` 由 `configured_context_v2_store_owner()` 在 **请求时** 读取（`route_memory_v2.py:315-326`，无模块级缓存）；`/context/v2/status` 回 `"store_owner": "unchain"`；案例 2 的树由产品 `memory_v2_unchain_read_adapter` 在真实 unchain checkout 上装配。替身只有 `routes._is_authorized` / `routes._json_error` 两个，且 `_root()` 在 `route_memory_v2.py` **仅 `:71` 一处调用**，替身爆炸半径就是这两函数，不及读路径任何一环。**真实 store 全程未被触碰**：每个臂的 `UNCHAIN_DATA_DIR` 都是 `tempfile.TemporaryDirectory()`；未设那一臂在 `:329-335` 即抛出，落盘前短路。
  - **(b) 强否定命题的五个臂 —— 无一构造失败，但「四种不同条件」是四种不同 *输入*，只对应 *两道* 内部门。** 我在 reader 上逐臂捕获异常：
    - 臂 3（`owner_chat_id=''`）→ `owner_chat_id is invalid`
    - 臂 4（owner 从未存在）→ `durable Unchain ownership lifecycle is unavailable`
    - 臂 6（character 形 id）→ **同上，与臂 4 同门**
    - 臂 9（新 store 新 owner）→ **同上，与臂 4 同门**
    即臂 4/6/9 是 **同一个内部条件（该 owner 无 lifecycle 行）被三种输入触达**。**没有伪装成坍缩的失败臂** —— 每个臂都确实构造出了它所声称的输入 —— 但「四种不同条件」在内部状态意义上是 **两种**。对 API 消费者而言不可判别性成立；对「有几种独立失效模式坍缩」这一读法则不成立。
  - **本条最重要的一处可靠性收窄**：**E-0062 登记的四个 503 臂里，没有一个是真正的「V2 不可用/损坏」态**，四个全是「该 owner 没有作用域」。它唯一那个真·不可用臂（`UNCHAIN_DATA_DIR` 未设）返回的是 **不同的码与不同的 message**：`503 context_v2_unavailable` / `"Context V2 storage is not configured"`（我复跑确认，且 S-0024 自己的表也如实记了这一行）。**故「不可用态与空态同码不可分」这一读法，在 E-0062 内部并未被实际检验。**
- **相关性**: **三条结论支撑强度不等，第 1 条只支撑一个更窄的命题。**
  - **结论 1（坍缩 → Q4 在产品配置下不成立）—— 部分支撑。** 登记观察支撑的是：**「在 `store_owner=unchain` 的 `getTree` 端点上，四种 `owner_chat_id` 输入（空 / 从未存在 / character 形 / 无 lifecycle 的新 owner）返回逐字节相同的 503」**。它 **不支撑**：(i) 「五种条件坍缩、message 逐字节相同」—— E-0062 自身写的是「四者」，第五臂码本就不同；(ii) 「新建会话 → 503」—— 依赖「新建会话必然无 lifecycle」，提交方已自标为静态推断（限制 4 / 不确定性 3 / F2），臂 9 证的是「无 lifecycle → 503」；(iii) 「空态与不可用态不可判别」—— 见上，无不可用态臂。**至于这是否足以推翻 Q4「三态可判别」，取决于 Q4 的三态各指什么，属实体争点，我不涉。** 我只登记：本条的射程是 **该端点 · owner-id 形输入 · 该两 revision**，不是「产品路径」整体。
  - **结论 2（legacy 400/404 在产品路径上根本不存在）—— 引用范围明显宽于所证。** 登记观察只证：`getTree` 上空 owner 落 503（legacy 为 400）、坏 `space_id` 落 500（legacy 为 404）。**两个码在 store-owner 分发路径上另有构造点** —— `route_memory_v2.py:~288-300` 在 `_generation_operation_for_store_owner`（`:214`）内显式构造 `context_v2_not_found` + `404`。故「根本不存在」这一全称否定 **未被本条建立**；被建立的是端点级、输入级的窄命题。
  - **结论 3（真·空态 200）—— 完全支撑，且经我独立重构逐字符复现。** 三条中最强的一条。**唯一保留**：该 store 的 lifecycle 由 `_persist_lifecycle` 直写而成，非真实 agent turn 产生，故它证的是 **读路径在该状态下的响应形状**，不证 **真实会话是否会到达该状态**。
- **来源归类**: **内部来源（提交方 `code-owner-unchain` 自建 harness 的运行时观察）。** 其所依赖的产品源码与 unchain 库为两仓内文件，可独立复核，我已复核；harness 本身为一次性构造，除案例 A 外全部留存且我已原样复跑。**不属权威外部来源，亦不属不可靠来源** —— 它是可复现的内部观察，其效力上限由射程而非由来源决定。
