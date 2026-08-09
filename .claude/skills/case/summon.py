#!/usr/bin/env python3
"""参与候选发现 · 实体抽取与边界匹配

用法:  python3 .claude/skills/case/summon.py <议案依据文件> [更多文件...]

产出参与候选与覆盖缺口草案。**它不批准任何人出庭**：所有初始参与者及后续
agent / role instance 都须由 `Chief Judge` 明示批准。本工具的历史失败记录见
法典 adaptations.md A-010。

已修复的三类静默漏人（每条都真实发生过，改动前先读）:

  1. 围栏须紧邻标题        -> 丢掉 6 个 Expert 中的 5 个（case 0000-0001）
  2. 只收含 "/" 的字符串   -> 丢掉 code-owner-settings 两次（case 0000-0001、0000-0002）
  3. 概念名无法命中 glob   -> 丢掉 shared-arteries / agents / electron（case 0000-0002）
"""
import re, sys, subprocess, pathlib, collections

REPO = pathlib.Path(__file__).resolve().parents[3]
AGENTS = REPO / ".claude/agents"
SIBLING = {"unchain": pathlib.Path("/Users/red/Desktop/GITRepo/unchain")}

# A-009 显式无 owner，未命中它们不构成候选遗漏
EXEMPT = re.compile(r"^(docs/|\.claude/agents/|\.claude/skills/|README|CONTRIBUTING|LICENSE"
                    r"|NOTICE|AGENTS\.md|CLAUDE\.md|\.gitignore|\.gitattributes|\.python-version)")


def glob_to_re(g):
    out, i = "", 0
    while i < len(g):
        if g.startswith("**/", i):  out += "(?:.*/)?"; i += 3
        elif g.startswith("**", i): out += ".*";       i += 2
        elif g[i] == "*":           out += "[^/]*";    i += 1
        else:                       out += re.escape(g[i]); i += 1
    return re.compile("^" + out + "$")


def load_charters():
    """A-010: 边界正文是「所有权边界声明」段内**第一个** fenced block，不要求紧邻标题。"""
    path_owners, trigger_owners, other = {}, {}, {}
    for f in sorted(AGENTS.rglob("*.md")):
        t = f.read_text()
        name = re.search(r'^name:\s*"?([^"\n]+)"?', t, re.M).group(1).strip()
        m = re.search(r"## 所有权边界声明.*?```\n(.*?)```", t, re.S)
        if not m:
            other[name] = ("无边界声明段", t)
            continue
        lines = [l.strip() for l in m.group(1).splitlines() if l.strip()]
        if name.startswith(("code-owner", "knowledge-owner", "codex")):
            pats = []
            for l in lines:
                head = l.split(":", 1)[0]
                repo, g = (head, l.split(":", 1)[1]) if head in ("pupu", "unchain") else ("pupu", l)
                pats.append((repo, glob_to_re(g), l))
            path_owners[name] = (pats, t)
        else:
            trigger_owners[name] = (lines, t)
    return path_owners, trigger_owners, other


def tracked(repo_path):
    out = subprocess.run(["git", "-C", str(repo_path), "ls-files"],
                         capture_output=True, text=True).stdout.split()
    return [p for p in out if p]


def extract(texts):
    """三类实体分别抽取。裸文件名与概念名是 A-010 两次漏人的直接原因。"""
    blob = "\n".join(texts)
    pathish = set()
    for e in re.findall(r"(?:src|electron|unchain_runtime|docs|e2e|scripts|public)/[\w./*-]+", blob):
        pathish.add(e.strip("`.,;)"))
    for e in re.findall(r"`([\w./-]+/[\w./*-]+)`", blob):
        pathish.add(e.strip("`.,;)"))
    bare = set()          # <- 修复 2：裸文件名
    for e in re.findall(r"\b([\w][\w.-]*\.(?:js|cjs|mjs|py|json|toml|md|sqlite3))\b", blob):
        if "/" not in e:
            bare.add(e)
    concept = set()       # <- 修复 3：概念名/符号名，只能给候选
    for e in re.findall(r"`([A-Za-z_][\w]{3,})`", blob):
        concept.add(e)
    return pathish, bare, concept


def main(argv):
    if len(argv) < 2:
        print(__doc__); return 2
    texts = [pathlib.Path(a).read_text() for a in argv[1:]]
    path_owners, trigger_owners, other = load_charters()
    pathish, bare, concept = extract(texts)

    files = {"pupu": tracked(REPO)}
    for k, p in SIBLING.items():
        if p.exists():
            files[k] = tracked(p)
    by_base = collections.defaultdict(list)
    for repo, fl in files.items():
        for p in fl:
            by_base[pathlib.PurePath(p).name].append((repo, p))

    # 裸文件名 -> 真实路径（可能多解，全部保留并标注歧义）
    resolved, ambiguous = set(), {}
    for b in bare:
        hits = by_base.get(b, [])
        if len(hits) > 1:
            ambiguous[b] = hits
        for repo, p in hits:
            resolved.add((repo, p))
    for e in pathish:
        resolved.add(("unchain", e) if e.startswith("src/unchain/") else ("pupu", e))

    hit, unmatched = collections.defaultdict(set), []
    for repo, e in sorted(resolved):
        found = False
        for name, (pats, _) in path_owners.items():
            if any(r == repo and rx.match(e) for r, rx, _ in pats):
                hit[name].add(f"{repo}:{e}"); found = True
        if not found and not EXEMPT.match(e):
            unmatched.append(f"{repo}:{e}")

    # 概念名 -> 在 charter 正文里出现过谁 = 候选（人工确认，不自动入 roster）
    cand = collections.defaultdict(set)
    for c in concept:
        for name, payload in list(path_owners.items()) + list(trigger_owners.items()):
            body = payload[1]
            if re.search(r"\b" + re.escape(c) + r"\b", body) and name not in hit:
                cand[name].add(c)

    print(f"=== 参与候选 · 路径边界机械命中（{len(hit)} 人）===")
    for n in sorted(hit, key=lambda n: -len(hit[n])):
        print(f"  {n:32s} {len(hit[n]):3d} 处   e.g. {', '.join(sorted(hit[n])[:2])}")

    print(f"\n=== 触发条件类候选（{len(trigger_owners)} 个，须人工对照待裁问题）===")
    for n, (lines, _) in sorted(trigger_owners.items()):
        print(f"  {n}\n      {' | '.join(lines)}")

    if cand:
        print(f"\n=== 概念名候选（不自动入 roster，须逐个确认决策链接）===")
        for n in sorted(cand, key=lambda n: -len(cand[n]))[:10]:
            print(f"  {n:32s} <- {', '.join(sorted(cand[n])[:6])}")

    if ambiguous:
        print(f"\n=== 裸文件名歧义（同名多解，全部计入）===")
        for b, hs in sorted(ambiguous.items())[:10]:
            print(f"  {b} -> {', '.join(p for _, p in hs)}")

    print(f"\n=== 未命中任何路径 owner 且不在 A-009 豁免内（{len(unmatched)} 个覆盖候选）===")
    for u in sorted(unmatched)[:25]:
        print("   ", u)
    print("\n注意：以上全部只是候选，不产生出庭、交付或闭庭义务。")
    print("      只有命中获准 write_set / contract_set 或直接验收、回滚责任的项目，")
    print("      才应整理为 RP-### 或覆盖缺口并交 Chief Judge；背景提及不计。")
    print("      仓外实体（运行时数据目录、外部系统）本工具一律看不见。")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
