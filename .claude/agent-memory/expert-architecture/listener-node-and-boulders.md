---
name: listener-node-and-boulders
description: 常驻agent的三件架构定案——listener node 一等原语契约、三块石头落位、单向门(event-ledger-first + 归一化envelope)
metadata:
  type: project
---

2026-06-20 CEO 愿景会收口,补 CTO M0→M3 路线的三件架构事。grounding: start_node.js 在 src/COMPONENTs/agents/pages/recipes_page/nodes/,后端 recipe.py/recipe_seeds.py 有 node-type 概念;Flask sidecar routes.py 验证零 scheduler(grep cron/worker/background 空)。Codex(architect)深推,我在 gate 拆分上加判。

**Why:** 北极星=伪常驻/在场感(非真 daemon/heartbeat,event-triggered)。三块石头 A 可恢复长流程引擎/B 事件唤醒层/C 打扰判定器。要在 M0/M1 把边界设计对,否则 M2(Gmail listener)/M3(listener 进 builder)抽不出来。

**How to apply:** 任何动 recipe graph node、sidecar 生命周期、durable store、事件/唤醒入口的设计,以本条为基线契约。

## 1) listener node 统一契约
start_node 泛化为 TYPED listener_node(单一节点带 listenerType,不是多个特化 start)。下游流程只消费归一化 envelope `pupu.flow_event.v1`,绝不消费 raw provider payload。五种 listener(on-user-message/on-schedule/on-email/on-webhook/on-file-change)只在 adapter config + trigger + cursor + payload.kind 上有别。
envelope 关键字段:schema 版本 / event_id / dedupe_key(=recipeId:listenerNodeId:sourceSpecificId)/ occurred_at+received_at / recipe_id+listener_node_id+listener_type / source{kind,cursor(如 gmail_history_id),can_backfill} / actor / payload{kind,refs,data} / delivery{attempt,replay,backfill} / causality{correlation_id}。

## 2) 三块石头落位
- durable job store + wakeup entrypoint 寄生 Flask sidecar = 正确,但要打成 runtime 边界(不是 route 胶水)。sidecar 链:listener adapter → event ledger/dedupe → gate → job engine → checkpoints → notify。
- 持久化分表:events / listener_subscriptions / listener_cursors / job_runs / job_checkpoints / job_outputs。resume 由持久化 event/checkpoint 驱动,不靠 React state、不靠 route 调用栈。
- 记忆服务边界:memory ≠ job store。job store 存执行真相(event/run/cursor/retry/checkpoint version);memory 存用户/项目语义知识。此边界现在就要划清。
- **我对 Codex 的修正(载入门):打扰判定器 C 实为两个门,不能合并。**
  Gate-1 admission(此事件该不该触发/恢复 flow)= 在 dedupe 之后、job 创建/恢复之前。
  Gate-2 interruption(要不要打断用户/推送)= 在 flow 产出结果、推送给用户之前。
  C(石头C,最不成熟、可能净有害)= Gate-2。M0/M1 两门都 pass-through,接口 decide(event,context)→{action:allow|defer|suppress, reason, modified_event}。绝不让门逻辑住进 adapter 或 flow node 内部。

## 3) 现在必须对的边界(否则 M2/M3 抽不出)
flow_event.v1 envelope + 版本化;幂等模型(event_id/dedupe_key/run_id/checkpoint version);wakeup entrypoint = "接受归一化事件并 resume-or-create job" 单一稳定 API;listener adapter 边界(provider 输入进/归一化事件出);job store vs memory 分离;两个 gate 接口(即便 pass-through);builder 契约(listener node 向 recipe graph 发 envelope)。

## 单向门(改不起)
1. **event-ledger-first runtime**:事件是持久输入,run 由事件派生/恢复。若 run 变主、event 变附属 → Gmail backfill/replay/dedupe/listener 抽取全部变痛苦。one-way-door。
2. **归一化 envelope 作为唯一下游契约**:recipe 一旦直接吃 raw Gmail/webhook/file payload,M3 listener 泛化会绕着 provider 怪癖固化。one-way-door。一旦 M3 把 listener node 发布给用户、用户 recipe 依赖该契约,契约本身也成单向门。

可逆:具体 DB 选型、Flask route 命名、首个 listener UI、schedule 语法、file-change 用 watcher 还是 startup-scan。

## 我与 CTO 的立场
赞成 CTO "先验证后抽象"(builder/listener node 排 M3)——避免在零真实负载下过度设计 UI 和节点语义。但 **envelope 契约 + 幂等模型 + 两个 gate 接口必须在 M0 就抽象进引擎设计**(哪怕 pass-through、哪怕只有 on-schedule 一种 listener 在跑)。即:UI/节点暴露晚做,运行时契约早定。这两件不冲突——延后的是用户可见面,提前的是运行时骨架。
