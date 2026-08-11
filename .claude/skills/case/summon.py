#!/usr/bin/env python3
"""为当前一个 Quorum owner 路由做机械边界检查。

用法：
  python3 .claude/skills/case/summon.py lead <motion|proposal> <材料文件> [...]
  python3 .claude/skills/case/summon.py handoff <current-owner> <交棒请求文件> [...]

本工具只比较材料中已经出现的路径与 owner charter。它不建立 roster，不推荐
Expert/POV/Dimension/程序角色，也不授予参与或访问权限。语义型责任必须由
Speaker 对照核心问题和 charter 人工判断。历史解析缺陷见法典 adaptations.md A-010。
"""

import collections
import pathlib
import re
import subprocess
import sys


REPO = pathlib.Path(__file__).resolve().parents[3]
AGENTS = REPO / ".claude/agents"
SIBLING = {"unchain": pathlib.Path("/Users/red/Desktop/GITRepo/unchain")}

# A-009 明确没有路径 owner 的范围；未命中这些路径不构成 owner 覆盖缺口。
EXEMPT = re.compile(
    r"^(docs/|\.claude/agents/|\.claude/skills/|README|CONTRIBUTING|LICENSE"
    r"|NOTICE|AGENTS\.md|CLAUDE\.md|\.gitignore|\.gitattributes|\.python-version)"
)


def glob_to_re(glob):
    out, index = "", 0
    while index < len(glob):
        if glob.startswith("**/", index):
            out += "(?:.*/)?"
            index += 3
        elif glob.startswith("**", index):
            out += ".*"
            index += 2
        elif glob[index] == "*":
            out += "[^/]*"
            index += 1
        else:
            out += re.escape(glob[index])
            index += 1
    return re.compile("^" + out + "$")


def load_charters():
    """读取 ownership boundary 段中的第一个 fenced block。"""
    path_owners = {}
    known_agents = set()
    for charter in sorted(AGENTS.rglob("*.md")):
        text = charter.read_text()
        name_match = re.search(r'^name:\s*"?([^"\n]+)"?', text, re.M)
        if not name_match:
            continue
        name = name_match.group(1).strip()
        known_agents.add(name)
        boundary = re.search(r"## 所有权边界声明.*?```\n(.*?)```", text, re.S)
        if not boundary or not name.startswith(("code-owner", "knowledge-owner", "codex")):
            continue

        patterns = []
        for line in (item.strip() for item in boundary.group(1).splitlines() if item.strip()):
            head = line.split(":", 1)[0]
            if head in ("pupu", "unchain"):
                repo_name, glob = head, line.split(":", 1)[1]
            else:
                repo_name, glob = "pupu", line
            patterns.append((repo_name, glob_to_re(glob), line))
        path_owners[name] = patterns
    return path_owners, known_agents


def tracked(repo_path):
    result = subprocess.run(
        ["git", "-C", str(repo_path), "ls-files"],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout.split()


def extract(texts):
    """抽取显式仓库路径、常见路径和裸文件名。"""
    blob = "\n".join(texts)
    explicit = {
        (repo_name, path.strip("`.,;)"))
        for repo_name, path in re.findall(r"\b(pupu|unchain):([\w./*-]+)", blob)
    }
    pathish = {
        path.strip("`.,;)")
        for path in re.findall(
            r"(?:src|electron|unchain_runtime|docs|e2e|scripts|public)/[\w./*-]+",
            blob,
        )
    }
    pathish.update(
        path.strip("`.,;)")
        for path in re.findall(r"`([\w./-]+/[\w./*-]+)`", blob)
    )
    bare = {
        name
        for name in re.findall(
            r"\b([\w][\w.-]*\.(?:js|cjs|mjs|py|json|toml|md|sqlite3))\b",
            blob,
        )
        if "/" not in name
    }
    return explicit, pathish, bare


def resolve_paths(texts):
    explicit, pathish, bare = extract(texts)
    files = {"pupu": tracked(REPO)}
    for repo_name, repo_path in SIBLING.items():
        if repo_path.exists():
            files[repo_name] = tracked(repo_path)

    by_basename = collections.defaultdict(list)
    for repo_name, paths in files.items():
        for path in paths:
            by_basename[pathlib.PurePath(path).name].append((repo_name, path))

    resolved = set(explicit)
    ambiguous = {}
    for name in bare:
        hits = by_basename.get(name, [])
        if len(hits) > 1:
            ambiguous[name] = hits
        resolved.update(hits)
    for path in pathish:
        repo_name = "unchain" if path.startswith(("src/unchain/", "unchain_runtime/")) else "pupu"
        resolved.add((repo_name, path))
    return resolved, ambiguous


def route(resolved, path_owners, excluded_owner=None):
    hits = collections.defaultdict(set)
    unmatched = []
    for repo_name, path in sorted(resolved):
        matched = False
        for owner, patterns in path_owners.items():
            if owner == excluded_owner:
                continue
            if any(repo == repo_name and regex.match(path) for repo, regex, _ in patterns):
                hits[owner].add(f"{repo_name}:{path}")
                matched = True
        if not matched and not EXEMPT.match(path):
            unmatched.append(f"{repo_name}:{path}")
    return hits, unmatched


def print_route(mode, context, hits, unmatched, ambiguous):
    print(f"=== 当前 owner 路由检查 · {mode} · {context} ===")
    if not hits:
        print("没有可用的机械路径边界命中。")
        print("Speaker 必须按核心问题选择当前一个 owner，并记录不确定性；不要扩展成候选名单。")
    else:
        best_score = max(len(paths) for paths in hits.values())
        best = sorted(owner for owner, paths in hits.items() if len(paths) == best_score)
        if len(best) == 1:
            owner = best[0]
            examples = ", ".join(sorted(hits[owner])[:3])
            print(f"机械建议：{owner}")
            print(f"依据：{best_score} 个显式路径命中；例如 {examples}")
        else:
            print("机械结果并列；Speaker 仍须按核心问题只选一个：")
            for owner in best:
                examples = ", ".join(sorted(hits[owner])[:2])
                print(f"  {owner}: {best_score} 个命中；例如 {examples}")

    if ambiguous:
        print(f"裸文件名存在 {len(ambiguous)} 处多解；上面的匹配已保守计入全部真实路径。")
    if unmatched:
        print(f"发现 {len(unmatched)} 个非豁免路径未命中 path owner；这是覆盖不确定性，不是增员指令。")
        for path in unmatched[:8]:
            print(f"  {path}")
    print("本输出不批准 owner、不创建 HS/RP、不授予访问，也不推荐其他参与者。")


def main(argv):
    if len(argv) < 2 or argv[1] not in {"lead", "handoff"}:
        print(__doc__)
        return 2

    mode = argv[1]
    if mode == "lead":
        if len(argv) < 4 or argv[2] not in {"motion", "proposal"}:
            print(__doc__)
            return 2
        context = argv[2]
        excluded_owner = None
        material_paths = argv[3:]
    else:
        if len(argv) < 4:
            print(__doc__)
            return 2
        context = argv[2]
        excluded_owner = argv[2]
        material_paths = argv[3:]

    try:
        texts = [pathlib.Path(path).read_text() for path in material_paths]
    except OSError as error:
        print(f"无法读取材料：{error}", file=sys.stderr)
        return 2

    path_owners, known_agents = load_charters()
    if excluded_owner and excluded_owner not in known_agents:
        print(f"未知 current owner：{excluded_owner}", file=sys.stderr)
        return 2


    resolved, ambiguous = resolve_paths(texts)
    hits, unmatched = route(resolved, path_owners, excluded_owner)
    print_route(mode, context, hits, unmatched, ambiguous)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
