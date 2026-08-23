# 目录布局

[Quorum 索引](../README.md) · [Court Records](README.md)

```text
.claude/court/
├── .numbers/
│   ├── motions/
│   │   └── M-<sequence>-<date>/
│   └── proposals/
│       └── P-<sequence>-<date>/
└── cases/
    └── <case-id>/
        ├── case.md
        ├── record.md
        ├── motion.md              # discussion_type: motion 时存在
        ├── proposal.md            # discussion_type: proposal 时存在
        ├── evidence.md            # 首个稳定 E/ES 或正式证据控制出现时按需创建
        ├── parking-lot.md         # 首次产生相关性移出处置时创建
        ├── ruling.md              # 首次裁定/授权时创建
        └── acceptance.md          # 获准方案进入验收时创建
```

- 编号通过先原子创建 `.numbers/<type>/<id>/` 取得；占位只保存 case 指针，不是正文
- `case.md`、`record.md` 及与 discussion type 对应的 `motion.md` 或 `proposal.md` 在 case 创建时存在
- 默认协作事件从主 owner 选择起写入 `record.md`，无需等到开庭
- `motion.md` 与 `proposal.md` 互斥；议案需要 action 时创建新的 proposal case，不在原目录添加 `proposal.md`
- 默认协作不创建空 `evidence.md`；但一旦分配 `E-####` 或稳定 `ES-###`，即可按需创建只保存 E/ES 的文件，不因此启动 DES、抽样或 Examiner。空 DES 只在正式证据控制已经合法启动后用于记录 `N = 0`
- `acceptance.md` 只属于经 `PLAN_RULING` 获准的方案；议案 case 不得创建
- 文件索引只列实际存在的文件，不提前生成空文件
- extension、derived 与 side case 使用独立 case 目录，不嵌套在 parent 目录
