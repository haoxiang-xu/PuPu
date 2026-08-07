# 目录布局

[Quorum 索引](../README.md) · [Court Records](README.md)

```text
.claude/court/
├── .numbers/
│   └── proposals/
│       └── <proposal-id>/          # 原子编号占位，只保存所属 case 指针
└── cases/
    └── <case-id>/
        ├── case.md                 # 当前状态、待裁问题与文件索引
        ├── record.md               # 追加式完整发言记录
        ├── evidence.md             # 证据台账与验证历史
        ├── proposal.md             # 有实施方案时创建
        ├── ruling.md               # 有裁定或 Fast Track 指派时创建
        └── acceptance.md           # 进入验收时创建
```

- `case.md` 在立案时创建，所有 track 必须存在
- `record.md` 在第一次庭审发言时创建；`evidence.md` 在第一项证据提交时创建
- `proposal.md`，`ruling.md` 与 `acceptance.md` 按阶段创建，不提前生成空文件
- `case.md` 的文件索引只列已经创建的文件；阶段推进时随文件创建而更新
- Fast Track 若未发生庭审，可省略 `record.md` 与 `evidence.md`；其指派记录写入 `ruling.md`，类型为 `FAST_TRACK_DIRECTIVE`，表示方案与执行授权的等价物，不新增一个正式裁定阶段
- side case 使用独立的 `<case-id>` 目录，通过 `case.md` 的 `parent_case_id` 与 `relation` 关联，不嵌套在 parent case 目录内
