from __future__ import annotations

import copy
import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any, Callable, Dict, List
from urllib.parse import urlparse
from urllib.request import Request, urlopen

import mcp_registry
from mcp_permission_audit import (
    audit_mcp_registry_entry,
    recipe_hash_for_entry,
)


class McpExternalRegistryError(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str,
        status: int = 400,
        *,
        diagnostics: List[Dict[str, Any]] | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.status = status
        self.diagnostics = diagnostics or []


MCP_EXTERNAL_REGISTRIES_FILENAME = "mcp_external_registries.json"
MCP_EXTERNAL_APPROVALS_FILENAME = "mcp_external_registry_approvals.json"
REGISTRY_FETCH_TIMEOUT_SECONDS = 8
MAX_REGISTRY_BYTES = 1048576


def _data_dir(data_dir: str | Path | None = None) -> Path:
    if data_dir is not None:
        return Path(data_dir)
    raw = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    return Path(raw) if raw else Path.home() / ".pupu"


def _store_path(data_dir: str | Path | None = None) -> Path:
    return _data_dir(data_dir) / MCP_EXTERNAL_REGISTRIES_FILENAME


def _approval_store_path(data_dir: str | Path | None = None) -> Path:
    return _data_dir(data_dir) / MCP_EXTERNAL_APPROVALS_FILENAME


def _empty_store() -> Dict[str, Any]:
    return {"version": 1, "registries": []}


def _empty_approval_store() -> Dict[str, Any]:
    return {"version": 1, "approvals": []}


def _read_store(data_dir: str | Path | None = None) -> Dict[str, Any]:
    path = _store_path(data_dir)
    if not path.exists():
        return _empty_store()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return _empty_store()
    if not isinstance(raw, dict) or not isinstance(raw.get("registries"), list):
        return _empty_store()
    return {
        "version": 1,
        "registries": [item for item in raw["registries"] if isinstance(item, dict)],
    }


def _read_approval_store(data_dir: str | Path | None = None) -> Dict[str, Any]:
    path = _approval_store_path(data_dir)
    if not path.exists():
        return _empty_approval_store()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return _empty_approval_store()
    if not isinstance(raw, dict) or not isinstance(raw.get("approvals"), list):
        return _empty_approval_store()
    return {
        "version": 1,
        "approvals": [item for item in raw["approvals"] if isinstance(item, dict)],
    }


def _write_store(store: Dict[str, Any], data_dir: str | Path | None = None) -> None:
    path = _store_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(store, indent=2, sort_keys=True), encoding="utf-8")


def _write_approval_store(store: Dict[str, Any], data_dir: str | Path | None = None) -> None:
    path = _approval_store_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(store, indent=2, sort_keys=True), encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass


def _clean_str(value: Any) -> str:
    return str(value or "").strip()


def _require_https_url(value: Any, *, code: str = "mcp_registry_url_invalid") -> str:
    url = _clean_str(value)
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise McpExternalRegistryError(
            code,
            "MCP registry URLs must use https",
            400,
        )
    return url


def _default_registry_fetcher(
    url: str,
    timeout: int,
    max_bytes: int,
) -> Dict[str, Any]:
    clean_url = _require_https_url(url)
    request = Request(
        clean_url,
        headers={"Accept": "application/json", "User-Agent": "PuPu-MCP-Registry/1.0"},
        method="GET",
    )
    with urlopen(request, timeout=timeout) as response:
        raw = response.read(max_bytes + 1)
    if len(raw) > max_bytes:
        raise McpExternalRegistryError(
            "mcp_registry_invalid",
            "MCP registry payload is too large",
            400,
        )
    parsed = json.loads(raw.decode("utf-8"))
    if not isinstance(parsed, dict):
        raise McpExternalRegistryError(
            "mcp_registry_invalid",
            "MCP registry JSON root must be an object",
            400,
        )
    return parsed


def _registry_id_for(source_type: str, source_value: str) -> str:
    digest = hashlib.sha256(source_value.encode("utf-8")).hexdigest()[:16]
    return f"registry.{source_type}.{digest}"


def _parse_inline_registry(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception as exc:
            raise McpExternalRegistryError(
                "mcp_registry_invalid",
                "MCP registry JSON is invalid",
                400,
            ) from exc
    if not isinstance(raw, dict):
        raise McpExternalRegistryError(
            "mcp_registry_invalid",
            "MCP registry JSON root must be an object",
            400,
        )
    return raw


def _all_external_records(data_dir: str | Path | None = None) -> List[Dict[str, Any]]:
    return list(_read_store(data_dir)["registries"])


def _external_id_sets(
    data_dir: str | Path | None = None,
    *,
    exclude_registry_id: str = "",
) -> tuple[set[str], set[str]]:
    entry_ids: set[str] = set()
    toolkit_ids: set[str] = set()
    for registry in _all_external_records(data_dir):
        if registry.get("registry_id") == exclude_registry_id:
            continue
        for entry in registry.get("entries") or []:
            if not isinstance(entry, dict):
                continue
            if entry.get("entry_id"):
                entry_ids.add(str(entry["entry_id"]))
            if entry.get("toolkit_id"):
                toolkit_ids.add(str(entry["toolkit_id"]))
    return entry_ids, toolkit_ids


def _curated_id_sets() -> tuple[set[str], set[str]]:
    entries = mcp_registry.INSTALLABLE_MCP_REGISTRY.values()
    return (
        {str(entry["entry_id"]) for entry in entries},
        {str(entry["toolkit_id"]) for entry in entries},
    )


def _validate_external_entries(entries_by_id: Dict[str, Dict[str, Any]]) -> None:
    for entry in entries_by_id.values():
        toolkit_id = str(entry.get("toolkit_id") or "")
        if toolkit_id.startswith("mcp.custom."):
            raise McpExternalRegistryError(
                "mcp_registry_conflict",
                "External registries cannot use reserved custom MCP toolkit ids",
                409,
            )


def _requested_fields(entry: Dict[str, Any]) -> Dict[str, Any]:
    original = entry.get("review_original") if isinstance(entry.get("review_original"), dict) else {}
    policy_summary = (
        copy.deepcopy(original.get("policy_summary"))
        if isinstance(original.get("policy_summary"), dict)
        else copy.deepcopy(entry.get("policy_summary") or {})
    )
    return {
        "trust_level": _clean_str(original.get("trust_level")) or "external_approved",
        "status": _clean_str(original.get("status")) or "available",
        "installable": bool(original.get("installable")),
        "policy_summary": policy_summary,
    }


def _recipe_hash(entry: Dict[str, Any]) -> str:
    requested = _requested_fields(entry)
    material_entry = copy.deepcopy(entry)
    material_entry["policy_summary"] = requested["policy_summary"]
    return recipe_hash_for_entry(material_entry)


def _prepare_external_entry(entry: Dict[str, Any], registry_id: str) -> Dict[str, Any]:
    prepared = copy.deepcopy(entry)
    prepared["registry_id"] = registry_id
    requested = _requested_fields(prepared)
    prepared["requested_trust_level"] = requested["trust_level"]
    prepared["requested_status"] = requested["status"]
    prepared["requested_installable"] = requested["installable"]
    prepared["requested_policy_summary"] = requested["policy_summary"]
    prepared["recipe_hash"] = _recipe_hash(prepared)
    return prepared


def _normalize_external_registry(
    payload: Dict[str, Any],
    *,
    registry_id: str,
    data_dir: str | Path | None = None,
    exclude_registry_id: str = "",
) -> Dict[str, Any]:
    curated_entry_ids, curated_toolkit_ids = _curated_id_sets()
    external_entry_ids, external_toolkit_ids = _external_id_sets(
        data_dir,
        exclude_registry_id=exclude_registry_id,
    )
    try:
        normalized = mcp_registry.normalize_registry_payload(
            payload,
            registry_id=registry_id,
            force_review=True,
            existing_entry_ids=curated_entry_ids | external_entry_ids,
            existing_toolkit_ids=curated_toolkit_ids | external_toolkit_ids,
        )
    except RuntimeError as exc:
        message = str(exc)
        code = "mcp_registry_conflict" if "Duplicate MCP registry" in message else "mcp_registry_invalid"
        status = 409 if code == "mcp_registry_conflict" else 400
        diagnostics = getattr(exc, "diagnostics", [])
        if diagnostics:
            first_code = str(diagnostics[0].get("code") or code)
            if first_code == "mcp_registry_conflict":
                code = first_code
                status = 409
            elif first_code == "mcp_registry_url_invalid":
                code = first_code
        raise McpExternalRegistryError(code, message, status, diagnostics=diagnostics) from exc
    _validate_external_entries(normalized["entries_by_id"])
    normalized["entries_by_id"] = {
        entry_id: _prepare_external_entry(entry, registry_id)
        for entry_id, entry in normalized["entries_by_id"].items()
    }
    return normalized


def _approval_for_entry(
    entry: Dict[str, Any],
    approvals: List[Dict[str, Any]],
) -> Dict[str, Any] | None:
    registry_id = str(entry.get("registry_id") or "")
    entry_id = str(entry.get("entry_id") or "")
    for approval in approvals:
        if (
            str(approval.get("registry_id") or "") == registry_id
            and str(approval.get("entry_id") or "") == entry_id
        ):
            return approval
    return None


def _approval_status(entry: Dict[str, Any], approval: Dict[str, Any] | None) -> str:
    if not approval:
        return "missing"
    if str(approval.get("recipe_hash") or "") == str(entry.get("recipe_hash") or ""):
        return "approved"
    return "stale"


def _approved_entry_copy(entry: Dict[str, Any]) -> Dict[str, Any]:
    requested = _requested_fields(entry)
    approved = copy.deepcopy(entry)
    approved["trust_level"] = "external_approved"
    approved["status"] = requested["status"]
    approved["installable"] = requested["installable"]
    approved["policy_summary"] = requested["policy_summary"]
    return approved


def _review_for_entry(entry: Dict[str, Any], approval: Dict[str, Any] | None = None) -> Dict[str, Any]:
    effective_entry = _approved_entry_copy(entry) if _approval_status(entry, approval) == "approved" else entry
    review = audit_mcp_registry_entry(effective_entry, approval=approval)
    review["recipeHash"] = str(entry.get("recipe_hash") or review["recipeHash"])
    review["approvedRecipeHash"] = str(approval.get("recipe_hash") or "") if approval else ""
    return review


def _entry_to_frontend(
    entry: Dict[str, Any],
    *,
    registry: Dict[str, Any] | None = None,
    approval: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    registry = registry if isinstance(registry, dict) else {}
    approval_status = _approval_status(entry, approval)
    effective_entry = _approved_entry_copy(entry) if approval_status == "approved" else entry
    workspace = entry.get("workspace") if isinstance(entry.get("workspace"), dict) else {}
    review = _review_for_entry(entry, approval)
    return {
        "id": effective_entry.get("entry_id", ""),
        "entryId": effective_entry.get("entry_id", ""),
        "toolkitId": effective_entry.get("toolkit_id", ""),
        "toolkitName": effective_entry.get("toolkit_name", ""),
        "toolkitDescription": effective_entry.get("toolkit_description", ""),
        "toolkitIcon": copy.deepcopy(effective_entry.get("toolkit_icon") or {}),
        "category": effective_entry.get("category", ""),
        "source": effective_entry.get("source", "mcp"),
        "trustLevel": effective_entry.get("trust_level", ""),
        "status": effective_entry.get("status", "available"),
        "installable": bool(effective_entry.get("installable")),
        "license": effective_entry.get("license", ""),
        "sourceRepo": effective_entry.get("source_repo", ""),
        "docsUrl": effective_entry.get("docs_url", ""),
        "readmeMarkdown": effective_entry.get("readme_markdown", ""),
        "metadata": copy.deepcopy(effective_entry.get("metadata") or {}),
        "setupPreview": entry.get("setup_preview", ""),
        "prerequisites": list(entry.get("prerequisites") or []),
        "tools": copy.deepcopy(entry.get("tools") or []),
        "policySummary": copy.deepcopy(effective_entry.get("policy_summary") or {}),
        "secrets": copy.deepcopy(entry.get("secrets") or []),
        "auth": copy.deepcopy(entry.get("auth") or {}),
        "mcp": copy.deepcopy(entry.get("mcp") or {}),
        "workspace": {
            "required": bool(workspace.get("required")),
            "placeholder": str(workspace.get("placeholder") or ""),
            "binding": str(workspace.get("binding") or ""),
        },
        "requiresWorkspace": bool(entry.get("requires_workspace")),
        "workspaceBinding": entry.get("workspace_binding", ""),
        "workspacePlaceholder": entry.get("workspace_placeholder", ""),
        "registryId": entry.get("registry_id", ""),
        "registryName": registry.get("name", ""),
        "registrySourceType": registry.get("source_type", ""),
        "externalReview": entry.get("source") == "mcp_registry",
        "approvalStatus": approval_status if entry.get("source") == "mcp_registry" else "",
        "approvedAt": float(approval.get("approved_at") or 0) if approval else 0,
        "recipeHash": entry.get("recipe_hash", ""),
        "approvedRecipeHash": str(approval.get("recipe_hash") or "") if approval else "",
        "approvalInvalidated": approval_status == "stale",
        "review": {
            key: value
            for key, value in review.items()
            if key != "recipeMaterial"
        },
    }


def _approval_counts_for_registry(
    record: Dict[str, Any],
    approvals: List[Dict[str, Any]],
) -> tuple[int, int, Dict[str, int]]:
    approved_count = 0
    stale_count = 0
    risk_counts = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    entries = [entry for entry in (record.get("entries") or []) if isinstance(entry, dict)]
    entry_by_id = {str(entry.get("entry_id") or ""): entry for entry in entries}
    for entry in entries:
        risk_level = str(_review_for_entry(entry, _approval_for_entry(entry, approvals)).get("riskLevel") or "low")
        if risk_level not in risk_counts:
            risk_level = "low"
        risk_counts[risk_level] += 1
    for approval in approvals:
        if str(approval.get("registry_id") or "") != str(record.get("registry_id") or ""):
            continue
        entry = entry_by_id.get(str(approval.get("entry_id") or ""))
        if not entry:
            stale_count += 1
        elif _approval_status(entry, approval) == "approved":
            approved_count += 1
        else:
            stale_count += 1
    return approved_count, stale_count, risk_counts


def _registry_to_frontend(
    record: Dict[str, Any],
    approvals: List[Dict[str, Any]] | None = None,
) -> Dict[str, Any]:
    approved_count, stale_count, risk_counts = _approval_counts_for_registry(record, approvals or [])
    return {
        "registryId": record.get("registry_id", ""),
        "name": record.get("name", ""),
        "publisher": record.get("publisher", ""),
        "homepage": record.get("homepage", ""),
        "sourceType": record.get("source_type", ""),
        "url": record.get("url", ""),
        "entryCount": len(record.get("entries") or []),
        "importedAt": float(record.get("imported_at") or 0),
        "lastRefreshedAt": float(record.get("last_refreshed_at") or 0),
        "lastError": record.get("last_error", ""),
        "status": record.get("status", "ok"),
        "approvedCount": approved_count,
        "staleApprovalCount": stale_count,
        "riskCounts": risk_counts,
    }


def external_registry_entries(
    *,
    data_dir: str | Path | None = None,
) -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    for registry in _all_external_records(data_dir):
        for entry in registry.get("entries") or []:
            if isinstance(entry, dict):
                entries.append(copy.deepcopy(entry))
    return entries


def external_entry_exists(
    entry_or_toolkit_id: str,
    *,
    data_dir: str | Path | None = None,
) -> bool:
    normalized = str(entry_or_toolkit_id or "").strip()
    if not normalized:
        return False
    for entry in external_registry_entries(data_dir=data_dir):
        if entry.get("entry_id") == normalized or entry.get("toolkit_id") == normalized:
            return True
    return False


def external_registry_entry(
    entry_id: str,
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, Any] | None:
    normalized = str(entry_id or "").strip()
    for entry in external_registry_entries(data_dir=data_dir):
        if entry.get("entry_id") == normalized:
            return copy.deepcopy(entry)
    return None


def _external_entry_record(
    entry_id: str,
    *,
    registry_id: str = "",
    data_dir: str | Path | None = None,
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    normalized_entry_id = str(entry_id or "").strip()
    normalized_registry_id = str(registry_id or "").strip()
    for registry in _all_external_records(data_dir):
        if normalized_registry_id and registry.get("registry_id") != normalized_registry_id:
            continue
        for entry in registry.get("entries") or []:
            if not isinstance(entry, dict):
                continue
            if (
                entry.get("entry_id") == normalized_entry_id
                or entry.get("toolkit_id") == normalized_entry_id
            ):
                return registry, entry
    raise McpExternalRegistryError(
        "mcp_registry_not_found",
        "External MCP registry entry not found",
        404,
    )


def approved_external_registry_entry(
    entry_id: str,
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, Any]:
    registry, entry = _external_entry_record(entry_id, data_dir=data_dir)
    approval = _approval_for_entry(entry, _read_approval_store(data_dir)["approvals"])
    status = _approval_status(entry, approval)
    if status == "missing":
        raise McpExternalRegistryError(
            "mcp_registry_entry_not_approved",
            "External MCP registry entry has not been approved",
            403,
        )
    if status == "stale":
        raise McpExternalRegistryError(
            "mcp_registry_approval_stale",
            "External MCP registry entry approval is stale",
            409,
        )
    return _approved_entry_copy(entry)


def list_mcp_store_entries(
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, Any]:
    curated = [_entry_to_frontend(entry) for entry in mcp_registry.registry_entries()]
    external: List[Dict[str, Any]] = []
    approvals = _read_approval_store(data_dir)["approvals"]
    for registry in _all_external_records(data_dir):
        for entry in registry.get("entries") or []:
            if isinstance(entry, dict):
                external.append(
                    _entry_to_frontend(
                        entry,
                        registry=registry,
                        approval=_approval_for_entry(entry, approvals),
                    )
                )
    entries = curated + external
    return {
        "entries": entries,
        "count": len(entries),
        "externalCount": len(external),
        "status": "ok",
    }


def list_mcp_store_registries(
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, Any]:
    approvals = _read_approval_store(data_dir)["approvals"]
    registries = [_registry_to_frontend(record, approvals) for record in _all_external_records(data_dir)]
    return {"registries": registries, "count": len(registries), "status": "ok"}


def approve_mcp_store_entry(
    entry_id: str,
    *,
    registry_id: str,
    data_dir: str | Path | None = None,
    now_fn: Callable[[], float] | None = None,
    acknowledged_risk: bool = False,
) -> Dict[str, Any]:
    registry, entry = _external_entry_record(
        entry_id,
        registry_id=registry_id,
        data_dir=data_dir,
    )
    now = (now_fn or time.time)()
    review = _review_for_entry(entry)
    if review.get("requiresAcknowledgement") and not acknowledged_risk:
        raise McpExternalRegistryError(
            "mcp_registry_review_ack_required",
            "This MCP registry entry requires risk acknowledgement before approval",
            403,
        )
    store = _read_approval_store(data_dir)
    next_approvals = [
        approval
        for approval in store["approvals"]
        if not (
            str(approval.get("registry_id") or "") == str(registry.get("registry_id") or "")
            and str(approval.get("entry_id") or "") == str(entry.get("entry_id") or "")
        )
    ]
    approval = {
        "registry_id": registry.get("registry_id", ""),
        "entry_id": entry.get("entry_id", ""),
        "toolkit_id": entry.get("toolkit_id", ""),
        "recipe_hash": entry.get("recipe_hash", ""),
        "approved_at": now,
        "acknowledged_risk": bool(acknowledged_risk),
        "review_snapshot": {
            key: value
            for key, value in review.items()
            if key in {
                "riskLevel",
                "riskScore",
                "riskFlags",
                "permissionGroups",
                "requiresAcknowledgement",
                "recipeHash",
                "recipeMaterial",
            }
        },
    }
    next_approvals.append(approval)
    store["approvals"] = next_approvals
    _write_approval_store(store, data_dir)
    return {
        "entry": _entry_to_frontend(entry, registry=registry, approval=approval),
    }


def _validation_response_from_error(exc: McpExternalRegistryError) -> Dict[str, Any]:
    diagnostics = exc.diagnostics or [
        {
            "code": exc.code,
            "message": str(exc),
            "path": "$",
            "entryId": "",
            "toolkitId": "",
            "severity": "error",
        }
    ]
    return {
        "valid": False,
        "status": "invalid",
        "diagnostics": diagnostics,
        "entries": [],
        "count": 0,
    }


def validate_mcp_store_registry(
    payload: Dict[str, Any],
    *,
    data_dir: str | Path | None = None,
    registry_fetcher: Callable[[str, int, int], Dict[str, Any]] | None = None,
) -> Dict[str, Any]:
    source = payload if isinstance(payload, dict) else {}
    url = _clean_str(source.get("url"))
    try:
        if url:
            registry_payload = (registry_fetcher or _default_registry_fetcher)(
                _require_https_url(url),
                REGISTRY_FETCH_TIMEOUT_SECONDS,
                MAX_REGISTRY_BYTES,
            )
            source_type = "url"
            source_value = url
        else:
            registry_payload = _parse_inline_registry(source.get("registry"))
            source_type = "inline"
            source_value = json.dumps(registry_payload, sort_keys=True)
        registry_id = _registry_id_for(f"preview-{source_type}", source_value)
        normalized = _normalize_external_registry(
            registry_payload,
            registry_id=registry_id,
            data_dir=data_dir,
        )
    except McpExternalRegistryError as exc:
        return _validation_response_from_error(exc)
    except Exception as exc:
        return _validation_response_from_error(
            McpExternalRegistryError(
                "mcp_registry_invalid",
                str(exc) or "MCP registry is invalid",
                400,
            )
        )

    registry = {
        "registry_id": registry_id,
        "name": _clean_str(source.get("name")) or _clean_str(registry_payload.get("name")) or "External registry",
        "publisher": _clean_str(registry_payload.get("publisher")),
        "homepage": _clean_str(registry_payload.get("homepage")),
        "source_type": source_type,
        "url": url if source_type == "url" else "",
        "entries": list(normalized["entries_by_id"].values()),
        "imported_at": 0,
        "last_refreshed_at": 0,
        "last_error": "",
        "status": "preview",
    }
    entries = [
        _entry_to_frontend(entry, registry=registry)
        for entry in registry["entries"]
    ]
    return {
        "valid": True,
        "status": "ok",
        "diagnostics": [],
        "entries": entries,
        "count": len(entries),
        "registry": _registry_to_frontend(registry, []),
    }


def revoke_mcp_store_entry_approval(
    entry_id: str,
    *,
    registry_id: str = "",
    data_dir: str | Path | None = None,
) -> Dict[str, Any]:
    normalized_entry_id = str(entry_id or "").strip()
    normalized_registry_id = str(registry_id or "").strip()
    store = _read_approval_store(data_dir)
    next_approvals = [
        approval
        for approval in store["approvals"]
        if not (
            str(approval.get("entry_id") or "") == normalized_entry_id
            and (
                not normalized_registry_id
                or str(approval.get("registry_id") or "") == normalized_registry_id
            )
        )
    ]
    if len(next_approvals) == len(store["approvals"]):
        raise McpExternalRegistryError(
            "mcp_registry_approval_not_found",
            "MCP registry entry approval not found",
            404,
        )
    store["approvals"] = next_approvals
    _write_approval_store(store, data_dir)
    return {
        "ok": True,
        "entryId": normalized_entry_id,
        "registryId": normalized_registry_id,
    }


def import_mcp_store_registry(
    payload: Dict[str, Any],
    *,
    data_dir: str | Path | None = None,
    now_fn: Callable[[], float] | None = None,
    registry_fetcher: Callable[[str, int, int], Dict[str, Any]] | None = None,
) -> Dict[str, Any]:
    source = payload if isinstance(payload, dict) else {}
    url = _clean_str(source.get("url"))
    if url:
        url = _require_https_url(url)
        source_type = "url"
        source_value = url
        try:
            registry_payload = (registry_fetcher or _default_registry_fetcher)(
                url,
                REGISTRY_FETCH_TIMEOUT_SECONDS,
                MAX_REGISTRY_BYTES,
            )
        except McpExternalRegistryError:
            raise
        except Exception as exc:
            raise McpExternalRegistryError(
                "mcp_registry_import_failed",
                str(exc),
                502,
            ) from exc
    else:
        source_type = "inline"
        registry_payload = _parse_inline_registry(source.get("registry"))
        source_value = json.dumps(registry_payload, sort_keys=True)

    registry_id = _registry_id_for(source_type, source_value)
    store = _read_store(data_dir)
    if any(record.get("registry_id") == registry_id for record in store["registries"]):
        raise McpExternalRegistryError(
            "mcp_registry_conflict",
            "MCP registry is already imported",
            409,
        )
    normalized = _normalize_external_registry(
        registry_payload,
        registry_id=registry_id,
        data_dir=data_dir,
    )
    now = (now_fn or time.time)()
    record = {
        "registry_id": registry_id,
        "name": _clean_str(source.get("name")) or _clean_str(registry_payload.get("name")) or "External registry",
        "publisher": _clean_str(registry_payload.get("publisher")),
        "homepage": _clean_str(registry_payload.get("homepage")),
        "source_type": source_type,
        "url": url if source_type == "url" else "",
        "entries": list(normalized["entries_by_id"].values()),
        "imported_at": now,
        "last_refreshed_at": now,
        "last_error": "",
        "status": "ok",
    }
    store["registries"].append(record)
    _write_store(store, data_dir)
    return {"registry": _registry_to_frontend(record, _read_approval_store(data_dir)["approvals"])}


def _registry_record(
    registry_id: str,
    *,
    data_dir: str | Path | None = None,
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    normalized = str(registry_id or "").strip()
    store = _read_store(data_dir)
    for record in store["registries"]:
        if record.get("registry_id") == normalized:
            return store, record
    raise McpExternalRegistryError(
        "mcp_registry_not_found",
        "MCP registry not found",
        404,
    )


def refresh_mcp_store_registry(
    registry_id: str,
    *,
    data_dir: str | Path | None = None,
    now_fn: Callable[[], float] | None = None,
    registry_fetcher: Callable[[str, int, int], Dict[str, Any]] | None = None,
) -> Dict[str, Any]:
    store, record = _registry_record(registry_id, data_dir=data_dir)
    if record.get("source_type") != "url" or not record.get("url"):
        raise McpExternalRegistryError(
            "mcp_registry_refresh_failed",
            "Only URL-backed MCP registries can be refreshed",
            400,
        )
    now = (now_fn or time.time)()
    try:
        payload = (registry_fetcher or _default_registry_fetcher)(
            record["url"],
            REGISTRY_FETCH_TIMEOUT_SECONDS,
            MAX_REGISTRY_BYTES,
        )
        normalized = _normalize_external_registry(
            payload,
            registry_id=record["registry_id"],
            data_dir=data_dir,
            exclude_registry_id=record["registry_id"],
        )
        record["name"] = _clean_str(payload.get("name")) or record.get("name") or "External registry"
        record["publisher"] = _clean_str(payload.get("publisher"))
        record["homepage"] = _clean_str(payload.get("homepage"))
        record["entries"] = list(normalized["entries_by_id"].values())
        record["last_refreshed_at"] = now
        record["last_error"] = ""
        record["status"] = "ok"
    except Exception as exc:
        record["last_error"] = str(exc)
        record["status"] = "error"
    _write_store(store, data_dir)
    return {"registry": _registry_to_frontend(record, _read_approval_store(data_dir)["approvals"])}


def delete_mcp_store_registry(
    registry_id: str,
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, Any]:
    normalized = str(registry_id or "").strip()
    store = _read_store(data_dir)
    next_records = [
        record for record in store["registries"] if record.get("registry_id") != normalized
    ]
    if len(next_records) == len(store["registries"]):
        raise McpExternalRegistryError(
            "mcp_registry_not_found",
            "MCP registry not found",
            404,
        )
    store["registries"] = next_records
    _write_store(store, data_dir)
    approval_store = _read_approval_store(data_dir)
    approval_store["approvals"] = [
        approval
        for approval in approval_store["approvals"]
        if str(approval.get("registry_id") or "") != normalized
    ]
    _write_approval_store(approval_store, data_dir)
    return {"ok": True, "registryId": normalized}
