#### S-XXXX | ASSESSMENT | evidence-examiner → E-0064

- **阶段**: 议案庭审
- **结论**: 七行观察 **全部独立复现，无篡改迹象**。其结构判据 **比提交方自陈更强** —— 本庭在传唤中提出的「只支持这一个实例」之忧不成立。「`degraded` 是占位串不是准确描述」**成立，且不是 `:489` 的重复**：我以三臂对照证明该字段在四种互不相同的真实状态下恒为 `'degraded'`，而相邻的 `backend` 字段确实会变。附 **三处引证/表述缺陷** 与 **一处必须随证据一同引用的收窄**。
- **依据**: E-0064
- **不确定性**: 见下「不确定性」四项
- **请求/下一步**: 见下「请求」四项
- **评估结论**: 已验证
- **证据编号**: E-0064
- **来源类型**: general
- **来源归类**: **内部来源，已由第二方以不同 harness 独立复核。** 提交方自建 harness 在 PuPu `b2385d5d` / unchain `a4e69f41` 上的运行时观察，非外部系统响应，无第三方权威背书。我 **未复用提交方的 `g8_tree.py`**，改以仓内既有 fixture（`pupu:unchain_runtime/server/tests/test_memory_v2_unchain_read_adapter.py` 的 `_seed_owner` 建库序列）自写 harness 重建，并另加三臂对照。两仓 revision 经我 `git rev-parse` 实测与登记一致。依证据规则第四节须查类无保管链 —— 但本条的承重部分由 **同 revision 仓内源码（自证类）** 独立支撑，保管链弱点在此近乎不咬。同机同环境，惟 E-0059 所指 import 缺陷 **在我处未复发**。

---

- **真实性**: **成立。** 独立重建后逐条比对，E-0064 登记的七行 **全部命中**：

  | 登记值 | 我的复现 |
  |---|---|
  | `_vector_index = None` | `None` ✓ |
  | `vector_error = ''` | `''` ✓ |
  | `lexical_fallback = False` | `False` ✓ |
  | `matched_by = [['lexical_fallback','fts'], …]` | `[['lexical_fallback','fts']]` ✓ |
  | route keys `['backend','owner_chat_id','query','results','vector_status']` | 五键逐字一致 ✓ |
  | `backend = 'fts5'` | `'fts5'` ✓ |
  | `vector_status = 'degraded'` | `'degraded'` ✓ |

  **关于本庭点名的 import 检验：我未卡住。** 在 `env -u PYTHONPATH -u UNCHAIN_SOURCE_PATH -u PUPU_CONTEXT_V2_STORE_OWNER` 下，`import unchain` 先失败（`No module named 'unchain'`），仅执行 `import unchain_adapter` 之后 `unchain.__file__` 即解析到 `/Users/red/Desktop/GITRepo/unchain/src/unchain/__init__.py`，且 `UNCHAIN_SOURCE_PATH` 与 `PYTHONPATH` 均为空串。**E-0059 关于「harness 构造缺陷、产品自带 bootstrap 在零 env 下即挂 sys.path」的诊断，在我手上成立。**

  **四处缺陷（均不动摇任一观察值）**：
  1. **引证行号错** —— `backend` 实际在 `memory_v2_unchain_read_adapter.py:488`，非登记的 `:485`（`:489` 的 `vector_status` 正确）。同一错误亦见 S-0024 正文。
  2. **「取得方式」不可按其字面复跑** —— 其命名的 `g8_vector.py` 实为 3 行残桩（`# just inline minimal` 之后为空文件），真实探针是 inline heredoc 且 **未留存**。故本条的可复现性 **依赖我的独立重建，不依赖提交方留存的脚本**。
  3. **类名不准** —— 实际持有 `_search` 的是 `BoundSQLiteContextV2ReadService`（`sqlite_read_v2.py:399/:402`），非其完整性限制 (1) 所写的 `SQLiteContextV2ReadService`（`:280/:283`）。实质路径无误（后者在 `:389` 产出前者），仅命名瑕疵。
  4. `matched_by` 一行以 `…` 省略 —— 我的 store 只建 1 条目故只得 1 个元素，**省略部分不可核**。

- **可靠性**: **足以支撑结构性结论，且本条的结构判据比提交方自陈的更强。**

  1. **该实例确以产品路径构造，非测试便利构造。** 我经 **产品入口** `open_pupu_unchain_memory_v2_reader(root_dir=…, owner_chat_id=…)` 取得 reader —— 与 `route_memory_v2.py:351` 的调用同一入口；其 `search_entries` 即 `:1228` 路由所调的同一方法。实测 `reader._reader` 类型为 `unchain.persistence.sqlite_read_v2.BoundSQLiteContextV2ReadService`，`._search` 为 `unchain.memory.workspace.search.WorkspaceSearchService`。
  2. **提交方低估了自己的判据。** 其完整性限制 (2) 称「更稳的判据是 `sqlite_read_v2.py:418` 的构造实参」。**实际判据更强**：`SQLiteContextV2ReadService.__init__`（`:283-…`，形参仅 `context_store` / `memory_store` / `compiler_store`）与 `BoundSQLiteContextV2ReadService.__init__`（`:402-…`，形参仅 `database_path` / `scope` / `journals` / `artifacts` / `checkpoints` / `workspace`）**均无 `vector_index` 形参**；`_vector_index` 在 unchain 全源 **只有一处赋值**（`search.py:149`，`__init__` 内），无 setter；`src/unchain/persistence/` 内 **零处** 调用会保留 vector_index 的 `with_link_repository`。
  3. **故在此读路径上，任何调用方都无从接入向量索引 —— `None` 是构造上不可达其他值，不是「这一次实例恰好是 None」。** 读私有属性在此处只是对静态可导事实的一次确认，**本庭传唤中提出的「只支持这一个实例」之忧不成立**。
  4. 其完整性限制 (4)「临时 store」**在本条不咬** —— `_vector_index` 不是 store 内容的函数（与 E-0061 不同，那里该限制真实咬）。

- **相关性**: **支持其命题，且确属新信息，不是 `:489` 的重复。**

  本庭要求区分的两件事，我在 **同一产品构造实例** 上以对照实验分开：

  | 臂 | `_vector_index` | `raw.vector_error` | → route `vector_status` | route `backend` |
  |---|---|---|---|---|
  | 基线（产品接线，未触碰） | `None` | `''` | `'degraded'` | `'fts5'` |
  | A 注入 **健康** 向量索引 | 存在且可用 | `''` | `'degraded'` | `'fts5'` |
  | B 注入 **损坏** 向量索引 | 存在且抛错 | `'unavailable'` | `'degraded'` | `'fts5'` |
  | C 强制词法索引不可用 | `None` | `''` | `'degraded'` | **`'degraded'`** |

  - **C 臂是阳性对照**：相邻字段在同一 harness 下确实会变（`'fts5'` → `'degraded'`），故 `vector_status` 的恒定 **不是我探针的假象**。
  - **净效**：S-0008 从 `:489` 认定该字段是 **常量**；但常量仍可能碰巧为真 —— **B 臂即是碰巧为真的那一种世界**。E-0064 补上的是 **被指称的状态并不存在**：产品接线下没有任何东西处于降级，向量通道是 **缺席（absent）** 而非 **受损（impaired）**。「占位串不是准确描述」是这两个合取，**第二个合取由本条首次确立于 unchain 读路径**（S-0004 的 `NullVectorBackend` 属 PuPu 自有向量后端，是另一条路径）。
  - 其新增的 **词汇碰撞** 亦复现：同一次查询同时出现 `matched_by=['lexical_fallback','fts']`（评分通道名，`search.py:264`）与结果级 `lexical_fallback=False`（`search.py:117`）。
  - **一处必须随证据一同引用的收窄** —— E-0064 称「另经 E-0062 案例 8 在 **完整 HTTP 路径** 上复现同样两个字段值」。**「完整」过宽**：E-0062 自陈完整性限制 (1) 为「Flask `test_client`，**未起真实 sidecar 进程、未经 HTTP socket、未经 Electron 转发**」。准确表述应为「**完整 Flask 路由层（`test_client`）**」。且 **E-0062 自身仍是未验证的须查类**，该佐证继承其待决状态。
  - **范围声明经核准确** —— 其完整性限制 (1) 只覆盖 PuPu Context V2 读路径，并明确不否认 unchain 支持向量。我复核其反证引用 `sqlite_long_term_memory_v2.py:104-106`（该处 **确传** `vector_index=self._vector_index`）与 `:176`，**属实**。**这是本批须查类中第一条援引范围不宽于所证范围的证据。** 惟下游引用须保留「**读路径**」限定语：不加限定的「根本没接向量后端」宽于所证。
  - 其自标未核实项（`"degraded"` 是否为某未落地后端的前向占位）我同样未核，**且该命题不为其结论所需**，提交方已正确标注为非主张。

---

- **不确定性**:
  1. 原始探针脚本未留存。我的复现虽逐字一致，仍不能排除提交方当时另有未记录的 env 或步骤 —— 本条的可复现性实际由我的独立重建承担。
  2. `matched_by` 行的 `…` 省略部分不可核。
  3. 全部观察取自临时 store；**本机真实 store（G2）仍未被观察**。这对 `_vector_index` 无影响（结构判据独立于 store 内容），但对 `matched_by` 的实际取值分布有影响。
  4. 未起真实 sidecar、未经 socket、未经 Electron 转发。**renderer 最终看到什么，本条与 E-0062 均不主张。**

- **请求**:
  1. 请将 `backend` 的引证由 `:485` 改为 `:488`（`:489` 无误），E-0064 与 S-0024 正文同处一并改。**该行号属 `pupu:` 侧**，依提交方在 S-0024 自设的边界（跨仓半边只作锚点引用），此项更正宜由 `code-owner-runtime` 确认。
  2. 请将「完整 HTTP 路径」改为「完整 Flask 路由层（`test_client`）」，并标注该佐证依赖 **尚未验证的 E-0062**。
  3. 建议本庭在 `SUMMARY` 中将本条的结构判据 **升格记载** 为「两个读服务 `__init__` 均无 `vector_index` 形参」，而非提交方所写的「构造未传实参」—— 前者排除了任何调用方接入的可能，后者没有。
  4. 若 Q3 前提据本条成立，建议同时记明一项 **纯事实登记**（不含实体主张）：`vector_status` 在产品读路径上 **恒为 `'degraded'` 且与真实状态无关**，四种互不相同的真实状态下取值不变。
