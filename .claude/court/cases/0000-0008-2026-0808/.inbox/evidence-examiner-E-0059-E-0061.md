#### S-XXXX | ASSESSMENT | evidence-examiner → E-0059

- **阶段**: 议案庭审
- **结论**: E-0059 登记的两段实跑 **逐字符复现成功**（heredoc 四行输出全同；既有测试 `13 passed in 0.70s` 全同），源锚点 `unchain_adapter.py:56-72` 引用精确。其两条主张 **均成立**：(a)「零 env 配置下产品自带 bootstrap 把 sibling repo 挂上 `sys.path`」是直接观察；(b)「三名同僚的 `ModuleNotFoundError` 系 harness 未 import 产品 bootstrap，而非环境缺陷」是 **归因**，但经我三项独立验证后 **机制被完整闭合**，属被证据支撑的归因，不是未经检验的推测。仅一处措辞需收窄：「非环境问题」只在「产品不要求安装 unchain」这一意义上成立，sibling 回退 **确实依赖目录布局** —— 该点提交方限制 (1) 已自陈，不构成夸大。
- **依据**: E-0059
- **不确定性**:
  1. **同机同环境复跑不构成第二环境佐证**（证据规则第四节，须查类无保管链）。本次复跑只证成可复现性。
  2. **归因链是我重建的，不是对三人执行过程的直接观察。** 我未原样重建 S-0004 的 E-0010 harness 并复现其失败；我做的是证明「唯一 bootstrap 链」存在且前案记载的替身正好切断它。若三人中任一人的失败另有成因，本条不覆盖。
  3. **打包态（`app.isPackaged`）解析未核实** —— 提交方限制 (2) 自陈并归 `code-owner-electron`，我同样未核实。
  4. 本条 **不闭合 G8**，它只提供方法；G8 的实跑闭合取决于 E-0062，不在本次审查范围。
- **请求/下一步**: 建议 `speaker-of-the-house`（1）采纳本条；（2）**在案卷中同步更正 G8 的成因定性** —— record.md:628 / :178 / :695 及 E-0010 限制 (3) 中「我环境的缺陷」的表述，据本条应改为「harness 未经产品 bootstrap」，二者对下游的含义完全不同（前者暗示不可修复，后者是可复跑的方法缺陷）；（3）E-0010 限制 (3) 对「被污染输出不得引用」的隔离 **仍然正确**，无需推翻，需更正的只是成因归属。
- **评估结论**: 已验证
- **证据编号**: E-0059
- **来源类型**: general

- **真实性**: **确认，逐字符一致。**
  - revision 核对：PuPu `git rev-parse HEAD` = `b2385d5dc7951887b6aeebd4001d17b4cd78af83`（= `b2385d5d`）；unchain = `a4e69f413c449c5768433ba4dddc5b60b8146991`（= `a4e69f41`）。两仓 `unchain_runtime/` 与 unchain 工作树 **均干净**（本次审查前后各查一次，无改动）。
  - **原样复跑**（未改写一字）`cd .../unchain_runtime/server && env -u PYTHONPATH -u UNCHAIN_SOURCE_PATH python3 - <<'EOF' …`，实得：
    ```
    BEFORE: 'unchain' importable? NO -> No module named 'unchain'
    AFTER importing unchain_adapter:
      unchain.__file__ = /Users/red/Desktop/GITRepo/unchain/src/unchain/__init__.py
      unchain.journal OK
      UNCHAIN_SOURCE_PATH env = ''
    ```
    与登记 **四行全同，无一字符出入**。
  - 既有产品测试复跑：`PYTHONPATH=.:…/unchain/src python3 -m pytest tests/test_memory_v2_unchain_read_adapter.py -q` → **`13 passed in 0.70s`**，与登记连耗时都相同。
  - **源锚点行号精确**：`unchain_adapter.py:56` 为注释 `# Ensure unchain source is on sys.path (dev mode uses UNCHAIN_SOURCE_PATH env)`，`:57` 为 `def _ensure_unchain_on_path() -> None:`，`:72` 为模块级调用 `_ensure_unchain_on_path()`。函数逻辑我整读确认：先取 `UNCHAIN_SOURCE_PATH`（试 `<src>/src` 再试 `<src>` 本身），未命中则 `Path(__file__).resolve().parents[2]` = `…/PuPu` → 兄弟目录 `…/GITRepo/unchain/src`。与观察到的解析结果一致。
  - **无篡改迹象。** `env -u` 的存在使「不依赖任何 env」这一要害可被机械检验，且检验通过。

- **可靠性**: **内部来源；但我另做三项独立验证，其可靠性 *高于* 一次自陈实跑。**
  - **出处**：提交方（`code-owner-unchain`）自编的一次性 harness，加一条 **非其编写** 的仓内既有测试。均为本仓/兄弟仓固定 revision 上的内部产物，非外部权威来源。
  - **独立验证一 —— 读路径入口本身不触发 bootstrap（要害）**：我实跑 `sys.path.insert(0,"."); import route_memory_v2` → 成功；紧接 `import unchain` → **仍 `ModuleNotFoundError: No module named 'unchain'`**。即前案 harness 走的那个入口 **确实不会** 把 unchain 挂上路径。
  - **独立验证二 —— 唯一那条 bootstrap 链被前案 harness 切断**：`memory_v2_unchain_read_adapter.py:25-45` 有 7 条顶层 `from unchain.*` import，但该文件与 `route_memory_v2.py` **均不 import `unchain_adapter`**（grep 实测零命中）。全 server 树内 import `unchain_adapter` 的产品模块只有 `routes.py:6`（另 `interject_router.py` / `route_interject.py`，不在读路径上）。而 S-0007 记载前案 harness 以 `mock.patch.dict(sys.modules, {"routes": fr})` **顶替了 `routes`** —— 唯一那条链因此不曾执行。这与 S-0007 实测 ImportError 来源为 `memory_v2_unchain_read_adapter` 的 `from unchain.journal import …` **完全吻合**。
  - **独立验证三 —— `.venv` 那半边归因同样被推翻**：我实测仓根 `.venv/bin/python -c "import unchain"` → `ModuleNotFoundError`（与三人自陈一致）；但同一 `.venv` 解释器先 `import unchain_adapter` 后 → 解析到 `/Users/red/Desktop/GITRepo/unchain/src/unchain/__init__.py`。**即 `.venv` 未装 unchain 不是缺陷，产品从不要求它装。**
  - **保管链**：依证据规则第四节，须查类无保管链。本次复跑与原观察 **同机同环境**，故 **不构成独立第二环境的佐证**。
  - 既有测试那一跑 **不是提交方产物**，构成一处弱内部旁证（证明该 revision 上带正确 sys.path 时读适配器整体可运行）。

- **相关性**: **支持其声称的全部内容；一处措辞需精确化；两处它明确不主张的须防止被过度引用。**
  - **技术判断（a）成立且是直接观察**：「产品自带 bootstrap 在零 env 下把 sibling repo 挂上 `sys.path`」—— `env -u` 双清 + 实跑输出 + 源码整读，三重支撑。
  - **对三名同僚的归因 —— 被证据支撑，非推测**。本庭特别请查此点。我的判定依据是：唯一 bootstrap 链（`routes.py:6`）已被机械穷举确认；前案 harness 切断该链有案卷记载（S-0007）；切断后必失败、接上后必成功两侧我均实测。**归因链闭合，无缺环。** 但须精确记录其性质：这是 **机制性归因**，不是对三人执行过程的重演 —— 我未复现三人各自的 harness。若某人的失败另有成因，本条不覆盖（见不确定性 2）。
  - **需收窄的措辞**：「既非环境问题也非结构问题」中「非环境问题」应读作「**产品不要求环境安装 unchain**」。sibling 回退 **本身就是环境依赖**（依赖 PuPu 与 unchain 为兄弟目录），且 CEO 已预告路径会变。提交方限制 (1) 已明确自陈不主张普适性 —— **自陈与主张一致，不构成夸大**，但案卷引用时不得丢掉该限定。
  - **明确不主张、须防过度引用的两处**：(i) 限制 (3) —— 本条只证明 import 可成，**不证明由此得到的行为等同真实 sidecar 进程**；(ii) 限制 (2) —— **打包态解析未核实**。任何据本条推断「产品运行时行为已被观察」的引用都超出其射程。
  - **对 G8 的作用须准确表述**：本条 **推翻 G8 的成因定性**并 **提供方法**，但 **本身不闭合 G8**（它没有跑 `store_owner=unchain` 的读路径，只跑了 import）。G8 的实跑闭合归 E-0062。证据条目自身措辞（「为本案后续一切 `store_owner=unchain` 取证提供方法」）是恰当的，请勿在 `SUMMARY` 中升格为「G8 已由 E-0059 闭合」。

- **来源归类**: **内部来源。** 提交方自编 harness 在本仓 `b2385d5d` / 兄弟仓 `a4e69f41` 上的一次性运行，外加一条仓内既有产品测试的运行。无外部权威来源参与。依证据规则第四节，须查类不得据单次观察推断稳定状态 —— 但本条的观察对象是 **源码中的确定性控制流**（`sys.path` 注入），我两次独立触发（含 `.venv` 解释器）结果相同，就此点而言比典型须查类更稳。

---

#### S-XXXX | ASSESSMENT | evidence-examiner → E-0061

- **阶段**: 议案庭审
- **结论**: E-0061 的双臂实跑 **复现成功且确定**（连跑两次，全部计数、kind 集合、parent_paths、树层级逐项相同）。「当且仅当」的 **两个方向各自都有观察支撑** —— 方向一（显式建 folder → 返回、正常嵌套）由 A 臂直接观察，方向二（不建 → 不返回、祖先不物化）由 B 臂直接观察，**不是只跑到一个方向**。我另做静态闭合：全 unchain 仓 folder 条目的产生点 **只有一处**（`create_folder`），`_write` 每次只落一条 entry 且无任何父目录创建，故该双向命题在本 revision 上 **机制性成立**，非仅两点观察。关于仓内既有测试「正是按退化那一路写的」这一陈述 **属实且可逐行指认**。唯一须登记的瑕疵：登记的「实际输出」是 **经删节与手工重排版的转录，不是逐字**（三处差异 **全为排版性，无一处数字/kind/路径/层级被改动**）。
- **依据**: E-0061
- **不确定性**:
  1. **真实用户数据中 folder 的使用率不可知** —— 提交方限制 (1) 已自陈，受 G2 阻断。本条证明的是「退化形状 **可达**，且仓内既有测试正落在其上」，**不是**「真实配置下必然退化」。这是本条与议案之间唯一的缺口，**我不就其份量表态**（属实体争点）。
  2. 我的静态闭合只穷举了 **unchain 仓当前 revision** 的 folder 产生点。`pupu_legacy` 侧（`memory_v2_store.py`）是另一套表与另一套写路径，**不在本条射程内**，也不在 `store_owner=unchain` 路径上。
  3. `image` kind 未构造（限制 (2) 自陈）。但 `image` 与 markdown/link 同走 `service.py:_write`，**不影响方向二**。
  4. 同机同环境复跑，不构成独立第二环境佐证。
- **请求/下一步**: 建议 `speaker-of-the-house`（1）采纳本条，**并据此正式关闭 E-0014 限制 (3) 的挂起状态** —— E-0014 自标「纯推断、请勿采信」的那条外推，其 **结论成立**而其 **理由（"`MemoryEntryKind` 有 `FOLDER` 所以前提大概率不成立"）被推翻**；案卷宜同时记两者，勿只记结论；（2）在 `SUMMARY` 中把本条命题登记为 **「退化形状可达 + 既有测试正落其上」**，而 **不是**「产品路径下 tree 必然退化」—— 后者需要限制 (1) 所指的真实数据取证，本案无法提供；（3）「实际输出」字段的转录性质建议在案卷中标注为「摘录」，以免后续复核者按逐字比对判定不一致。
- **评估结论**: 已验证
- **证据编号**: E-0061
- **来源类型**: general

- **真实性**: **复现成功且确定；登记块为摘录而非逐字，三处差异均无实质。**
  - 脚本存在于登记路径 `…/76138b07-…/scratchpad/g8_tree.py`（6916 字节，`8 Aug 17:26`），我整读全文确认其 **只写 `tempfile.TemporaryDirectory()`**，未触碰本机真实 store，未写任何仓内文件。
  - `env -u PYTHONPATH -u UNCHAIN_SOURCE_PATH python3 g8_tree.py` **连跑两次**，两次输出相同，且与登记数值逐项一致：
    - **B 臂（不建 folder）**：`entries: 2` · `roots: 2` · `kinds ['link','markdown']` · `parent_paths ['/notes']` · 形状为 `/notes/Architecture.md` 与 `/notes/Upstream.link` **两个平级 root，零嵌套**。
    - **A 臂（建 folder）**：`entries: 3` · `roots: 1` · `kinds ['folder','link','markdown']` · `parent_paths ['/','/notes']` · 形状为 `/notes (folder, children=2)` 下挂两叶。
  - **三处转录差异（据实登记，均为排版性）**：(a) 登记块 **省略** 了 `[bootstrap] unchain.__file__ = …` 两行与每臂的 `top-level keys : ['entries','owner_chat_id','space_id','space_revision','tree']` 行；(b) 列被 **手工对齐**（脚本实际 print 格式为双空格分隔，见 `outline()` 的 f-string）；(c) `['link', 'markdown']` 登记为 `['link','markdown']`（去掉逗号后空格）。**没有任何数字、kind、路径或层级被改动或美化。** 但字段标称「实际输出」，故据实指出其为摘录。
  - 复跑前后两仓工作树 **均干净**，无任何文件被改动。

- **可靠性**: **内部来源；harness 出处核实属实，两臂对照结构经我逐行确认无污染。**
  - **出处属实**：`build()` 的建库序列确与 `pupu:unchain_runtime/server/tests/test_memory_v2_unchain_read_adapter.py:54-215` 的 `_seed_owner` / `_seed` 同构 —— 同样的 `admit_context_v2_store_owner(requested_owner=STORE_OWNER_UNCHAIN)`、同样五个 SQLite store（context / compiler / memory / curator / promotion）+ `SQLiteLegacyBootstrapService`、同样补 `memory_host_v2_schema` 与 `memory_review_proposals` 两表、同样 `_initialize_lifecycle_schema` + `_persist_lifecycle`、同样 `bind_workspace` → `MemoryWorkspaceService`。
  - **两臂唯一差异确为 `make_folders` 布尔**：我逐行核对 `build()`，`if make_folders:` 只多出一次 `ws.create_folder(path="/notes", …)`，其余写入（`write_markdown` `/notes/Architecture.md`、`create_link` `/notes/Upstream.link`）与 revision 递增逻辑（`bump()`）两臂完全共用。**对照实验干净，无第二变量。**
  - **bootstrap 确为唯一 sys.path 来源**：脚本 `:20 import unchain_adapter` 是全文唯一使 unchain 可导入的动作，实跑打印解析到 sibling repo。与 E-0059 同一机制，可交叉印证。
  - **保管链**：须查类无保管链；同机复跑不构成第二环境佐证。

- **相关性**: **两个方向各自成立，我另做静态闭合把它从"两点观察"升为"机制性命题"；关于既有测试的陈述属实。**
  - **方向一（显式建 → 返回）**：A 臂直接观察 —— `create_folder("/notes")` 后，`kinds` 含 `folder`，`roots` 降为 1，`/notes` 节点 `children=2`。**成立。**
  - **方向二（不建 → 不返回，祖先从不自动物化）**：B 臂直接观察 —— 写 `/notes/Architecture.md` 与 `/notes/Upstream.link` 之后，`parent_paths` 为 `['/notes']` 而 `/notes` **自身不在 entries 里**。**成立。**
  - **我补的静态闭合（不在登记内，属我的独立取证）**：
    - `unchain:memory/workspace/service.py:661-730` 的 `_write` —— 每次调用只落 **一条** entry，全文 **无任何父目录创建、也无父目录存在性校验**。
    - `unchain:persistence/sqlite_memory_v2.py:843-902` 的 `list_entries` —— **无 kind 过滤**的 path-prefix 查询（`substr(e.path_key,1,length(?)) = ?`），返回底层原始行，不合成任何虚拟 folder。
    - **全仓 folder 条目产生点只有一处**：`service.py:367 create_folder`（`:381 kind=MemoryEntryKind.FOLDER`）。另两个调用方 `memory/toolkit/services.py:228`（agent 工具面）与 `persistence/sqlite_memory_host_v2.py:948`（promotion 落地）**均经由它**。其余 `MemoryEntryKind.FOLDER` 命中（`sqlite_curator_review_decision_v2.py:594`、`sqlite_memory_host_v2.py:706`）是 **反序列化分支，非产生点**。
    - 故「folder 条目 **当且仅当** `create_folder` 被调用」在本 revision 上是 **机制性成立**，而非仅由两次实跑外插。
  - **退化机制的落点经我核实**：`pupu:unchain_runtime/server/memory_v2_unchain_read_adapter.py:443-448` —— `parent = nodes.get(item["parent_path"])`；`if parent is None: roots.append(node)`。**无 folder 条目 ⇒ 全部条目升为 root ⇒ tree 与 entries 同构（扁平）。** 与 E-0014 静态比对的描述一致。
  - **关于仓内既有测试的陈述 —— 属实，可逐行指认**：`tests/test_memory_v2_unchain_read_adapter.py` 全文 **零 `create_folder`**（grep 实测）；`_seed_owner` 唯一写入是 `:106 workspace.write_markdown(path=f"/notes/Architecture-{suffix}.md", …)`，**不建 `/notes`**；断言 `:238 assert reader.memory_tree().entries == (owner_a[1],)`（单条目）与 `:322 assert tree["tree"][0]["entry_id"] == entry.entry_id`（该 markdown **直接位于 tree 根**）。**这正是退化形状。** 该测试实跑 13 passed（E-0059 已跑，我复核）。提交方在限制 (4) 中明确将此标为「静态阅读 + 该测试实跑通过，非我对其意图的主张」—— **该自我限定恰当**，我同样不就测试作者的意图作任何推断。
  - **本条 *不* 支持、且未主张的**：真实配置下 tree 是否 **实际** 退化。这取决于真实数据里 folder 的使用率，受 G2 阻断。**请勿将本条升格为「产品路径下 tree 必然退化」** —— 那是本条与议案之间唯一的缺口，且提交方限制 (1) 已明确自陈。作为验证者我只登记该缺口存在，**不评估其对议案的份量**。

- **来源归类**: **内部来源。** 提交方（`code-owner-unchain`）自搭 harness 在 PuPu `b2385d5d` / unchain `a4e69f41` 上的运行，建库序列取自本仓既有测试 fixture；相关产品源码为两仓内部文件。无外部权威来源参与。依证据规则第四节，须查类不得据单次观察推断稳定状态 —— 本条经我 **两次连跑** 且观察对象为确定性控制流（无随机、无并发、无外部 IO），就可复现性而言强于典型须查类；但其 **不可外推至真实数据分布**，此为独立限制，与观察次数无关。
