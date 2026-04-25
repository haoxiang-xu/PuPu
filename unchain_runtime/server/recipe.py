"""Recipe dataclasses + JSON parser for PuPu Agent Recipe system.

A Recipe is a named, user-composable agent configuration persisted as JSON
under ~/.pupu/agent_recipes/<Name>.recipe.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_\- ]{1,64}$")
_VALID_PROMPT_FORMATS = ("soul", "skeleton")
_VALID_SUBAGENT_KINDS = ("ref", "inline", "recipe_ref")
_VAR_REF_PATTERN = re.compile(r"\{\{#([^.}]+)\.([^#}]+)#\}\}")

BUILTIN_DEVELOPER_PROMPT_SENTINEL = "{{USE_BUILTIN_DEVELOPER_PROMPT}}"


class RecipeValidationError(ValueError):
    """Raised when JSON does not conform to the Recipe schema."""


@dataclass(frozen=True)
class RecipeAgent:
    prompt_format: Literal["soul", "skeleton"]
    prompt: str


@dataclass(frozen=True)
class ToolkitRef:
    id: str
    enabled_tools: tuple[str, ...] | None


@dataclass(frozen=True)
class SubagentRef:
    kind: Literal["ref"]
    template_name: str
    disabled_tools: tuple[str, ...]


@dataclass(frozen=True)
class RecipeSubagentRef:
    kind: Literal["recipe_ref"]
    recipe_name: str
    disabled_tools: tuple[str, ...]


@dataclass(frozen=True)
class InlineSubagent:
    kind: Literal["inline"]
    name: str
    prompt_format: Literal["soul", "skeleton"]
    template: dict
    disabled_tools: tuple[str, ...]


@dataclass(frozen=True)
class Recipe:
    name: str
    description: str
    model: str | None
    max_iterations: int | None
    agent: RecipeAgent
    toolkits: tuple[ToolkitRef, ...]
    subagent_pool: tuple[SubagentRef | RecipeSubagentRef | InlineSubagent, ...]
    merge_with_user_selected: bool = True
    nodes: tuple[dict, ...] = ()
    edges: tuple[dict, ...] = ()


def is_valid_recipe_name(name: str) -> bool:
    return isinstance(name, str) and bool(_NAME_PATTERN.match(name))


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise RecipeValidationError(msg)


def _as_str_tuple(value: Any, field: str) -> tuple[str, ...]:
    _require(isinstance(value, list), f"{field} must be a list")
    result: list[str] = []
    for item in value:
        _require(isinstance(item, str), f"{field}[] entries must be strings")
        result.append(item)
    return tuple(result)


def _normalize_node_type(node_type: Any) -> str:
    raw = str(node_type or "").strip()
    return "toolkit_pool" if raw == "toolpool" else raw


def _is_toolkit_pool_type(node_type: Any) -> bool:
    return _normalize_node_type(node_type) == "toolkit_pool"


def _port_kind(port_id: Any) -> str:
    port = str(port_id or "").strip()
    if port == "in":
        return "in"
    if port == "out":
        return "out"
    if port in {"attach_top", "attach_bot"}:
        return "attach"
    return ""


def _edge_kind(edge: dict) -> str:
    kind = edge.get("kind")
    if kind in {"flow", "attach"}:
        return kind
    if _port_kind(edge.get("source_port_id")) == "attach" or _port_kind(edge.get("target_port_id")) == "attach":
        return "attach"
    return "flow"


def _normalize_graph_nodes(raw_nodes: Any) -> tuple[dict, ...]:
    _require(isinstance(raw_nodes, list), "nodes must be a list")
    nodes: list[dict] = []
    seen: set[str] = set()
    for idx, raw in enumerate(raw_nodes):
        _require(isinstance(raw, dict), f"nodes[{idx}] must be an object")
        node_id = raw.get("id")
        _require(isinstance(node_id, str) and node_id, f"nodes[{idx}].id must be a non-empty string")
        _require(node_id not in seen, f"duplicate node id: {node_id}")
        seen.add(node_id)
        node = dict(raw)
        node["type"] = _normalize_node_type(node.get("type"))
        _require(node["type"] in {"start", "end", "agent", "toolkit_pool", "subagent_pool"}, f"nodes[{idx}].type is invalid")
        nodes.append(node)
    return tuple(nodes)


def _normalize_graph_edges(raw_edges: Any) -> tuple[dict, ...]:
    if raw_edges is None:
        raw_edges = []
    _require(isinstance(raw_edges, list), "edges must be a list")
    edges: list[dict] = []
    seen: set[str] = set()
    for idx, raw in enumerate(raw_edges):
        _require(isinstance(raw, dict), f"edges[{idx}] must be an object")
        edge_id = raw.get("id")
        _require(isinstance(edge_id, str) and edge_id, f"edges[{idx}].id must be a non-empty string")
        _require(edge_id not in seen, f"duplicate edge id: {edge_id}")
        seen.add(edge_id)
        edge = dict(raw)
        edge["kind"] = _edge_kind(edge)
        if edge["kind"] == "flow" and _port_kind(edge.get("source_port_id")) == "in" and _port_kind(edge.get("target_port_id")) == "out":
            edge["source_node_id"], edge["target_node_id"] = edge.get("target_node_id"), edge.get("source_node_id")
            edge["source_port_id"], edge["target_port_id"] = edge.get("target_port_id"), edge.get("source_port_id")
        edges.append(edge)
    return tuple(edges)


def _node_outputs(node: dict) -> tuple[dict, ...]:
    node_type = node.get("type")
    raw_outputs = node.get("outputs")
    if node_type == "start" and not raw_outputs:
        raw_outputs = [
            {"name": "text", "type": "string"},
            {"name": "images", "type": "image[]"},
            {"name": "files", "type": "file[]"},
        ]
    if node_type == "agent" and not raw_outputs:
        raw_outputs = [{"name": "output", "type": "string"}]
    if not isinstance(raw_outputs, list):
        return ()
    outputs: list[dict] = []
    for item in raw_outputs:
        if isinstance(item, dict) and isinstance(item.get("name"), str) and item.get("name"):
            outputs.append(dict(item))
    return tuple(outputs)


def _validate_graph_variables(agents: list[dict], start: dict, by_id: dict[str, dict]) -> None:
    upstream: dict[str, set[str]] = {
        str(start["id"]): {str(item.get("name")) for item in _node_outputs(start)}
    }
    for agent in agents:
        override = agent.get("override")
        prompt = ""
        if isinstance(override, dict):
            prompt = str(override.get("prompt") or "")
        for match in _VAR_REF_PATTERN.finditer(prompt):
            node_id, field = match.group(1), match.group(2)
            fields = upstream.get(node_id)
            _require(fields is not None, f"variable {{{{#{node_id}.{field}#}}}} is not upstream of {agent.get('id')}")
            _require(field in fields, f"variable {{{{#{node_id}.{field}#}}}} does not exist")
        upstream[str(agent["id"])] = {
            str(item.get("name")) for item in _node_outputs(by_id[str(agent["id"])])
        }


def validate_recipe_graph(nodes: tuple[dict, ...], edges: tuple[dict, ...]) -> None:
    if not nodes:
        return
    by_id = {str(node["id"]): node for node in nodes}
    starts = [n for n in nodes if n.get("type") == "start"]
    ends = [n for n in nodes if n.get("type") == "end"]
    agents_all = [n for n in nodes if n.get("type") == "agent"]
    _require(len(starts) == 1, "recipe graph must have exactly one start node")
    _require(len(ends) == 1, "recipe graph must have exactly one end node")
    _require(len(agents_all) >= 1, "recipe graph must have at least one agent node")

    outgoing: dict[str, dict] = {}
    incoming: dict[str, dict] = {}
    attached_plugins: set[str] = set()
    for edge in edges:
        source_id = str(edge.get("source_node_id") or "")
        target_id = str(edge.get("target_node_id") or "")
        _require(source_id in by_id and target_id in by_id, f"edge {edge.get('id')} references a missing node")
        source = by_id[source_id]
        target = by_id[target_id]
        if edge.get("kind") == "flow":
            _require(_port_kind(edge.get("source_port_id")) == "out" and _port_kind(edge.get("target_port_id")) == "in", f"flow edge {edge.get('id')} must connect out -> in")
            _require(source.get("type") in {"start", "agent"}, f"flow edge {edge.get('id')} cannot start at {source.get('type')}")
            _require(target.get("type") in {"agent", "end"}, f"flow edge {edge.get('id')} cannot target {target.get('type')}")
            _require(source_id not in outgoing, f"{source_id} has multiple flow outputs")
            _require(target_id not in incoming, f"{target_id} has multiple flow inputs")
            outgoing[source_id] = edge
            incoming[target_id] = edge
        elif edge.get("kind") == "attach":
            _require(_port_kind(edge.get("source_port_id")) == "attach" and _port_kind(edge.get("target_port_id")) == "attach", f"attach edge {edge.get('id')} must connect attach ports")
            source_is_agent = source.get("type") == "agent"
            target_is_agent = target.get("type") == "agent"
            source_is_plugin = _is_toolkit_pool_type(source.get("type")) or source.get("type") == "subagent_pool"
            target_is_plugin = _is_toolkit_pool_type(target.get("type")) or target.get("type") == "subagent_pool"
            _require((source_is_agent and target_is_plugin) or (target_is_agent and source_is_plugin), f"attach edge {edge.get('id')} must connect an agent to a pool")
            if source_is_plugin:
                attached_plugins.add(source_id)
            if target_is_plugin:
                attached_plugins.add(target_id)
        else:
            raise RecipeValidationError(f"edge {edge.get('id')} has invalid kind")

    start = starts[0]
    end = ends[0]
    _require(str(start["id"]) not in incoming, "start cannot have a flow input")
    _require(str(end["id"]) not in outgoing, "end cannot have a flow output")

    visited = {str(start["id"])}
    ordered_agents: list[dict] = []
    current = start
    while str(current["id"]) != str(end["id"]):
        edge = outgoing.get(str(current["id"]))
        _require(edge is not None, f"{current.get('id')} is not connected to end")
        next_id = str(edge.get("target_node_id") or "")
        _require(next_id not in visited, "recipe graph contains a flow cycle")
        visited.add(next_id)
        current = by_id[next_id]
        if current.get("type") == "agent":
            ordered_agents.append(current)

    for agent in agents_all:
        agent_id = str(agent["id"])
        _require(agent_id in visited, f"agent {agent_id} is disconnected from the main chain")
        _require(agent_id in incoming, f"agent {agent_id} is missing a flow input")
        _require(agent_id in outgoing, f"agent {agent_id} is missing a flow output")

    for node in nodes:
        node_id = str(node["id"])
        if _is_toolkit_pool_type(node.get("type")) or node.get("type") == "subagent_pool":
            _require(node_id in attached_plugins, f"{node_id} is not attached to any agent")

    _validate_graph_variables(ordered_agents, start, by_id)


def _parse_agent(data: Any) -> RecipeAgent:
    _require(isinstance(data, dict), "agent must be an object")
    prompt_format = data.get("prompt_format")
    _require(
        prompt_format in _VALID_PROMPT_FORMATS,
        f"agent.prompt_format must be one of {_VALID_PROMPT_FORMATS}",
    )
    prompt = data.get("prompt", "")
    _require(isinstance(prompt, str), "agent.prompt must be a string")
    return RecipeAgent(prompt_format=prompt_format, prompt=prompt)


def _parse_toolkit_ref(data: Any) -> ToolkitRef:
    _require(isinstance(data, dict), "toolkits[] entry must be an object")
    tid = data.get("id")
    _require(isinstance(tid, str) and tid, "toolkits[].id must be a non-empty string")
    enabled = data.get("enabled_tools", None)
    if enabled is None:
        return ToolkitRef(id=tid, enabled_tools=None)
    return ToolkitRef(id=tid, enabled_tools=_as_str_tuple(enabled, f"toolkits[{tid}].enabled_tools"))


def _parse_subagent_entry(data: Any) -> SubagentRef | RecipeSubagentRef | InlineSubagent:
    _require(isinstance(data, dict), "subagent_pool[] entry must be an object")
    kind = data.get("kind")
    _require(kind in _VALID_SUBAGENT_KINDS, f"subagent_pool[].kind must be one of {_VALID_SUBAGENT_KINDS}")
    disabled = _as_str_tuple(data.get("disabled_tools", []), "subagent_pool[].disabled_tools")
    if kind == "ref":
        tname = data.get("template_name")
        _require(isinstance(tname, str) and tname, "ref subagent requires template_name")
        return SubagentRef(kind="ref", template_name=tname, disabled_tools=disabled)
    if kind == "recipe_ref":
        rname = data.get("recipe_name")
        _require(isinstance(rname, str) and rname, "recipe_ref subagent requires recipe_name")
        _require(is_valid_recipe_name(rname), f"recipe_ref recipe_name invalid: {rname!r}")
        return RecipeSubagentRef(kind="recipe_ref", recipe_name=rname, disabled_tools=disabled)
    name = data.get("name")
    _require(isinstance(name, str) and name, "inline subagent requires name")
    pformat = data.get("prompt_format")
    _require(pformat in _VALID_PROMPT_FORMATS, "inline.prompt_format must be soul or skeleton")
    template = data.get("template")
    _require(isinstance(template, dict), "inline.template must be an object")
    return InlineSubagent(
        kind="inline",
        name=name,
        prompt_format=pformat,
        template=template,
        disabled_tools=disabled,
    )


def _projection_agent_from_graph(nodes: tuple[dict, ...]) -> dict:
    for node in nodes:
        if node.get("type") != "agent":
            continue
        override = node.get("override")
        if not isinstance(override, dict):
            override = {}
        prompt = override.get("prompt", "")
        prompt_format = override.get("prompt_format") or "soul"
        if prompt_format not in _VALID_PROMPT_FORMATS:
            prompt_format = "soul"
        return {
            "prompt_format": prompt_format,
            "prompt": prompt if isinstance(prompt, str) else str(prompt or ""),
        }
    return {"prompt_format": "soul", "prompt": ""}


def parse_recipe_json(data: Any) -> Recipe:
    """Parse a JSON-decoded dict into a Recipe. Raises RecipeValidationError on any violation."""
    _require(isinstance(data, dict), "recipe root must be an object")
    name = data.get("name")
    _require(is_valid_recipe_name(name), f"recipe name invalid: {name!r}")

    description = data.get("description", "")
    _require(isinstance(description, str), "description must be a string")

    model = data.get("model", None)
    _require(model is None or isinstance(model, str), "model must be a string or null")

    max_iter = data.get("max_iterations", None)
    if max_iter is not None:
        _require(isinstance(max_iter, int) and max_iter > 0, "max_iterations must be positive int or null")

    graph_nodes: tuple[dict, ...] = ()
    graph_edges: tuple[dict, ...] = ()
    if "nodes" in data:
        graph_nodes = _normalize_graph_nodes(data.get("nodes"))
        graph_edges = _normalize_graph_edges(data.get("edges", []))
        validate_recipe_graph(graph_nodes, graph_edges)

    agent_raw = data.get("agent")
    if agent_raw is None and graph_nodes:
        agent_raw = _projection_agent_from_graph(graph_nodes)
    agent = _parse_agent(agent_raw)

    toolkits_raw = data.get("toolkits", [])
    _require(isinstance(toolkits_raw, list), "toolkits must be a list")
    toolkits = tuple(_parse_toolkit_ref(tk) for tk in toolkits_raw)

    pool_raw = data.get("subagent_pool", [])
    _require(isinstance(pool_raw, list), "subagent_pool must be a list")
    pool = tuple(_parse_subagent_entry(entry) for entry in pool_raw)

    merge = data.get("merge_with_user_selected", True)
    _require(isinstance(merge, bool), "merge_with_user_selected must be a boolean")

    return Recipe(
        name=name,
        description=description,
        model=model,
        max_iterations=max_iter,
        agent=agent,
        toolkits=toolkits,
        subagent_pool=pool,
        merge_with_user_selected=merge,
        nodes=graph_nodes,
        edges=graph_edges,
    )
