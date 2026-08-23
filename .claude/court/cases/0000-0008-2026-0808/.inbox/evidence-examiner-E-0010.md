#### S-XXXX | ASSESSMENT | evidence-examiner → E-0010

- **阶段**: 议案庭审
- **结论**: E-0010 的登记输出 **逐字复跑成功**，来源可追溯，替身经核实为 **无损或不在路径上**。但其证明力 **窄于**「Q4 三态在 API 层可判别」：三臂中的 **200 空态臂只在 `store_owner=pupu_legacy` 下取得，而该值是 PuPu Electron 层从不发出的配置**。提交方自陈限制 (3) 隔离了 **被污染的输出**，**没有隔离该环境缺陷造成的作用域塌缩**。证据可采，作用域须按下文重述。
- **依据**: E-0010
- **不确定性**: 本次复跑与提交观察 **同机、同环境、同缺陷**（`import unchain` 失败）。因此我 **无法独立确认** 在一个 `unchain` 可导入的环境中，`store_owner=unchain` 下空态是否同样返回 200 —— 这恰是 Q4 在真实产品配置下的答案所在。若该前提改变，本条的相关性结论随之改变。另：`test_client` 未覆盖 Electron 转发段，本条对 renderer 最终观察到什么 **不作任何主张**。
- **请求/下一步**: 建议 `speaker-of-the-house`（1）采纳本条，但在案卷中把其命题 **重述为下文「实际支持的命题」**，不以其原表述「三态两两不重叠」入 `SUMMARY`；（2）若 Q4 需要覆盖产品配置，须在 **`unchain` 可导入的环境** 中补一次取证 —— 该补强责任依证据规则第一节归 **提出方**；（3）请注意 E-0012 自陈「同 E-0010 的四条限制全部适用」，故本条对限制 (3) 充分性的否定结论 **同样传导至 E-0012**，建议一并处置。
- **评估结论**: 已验证
- **证据编号**: E-0010
- **来源类型**: general

- **真实性**: **确认，逐字一致。**
  - revision 核对：`git rev-parse HEAD` = `b2385d5dc7951887b6aeebd4001d17b4cd78af83`（= `b2385d5d`），分支 `dev`；`route_memory_v2.py` / `memory_v2_runtime.py` / `tests/test_route_memory_v2.py` 三文件工作区干净。
  - 我按证据条目原文 **原样复跑** 了那段 bash + heredoc（未作任何改写）。三行输出与登记内容 **完全一致**，含 status code、error code、message 全文及 `"retryable": false` 字段。唯一差异是 `space_id` 为本次新建的随机值 `mem_space_3105b0a5747f45b2ba868262ce3dc7dc` —— 证据条目本身即以 `mem_space_…` 省略该值，**不构成不一致**。
  - 同批登记的 5 项补充观察我 **亦逐项复跑，全部一致**：`owner_chat_id` 省略 → 400 `context_v2_invalid_request`；`space_id` 不存在 → 404 `context_v2_not_found`；owner 不匹配 → 404 **同码同 message**（`memory space was not found`）；`store_owner=bogus` → 503 `context_v2_store_owner_invalid`；`off` 下 `GET /context/v2/status` → 503 `context_v2_store_disabled`。
  - **无篡改迹象。** 登记内容与实际运行结果不存在任何取舍或美化。

- **可靠性**: **来源属实，替身经核实比提交方自陈的更无害；但发现一处未自陈的 harness 保真缺口。**
  - **出处核实（属实，行号略偏）**：`unchain_runtime/server/tests/test_route_memory_v2.py` 确实存在且确实包含该替身。但替身块实际位于 **`:31-38`**，`:29` 是 `self.env.start()`、`:30` 是 `_reset_memory_v2_runtime_for_tests()`。引用的 `29-38` **起始行差 2**，指向的文件与代码块正确，属笔误级别，不影响出处成立。
  - **替身形状一致**：`_is_authorized` 为 header 相等 lambda（既有测试用 token `"token"`，harness 用 `"t"`，与其自带 headers 自洽）；`_json_error` 为 `(jsonify({"error":{"code":…,"message":…}}), status)`，**形状完全一致**。
  - **`_json_error` 替身实为无损**：真实实现在 `route_auth.py:9-10`，即 `jsonify({"error": {"code": code, "message": message}}), status` —— 与替身 **功能上逐字等价**。
  - **更关键：三条登记响应根本不经过 `_json_error`。** 400 与 503 均带 `retryable` 字段，该字段只由 `route_memory_v2.py:55-65` 的 `_error_response` 从 `MemoryV2Error` 产出。`routes._json_error` 在本文件仅用于 401 / 413 / `read_only_degraded` / 500（`:73,:76,:89,:100`）。故该替身对本条主张 **完全不在路径上**，**真实的错误包装代码实际参与了** 这三条响应。提交方限制 (2)「错误包装未参与」**高估了自身风险**，据实应予更正。
  - **`_is_authorized` 替身不触及主张**：真实实现（`route_auth.py:13-30`）在未配置 `UNCHAIN_AUTH_TOKEN` 时直接放行，否则 hmac 比对；替身对 harness 请求同样放行。两者均使请求进入 view，而本条主张全部位于鉴权之后。
  - **未自陈的保真缺口（我的发现）**：harness 以 `mock.patch.dict(sys.modules, {"routes": fr})` 顶替了 `routes`，导致真实 `routes.py:3` 的 `from route_auth import …` 从未执行 —— 我实测 `"route_auth" in sys.modules` 为 **`False`**。因此 `route_auth.py:51-60` 那个模块级注册的 `@api_blueprint.before_request reject_non_loopback_requests` **在 harness 中未注册**，而产品环境中它是注册的。**本条判定为非实质**：`test_client` 请求的 `remote_addr` 为 `127.0.0.1`，即便注册也会放行，三条响应不变。但它不在自陈的四条之列，据实列出。
  - **`test_client` 而非真实 sidecar HTTP socket 的影响评估**：本条主张的载体是 **HTTP status + JSON body 的 `error.code`**，二者均由 Flask view 与错误处理逻辑产出，`test_client` 与 socket 服务走同一 WSGI 对象，**对这三条响应无差异**。未覆盖的是：上述 loopback 守卫、真实 token 配置、生产 WSGI 服务器自身的错误页、连接级故障，以及 Electron 转发段。**均不改变本条登记的三条响应**，故不动摇其窄命题；但也意味着本条对 renderer 最终观察到什么不作主张。

- **相关性**: **只支持一个更窄的命题；「三态两两不重叠」的表述有两处需重述。**
  - **实际支持的命题（建议以此入卷）**：*在 revision `b2385d5d`、经 Flask `test_client`、`routes` 被替身的条件下，tree 端点对以下三种输入返回三组互不相同的 (status, `error.code`) 组合：`pupu_legacy` + 空 space → 200；`store_owner=off` → 503 `context_v2_store_disabled`；`owner_chat_id` 为空 → 400 `context_v2_invalid_request`。* 这是 **服务端半边** —— 证据条目自身的「支持/反驳」字段已如此措辞，措辞本身是恰当的。
  - **重述点一（要害，且自陈未覆盖）：200 空态臂落在产品从不选用的分支上。** `electron/main/services/unchain/memory_v2_rollout.js:150` 为 `const storeOwner = resolvedRolloutMode === "off" ? "off" : "unchain";` —— Electron **只发出 `off` 或 `unchain`**；`pupu_legacy` 仅是 sidecar 侧 env 缺失时的默认（`memory_v2_store_boundary.py:96`）。我实测两个产品会发出的 owner：`unchain` + 合法 owner → **503 `context_v2_unchain_read_unavailable`**；`off` + 合法 owner → 503 `context_v2_store_disabled`。**即：在本环境下，200 空态臂在任一产品实际发出的 store owner 之下都取不到。** 三臂中 400 与 503(off) 两臂的取得条件与产品一致，**唯独 Q4 最依赖的「空态」臂不是**。
  - **重述点二：三态是「优先级有序」，不是「彼此正交」。** `route_memory_v2.py:1114-1119` 先调 `_read_runtime_for_store_owner(...)`、后由 `get_tree(...)` 校验 `owner_chat_id`，故 store owner 门 **严格先于** 参数校验。实测 `off` + 空 `owner_chat_id` → **503 `context_v2_store_disabled`，而非 400** —— 停用态会 **掩盖** 非法请求态。对「客户端能否从单次响应分辨出当前是哪一态」而言，有序化是够用甚至更好的；但本条 **未** 证明三条件可 **各自独立** 检出，「两两不重叠」不宜被这样解读。
  - **补充（部分已可从证据自身看出）：503 是多路复用的。** 同一读路径上至少有 `context_v2_store_disabled` / `context_v2_unchain_read_unavailable` / `context_v2_store_owner_invalid` / `context_v2_unavailable`（`memory_v2_runtime.py:701-706`），另有 `context_v2_owned_by_unchain`（`memory_v2_runtime.py:725-734`）走 `_runtime()` 的路径。**故三态判别只在消费方分支于 `error.code` 时成立，绝不能只看 HTTP status。** 证据登记了 code，命题字面成立；但任何据「503」单独判定停用态的下游设计都不被本条支持。
  - **对本庭特别问询的直接回答 —— 自陈 (3) 是否足以隔离污染：不足。** 我确认了污染的成因属实：实测该 ImportError 的真实来源是 `memory_v2_unchain_read_adapter` 中的 `from unchain.journal import ArtifactRef, EventCursor, ResourceRef` → `No module named 'unchain'`，**确系环境产物、非产品缺陷**，故 (3) 对「那条 `context_v2_unchain_read_unavailable` 输出不得当产品结论引用」的隔离 **是正确且必要的**。但同一环境缺陷 **另有一处未被隔离的后果**：它使 `unchain` 分支整体不可观测，从而让 200 空态臂 **只能** 退到 `pupu_legacy` 上取得（见重述点一）。(3) 隔离了 **被污染的输出**，未声明 **被塌缩的作用域**。就此而言，证据的其他部分（200 臂）**确实受同一环境缺陷影响**。
  - 其余两臂（400、503-off）**不受该缺陷影响**：`route_memory_v2.py:327` 为 `if store_owner != STORE_OWNER_UNCHAIN: return _runtime()`，两者均在 `:330-361` 的 unchain 导入段之前返回，路径上不触及 `import unchain`。

- **来源归类**: **内部来源。** 由提交方（`code-owner-runtime`）自行编写的一次性 harness，在本仓自身代码的固定 revision 上运行；非外部权威来源。其替身出处（`tests/test_route_memory_v2.py:31-38`）亦为内部既有测试。依证据规则第四节，须查类无保管链 —— 本次复跑与原观察 **同机同环境**，故复跑证成其可复现性，**不构成独立第二环境的佐证**。
