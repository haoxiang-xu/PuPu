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
        ├── evidence.md             # 证据、DU/DES、随机批次与置信度报告
        ├── proposal.md             # 方案、快照 manifest 与 ACK ledger
        ├── parking-lot.md          # 有未进入主流程的相关性处置时创建
        ├── ruling.md               # 有裁定或 Fast Track 指派时创建
        └── acceptance.md           # 进入验收时创建
```

- `case.md` 在立案时创建，所有 track 必须存在
- `record.md` 在第一次庭审发言或冻结首个 `BOS-###` 时创建；`evidence.md` 在本阶段证据 preflight 冻结首份 `DES-###` 时创建，即使 `N = 0` 也保存空 manifest 与 `CR = NOT_APPLICABLE`
- `proposal.md`，`ruling.md` 与 `acceptance.md` 按阶段创建，不提前生成空文件
- `case.md` 的文件索引只列已经创建的文件；阶段推进时随文件创建而更新
- Fast Track 没有庭审实体发言，但仍以一条最小 `OBLIGATION_SET` 在 `record.md` 冻结 intake BOS，并以最小 `evidence.md` 保存 preflight DES；这两条程序记录不构成开庭。`EMPTY / INHERITED_ONLY` 时直接指派，`FIRST_RANDOM_REQUIRED` 时执行首批 16% 抽样；其他非空集合等待 `Chief Judge` 方向。其指派记录写入 `ruling.md`，类型为 `FAST_TRACK_DIRECTIVE`，引用最新 CR 或 `CR = NOT_APPLICABLE` 即作证据处置
- Fast preflight 使用 `phase: intake`；提出者随 filing 提交的证据在 `evidence.md` 以 `INTAKE@<submission-hash>` 作为提交来源，无需伪造 `S-####` 或创建 `record.md`
- Debate 默认创建 `record.md`、`evidence.md`、`proposal.md` 与 `ruling.md`；空决策证据集仍以 `N = 0` manifest 留痕，不创建 Examiner
- `parking-lot.md` 只在首次产生 `ADMIT_CONTEXT`、`MERGE_DUPLICATE`、`PARK_OUT_OF_SCOPE`、`PARK_PREMATURE` 或 `RETURN_NO_LINK` 项时创建，不得为满足格式制造空清单
- side case 使用独立的 `<case-id>` 目录，通过 `case.md` 的 `parent_case_id` 与 `relation` 关联，不嵌套在 parent case 目录内
