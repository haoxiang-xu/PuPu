# 延伸与 Side Case

[Quorum 索引](../README.md) · [Case Lifecycle](README.md)

## 同类延伸

议案可以延伸议案，方案可以延伸方案。延伸 case 用于父 case 当前范围内、但需要独立主 owner 和独立结论的子问题：

- `relation: extension`；
- `parent_case_id` 指向父 case；
- `discussion_type` 必须与父 case 相同；
- 自身只选择一个主 owner，并从 `procedure_mode: collaboration` 开始；
- `blocking: true` 只在其结果是父 case 当前回答或方案不可替代的必要输入时使用。

子议案的裁定结论返回父议案；子方案使用 `PLAN_RULING` 的 `ruling_scope: COMPONENT`，获准方案块返回父方案主 owner 集成，不授权 action、不创建 AS 或进入独立验收。子 case 的辩论庭或众议庭升级不自动改变 parent 的 procedure mode。

## 跨类别派生

议案结论产生实施需求时，新建方案 case 并记 `relation: derived`、`derived_from: <motion-id>`。方案发现需要独立判断的问题时，也可新建议案并引用，但 parent 不会自动等待，除非另记 `blocking: true`。

`derived` 不是阶段转换：新 case 有独立主 owner、协作、异议和裁定。原 case 的讨论类别永不改变。

## Side Case

无法映射当前冻结目标、BOS 或返修范围的新问题，若值得另议，建立 side case：

- `relation: side-case`；
- `blocking` 单独记录，不与 relation 混用；
- side case 可是议案或方案，但不能借此改变 parent 的 discussion type；
- 自身从一个主 owner 和 collaboration 开始，不继承 parent 的 procedure mode、electorate 或投票；
- 可引用 parent 证据及核验历史，但不得重置或伪造新的核验结论。

blocking child 结束后，parent 仍须由 `Chief Judge` 或规范授权的程序记录明示恢复、终止或按其结果重框；不得自动迁移状态。为防无限递归，一个 blocking child 不得再创建 blocking side case，但可以建立范围有限、不会阻塞 parent 的同类延伸。

同一 parent 同时最多一个 active `blocking: true` child；其他 child 必须 non-blocking，或等待当前 child 解除后再建立。组件 child 的 `PLAN_RULING: APPROVED + COMPONENT` 只关闭 child并返回组件，不自动释放 parent；Speaker 必须等待 `SIDE_CASE_RULING: RELEASE` 后才更新 parent 状态。

无论 parent 是议案还是方案，只要任一 `blocking: true` 的 extension、derived 或 side case 尚未被明示解除，parent 就不得形成终局 SUMMARY 或实体裁定；不得只检查同类别 child 而漏掉跨类别 blocking 关系。

non-blocking side case 不延迟 parent。Speaker 在 parent 结案摘要中只列其编号、关系及未决状态，不复制内容。
