from __future__ import annotations

import copy
import hashlib
import json
from typing import Any, Dict, List


def _clean_str(value: Any) -> str:
    return str(value or "").strip()


def _secret_key(secret: Any) -> str:
    if isinstance(secret, dict):
        return _clean_str(secret.get("key") or secret.get("name"))
    return _clean_str(secret)


def _recipe_material(entry: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "mcp": copy.deepcopy(entry.get("mcp") or {}),
        "secrets": [
            {"key": key}
            for key in (_secret_key(secret) for secret in (entry.get("secrets") or []))
            if key
        ],
        "auth": copy.deepcopy(entry.get("auth") or {}),
        "workspace": copy.deepcopy(entry.get("workspace") or {}),
        "tools": copy.deepcopy(entry.get("tools") or []),
        "policySummary": copy.deepcopy(entry.get("policy_summary") or entry.get("policySummary") or {}),
        "license": _clean_str(entry.get("license")),
        "sourceRepo": _clean_str(entry.get("source_repo") or entry.get("sourceRepo")),
        "docsUrl": _clean_str(entry.get("docs_url") or entry.get("docsUrl")),
    }


def recipe_hash_for_entry(entry: Dict[str, Any]) -> str:
    payload = json.dumps(
        _recipe_material(entry),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _risk_level(score: int) -> str:
    if score >= 75:
        return "critical"
    if score >= 50:
        return "high"
    if score >= 25:
        return "medium"
    return "low"


def _append_group(groups: List[Dict[str, Any]], kind: str, summary: str, items: List[str] | None = None) -> None:
    clean_items = [item for item in (items or []) if _clean_str(item)]
    if summary or clean_items:
        groups.append({"kind": kind, "summary": summary, "items": clean_items})


def audit_mcp_registry_entry(
    entry: Dict[str, Any],
    *,
    approval: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    mcp = entry.get("mcp") if isinstance(entry.get("mcp"), dict) else {}
    auth = entry.get("auth") if isinstance(entry.get("auth"), dict) else {}
    oauth = auth.get("oauth") if isinstance(auth.get("oauth"), dict) else {}
    workspace = entry.get("workspace") if isinstance(entry.get("workspace"), dict) else {}
    policy = entry.get("policy_summary") or entry.get("policySummary") or {}
    if not isinstance(policy, dict):
        policy = {}

    score = 0
    flags: List[str] = []
    groups: List[Dict[str, Any]] = []

    transport = _clean_str(mcp.get("transport"))
    if transport == "stdio":
        score += 35
        flags.append("stdio_transport")
        command = " ".join(
            [mcp.get("command", ""), *[str(arg) for arg in (mcp.get("args") or [])]]
        ).strip()
        _append_group(groups, "transport", "stdio", [command])
    elif transport == "http":
        score += 10
        flags.append("remote_http_transport")
        _append_group(groups, "transport", "http", [_clean_str(mcp.get("url"))])
    else:
        score += 20
        flags.append("unknown_transport")

    secret_keys = [
        key for key in (_secret_key(secret) for secret in (entry.get("secrets") or [])) if key
    ]
    if secret_keys:
        score += 15
        flags.append("secret_inputs")
        _append_group(groups, "secrets", f"{len(secret_keys)} secret key(s)", secret_keys)

    scopes = [str(scope) for scope in (oauth.get("scopes") or []) if _clean_str(scope)]
    if oauth:
        score += 15 + min(15, len(scopes) * 3)
        flags.append("oauth_access")
        provider = _clean_str(oauth.get("providerLabel") or oauth.get("provider"))
        _append_group(groups, "oauth", provider, scopes)

    if bool(workspace.get("required") or entry.get("requires_workspace") or entry.get("requiresWorkspace")):
        score += 25
        flags.append("workspace_access")
        _append_group(
            groups,
            "workspace",
            _clean_str(workspace.get("binding") or entry.get("workspace_binding") or entry.get("workspaceBinding")),
            [_clean_str(workspace.get("placeholder") or entry.get("workspace_placeholder") or entry.get("workspacePlaceholder"))],
        )

    if not bool(policy.get("reviewed")):
        score += 15
        flags.append("unreviewed_policy")

    default_enabled = int(policy.get("defaultEnabledTools") or policy.get("default_enabled_tools") or 0)
    confirmation_required = int(
        policy.get("confirmationRequiredTools") or policy.get("confirmation_required_tools") or 0
    )
    if default_enabled:
        score += 10
        flags.append("default_enabled_tools")
    if confirmation_required:
        score += min(20, confirmation_required * 5)
    _append_group(
        groups,
        "tools",
        f"{default_enabled} default / {confirmation_required} confirmation",
        [],
    )

    if not _clean_str(entry.get("license")):
        score += 5
        flags.append("missing_license")
    if not _clean_str(entry.get("source_repo") or entry.get("sourceRepo")):
        score += 5
        flags.append("missing_source_repo")
    if not _clean_str(entry.get("docs_url") or entry.get("docsUrl")):
        score += 5
        flags.append("missing_docs_url")

    risk_level = _risk_level(score)
    material = _recipe_material(entry)
    recipe_hash = recipe_hash_for_entry(entry)
    approved_recipe_hash = _clean_str((approval or {}).get("recipe_hash"))
    previous_material = (
        (approval or {}).get("review_snapshot", {}).get("recipeMaterial")
        if isinstance((approval or {}).get("review_snapshot"), dict)
        else None
    )

    return {
        "riskLevel": risk_level,
        "riskScore": score,
        "riskFlags": flags,
        "permissionGroups": groups,
        "requiresAcknowledgement": risk_level in {"medium", "high", "critical"},
        "recipeHash": recipe_hash,
        "approvedRecipeHash": approved_recipe_hash,
        "recipeDiff": diff_recipe_material(previous_material, material) if previous_material else [],
        "acknowledgedRisk": bool((approval or {}).get("acknowledged_risk")),
        "recipeMaterial": material,
    }


def diff_recipe_material(previous: Any, current: Any, path: str = "") -> List[Dict[str, Any]]:
    if previous == current:
        return []
    if isinstance(previous, dict) and isinstance(current, dict):
        diff: List[Dict[str, Any]] = []
        for key in sorted(set(previous.keys()) | set(current.keys())):
            child_path = f"{path}.{key}" if path else str(key)
            if key not in previous:
                diff.append({"path": child_path, "kind": "added", "oldValue": None, "newValue": current[key]})
            elif key not in current:
                diff.append({"path": child_path, "kind": "removed", "oldValue": previous[key], "newValue": None})
            else:
                diff.extend(diff_recipe_material(previous[key], current[key], child_path))
        return diff
    return [{"path": path or "$", "kind": "changed", "oldValue": previous, "newValue": current}]
