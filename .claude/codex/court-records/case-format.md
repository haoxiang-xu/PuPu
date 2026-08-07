# `case.md` 格式

[Quorum 索引](../README.md) · [Court Records](README.md)

```markdown
---
case_id: 0000-0001-2026-0806
title: 示例议案
track: full
status: hearing
phase: motion
parent_case_id: null
relation: null
created_at: 2026-08-06T18:00:00-07:00
updated_at: 2026-08-06T18:00:00-07:00
---

# 示例议案

## 待裁问题
- ...

## 必到角色与交付
- `expert-security`: `ASSESSMENT`

## 已知缺口
- 无

## 文件索引
- [发言记录](record.md)
- [证据台账](evidence.md)
```

- `track` 只允许 `fast`，`express`，`full`
- `status` 只允许 `filed`，`hearing`，`awaiting-witness`，`awaiting-ruling`，`implementing`，`acceptance`，`reconsideration`，`closed`，`terminated`
- `phase` 只允许 `motion`，`proposal`，`combined`，`implementation`，`acceptance`，`reconsideration`；`combined` 只用于 Express 的合并庭审与单次裁定
- `relation` 只允许 `blocking`，`non-blocking` 或 `null`
- 所有时间使用带 UTC offset 的 ISO 8601；编号中的日期仍使用编号责任规定的归档日期格式
