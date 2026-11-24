"""PuPu Agent Builder test suite: definitions.

Every document here is written in the exact v1 Skeleton shape the host admits.
Code text lives next to its node under config.code["__text"]; the builder
strips it and hands it to the managed-source store as the author's text.
Workflow references carry "__ref:<workflow id>" placeholders that the builder
replaces with the real published revision once that Workflow is published.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
PROFILE = json.load(open(os.path.join(HERE, "profile.json")))
SKILL = {"source": "user-agents",
         "source_id": os.environ.get("QA_SKILL_HOME", "/Users/red") + "/.agents/skills/workflow-test-notes/SKILL.md",
         "name": "workflow-test-notes"}

# ---------------------------------------------------------------- helpers

def ref(node, *path): return {"kind": "ref", "node_id": node, "path": list(path)}
def lit(value): return {"kind": "literal", "value": value}
def first(*values): return {"kind": "first_present", "values": list(values)}

def bind(name, value, missing="error", default=None):
    row = {"name": name, "value": value, "missing": missing}
    if missing == "default":
        row["default"] = default
    return row

def res(name, *path): return {"name": name, "source": {"kind": "result", "path": list(path or [name])}}
def inp(name, *path): return {"name": name, "source": {"kind": "input", "path": list(path or [name])}}

def node(id, type, config, label=None):
    value = {"id": id, "type": type, "config": config}
    if label:
        value["label"] = label
    return value

def start(names, label=None):
    return node("start", "start", {"execution": {"outputs": [res(n) for n in names]}}, label)

def end(rows, label=None):
    return node("end", "end", {"execution": {"inputs": rows, "outputs": [inp(r["name"]) for r in rows]}}, label)

def code(id, label, inputs, outputs, result_schema, text, timeout_ms=30000):
    return node(id, "code", {"execution": {"inputs": inputs, "outputs": [res(o) for o in outputs]},
        "code": {"source": {"kind": "file", "path": "pending.py"}, "environment_profile_id": "builtin",
                 "timeout_ms": timeout_ms, "max_result_bytes": 1048576, "max_log_bytes": 1048576,
                 "result_schema": result_schema, "__text": text}}, label)

def kernel(prompt, *, max_iterations=8, output_tokens=4096, history="none", json_schema=None):
    return {"schema_version": 1, "profile": dict(PROFILE), "prompt": prompt,
            "max_iterations": max_iterations, "output_tokens": output_tokens,
            "history": history, "overflow": "error", "json_schema": json_schema}

def agent(id, label, inputs, outputs, kern=None, draft=None):
    config = {"execution": {"inputs": inputs, "outputs": outputs}}
    if kern is not None:
        config["kernel"] = kern
    if draft is not None:
        config["kernel_draft"] = draft
    return node(id, "agent", config, label)

def wf_call(id, label, workflow_id, inputs, outputs):
    return node(id, "workflow_call", {"execution": {"inputs": inputs, "outputs": [res(o) for o in outputs]},
        "workflow": {"workflow_id": workflow_id, "revision_id": "__ref:" + workflow_id}}, label)

def flow(source, target, port="out"):
    return {"id": f"flow-{source}-{port}-{target}", "kind": "flow", "source_node_id": source,
            "source_port_id": port, "target_node_id": target, "target_port_id": "in"}

def attach(agent_id, pool_id, below=True):
    return {"id": f"attach-{agent_id}-{pool_id}", "kind": "attach", "source_node_id": agent_id,
            "source_port_id": "attach_bot" if below else "attach_top", "target_node_id": pool_id,
            "target_port_id": "attach_top" if below else "attach_bot"}

def closed(props, required=None):
    return {"type": "object", "properties": props, "required": list(required if required is not None else props),
            "additionalProperties": False}

def doc(kind, id, name, description, nodes, edges, icon=None, color=None, input_schema=None):
    value = {"schema_version": 1, "kind": kind, "id": id, "name": name, "description": description,
             "nodes": nodes, "edges": edges}
    if icon or color:
        value["presentation"] = {k: v for k, v in (("icon", icon), ("color", color)) if v}
    if input_schema is not None:
        value["input_schema"] = input_schema
    return value

def chain(*ids):
    return [flow(a, b) for a, b in zip(ids, ids[1:])]

def sub_entry(id, name, description, source, *, modes=("delegate",), output="summary", tools=None, disabled=()):
    return {"id": id, "name": name, "description": description, "source": source,
            "allowed_modes": list(modes), "output_mode": output, "memory_policy": "ephemeral",
            "parallel_safe": True, "allowed_tools": tools, "disabled_tools": list(disabled)}

def chat_agent_doc(id, name, prompt, *, json_schema=None, extra_outputs=()):
    """A one-Kernel Agent with an explicit model, as an embedded child or a saved Agent."""
    outputs = [res("message"), res("context")] + [res(n) for n in extra_outputs]
    end_rows = [bind("message", ref("kernel", "message"))] + [bind(n, ref("kernel", n)) for n in extra_outputs]
    return doc("agent", id, name, "", [
        start(["message"]),
        agent("kernel", name, [bind("message", ref("start", "message"))], outputs,
              kernel(prompt, json_schema=json_schema)),
        end(end_rows),
    ], chain("start", "kernel", "end"))


# ============================================================ Code sources

TEXT_STATS = r'''import re
from collections import Counter

STOP = {"the", "a", "an", "and", "or", "of", "to", "in", "is", "it", "for", "on", "with",
        "的", "了", "是", "在", "和", "也", "就", "都", "而", "及"}


def main(input, context):
    text = input["text"]
    if not isinstance(text, str) or not text.strip():
        # Deliberate error path: an empty text is refused with a readable reason.
        raise ValueError("text 不能为空：请至少输入一句话")
    top_n = int(input["top_n"])
    if top_n < 1 or top_n > 50:
        raise ValueError("top_n 必须在 1 到 50 之间")
    cjk = re.findall(r"[一-鿿]", text)
    words = [w.lower() for w in re.findall(r"[A-Za-z][A-Za-z'-]+", text)]
    # Chinese has no spaces: count two-character terms inside each run of Han characters.
    bigrams = [run[i:i + 2] for run in re.findall(r"[一-鿿]+", text) for i in range(len(run) - 1)]
    tokens = [t for t in words + bigrams if t not in STOP and not any(ch in STOP for ch in t)]
    sentences = [s for s in re.split(r"[。！？!?.\n]+", text) if s.strip()]
    letters = len(cjk) + sum(len(w) for w in words)
    language = "zh" if letters and len(cjk) / letters > 0.3 else "en"
    return {
        "chars": len(text),
        "words": len(words) + len(cjk),
        "sentences": len(sentences),
        "language": language,
        "top_terms": [term for term, _ in Counter(tokens).most_common(top_n)],
    }
'''

TICKET_SCORE = r'''import re

RULES = {
    "billing": ["refund", "invoice", "charge", "退款", "发票", "扣费", "账单", "付款"],
    "bug": ["error", "crash", "bug", "broken", "报错", "崩溃", "闪退", "无法", "打不开"],
    "feature": ["feature", "support for", "would be nice", "希望", "建议", "能不能", "新增"],
}
URGENT = ["urgent", "asap", "immediately", "紧急", "马上", "尽快", "生产环境", "全部用户"]


def main(input, context):
    title = input["title"].strip()
    body = input["body"].strip()
    tier = (input["customer_tier"] or "standard").lower()
    amount = float(input["amount"] or 0)
    text = (title + "\n" + body).lower()
    hits = {name: sum(word in text for word in words) for name, words in RULES.items()}
    category = max(hits, key=hits.get) if max(hits.values()) > 0 else "other"
    signals = [f"{name}:{count}" for name, count in hits.items() if count]
    score = 20 + 15 * hits.get(category, 0)
    if any(word in text for word in URGENT):
        score += 30
        signals.append("urgent")
    if tier == "enterprise":
        score += 20
        signals.append("enterprise")
    if amount >= 1000:
        score += 15
        signals.append("amount>=1000")
    if re.search(r"!{2,}|！{2,}", title + body):
        score += 5
    return {"category": category, "priority_score": min(score, 100), "signals": signals, "tier": tier}
'''

ROUTE_BILLING = r'''def main(input, context):
    amount = float(input["amount"] or 0)
    team = "finance-senior" if amount >= 1000 else "finance"
    return {"team": team, "sla_hours": 4 if amount >= 1000 else 24,
            "next_step": "核对订单与扣款记录，确认是否走退款流程"}
'''

ROUTE_BUG = r'''def main(input, context):
    score = int(input["priority_score"])
    return {"team": "engineering-oncall" if score >= 70 else "engineering",
            "sla_hours": 2 if score >= 70 else 48,
            "next_step": "收集版本号、复现步骤与日志，创建缺陷单"}
'''

ROUTE_FEATURE = r'''def main(input, context):
    return {"team": "product", "sla_hours": 120, "next_step": "记录需求并合并到需求池，回复用户已收到"}
'''

ROUTE_OTHER = r'''def main(input, context):
    return {"team": "support", "sla_hours": 24, "next_step": "人工阅读后再分类"}
'''

ESCALATE = r'''def main(input, context):
    reasons = list(input["signals"])
    return {"team": "escalation-desk", "sla_hours": 1,
            "next_step": "升级给值班主管：" + "、".join(reasons or ["高优先级"]),
            "original_team": input["team"]}
'''

PIPELINE_PREP = r'''def main(input, context):
    text = input["text"].strip()
    first_line = text.splitlines()[0] if text else ""
    title = first_line[:60] if len(first_line) <= 60 else first_line[:57] + "..."
    return {"title": title or "（无标题）", "body": text}
'''

PIPELINE_REPORT = r'''def main(input, context):
    escalated = input["team"] == "escalation-desk"
    lines = [
        f"分类：{input['category']}（优先级 {input['priority_score']}）",
        f"分派：{input['team']}，SLA {input['sla_hours']} 小时",
        f"下一步：{input['next_step']}",
        f"语言：{input['language']}，{input['words']} 词，关键词：{', '.join(input['top_terms'])}",
    ]
    return {"report": "\n".join(lines), "escalated": escalated}
'''

SKILL_DIGEST = r'''def main(input, context):
    content = input["content"]
    lines = content.splitlines()
    headings = [line.lstrip("#").strip() for line in lines if line.startswith("#")]
    body = [line for line in lines if line.strip() and not line.startswith("---")]
    limit = int(input["max_lines"])
    return {"skill": input["name"], "line_count": len(lines), "headings": headings,
            "preview": "\n".join(body[:limit])}
'''

SHELL_GUARD = r'''import re

DANGEROUS = [
    (r"\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r", "递归强制删除"),
    (r"\bsudo\b", "提权"),
    (r"curl[^|]*\|\s*(ba)?sh|wget[^|]*\|\s*(ba)?sh", "下载即执行"),
    (r"git\s+push\s+.*(--force|-f\b)", "强推"),
    (r"\bchmod\s+-R\s+777", "全局放权"),
    (r">\s*/dev/sd|mkfs|dd\s+if=", "写磁盘"),
]


def main(input, context):
    args = input["arguments"] or {}
    command = str(args.get("command") or args.get("cmd") or "")
    matched = [label for pattern, label in DANGEROUS if re.search(pattern, command)]
    return {"require_approval": bool(matched), "matched": matched}
'''

REDACT = r'''import json, re

PATTERNS = [
    (re.compile(r"sk-[A-Za-z0-9_-]{16,}"), "sk-***"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "AKIA***"),
    (re.compile(r"(?i)(password|passwd|secret|token)\s*[:=]\s*\S+"), r"\1=***"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"), "[私钥已隐去]"),
]


def scrub(value, counter):
    if isinstance(value, str):
        for pattern, replacement in PATTERNS:
            value, n = pattern.subn(replacement, value)
            counter[0] += n
        return value
    if isinstance(value, list):
        return [scrub(item, counter) for item in value]
    if isinstance(value, dict):
        return {key: scrub(item, counter) for key, item in value.items()}
    return value


def main(input, context):
    counter = [0]
    cleaned = scrub(input["visible_result"], counter)
    if counter[0]:
        cleaned = dict(cleaned)
        cleaned["redactions"] = counter[0]
    return {"result": cleaned}
'''

PICK_FILES = r'''def main(input, context):
    found = input["found"] or {}
    ok = bool(input["ok"])
    paths = []
    if isinstance(found, dict):
        for key in ("matches", "files", "paths", "results"):
            if isinstance(found.get(key), list):
                paths = [p if isinstance(p, str) else str(p.get("path", p)) for p in found[key]]
                break
    paths = sorted(paths, key=lambda p: (p.count("/"), len(p)))[:8]
    note = "工作区里找到的说明文档" if paths else (
        "没有列出文件（工具调用失败或工作区为空），请自行用 glob/read 查找" if not ok else "工作区里没有 Markdown 文件")
    return {"files": paths, "note": note}
'''

REPORT_WORDS = r'''def main(input, context):
    text = input["report"]
    sections = [line for line in text.splitlines() if line.startswith("#")]
    return {"report": text, "section_count": len(sections), "length": len(text)}
'''

FALLBACK_REPLY = r'''def main(input, context):
    return {"message": "这条消息没有归到账单、缺陷或使用问题。已转人工：" + input["summary"]}
'''

ROUTER_TO_TEXT = r'''def main(input, context):
    return {"message": (f"已转给 {input['team']}（SLA {input['sla_hours']} 小时）。"
                        f"下一步：{input['next_step']}")}
'''


# ============================================================ Workflows

def wf_text_stats():
    return doc("workflow", "qa-wf-text-stats", "QA · 文本统计",
        "最简 Workflow：一个 Code 节点做字数、句数、语言和高频词统计。text 为空会故意报错，用来测出错路径。",
        [start(["text", "top_n"]),
         code("stats", "统计文本", [bind("text", ref("start", "text")), bind("top_n", ref("start", "top_n"))],
              ["chars", "words", "sentences", "language", "top_terms"],
              closed({"chars": {"type": "integer"}, "words": {"type": "integer"},
                      "sentences": {"type": "integer"}, "language": {"type": "string"},
                      "top_terms": {"type": "array", "items": {"type": "string"}}}), TEXT_STATS),
         end([bind(n, ref("stats", n)) for n in ("chars", "words", "sentences", "language", "top_terms")])],
        chain("start", "stats", "end"), icon="bar_chart", color="#2563eb",
        input_schema={"type": "object", "additionalProperties": False, "required": ["text"],
            "description": "统计一段文本",
            "properties": {"text": {"type": "string", "description": "要统计的文本"},
                           "top_n": {"type": "integer", "description": "返回多少个高频词（1–50）", "default": 5}}})


ROUTE_SCHEMA = closed({"team": {"type": "string"}, "sla_hours": {"type": "integer"}, "next_step": {"type": "string"}})

def wf_ticket_router():
    branches = [("billing", "账单分派", ROUTE_BILLING, [bind("amount", ref("start", "amount"))]),
                ("bug", "缺陷分派", ROUTE_BUG, [bind("priority_score", ref("score", "priority_score"))]),
                ("feature", "需求分派", ROUTE_FEATURE, []),
                ("other", "其他分派", ROUTE_OTHER, [])]
    nodes = [start(["title", "body", "customer_tier", "amount"]),
        code("score", "关键词打分", [bind("title", ref("start", "title")), bind("body", ref("start", "body")),
             bind("customer_tier", ref("start", "customer_tier"), "default", "standard"),
             bind("amount", ref("start", "amount"), "null")],
             ["category", "priority_score", "signals", "tier"],
             closed({"category": {"type": "string"}, "priority_score": {"type": "integer"},
                     "signals": {"type": "array", "items": {"type": "string"}}, "tier": {"type": "string"}}),
             TICKET_SCORE),
        node("by_category", "switch_case", {"execution": {
            "inputs": [bind("category", ref("score", "category"))],
            "value": {"kind": "input", "path": ["category"]},
            "cases": [{"id": "case-billing", "value": "billing"}, {"id": "case-bug", "value": "bug"},
                      {"id": "case-feature", "value": "feature"}]}}, "按类别分流")]
    for key, label, text, inputs in branches:
        nodes.append(code("route_" + key, label, inputs, ["team", "sla_hours", "next_step"], ROUTE_SCHEMA, text))
    branch_ids = ["route_" + key for key, *_ in branches]
    pick = lambda field: first(*[ref(b, field) for b in branch_ids])
    nodes.append(node("need_escalate", "if_else", {"execution": {
        "inputs": [bind("score", ref("score", "priority_score")), bind("tier", ref("score", "tier")),
                   bind("category", ref("score", "category"))],
        "condition": {"kind": "any", "conditions": [
            {"kind": "compare", "operator": "gte", "left": {"kind": "input", "path": ["score"]},
             "right": {"kind": "literal", "value": 90}},
            {"kind": "all", "conditions": [
                {"kind": "compare", "operator": "eq", "left": {"kind": "input", "path": ["tier"]},
                 "right": {"kind": "literal", "value": "enterprise"}},
                {"kind": "compare", "operator": "ne", "left": {"kind": "input", "path": ["category"]},
                 "right": {"kind": "literal", "value": "feature"}}]}]}}}, "是否升级"))
    nodes.append(code("escalate", "升级值班主管",
        [bind("signals", ref("score", "signals")), bind("team", pick("team"))],
        ["team", "sla_hours", "next_step", "original_team"],
        closed({"team": {"type": "string"}, "sla_hours": {"type": "integer"}, "next_step": {"type": "string"},
                "original_team": {"type": "string"}}), ESCALATE))
    final = lambda field: first(ref("escalate", field), *[ref(b, field) for b in branch_ids])
    nodes.append(end([bind("category", ref("score", "category")),
                      bind("priority_score", ref("score", "priority_score")),
                      bind("team", final("team")), bind("sla_hours", final("sla_hours")),
                      bind("next_step", final("next_step")),
                      bind("escalated_from", ref("escalate", "original_team"), "null")]))
    edges = [flow("start", "score"), flow("score", "by_category")]
    for key, case in (("billing", "case-billing"), ("bug", "case-bug"), ("feature", "case-feature"), ("other", "default")):
        edges += [flow("by_category", "route_" + key, case), flow("route_" + key, "need_escalate")]
    edges += [flow("need_escalate", "escalate", "true"), flow("need_escalate", "end", "false"), flow("escalate", "end")]
    return doc("workflow", "qa-wf-ticket-router", "QA · 工单分级路由",
        "纯规则路由：关键词打分 → Switch 四路分派（含 default）→ If/Else（any/all 组合条件）决定是否升级，"
        "End 用 first_present 汇合各分支。可选参数测默认值与 null。", nodes, edges, icon="target", color="#d97706",
        input_schema={"type": "object", "additionalProperties": False, "required": ["title", "body"],
            "properties": {"title": {"type": "string", "description": "工单标题"},
                           "body": {"type": "string", "description": "工单正文"},
                           "customer_tier": {"type": "string", "description": "standard / pro / enterprise",
                                             "default": "standard"},
                           "amount": {"type": "number", "description": "涉及金额，无则 0", "default": 0}}})


def wf_support_pipeline():
    nodes = [start(["text", "customer_tier"]),
        wf_call("stats", "调用：文本统计", "qa-wf-text-stats",
                [bind("text", ref("start", "text")), bind("top_n", lit(3))],
                ["words", "language", "top_terms"]),
        code("prep", "拆出标题与正文", [bind("text", ref("start", "text"))], ["title", "body"],
             closed({"title": {"type": "string"}, "body": {"type": "string"}}), PIPELINE_PREP),
        wf_call("route", "调用：工单分级路由", "qa-wf-ticket-router",
                [bind("title", ref("prep", "title")), bind("body", ref("prep", "body")),
                 bind("customer_tier", ref("start", "customer_tier"))],
                ["category", "priority_score", "team", "sla_hours", "next_step"]),
        code("report", "汇总报告",
             [bind(n, ref("route", n)) for n in ("category", "priority_score", "team", "sla_hours", "next_step")]
             + [bind(n, ref("stats", n)) for n in ("words", "language", "top_terms")],
             ["report", "escalated"],
             closed({"report": {"type": "string"}, "escalated": {"type": "boolean"}}), PIPELINE_REPORT),
        end([bind("report", ref("report", "report")), bind("escalated", ref("report", "escalated")),
             bind("category", ref("route", "category")), bind("team", ref("route", "team")),
             bind("next_step", ref("route", "next_step")), bind("language", ref("stats", "language"))])]
    return doc("workflow", "qa-wf-support-pipeline", "QA · 客服预处理流水线",
        "嵌套 Workflow：先后用 Workflow Call 调用「文本统计」和「工单分级路由」，再由 Code 汇总。"
        "被客服总台 Agent 再调用一层，形成三层嵌套。", nodes,
        chain("start", "stats", "prep", "route", "report", "end"), icon="data", color="#7c3aed",
        input_schema={"type": "object", "additionalProperties": False, "required": ["text"],
            "properties": {"text": {"type": "string", "description": "用户原始消息"},
                           "customer_tier": {"type": "string", "default": "standard",
                                             "description": "standard / pro / enterprise"}}})


def wf_skill_digest():
    nodes = [start(["max_lines"]),
        node("skill", "skill_read", {"skill": dict(SKILL), "execution": {"inputs": [],
             "outputs": [res("content"), res("name")]}}, "读取技能"),
        code("digest", "提取标题与预览", [bind("content", ref("skill", "content")), bind("name", ref("skill", "name")),
             bind("max_lines", ref("start", "max_lines"))], ["skill", "line_count", "headings", "preview"],
             closed({"skill": {"type": "string"}, "line_count": {"type": "integer"},
                     "headings": {"type": "array", "items": {"type": "string"}}, "preview": {"type": "string"}}),
             SKILL_DIGEST),
        end([bind(n, ref("digest", n)) for n in ("skill", "line_count", "headings", "preview")])]
    return doc("workflow", "qa-wf-skill-digest", "QA · 读取技能摘要",
        "Skill Read → Code：读取 ~/.agents/skills/workflow-test-notes 并提取标题和前几行。"
        "技能被删或改名时会走 skill_unavailable 出错路径。", nodes, chain("start", "skill", "digest", "end"),
        icon="book_open", color="#059669",
        input_schema={"type": "object", "additionalProperties": False, "required": [],
            "properties": {"max_lines": {"type": "integer", "default": 12, "description": "预览行数"}}})


def wf_shell_guard():
    nodes = [start(["event", "tool_name", "arguments"]),
        code("inspect", "检查危险命令", [bind("arguments", ref("start", "arguments"), "default", {})],
             ["require_approval", "matched"],
             closed({"require_approval": {"type": "boolean"}, "matched": {"type": "array", "items": {"type": "string"}}}),
             SHELL_GUARD, timeout_ms=5000),
        end([bind("decision", lit("continue")), bind("require_approval", ref("inspect", "require_approval")),
             bind("arguments", ref("start", "arguments"))])]
    return doc("workflow", "qa-hook-shell-guard", "QA · Hook：危险命令需审批",
        "before_tool_call Hook（已发布、被引用）：rm -rf、sudo、curl|sh、强推等命令强制弹审批，其余直接放行。",
        nodes, chain("start", "inspect", "end"), icon="shield", color="#dc2626")


# ============================================================ Embedded hook bodies

def hook_redact_body():
    nodes = [start(["event", "tool_name", "visible_result"]),
        code("redact", "隐去密钥", [bind("visible_result", ref("start", "visible_result"), "default", {})], ["result"],
             closed({"result": {"type": "object"}}), REDACT, timeout_ms=5000),
        end([bind("decision", lit("replace")), bind("result", ref("redact", "result"))])]
    return doc("workflow", "qa-hook-redact", "Hook：结果脱敏", "", nodes, chain("start", "redact", "end"))


def hook_block_writes_body():
    nodes = [start(["tool_name"]),
        end([bind("decision", lit("block")),
             bind("reason", lit("这是只读审查 Agent：写文件被 Hook 拦截。请把建议写在回复里。"))])]
    return doc("workflow", "qa-hook-block-writes", "Hook：禁止写文件", "", nodes, chain("start", "end"))


def hook_disabled_body():
    nodes = [start([]), end([bind("decision", lit("block")), bind("reason", lit("这个 Hook 是关着的，不应该触发"))])]
    return doc("workflow", "qa-hook-disabled", "Hook：已停用（不应触发）", "", nodes, chain("start", "end"))


# ============================================================ Agents

def agent_plain():
    nodes = [start(["message"]),
        agent("agent", "助手", [bind("message", ref("start", "message"))], [res("message"), res("context")],
              draft={"prompt": "你是简洁的中文助手。先给结论，再给最多三条要点。", "max_iterations": 4}),
        end([bind("message", ref("agent", "message"))])]
    return doc("agent", "qa-agent-plain", "QA · 随手问（最简）",
        "Start → Agent → End。Agent 不绑模型，测试时用 Test 面板里选的模型（未配置 Kernel 的兜底路径）。",
        nodes, chain("start", "agent", "end"), icon="chat", color="#0891b2")


def agent_polisher():
    value = chat_agent_doc("qa-agent-polisher", "QA · 中英润色",
        "你是双语编辑。用户给中文就润色中文并附一版英文；给英文就润色英文并附一版中文。"
        "只输出两段正文，不要解释。")
    value["description"] = "单 Kernel、显式绑定 gpt-4.1-mini。也被「调研主管」当作引用型子智能体（agent_ref）。"
    value["presentation"] = {"icon": "edit_pen", "color": "#db2777"}
    return value


TRIAGE_SCHEMA = closed({
    "category": {"type": "string", "description": "只能是 billing（账单退款）、bug（报错故障）、how_to（使用问题）、other 之一"},
    "urgency": {"type": "integer", "description": "紧急度，1 最低，5 最紧急"},
    "needs_human": {"type": "boolean", "description": "是否必须人工跟进"},
    "summary": {"type": "string", "description": "一句话概括用户诉求"},
    "tags": {"type": "array", "items": {"type": "string"}, "description": "最多 4 个关键词"},
})

def agent_ticket_triage():
    asks = ["category", "urgency", "needs_human", "summary", "tags"]
    nodes = [start(["message"], "用户消息"),
        agent("classify", "分诊（JSON 输出）", [bind("message", ref("start", "message"))],
              [res("message"), res("context")] + [res(a) for a in asks],
              kernel("你是客服分诊员。只根据用户消息判断类别、紧急度和是否需要人工，不要回答问题本身。",
                     max_iterations=2, output_tokens=1024, json_schema=TRIAGE_SCHEMA)),
        node("by_category", "switch_case", {"execution": {
            "inputs": [bind("category", ref("classify", "category"))],
            "value": {"kind": "input", "path": ["category"]},
            "cases": [{"id": "case-billing", "value": "billing"}, {"id": "case-bug", "value": "bug"},
                      {"id": "case-howto", "value": "how_to"}]}}, "按类别"),
        wf_call("billing_route", "账单：走路由 Workflow", "qa-wf-ticket-router",
                [bind("title", ref("classify", "summary")), bind("body", ref("start", "message")),
                 bind("customer_tier", lit("pro"))], ["team", "sla_hours", "next_step"]),
        code("billing_text", "转成回复", [bind(n, ref("billing_route", n)) for n in ("team", "sla_hours", "next_step")],
             ["message"], closed({"message": {"type": "string"}}), ROUTER_TO_TEXT),
        agent("bug_helper", "缺陷：引导复现",
              [bind("message", ref("start", "message")), bind("urgency", ref("classify", "urgency")),
               bind("tags", ref("classify", "tags"), "default", [])],
              [res("message"), res("context")],
              kernel("你是技术支持。紧急度 {{#input.urgency#}}/5。先安抚一句，再列出需要用户补充的复现信息"
                     "（版本、步骤、期望/实际、日志），最后给一个临时绕过办法（如果有）。")),
        agent("howto_helper", "使用问题：直接解答", [bind("message", ref("start", "message"))],
              [res("message"), res("context")],
              kernel("你是产品专家。用编号步骤回答使用问题，最后一句告诉用户如果还不行该提供什么信息。",
                     history="root")),
        code("fallback", "其他：转人工", [bind("summary", ref("classify", "summary"))], ["message"],
             closed({"message": {"type": "string"}}), FALLBACK_REPLY),
        node("human_check", "if_else", {"execution": {
            "inputs": [bind("needs_human", ref("classify", "needs_human")), bind("urgency", ref("classify", "urgency"))],
            "condition": {"kind": "any", "conditions": [
                {"kind": "compare", "operator": "eq", "left": {"kind": "input", "path": ["needs_human"]},
                 "right": {"kind": "literal", "value": True}},
                {"kind": "compare", "operator": "gte", "left": {"kind": "input", "path": ["urgency"]},
                 "right": {"kind": "literal", "value": 4}}]}}}, "需要人工？"),
        code("handoff_note", "附上人工跟进说明",
             [bind("summary", ref("classify", "summary")), bind("urgency", ref("classify", "urgency"))],
             ["note"], closed({"note": {"type": "string"}}),
             'def main(input, context):\n    return {"note": f"已标记人工跟进（紧急度 {input[\'urgency\']}/5）：{input[\'summary\']}"}\n'),
        end([bind("message", first(ref("billing_text", "message"), ref("bug_helper", "message"),
                                   ref("howto_helper", "message"), ref("fallback", "message"))),
             bind("category", ref("classify", "category")), bind("urgency", ref("classify", "urgency")),
             bind("handoff", ref("handoff_note", "note"), "default", "无需人工")])]
    edges = chain("start", "classify", "by_category") + [
        flow("by_category", "billing_route", "case-billing"), flow("billing_route", "billing_text"),
        flow("by_category", "bug_helper", "case-bug"), flow("by_category", "howto_helper", "case-howto"),
        flow("by_category", "fallback", "default")]
    for last in ("billing_text", "bug_helper", "howto_helper", "fallback"):
        edges.append(flow(last, "human_check"))
    edges += [flow("human_check", "handoff_note", "true"), flow("human_check", "end", "false"),
              flow("handoff_note", "end")]
    return doc("agent", "qa-agent-ticket-triage", "QA · 工单分诊",
        "JSON 输出（5 个 Ask 字段，含 enum/整数范围/布尔/数组）→ Switch 四路：账单走 Workflow Call，缺陷和使用问题各一个 Agent，"
        "其他走 Code → If/Else 决定是否附人工说明 → End 用 first_present 和 default 汇合。", nodes, edges,
        icon="briefcase", color="#ea580c")


def agent_code_reviewer():
    nodes = [start(["message"], "审查要求"),
        node("list_docs", "tool_call", {"tool": {"name": "glob", "on_error": "continue", "approval_timeout_ms": 600000},
             "execution": {"inputs": [bind("pattern", lit("**/*.md"))],
                           "outputs": [res("found", "result"), res("ok")]}}, "列出 Markdown（Tool Call）"),
        code("pick", "挑重点文件", [bind("found", ref("list_docs", "found"), "null"), bind("ok", ref("list_docs", "ok"))],
             ["files", "note"], closed({"files": {"type": "array", "items": {"type": "string"}}, "note": {"type": "string"}}),
             PICK_FILES),
        agent("reviewer", "审查员", [bind("message", ref("start", "message")), bind("files", ref("pick", "files")),
              bind("note", ref("pick", "note"))], [res("message"), res("context")],
              kernel("你是只读代码审查员，工作区就是被审查的仓库。{{#input.note#}}：先看这些文件，再按用户要求用 "
                     "read/grep/glob 深入。需要统计长文本时调用 workflow_text_stats 工具。可以用 shell 跑只读命令，"
                     "危险命令会被要求审批。不要写文件。输出：## 结论、## 问题（按严重度）、## 建议。",
                     max_iterations=16, output_tokens=8192, history="root")),
        node("tools", "toolkit_pool", {"toolkits": [{"id": "core", "enabled_tools": ["read", "grep", "glob", "shell", "write", "edit"]}],
             "merge_with_user_selected": False,
             "workflow_tools": [{"id": "text_stats", "workflow": {"workflow_id": "qa-wf-text-stats",
                                                                 "revision_id": "__ref:qa-wf-text-stats"}}]},
             "只读工具 + Workflow 工具"),
        node("hooks", "hooks_pool", {"hooks": [
            {"id": "shell-guard", "order": 10, "event": "before_tool_call", "tool_name": "shell",
             "workflow": {"workflow_id": "qa-hook-shell-guard", "revision_id": "__ref:qa-hook-shell-guard"},
             "force_approval": False, "enabled": True},
            {"id": "block-writes", "order": 20, "event": "before_tool_call", "tool_name": ["write", "edit"],
             "workflow": {"kind": "embedded", "document": hook_block_writes_body()}, "force_approval": False},
            {"id": "redact-secrets", "order": 30, "event": "after_tool_call", "tool_name": ["read", "grep", "shell"],
             "workflow": {"kind": "embedded", "document": hook_redact_body()}, "force_approval": False, "enabled": True},
            {"id": "never-runs", "order": 40, "event": "before_tool_call", "tool_name": None,
             "workflow": {"kind": "embedded", "document": hook_disabled_body()}, "force_approval": True, "enabled": False},
        ]}, "四个 Hook"),
        code("wrap", "统计报告", [bind("report", ref("reviewer", "message"))], ["report", "section_count", "length"],
             closed({"report": {"type": "string"}, "section_count": {"type": "integer"}, "length": {"type": "integer"}}),
             REPORT_WORDS),
        end([bind("message", ref("wrap", "report")), bind("section_count", ref("wrap", "section_count")),
             bind("files_seen", ref("pick", "files"))])]
    edges = chain("start", "list_docs", "pick", "reviewer", "wrap", "end") + [
        attach("reviewer", "tools", below=True), attach("reviewer", "hooks", below=False)]
    return doc("agent", "qa-agent-code-reviewer", "QA · 只读代码审查",
        "Tool Call（glob，失败继续）→ Code → 审查 Agent。Agent 挂 Toolkit Pool（core 六个工具 + 一个 Workflow 工具）"
        "和 Hooks Pool：引用型 shell 审批、内嵌的写文件拦截、内嵌的结果脱敏（after_tool_call）、一个已停用的 Hook。",
        nodes, edges, icon="code", color="#4f46e5")


CRITIC_SCHEMA = closed({
    "verdict": {"type": "string", "enum": ["solid", "needs_work", "unreliable"]},
    "issues": {"type": "array", "items": {"type": "string"}, "maxItems": 6},
    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
})

def agent_research_lead():
    fact_checker = chat_agent_doc("qa-sub-fact-checker", "事实核查员",
        "你只做一件事：把收到的论断逐条标注为「可证实 / 存疑 / 错误」，并说明依据。不要扩写。")
    researcher = doc("agent", "qa-sub-researcher", "资料检索员", "", [
        start(["message"]),
        agent("kernel", "资料检索员", [bind("message", ref("start", "message"))], [res("message"), res("context")],
              kernel("你是资料检索员。需要时用 web_fetch 读取公开网页（最多 3 个）。写下要点和来源链接；"
                     "把关键论断交给「事实核查员」核查后再汇报。", max_iterations=10)),
        node("web", "toolkit_pool", {"toolkits": [{"id": "core", "enabled_tools": ["web_fetch"]}],
                                     "merge_with_user_selected": False}, "联网"),
        node("pool", "subagent_pool", {"subagents": [sub_entry("fact-checker", "事实核查员",
             "逐条核查论断的真伪", {"kind": "embedded", "document": fact_checker}, output="last_message")]},
             "二级子智能体"),
        end([bind("message", ref("kernel", "message"))]),
    ], chain("start", "kernel", "end") + [attach("kernel", "web"), attach("kernel", "pool", below=False)])
    critic = chat_agent_doc("qa-sub-critic", "批判审稿人",
        "你是严格的审稿人。指出草稿中的逻辑漏洞、证据不足和遗漏的反方观点。给出整体判断。",
        json_schema=CRITIC_SCHEMA, extra_outputs=("verdict", "issues", "confidence"))
    nodes = [start(["message"], "调研题目"),
        agent("lead", "调研主管", [bind("message", ref("start", "message"))], [res("message"), res("context")],
              kernel("你是调研主管。流程：1) 把题目拆成 2–3 个子问题，交给「资料检索员」；2) 汇总成草稿；"
                     "3) 把草稿交给「批判审稿人」；4) 根据意见修改；5) 最终稿交给「中英润色」得到双语版本。"
                     "最终输出 Markdown：# 标题、## 结论、## 依据（附来源）、## 争议点、## English version。",
                     max_iterations=20, output_tokens=8192, history="root")),
        node("team", "subagent_pool", {"subagents": [
            sub_entry("researcher", "资料检索员", "联网查资料，并会再委派事实核查员",
                      {"kind": "embedded", "document": researcher}, output="summary"),
            sub_entry("critic", "批判审稿人", "审稿并给出 JSON 结论（verdict/issues/confidence）",
                      {"kind": "embedded", "document": critic}, output="full_trace", modes=("delegate", "worker")),
            sub_entry("polisher", "中英润色", "把定稿润色成中英双语（引用已保存的 Agent）",
                      {"kind": "agent_ref", "agent_id": "qa-agent-polisher"}, output="last_message"),
        ]}, "三人小组"),
        code("wrap", "统计报告", [bind("report", ref("lead", "message"))], ["report", "section_count", "length"],
             closed({"report": {"type": "string"}, "section_count": {"type": "integer"}, "length": {"type": "integer"}}),
             REPORT_WORDS),
        end([bind("message", ref("wrap", "report")), bind("section_count", ref("wrap", "section_count")),
             bind("length", ref("wrap", "length"))])]
    return doc("agent", "qa-agent-research-lead", "QA · 调研主管（多子智能体）",
        "Subagent Pool 三个成员：内嵌「资料检索员」（自带联网 Toolkit 和二级子智能体「事实核查员」）、"
        "内嵌「批判审稿人」（JSON 输出）、引用已保存的「中英润色」。三种 output_mode 都用到。",
        nodes, chain("start", "lead", "wrap", "end") + [attach("lead", "team")], icon="search", color="#0d9488")


def agent_support_desk():
    refund_expert = chat_agent_doc("qa-sub-refund-expert", "退款政策专家",
        "你熟悉常见 SaaS 退款政策：14 天内无理由退款，年付按剩余月份折算，已用量超 80% 不退。"
        "根据案情给出是否可退、可退金额的计算方式和需要的材料。")
    nodes = [start(["message"], "用户消息"),
        wf_call("pipeline", "预处理流水线（三层嵌套）", "qa-wf-support-pipeline",
                [bind("text", ref("start", "message")), bind("customer_tier", lit("pro"))],
                ["report", "escalated", "category", "team", "next_step", "language"]),
        node("escalated", "if_else", {"execution": {
            "inputs": [bind("escalated", ref("pipeline", "escalated"))],
            "condition": {"kind": "compare", "operator": "eq", "left": {"kind": "input", "path": ["escalated"]},
                          "right": {"kind": "literal", "value": True}}}}, "已升级？"),
        agent("senior", "升级处理", [bind("message", ref("start", "message")), bind("report", ref("pipeline", "report"))],
              [res("message"), res("context")],
              kernel("你是客服主管，这单已升级。内部分析：\n{{#input.report#}}\n"
                     "涉及退款就先问「退款政策专家」。需要重新核对分派时调用 workflow_reroute。"
                     "回复要包含：致歉、已采取的动作、预计时间、需要用户提供的信息。", max_iterations=10, history="root")),
        node("senior_pool", "subagent_pool", {"subagents": [sub_entry("refund", "退款政策专家", "判断能否退款及金额",
             {"kind": "embedded", "document": refund_expert}, output="last_message")]}, "专家"),
        node("senior_tools", "toolkit_pool", {"toolkits": [], "merge_with_user_selected": False,
             "workflow_tools": [{"id": "reroute", "workflow": {"workflow_id": "qa-wf-ticket-router",
                                                              "revision_id": "__ref:qa-wf-ticket-router"}}]},
             "Workflow 工具：重新路由"),
        node("playbook", "skill_read", {"skill": dict(SKILL), "execution": {"inputs": [],
             "outputs": [res("content")]}}, "读取话术技能"),
        agent("standard", "标准回复", [bind("message", ref("start", "message")),
              bind("playbook", ref("playbook", "content"), "default", "（没有读到话术）"),
              bind("team", ref("pipeline", "team")), bind("next_step", ref("pipeline", "next_step"))],
              [res("message"), res("context")],
              kernel("按下面的话术回复用户：\n{{#input.playbook#}}\n该单分派给 {{#input.team#}}，下一步：{{#input.next_step#}}。"
                     "语气友好，三段以内。", max_iterations=3, history="root")),
        end([bind("message", first(ref("senior", "message"), ref("standard", "message"))),
             bind("internal_report", ref("pipeline", "report")),
             bind("senior_model", ref("senior", "context", "model"), "null")])]
    edges = chain("start", "pipeline", "escalated") + [
        flow("escalated", "senior", "true"), flow("escalated", "playbook", "false"),
        flow("playbook", "standard"), flow("senior", "end"), flow("standard", "end"),
        attach("senior", "senior_pool"), attach("senior", "senior_tools", below=False)]
    return doc("agent", "qa-agent-support-desk", "QA · 客服总台（综合）",
        "Workflow Call 调「客服预处理流水线」（其内再调两个 Workflow，共三层）→ If/Else：升级单走带子智能体和 "
        "Workflow 工具的主管 Agent；普通单先 Skill Read 读话术再回复。End 汇合两条路径。",
        nodes, edges, icon="phone", color="#16a34a")


WORKFLOWS = [wf_text_stats, wf_ticket_router, wf_shell_guard, wf_skill_digest, wf_support_pipeline]
AGENTS = [agent_plain, agent_polisher, agent_ticket_triage, agent_code_reviewer, agent_research_lead, agent_support_desk]
