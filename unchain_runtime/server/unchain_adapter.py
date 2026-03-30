import inspect
import json
import importlib
import os
import base64
import pkgutil
import tomllib
import queue
import re
import copy
import sys
import threading
import time
import uuid as _uuid
from pathlib import Path
from typing import Any, Dict, Iterable, List

try:
    import httpx as _httpx
except ImportError:  # pragma: no cover
    _httpx = None  # type: ignore

# Ensure unchain source is on sys.path (dev mode uses UNCHAIN_SOURCE_PATH env)
def _ensure_unchain_on_path() -> None:
    _source = os.environ.get("UNCHAIN_SOURCE_PATH", "").strip()
    if _source:
        _src_dir = os.path.join(_source, "src")
        if os.path.isdir(_src_dir) and _src_dir not in sys.path:
            sys.path.insert(0, _src_dir)
            return
        if os.path.isdir(_source) and _source not in sys.path:
            sys.path.insert(0, _source)
            return
    _project_root = str(Path(__file__).resolve().parents[2])
    _sibling = os.path.join(os.path.dirname(_project_root), "unchain", "src")
    if os.path.isdir(_sibling) and _sibling not in sys.path:
        sys.path.insert(0, _sibling)

_ensure_unchain_on_path()

# Import unchain agent modules
try:
    from unchain.agent import Agent as _UnchainAgent
    from unchain.agent.modules import ToolsModule as _ToolsModule
    from unchain.agent.modules import MemoryModule as _MemoryModule
    from unchain.agent.modules import PoliciesModule as _PoliciesModule
    from unchain.agent.modules import SubagentModule as _SubagentModule
    from unchain.subagents import SubagentTemplate as _SubagentTemplate
    from unchain.subagents import SubagentPolicy as _SubagentPolicy
except ImportError:
    _UnchainAgent = None  # type: ignore
    _ToolsModule = None  # type: ignore
    _MemoryModule = None  # type: ignore
    _PoliciesModule = None  # type: ignore
    _SubagentModule = None  # type: ignore
    _SubagentTemplate = None  # type: ignore
    _SubagentPolicy = None  # type: ignore

_SUPPORTED_PROVIDERS = {"openai", "anthropic", "ollama"}
_ALLOWED_INPUT_MODALITIES = ("text", "image", "pdf")
_ALLOWED_INPUT_SOURCE_TYPES = ("url", "base64")
_OLLAMA_EMBEDDING_FAMILY_PREFIXES = ("bert", "nomic-bert", "bge")
_INPUT_MODALITY_ALIAS_MAP = {
    "file": "pdf",
}
_KNOWN_TOOLKIT_EXPORTS = {
    "WorkspaceToolkit": "builtin",
    "TerminalToolkit": "builtin",
    "ExternalAPIToolkit": "builtin",
    "AskUserToolkit": "builtin",
}
_TOOLKIT_EXPORT_ID_ALIASES = {
    "WorkspaceToolkit": "workspace_toolkit",
    "TerminalToolkit": "terminal_toolkit",
    "ExternalAPIToolkit": "external_api_toolkit",
    "AskUserToolkit": "ask-user-toolkit",
}
_TOOLKIT_NAME_ALIASES = {
    "workspace": "WorkspaceToolkit",
    "access_workspace_toolkit": "WorkspaceToolkit",
    "workspace_toolkit": "WorkspaceToolkit",
    "WorkspaceToolkit": "WorkspaceToolkit",
    "terminal": "TerminalToolkit",
    "run_terminal_toolkit": "TerminalToolkit",
    "terminal_toolkit": "TerminalToolkit",
    "TerminalToolkit": "TerminalToolkit",
    "external_api": "ExternalAPIToolkit",
    "external_api_toolkit": "ExternalAPIToolkit",
    "ExternalAPIToolkit": "ExternalAPIToolkit",
    "ask_user": "AskUserToolkit",
    "interaction_toolkit": "AskUserToolkit",
    "interaction-toolkit": "AskUserToolkit",
    "ask_user_toolkit": "AskUserToolkit",
    "ask-user-toolkit": "AskUserToolkit",
    "AskUserToolkit": "AskUserToolkit",
}
_DEFAULT_MAX_ITERATIONS = 32
_CONFIRMATION_CANCELLED_REASON = "confirmation_cancelled_stream_terminated"
_CONFIRMATION_REQUIRED_TOOL_NAMES = {
    "write_file",
    "delete_file",
    "move_file",
    "terminal_exec",
}
_WORKSPACE_PROXY_ORIGINAL_TOOL_NAME_ATTR = "_pupu_original_tool_name"
_ASK_USER_QUESTION_TOOL_NAME = "ask_user_question"
_HUMAN_INPUT_OTHER_VALUE = "__other__"
_SYSTEM_PROMPT_V2_MAX_SECTION_CHARS = 2000
_SYSTEM_PROMPT_V2_SECTION_ORDER = (
    "personality",
    "rules",
    "style",
    "output_format",
    "context",
    "constraints",
)
_SYSTEM_PROMPT_V2_SECTION_TITLES = {
    "personality": "Personality",
    "rules": "Rules",
    "style": "Style",
    "output_format": "Output Format",
    "context": "Context",
    "constraints": "Constraints",
}
_SYSTEM_PROMPT_V2_SECTION_ALIASES = {
    "personally": "personality",
}
_SYSTEM_PROMPT_V2_BUILTIN_RULES = [
    "Once you start your final answer, treat that single message as the final deliverable. Output may be truncated, so do not depend on follow-up continuation.",
    "Tool use is optional. Call tools only when they are genuinely necessary to produce a correct and useful answer.",
    "If important information is missing, the requirements are ambiguous, or there are multiple materially different approaches, you may use one or more ask-user tool calls before the final answer to resolve the uncertainty. Prefer asking over guessing when the choice would meaningfully affect the outcome. Before responding, gather enough information to make the final answer as complete and actionable as possible.",
    "In the final response, aim to deliver a full result whenever feasible: a concrete plan, a direct answer, a finished artifact, or the best available outcome for the task, rather than a partial handoff."
]
_MEMORY_UNAVAILABLE_CODE = "memory_unavailable"
_pending_confirmations: Dict[str, Dict[str, Any]] = {}
_pending_confirmations_lock = threading.Lock()


def _is_openai_previous_response_fallback_error(exc: Exception) -> bool:
    """Return True when OpenAI should fall back from previous_response_id chaining."""
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        error_obj = body.get("error")
        if isinstance(error_obj, dict):
            code = error_obj.get("code")
            if code == "previous_response_not_found":
                return True

            param = error_obj.get("param")
            message = str(error_obj.get("message", ""))
            if param == "previous_response_id" and "not found" in message.lower():
                return True

            if "no tool call found for function call output" in message.lower():
                return True

    text = str(exc).lower()
    if "previous_response_id" in text and "not found" in text:
        return True
    if "no tool call found for function call output" in text:
        return True
    return False

def _normalize_tool_confirmation_response(raw: object) -> Dict[str, Any]:
    approved = True
    reason = ""
    modified_arguments: Dict[str, Any] | None = None

    if isinstance(raw, bool):
        approved = raw
    elif isinstance(raw, dict):
        approved = bool(raw.get("approved", True))
        reason_raw = raw.get("reason", "")
        reason = reason_raw if isinstance(reason_raw, str) else str(reason_raw or "")
        modified_raw = raw.get("modified_arguments")
        if isinstance(modified_raw, dict):
            modified_arguments = modified_raw
    else:
        approved_attr = getattr(raw, "approved", raw)
        approved = bool(approved_attr)
        reason_attr = getattr(raw, "reason", "")
        reason = reason_attr if isinstance(reason_attr, str) else str(reason_attr or "")
        modified_attr = getattr(raw, "modified_arguments", None)
        if isinstance(modified_attr, dict):
            modified_arguments = modified_attr

    return {
        "approved": approved,
        "reason": reason,
        "modified_arguments": modified_arguments,
    }


def _build_tool_confirmation_request_payload(request_obj: object) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    if isinstance(request_obj, dict):
        payload = dict(request_obj)
    else:
        to_dict = getattr(request_obj, "to_dict", None)
        if callable(to_dict):
            try:
                raw_payload = to_dict()
                if isinstance(raw_payload, dict):
                    payload = dict(raw_payload)
            except Exception:
                payload = {}

    if not payload:
        payload = {
            "tool_name": getattr(request_obj, "tool_name", ""),
            "tool_display_name": getattr(request_obj, "tool_display_name", ""),
            "call_id": getattr(request_obj, "call_id", ""),
            "arguments": getattr(request_obj, "arguments", {}),
            "description": getattr(request_obj, "description", ""),
        }

    payload["type"] = "tool_call"

    if not isinstance(payload.get("tool_name"), str):
        payload["tool_name"] = str(payload.get("tool_name", "") or "")
    display_name = payload.get("tool_display_name", "")
    if display_name is None:
        display_name = ""
    if not isinstance(display_name, str):
        display_name = str(display_name or "")
    payload["tool_display_name"] = display_name.strip()
    if not isinstance(payload.get("call_id"), str):
        payload["call_id"] = str(payload.get("call_id", "") or "")

    raw_arguments = payload.get("arguments")
    arguments = raw_arguments
    payload["arguments"] = arguments if isinstance(arguments, dict) else {}

    description = payload.get("description", "")
    payload["description"] = description if isinstance(description, str) else str(description or "")

    confirmation_id = payload.get("confirmation_id", "")
    if confirmation_id is None:
        confirmation_id = ""
    if not isinstance(confirmation_id, str):
        confirmation_id = str(confirmation_id or "")
    payload["confirmation_id"] = confirmation_id.strip()
    payload["requires_confirmation"] = True

    # ── interact extension ──────────────────────────────────────────────
    # interact_type: "confirmation" | "multi_choice" | "text_input" | "single" | "multi"
    interact_type = payload.get("interact_type", "confirmation")
    payload["interact_type"] = interact_type if isinstance(interact_type, str) else "confirmation"

    interact_config = payload.get("interact_config")
    payload["interact_config"] = interact_config if isinstance(interact_config, (dict, list)) else {}

    return payload


def _set_workspace_proxy_tool_metadata(
    tool_obj: Any,
    *,
    original_tool_name: str,
) -> None:
    if not isinstance(original_tool_name, str) or not original_tool_name.strip():
        return
    try:
        setattr(
            tool_obj,
            _WORKSPACE_PROXY_ORIGINAL_TOOL_NAME_ATTR,
            original_tool_name.strip(),
        )
    except Exception:
        return


def _resolve_tool_display_name(
    tool_name: object,
    *,
    tool_obj: Any = None,
) -> str:
    original_name = getattr(tool_obj, _WORKSPACE_PROXY_ORIGINAL_TOOL_NAME_ATTR, "")
    if isinstance(original_name, str) and original_name.strip():
        return original_name.strip()

    if isinstance(tool_name, str):
        return tool_name
    return str(tool_name or "")


def submit_tool_confirmation(
    confirmation_id: str,
    approved: bool,
    reason: str = "",
    modified_arguments: Dict[str, Any] | None = None,
) -> bool:
    normalized_id = confirmation_id.strip() if isinstance(confirmation_id, str) else ""
    if not normalized_id:
        return False

    with _pending_confirmations_lock:
        pending = _pending_confirmations.get(normalized_id)
        if pending is None:
            return False

        pending["response"] = {
            "approved": bool(approved),
            "reason": reason if isinstance(reason, str) else str(reason or ""),
            "modified_arguments": modified_arguments if isinstance(modified_arguments, dict) else None,
        }
        event = pending.get("event")
        if isinstance(event, threading.Event):
            event.set()

    return True


def cancel_tool_confirmations(cancel_event: threading.Event | None = None) -> int:
    cancelled = 0
    with _pending_confirmations_lock:
        for pending in _pending_confirmations.values():
            if not isinstance(pending, dict):
                continue

            waiter_cancel_event = pending.get("cancel_event")
            if (
                isinstance(cancel_event, threading.Event)
                and waiter_cancel_event is not cancel_event
            ):
                continue

            if pending.get("response") is not None:
                continue

            pending["response"] = {
                "approved": False,
                "reason": _CONFIRMATION_CANCELLED_REASON,
                "modified_arguments": None,
            }
            cancelled += 1
            event = pending.get("event")
            if isinstance(event, threading.Event):
                event.set()

    return cancelled


def _make_tool_confirm_callback(
    emit_event,
    cancel_event: threading.Event | None = None,
):
    def on_tool_confirm(request_obj: object) -> Dict[str, Any]:
        normalized_cancel_event = cancel_event if isinstance(cancel_event, threading.Event) else None
        request_payload = _build_tool_confirmation_request_payload(request_obj)
        suppress_event = bool(request_payload.get("_skip_emit_event"))
        confirmation_id = str(request_payload.get("confirmation_id", "") or "").strip()
        if not confirmation_id:
            confirmation_id = str(_uuid.uuid4())
        request_payload["confirmation_id"] = confirmation_id
        waiter = {
            "event": threading.Event(),
            "response": None,
            "cancel_event": normalized_cancel_event,
        }

        with _pending_confirmations_lock:
            _pending_confirmations[confirmation_id] = waiter

        try:
            if not suppress_event:
                emit_payload = {
                    key: value
                    for key, value in request_payload.items()
                    if key != "_skip_emit_event"
                }
                emit_event(emit_payload)
            if normalized_cancel_event is not None and normalized_cancel_event.is_set():
                cancel_tool_confirmations(normalized_cancel_event)
            event = waiter.get("event")
            if isinstance(event, threading.Event):
                event.wait()
        except Exception as callback_error:
            return {
                "approved": False,
                "reason": f"Failed to request confirmation: {callback_error}",
                "modified_arguments": None,
            }
        finally:
            with _pending_confirmations_lock:
                _pending_confirmations.pop(confirmation_id, None)

        response = waiter.get("response")
        if isinstance(response, dict):
            return _normalize_tool_confirmation_response(response)

        if normalized_cancel_event is not None and normalized_cancel_event.is_set():
            return {
                "approved": False,
                "reason": _CONFIRMATION_CANCELLED_REASON,
                "modified_arguments": None,
            }

        return {
            "approved": False,
            "reason": "Confirmation ended without a response",
            "modified_arguments": None,
        }

    return on_tool_confirm


def _make_continuation_callback(
    emit_event,
    cancel_event: threading.Event | None = None,
):
    def on_continuation_request(payload: Dict[str, Any]) -> Dict[str, Any]:
        normalized_cancel_event = cancel_event if isinstance(cancel_event, threading.Event) else None
        confirmation_id = str(_uuid.uuid4())
        waiter: Dict[str, Any] = {
            "event": threading.Event(),
            "response": None,
            "cancel_event": normalized_cancel_event,
        }

        with _pending_confirmations_lock:
            _pending_confirmations[confirmation_id] = waiter

        try:
            emit_event({
                "type": "continuation_request",
                "confirmation_id": confirmation_id,
                "iteration": payload.get("iteration", 0),
            })
            if normalized_cancel_event is not None and normalized_cancel_event.is_set():
                cancel_tool_confirmations(normalized_cancel_event)
            event = waiter.get("event")
            if isinstance(event, threading.Event):
                event.wait()
        except Exception:
            return {"approved": False}
        finally:
            with _pending_confirmations_lock:
                _pending_confirmations.pop(confirmation_id, None)

        response = waiter.get("response")
        if isinstance(response, dict):
            return {"approved": bool(response.get("approved", False))}

        if normalized_cancel_event is not None and normalized_cancel_event.is_set():
            return {"approved": False}

        return {"approved": False}

    return on_continuation_request


def _provider_default_model(provider: str) -> str:
    if provider == "openai":
        return "gpt-5"
    if provider == "anthropic":
        return "claude-sonnet-4"
    return "deepseek-r1:14b"


def _normalize_provider_model_name(provider: str, model: str) -> str:
    normalized_provider = provider.strip().lower()
    normalized_model = str(model or "").strip()
    if not normalized_model:
        return normalized_model

    # Anthropic model names use hyphenated minor versions:
    # claude-opus-4-6 (not claude-opus-4.6).
    if normalized_provider == "anthropic":
        match = re.match(r"^(claude-[a-z0-9-]*-\d+)\.(\d+)(.*)$", normalized_model)
        if match:
            return f"{match.group(1)}-{match.group(2)}{match.group(3)}"

    return normalized_model


def _parse_model_overrides(options: Dict[str, object] | None) -> Dict[str, str]:
    if not isinstance(options, dict):
        return {}

    overrides: Dict[str, str] = {}

    model_id_raw = options.get("modelId") or options.get("model_id")
    if isinstance(model_id_raw, str) and model_id_raw.strip():
        model_id = model_id_raw.strip()
        if ":" in model_id:
            provider_part, model_part = model_id.split(":", 1)
            provider_candidate = provider_part.strip().lower()
            model_candidate = model_part.strip()
            if provider_candidate in {"openai", "anthropic", "ollama"} and model_candidate:
                overrides["provider"] = provider_candidate
                overrides["model"] = model_candidate
        else:
            overrides["model"] = model_id

    provider_raw = options.get("provider")
    if isinstance(provider_raw, str) and provider_raw.strip().lower() in {"openai", "anthropic", "ollama"}:
        overrides["provider"] = provider_raw.strip().lower()

    model_raw = options.get("model")
    if isinstance(model_raw, str) and model_raw.strip():
        model_value = model_raw.strip()
        if ":" in model_value and "provider" not in overrides:
            provider_part, model_part = model_value.split(":", 1)
            provider_candidate = provider_part.strip().lower()
            model_candidate = model_part.strip()
            if provider_candidate in {"openai", "anthropic", "ollama"} and model_candidate:
                overrides["provider"] = provider_candidate
                overrides["model"] = model_candidate
            else:
                overrides["model"] = model_value
        else:
            overrides["model"] = model_value

    return overrides


def _get_runtime_config(overrides: Dict[str, str] | None = None) -> Dict[str, str]:
    base_provider = os.environ.get("UNCHAIN_PROVIDER", "ollama").strip().lower() or "ollama"
    provider = base_provider if base_provider in {"openai", "anthropic", "ollama"} else "ollama"

    provider_override = (overrides or {}).get("provider", "").strip().lower()
    if provider_override in {"openai", "anthropic", "ollama"}:
        provider = provider_override

    env_model = os.environ.get("UNCHAIN_MODEL", _provider_default_model(provider)).strip()
    model = env_model or _provider_default_model(provider)

    if provider_override and provider_override in {"openai", "anthropic", "ollama"}:
        model = _provider_default_model(provider_override)

    model_override = (overrides or {}).get("model", "").strip()
    if model_override:
        model = model_override

    model = _normalize_provider_model_name(provider, model)

    return {
        "provider": provider,
        "model": model,
        "source": "",
    }


def get_runtime_config(options: Dict[str, object] | None = None) -> Dict[str, str]:
    overrides = _parse_model_overrides(options)
    return _get_runtime_config(overrides)


def get_model_name(options: Dict[str, object] | None = None) -> str:
    config = get_runtime_config(options)
    if not config.get("model"):
        return "model-unavailable"
    return f"{config['provider']}:{config['model']}"


def _default_model_capabilities() -> Dict[str, object]:
    return {
        "input_modalities": ["text"],
        "input_source_types": {},
    }


def _capability_file_candidates() -> List[Path]:
    candidates: List[Path] = []

    # Try to find model_capabilities.json via unchain package
    try:
        import unchain.runtime.resources as _res_pkg
        _res_dir = Path(_res_pkg.__file__).parent if hasattr(_res_pkg, "__file__") else None
        if _res_dir is not None:
            candidates.append(_res_dir / "model_capabilities.json")
    except Exception:
        pass

    current_file = Path(__file__).resolve()
    project_root = current_file.parents[2]
    candidates.append(
        project_root / "unchain_runtime" / "runtime" / "resources" / "model_capabilities.json"
    )
    candidates.append(
        project_root.parent / "unchain" / "src" / "unchain" / "runtime" / "resources" / "model_capabilities.json"
    )

    unique_candidates: List[Path] = []
    seen = set()
    for path_candidate in candidates:
        resolved = path_candidate.expanduser().resolve()
        as_str = str(resolved)
        if as_str in seen:
            continue
        seen.add(as_str)
        unique_candidates.append(resolved)

    return unique_candidates


def _load_raw_capability_catalog() -> Dict[str, Dict[str, object]]:
    for candidate in _capability_file_candidates():
        if not candidate.exists() or not candidate.is_file():
            continue

        try:
            raw = json.loads(candidate.read_text(encoding="utf-8"))
        except Exception:
            continue

        if not isinstance(raw, dict):
            continue

        catalog: Dict[str, Dict[str, object]] = {}
        for model_name, capabilities in raw.items():
            if not isinstance(model_name, str) or not isinstance(capabilities, dict):
                continue
            catalog[model_name] = capabilities
        return catalog

    return {}


def _normalize_input_modalities(raw_modalities: object) -> List[str]:
    modalities = set()
    if isinstance(raw_modalities, list):
        for item in raw_modalities:
            if not isinstance(item, str):
                continue
            modality_raw = item.strip().lower()
            modality = _INPUT_MODALITY_ALIAS_MAP.get(modality_raw, modality_raw)
            if modality in _ALLOWED_INPUT_MODALITIES:
                modalities.add(modality)

    ordered = [modality for modality in _ALLOWED_INPUT_MODALITIES if modality in modalities]
    if not ordered:
        return ["text"]
    return ordered


def _normalize_source_type_list(raw_source_types: object) -> List[str]:
    source_types = set()
    if isinstance(raw_source_types, list):
        for item in raw_source_types:
            if not isinstance(item, str):
                continue
            source_type = item.strip().lower()
            if source_type in _ALLOWED_INPUT_SOURCE_TYPES:
                source_types.add(source_type)

    return [source_type for source_type in _ALLOWED_INPUT_SOURCE_TYPES if source_type in source_types]


def _normalize_input_source_types(
    raw_source_types: object,
    input_modalities: List[str],
) -> Dict[str, List[str]]:
    if not isinstance(raw_source_types, dict):
        return {}

    allowed_modalities = {modality for modality in input_modalities if modality != "text"}
    normalized: Dict[str, List[str]] = {}

    for key, value in raw_source_types.items():
        if not isinstance(key, str):
            continue
        modality_raw = key.strip().lower()
        modality = _INPUT_MODALITY_ALIAS_MAP.get(modality_raw, modality_raw)
        if modality not in allowed_modalities:
            continue

        source_types = _normalize_source_type_list(value)
        if source_types:
            existing_source_types = normalized.get(modality, [])
            normalized[modality] = _normalize_source_type_list(
                [*existing_source_types, *source_types]
            )

    return normalized


def _normalize_model_capabilities(raw_capabilities: Dict[str, object]) -> Dict[str, object]:
    input_modalities = _normalize_input_modalities(raw_capabilities.get("input_modalities"))
    input_source_types = _normalize_input_source_types(
        raw_capabilities.get("input_source_types"),
        input_modalities,
    )
    return {
        "input_modalities": input_modalities,
        "input_source_types": input_source_types,
    }


def _is_embedding_model(raw_capabilities: Dict[str, object]) -> bool:
    model_type = str(raw_capabilities.get("model_type", "")).strip().lower()
    return model_type == "embedding"


def _normalize_ollama_family(raw_family: object) -> str:
    if not isinstance(raw_family, str):
        return ""
    return raw_family.strip().lower()


def _is_ollama_embedding_family(raw_family: object) -> bool:
    family = _normalize_ollama_family(raw_family)
    return any(
        family == prefix or family.startswith(f"{prefix}-")
        for prefix in _OLLAMA_EMBEDDING_FAMILY_PREFIXES
    )


def _is_ollama_embedding_entry(raw_entry: object) -> bool:
    if not isinstance(raw_entry, dict):
        return False

    details = raw_entry.get("details")
    if not isinstance(details, dict):
        return False

    raw_families: List[object] = []
    if isinstance(details.get("families"), list):
        raw_families.extend(details["families"])
    if "family" in details:
        raw_families.append(details["family"])

    return any(_is_ollama_embedding_family(raw_family) for raw_family in raw_families)


def get_default_model_capabilities() -> Dict[str, object]:
    return _default_model_capabilities()


def _fetch_ollama_models(chat_only: bool = False) -> List[str]:
    """Query the local Ollama daemon for all installed model names.

    Returns an empty list if Ollama is unreachable or httpx is unavailable.
    """
    if _httpx is None:
        return []

    ollama_host = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
    try:
        response = _httpx.get(f"{ollama_host}/api/tags", timeout=3.0)
        response.raise_for_status()
        data = response.json()
        models = data.get("models") or []
        names: List[str] = []
        for entry in models:
            name = str(entry.get("name") or entry.get("model") or "").strip()
            if name:
                if chat_only and _is_ollama_embedding_entry(entry):
                    continue
                names.append(name)
        return names
    except Exception:
        return []


def get_capability_catalog() -> Dict[str, List[str]]:
    providers: Dict[str, List[str]] = {
        "openai": [],
        "anthropic": [],
        "ollama": [],
    }

    raw_catalog = _load_raw_capability_catalog()
    for model_name, capabilities in raw_catalog.items():
        provider = str(capabilities.get("provider", "")).strip().lower()
        if provider not in providers:
            continue
        if _is_embedding_model(capabilities):
            continue

        providers[provider].append(
            _normalize_provider_model_name(provider, model_name),
        )

    # Merge dynamically discovered Ollama chat models so installed LLMs
    # appear as chips regardless of model_capabilities.json.
    for live_model in _fetch_ollama_models(chat_only=True):
        normalized = _normalize_provider_model_name("ollama", live_model)
        if normalized:
            providers["ollama"].append(normalized)

    for provider_key in providers:
        providers[provider_key] = sorted({name for name in providers[provider_key] if name})

    return providers


def get_embedding_provider_catalog() -> Dict[str, List[str]]:
    providers: Dict[str, List[str]] = {
        "openai": [],
    }

    raw_catalog = _load_raw_capability_catalog()
    for model_name, capabilities in raw_catalog.items():
        provider = str(capabilities.get("provider", "")).strip().lower()
        if provider != "openai":
            continue
        if not _is_embedding_model(capabilities):
            continue

        normalized_model = _normalize_provider_model_name(provider, model_name)
        if not normalized_model:
            continue
        providers["openai"].append(normalized_model)

    providers["openai"] = sorted({name for name in providers["openai"] if name})
    return providers


def get_model_capability_catalog() -> Dict[str, Dict[str, object]]:
    catalog: Dict[str, Dict[str, object]] = {}

    raw_catalog = _load_raw_capability_catalog()
    for model_name, capabilities in raw_catalog.items():
        provider = str(capabilities.get("provider", "")).strip().lower()
        if provider not in _SUPPORTED_PROVIDERS:
            continue
        if _is_embedding_model(capabilities):
            continue

        normalized_model = _normalize_provider_model_name(provider, model_name)
        if not normalized_model:
            continue

        model_id = f"{provider}:{normalized_model}"
        catalog[model_id] = _normalize_model_capabilities(capabilities)

    ordered_model_ids = sorted(catalog)
    return {model_id: catalog[model_id] for model_id in ordered_model_ids}


def _resolve_toolkit_base():
    try:
        tool_module = importlib.import_module("unchain.tools")
    except Exception:
        return None

    toolkit_base = getattr(tool_module, "Toolkit", None)
    if isinstance(toolkit_base, type):
        return toolkit_base
    return None


# ── Tool introspection helpers ────────────────────────────────────────────────

_TOOL_MARKER_ATTRS = ("is_tool", "tool_name", "__tool__", "__tool_metadata__")


def _clean_docstring(doc: str) -> str:
    if not doc:
        return ""
    for line in doc.strip().splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return ""


def _enumerate_toolkit_tools(cls: type) -> List[Dict[str, str]]:
    """Return [{name, description}] for each tool found in a toolkit class."""
    tools: List[Dict[str, str]] = []
    seen_names: set[str] = set()

    # Strategy 1: explicit .tools list/tuple on the class
    raw_tools = getattr(cls, "tools", None)
    if isinstance(raw_tools, (list, tuple)):
        for t in raw_tools:
            if callable(t):
                name = getattr(t, "tool_name", None) or getattr(t, "__name__", None) or ""
                desc = getattr(t, "description", None) or getattr(t, "__doc__", None) or ""
                if name and name not in seen_names:
                    seen_names.add(name)
                    tools.append({"name": str(name), "description": _clean_docstring(str(desc))})
            elif isinstance(t, str) and t not in seen_names:
                seen_names.add(t)
                tools.append({"name": t, "description": ""})
        if tools:
            return tools

    # Strategy 2: inspect members for known tool-marker attributes
    try:
        members = inspect.getmembers(cls, predicate=callable)
    except Exception:
        members = []
    for attr_name, attr_val in members:
        if attr_name.startswith("_"):
            continue
        underlying = getattr(attr_val, "__func__", attr_val)
        is_marked = any(
            hasattr(attr_val, m) or hasattr(underlying, m) for m in _TOOL_MARKER_ATTRS
        )
        if is_marked and attr_name not in seen_names:
            seen_names.add(attr_name)
            name = (
                getattr(attr_val, "tool_name", None)
                or getattr(underlying, "tool_name", None)
                or attr_name
            )
            desc = (
                getattr(attr_val, "description", None)
                or getattr(underlying, "description", None)
                or getattr(attr_val, "__doc__", None)
                or ""
            )
            tools.append({"name": str(name), "description": _clean_docstring(str(desc))})
    if tools:
        return tools

    # Strategy 3: fall back to public callables defined in this class's own __dict__
    for attr_name, attr_val in cls.__dict__.items():
        if attr_name.startswith("_"):
            continue
        if isinstance(attr_val, staticmethod):
            fn = attr_val.__func__
        elif isinstance(attr_val, classmethod):
            fn = attr_val.__func__
        elif callable(attr_val):
            fn = attr_val
        else:
            continue
        if attr_name not in seen_names:
            seen_names.add(attr_name)
            desc = getattr(fn, "description", None) or getattr(fn, "__doc__", None) or ""
            tools.append({"name": attr_name, "description": _clean_docstring(str(desc))})
    return tools


def _enumerate_builtin_submodule_toolkits(
    toolkit_base: type,
    seen: set[str],
) -> List[Dict[str, object]]:
    """Walk unchain.toolkits.builtin and return concrete toolkit subclasses."""
    entries: List[Dict[str, object]] = []

    try:
        builtin_pkg = importlib.import_module("unchain.toolkits.builtin")
    except Exception:
        return entries

    pkg_path = getattr(builtin_pkg, "__path__", None)
    if not pkg_path:
        return entries

    for _finder, submodule_name, _ispkg in pkgutil.iter_modules(pkg_path):
        full_name = f"unchain.toolkits.builtin.{submodule_name}"
        try:
            submodule = importlib.import_module(full_name)
        except Exception:
            continue

        for attr_name in dir(submodule):
            candidate = getattr(submodule, attr_name, None)
            if not isinstance(candidate, type):
                continue
            try:
                is_sub = issubclass(candidate, toolkit_base)
            except Exception:
                continue
            if not is_sub or candidate is toolkit_base:
                continue

            class_name = candidate.__name__
            module_name = str(getattr(candidate, "__module__", full_name))
            dedupe_key = f"{module_name}:{class_name}"
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)

            tools = _enumerate_toolkit_tools(candidate)
            toolkit_name = _TOOLKIT_EXPORT_ID_ALIASES.get(class_name, submodule_name)
            entries.append({
                "name": toolkit_name,
                "class_name": class_name,
                "module": module_name,
                "kind": "builtin",
                "tools": tools,
            })

    return entries


def get_toolkit_catalog() -> Dict[str, object]:
    toolkit_base = _resolve_toolkit_base()
    if toolkit_base is None:
        return {
            "toolkits": [],
            "count": 0,
            "source": "",
        }

    entries: List[Dict[str, object]] = []
    seen: set[str] = set()

    # Mark the abstract base as seen so submodule walker skips it
    base_module = str(getattr(toolkit_base, "__module__", ""))
    seen.add(f"{base_module}:{toolkit_base.__name__}")

    # Walk unchain.toolkits.builtin for concrete implementations
    entries.extend(_enumerate_builtin_submodule_toolkits(toolkit_base, seen))

    # Also pick up exported toolkit classes from unchain.toolkits.
    # that weren't already found via submodule walk
    try:
        toolkit_module = importlib.import_module("unchain.toolkits")
    except Exception:
        toolkit_module = None

    if toolkit_module is not None:
        for export_name, kind in _KNOWN_TOOLKIT_EXPORTS.items():
            candidate = getattr(toolkit_module, export_name, None)
            if not isinstance(candidate, type):
                continue
            try:
                is_sub = issubclass(candidate, toolkit_base)
            except Exception:
                continue
            if not is_sub or candidate is toolkit_base:
                continue
            class_name = candidate.__name__
            module_name = str(getattr(candidate, "__module__", ""))
            dedupe_key = f"{module_name}:{class_name}"
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            tools = _enumerate_toolkit_tools(candidate)
            entries.append({
                "name": _TOOLKIT_EXPORT_ID_ALIASES.get(export_name, export_name),
                "class_name": class_name,
                "module": module_name,
                "kind": kind,
                "tools": tools,
            })

    return {
        "toolkits": entries,
        "count": len(entries),
        "source": "",
    }


# ── Toolkit directory / TOML helpers ─────────────────────────────────────────

def _resolve_toolkit_dir(toolkit_class: type) -> Path | None:
    """Return the directory that contains the toolkit's Python module."""
    module_name = getattr(toolkit_class, "__module__", "")
    if not module_name:
        return None
    try:
        mod = importlib.import_module(module_name)
    except Exception:
        return None
    mod_file = getattr(mod, "__file__", None)
    if not mod_file:
        return None
    return Path(mod_file).parent


def _read_toolkit_toml(toolkit_class: type) -> Dict[str, object]:
    """Read and parse toolkit.toml from the toolkit's directory.

    Returns an empty dict on any failure.
    """
    toolkit_dir = _resolve_toolkit_dir(toolkit_class)
    if toolkit_dir is None:
        return {}
    toml_path = toolkit_dir / "toolkit.toml"
    if not toml_path.is_file():
        return {}
    try:
        with open(toml_path, "rb") as f:
            return tomllib.load(f)
    except Exception:
        return {}


# ── Icon / README helpers ────────────────────────────────────────────────────

def _looks_like_icon_asset(value: str) -> bool:
    return Path(value).suffix.lower() in {".svg", ".png"}


def _read_icon_payload(icon_path: object) -> Dict[str, str]:
    """Read an icon file and return an IconPayload dict.

    Returns an empty dict on any failure so the catalog remains usable.
    """
    if not isinstance(icon_path, str) or not icon_path.strip():
        return {}

    path = Path(icon_path.strip())
    if not path.is_file():
        return {}

    try:
        suffix = path.suffix.lower()
        if suffix == ".svg":
            content = path.read_text(encoding="utf-8", errors="replace")
            return {
                "type": "file",
                "mimeType": "image/svg+xml",
                "content": content,
                "encoding": "utf8",
            }
        if suffix == ".png":
            raw = path.read_bytes()
            content = base64.b64encode(raw).decode("ascii")
            return {
                "type": "file",
                "mimeType": "image/png",
                "content": content,
                "encoding": "base64",
            }
    except Exception:
        pass
    return {}


def _read_builtin_icon_payload(
    icon_name: object,
    color: object,
    background_color: object,
) -> Dict[str, str]:
    if not isinstance(icon_name, str) or not icon_name.strip():
        return {}
    if not isinstance(color, str) or not color.strip():
        return {}
    if not isinstance(background_color, str) or not background_color.strip():
        return {}
    return {
        "type": "builtin",
        "name": icon_name.strip(),
        "color": color.strip(),
        "backgroundColor": background_color.strip(),
    }


def _resolve_toolkit_readme(toolkit_class: type) -> str:
    """Locate and read the README.md that lives beside a toolkit module.

    Resolution order:
    1. ``[toolkit] readme`` path from toolkit.toml (relative to toolkit dir)
    2. README.md in the module directory
    3. README.md in the parent package directory
    """
    toolkit_dir = _resolve_toolkit_dir(toolkit_class)

    # 1. Check toolkit.toml readme field
    if toolkit_dir is not None:
        toml_data = _read_toolkit_toml(toolkit_class)
        toml_readme = (toml_data.get("toolkit") or {}).get("readme", "")
        if isinstance(toml_readme, str) and toml_readme.strip():
            readme_path = toolkit_dir / toml_readme.strip()
            if readme_path.is_file():
                try:
                    return readme_path.read_text(encoding="utf-8", errors="replace")
                except Exception:
                    pass

    # 2. Look for README.md in the module directory
    if toolkit_dir is not None:
        for candidate in ("README.md", "readme.md", "Readme.md"):
            readme_path = toolkit_dir / candidate
            if readme_path.is_file():
                try:
                    return readme_path.read_text(encoding="utf-8", errors="replace")
                except Exception:
                    return ""

        # 3. Also check the parent package dir (for toolkit packages)
        parent_dir = toolkit_dir.parent
        for candidate in ("README.md", "readme.md", "Readme.md"):
            readme_path = parent_dir / candidate
            if readme_path.is_file():
                try:
                    return readme_path.read_text(encoding="utf-8", errors="replace")
                except Exception:
                    return ""

    return ""


def _get_toolkit_icon_path(toolkit_class: type) -> str:
    """Extract icon_path from a toolkit class or auto-discover icon.svg."""
    # 1. Explicit class attribute
    icon_path = getattr(toolkit_class, "icon_path", None)
    if isinstance(icon_path, str) and icon_path.strip():
        return icon_path.strip()
    icon_path = getattr(toolkit_class, "icon", None)
    if isinstance(icon_path, str) and icon_path.strip():
        return icon_path.strip()

    # 2. Read from toolkit.toml `[toolkit] icon` field
    toml_data = _read_toolkit_toml(toolkit_class)
    toml_icon = (toml_data.get("toolkit") or {}).get("icon", "")
    if isinstance(toml_icon, str) and toml_icon.strip():
        toolkit_dir = _resolve_toolkit_dir(toolkit_class)
        if toolkit_dir is not None:
            resolved = toolkit_dir / toml_icon.strip()
            if resolved.is_file():
                return str(resolved)

    # 3. Auto-discover icon.svg / icon.png in the toolkit directory
    toolkit_dir = _resolve_toolkit_dir(toolkit_class)
    if toolkit_dir is not None:
        for candidate in ("icon.svg", "icon.png"):
            icon_file = toolkit_dir / candidate
            if icon_file.is_file():
                return str(icon_file)
    return ""


def _get_toolkit_icon_payload(toolkit_class: type) -> Dict[str, str]:
    """Resolve a toolkit icon as either a file payload or a builtin icon."""
    icon_path = getattr(toolkit_class, "icon_path", None)
    if isinstance(icon_path, str) and icon_path.strip():
        payload = _read_icon_payload(icon_path.strip())
        if payload:
            return payload

    icon_path = getattr(toolkit_class, "icon", None)
    if isinstance(icon_path, str) and icon_path.strip():
        payload = _read_icon_payload(icon_path.strip())
        if payload:
            return payload

    toml_data = _read_toolkit_toml(toolkit_class)
    toml_toolkit = toml_data.get("toolkit") or {}
    toml_icon = toml_toolkit.get("icon", "")
    if isinstance(toml_icon, str) and toml_icon.strip():
        icon_name = toml_icon.strip()
        if _looks_like_icon_asset(icon_name):
            toolkit_dir = _resolve_toolkit_dir(toolkit_class)
            if toolkit_dir is not None:
                payload = _read_icon_payload(str((toolkit_dir / icon_name).resolve()))
                if payload:
                    return payload
        payload = _read_builtin_icon_payload(
            icon_name,
            toml_toolkit.get("color"),
            toml_toolkit.get("backgroundcolor"),
        )
        if payload:
            return payload

    auto_icon_path = _get_toolkit_icon_path(toolkit_class)
    if auto_icon_path:
        payload = _read_icon_payload(auto_icon_path)
        if payload:
            return payload
    return {}


def _enumerate_toolkit_tools_v2(cls: type) -> List[Dict[str, object]]:
    """Return enriched tool rows for the v2 catalog.

    Merges metadata from three sources (highest priority first):
    1. ``__tool_metadata__`` attribute on the method
    2. ``[[tools]]`` entry in toolkit.toml (matched by name)
    3. Basic introspection from ``_enumerate_toolkit_tools``
    """
    basic_tools = _enumerate_toolkit_tools(cls)
    enriched: List[Dict[str, object]] = []
    toolkit_icon = _get_toolkit_icon_payload(cls)

    # Build a lookup from toolkit.toml [[tools]] entries
    toml_data = _read_toolkit_toml(cls)
    toml_tools_list = toml_data.get("tools") or []
    if not isinstance(toml_tools_list, list):
        toml_tools_list = []
    toml_tools_by_name: Dict[str, Dict[str, object]] = {}
    for entry in toml_tools_list:
        if isinstance(entry, dict):
            tn = str(entry.get("name", "")).strip()
            if tn:
                toml_tools_by_name[tn] = entry

    for tool in basic_tools:
        tool_name = tool.get("name", "")

        # Try to read per-tool metadata from the toolkit class
        tool_meta: Dict[str, object] = {}
        tool_func = None
        try:
            tool_func = getattr(cls, tool_name, None)
        except Exception:
            pass

        if tool_func is not None:
            tool_meta = getattr(tool_func, "__tool_metadata__", {}) or {}
            if not isinstance(tool_meta, dict):
                tool_meta = {}

        # Merge with toml entry (toml is lower priority than __tool_metadata__)
        toml_entry = toml_tools_by_name.get(tool_name, {})

        icon_path = tool_meta.get("icon_path", "") or ""
        icon_payload = _read_icon_payload(icon_path) if icon_path else copy.deepcopy(toolkit_icon)

        title = (
            str(tool_meta.get("title", "")).strip()
            or str(toml_entry.get("title", "")).strip()
            or tool_name
        )
        description = (
            tool.get("description", "")
            or str(toml_entry.get("description", "")).strip()
        )

        enriched.append({
            "name": tool_name,
            "title": title,
            "description": description,
            "icon": icon_payload,
            "hidden": bool(
                tool_meta.get("hidden", toml_entry.get("hidden", False))
            ),
            "observe": bool(
                tool_meta.get("observe", toml_entry.get("observe", False))
            ),
            "requiresConfirmation": tool_name in _CONFIRMATION_REQUIRED_TOOL_NAMES
                or bool(tool_meta.get(
                    "requires_confirmation",
                    toml_entry.get("requires_confirmation", False),
                )),
        })

    return enriched


def _detect_toolkit_source(kind: str) -> str:
    """Map toolkit kind to a source label for the v2 catalog."""
    if kind in ("builtin", "core"):
        return "builtin"
    if kind == "integration":
        return "plugin"
    return "local"


def get_toolkit_catalog_v2() -> Dict[str, object]:
    """Enriched toolkit catalog with icon payloads, per-tool metadata, and
    README support for the tool-modal UI."""
    toolkit_base = _resolve_toolkit_base()
    if toolkit_base is None:
        return {
            "toolkits": [],
            "count": 0,
            "source": "",
        }

    def _build_entry(candidate: type, kind: str) -> Dict[str, object]:
        """Build a single ToolkitGroup dict, merging toolkit.toml fields."""
        class_name = candidate.__name__
        toml_data = _read_toolkit_toml(candidate)
        toml_toolkit = toml_data.get("toolkit") or {}
        toml_display = toml_data.get("display") or {}

        toolkit_name = (
            str(toml_toolkit.get("name", "")).strip() or class_name
        )
        toolkit_description = (
            str(toml_toolkit.get("description", "")).strip()
            or _clean_docstring(getattr(candidate, "__doc__", "") or "")
        )
        source = (
            _detect_toolkit_source(
                str(toml_display.get("category", "")).strip() or kind
            )
        )
        display_order = toml_display.get("order", 999)
        if not isinstance(display_order, (int, float)):
            display_order = 999
        hidden = bool(toml_display.get("hidden", False))

        tools_v2 = _enumerate_toolkit_tools_v2(candidate)
        toolkit_icon = _get_toolkit_icon_payload(candidate)
        tags = toml_toolkit.get("tags", [])
        if not isinstance(tags, list):
            tags = []

        return {
            "toolkitId": _TOOLKIT_EXPORT_ID_ALIASES.get(class_name, class_name),
            "toolkitName": toolkit_name,
            "toolkitDescription": toolkit_description,
            "toolkitIcon": toolkit_icon,
            "source": source,
            "toolCount": len(tools_v2),
            "defaultEnabled": False,
            "tools": tools_v2,
            "displayOrder": int(display_order),
            "hidden": hidden,
            "tags": [str(t) for t in tags if isinstance(t, str)],
        }

    # Re-use the same discovery logic as v1
    entries: List[Dict[str, object]] = []
    seen: set[str] = set()

    base_module = str(getattr(toolkit_base, "__module__", ""))
    seen.add(f"{base_module}:{toolkit_base.__name__}")

    # Walk builtin submodules
    try:
        builtin_pkg = importlib.import_module("unchain.toolkits.builtin")
    except Exception:
        builtin_pkg = None

    if builtin_pkg is not None:
        pkg_path = getattr(builtin_pkg, "__path__", None)
        if pkg_path:
            for _finder, submodule_name, _ispkg in pkgutil.iter_modules(pkg_path):
                full_name = f"unchain.toolkits.builtin.{submodule_name}"
                try:
                    submodule = importlib.import_module(full_name)
                except Exception:
                    continue

                for attr_name in dir(submodule):
                    candidate = getattr(submodule, attr_name, None)
                    if not isinstance(candidate, type):
                        continue
                    try:
                        is_sub = issubclass(candidate, toolkit_base)
                    except Exception:
                        continue
                    if not is_sub or candidate is toolkit_base:
                        continue

                    class_name = candidate.__name__
                    module_name = str(getattr(candidate, "__module__", full_name))
                    dedupe_key = f"{module_name}:{class_name}"
                    if dedupe_key in seen:
                        continue
                    seen.add(dedupe_key)

                    entries.append(_build_entry(candidate, "builtin"))

    # Exported toolkit classes
    try:
        toolkit_module = importlib.import_module("unchain.toolkits")
    except Exception:
        toolkit_module = None

    if toolkit_module is not None:
        for export_name, kind in _KNOWN_TOOLKIT_EXPORTS.items():
            candidate = getattr(toolkit_module, export_name, None)
            if not isinstance(candidate, type):
                continue
            try:
                is_sub = issubclass(candidate, toolkit_base)
            except Exception:
                continue
            if not is_sub or candidate is toolkit_base:
                continue
            class_name = candidate.__name__
            module_name = str(getattr(candidate, "__module__", ""))
            dedupe_key = f"{module_name}:{class_name}"
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)

            entries.append(_build_entry(candidate, kind))

    # Sort by display order from toolkit.toml
    entries.sort(key=lambda e: (e.get("displayOrder", 999), e.get("toolkitName", "")))

    return {
        "toolkits": entries,
        "count": len(entries),
        "source": "",
    }


def get_toolkit_metadata(
    toolkit_id: str,
    tool_name: str | None = None,
) -> Dict[str, object]:
    """Return toolkit README markdown + icon for the detail panel."""
    if not isinstance(toolkit_id, str) or not toolkit_id.strip():
        return {
            "toolkitId": "",
            "toolkitName": "",
            "toolkitDescription": "",
            "toolkitIcon": {},
            "readmeMarkdown": "",
            "selectedToolName": None,
        }

    toolkit_id = toolkit_id.strip()

    toolkit_base = _resolve_toolkit_base()
    if toolkit_base is None:
        return {
            "toolkitId": toolkit_id,
            "toolkitName": toolkit_id,
            "toolkitDescription": "",
            "toolkitIcon": {},
            "readmeMarkdown": "",
            "selectedToolName": tool_name,
        }

    # Search for the toolkit class by class_name
    found_class: type | None = None
    normalized_toolkit_id = _TOOLKIT_NAME_ALIASES.get(toolkit_id, toolkit_id)

    try:
        builtin_pkg = importlib.import_module("unchain.toolkits.builtin")
        pkg_path = getattr(builtin_pkg, "__path__", None)
        if pkg_path:
            for _finder, submodule_name, _ispkg in pkgutil.iter_modules(pkg_path):
                full_name = f"unchain.toolkits.builtin.{submodule_name}"
                try:
                    submodule = importlib.import_module(full_name)
                except Exception:
                    continue
                for attr_name in dir(submodule):
                    candidate = getattr(submodule, attr_name, None)
                    if (
                        isinstance(candidate, type)
                        and issubclass(candidate, toolkit_base)
                        and candidate is not toolkit_base
                        and (
                            candidate.__name__ == normalized_toolkit_id
                            or _TOOLKIT_EXPORT_ID_ALIASES.get(candidate.__name__) == toolkit_id
                        )
                    ):
                        found_class = candidate
                        break
                if found_class:
                    break
    except Exception:
        pass

    # Also check top-level unchain exports
    if found_class is None:
        try:
            toolkit_module = importlib.import_module("unchain.toolkits")
            for export_name in _KNOWN_TOOLKIT_EXPORTS:
                candidate = getattr(toolkit_module, export_name, None)
                if (
                    isinstance(candidate, type)
                    and issubclass(candidate, toolkit_base)
                    and candidate is not toolkit_base
                    and (
                        candidate.__name__ == normalized_toolkit_id
                        or _TOOLKIT_EXPORT_ID_ALIASES.get(candidate.__name__) == toolkit_id
                    )
                ):
                    found_class = candidate
                    break
        except Exception:
            pass

    if found_class is None:
        return {
            "toolkitId": toolkit_id,
            "toolkitName": toolkit_id,
            "toolkitDescription": "",
            "toolkitIcon": {},
            "readmeMarkdown": "",
            "selectedToolName": tool_name,
        }

    toolkit_icon = _get_toolkit_icon_payload(found_class)
    readme_markdown = _resolve_toolkit_readme(found_class)

    toml_data = _read_toolkit_toml(found_class)
    toml_toolkit = toml_data.get("toolkit") or {}
    toolkit_name = (
        str(toml_toolkit.get("name", "")).strip() or found_class.__name__
    )
    toolkit_description = (
        str(toml_toolkit.get("description", "")).strip()
        or _clean_docstring(getattr(found_class, "__doc__", "") or "")
    )

    return {
        "toolkitId": toolkit_id,
        "toolkitName": toolkit_name,
        "toolkitDescription": toolkit_description,
        "toolkitIcon": toolkit_icon,
        "readmeMarkdown": readme_markdown,
        "selectedToolName": tool_name,
    }


def _build_payload(provider: str, options: Dict[str, object]) -> Dict[str, float]:
    payload: Dict[str, float] = {}

    temperature = options.get("temperature")
    if isinstance(temperature, (int, float)):
        payload["temperature"] = float(temperature)

    max_tokens = options.get("maxTokens")
    if isinstance(max_tokens, (int, float)):
        max_tokens_value = int(max_tokens)
        if provider == "openai":
            payload["max_output_tokens"] = max_tokens_value
        elif provider == "anthropic":
            payload["max_tokens"] = max_tokens_value
        else:
            payload["num_predict"] = max_tokens_value

    return payload


def _normalize_system_prompt_v2_section_key(raw_key: object) -> str:
    if not isinstance(raw_key, str):
        return ""
    normalized = raw_key.strip().lower()
    normalized = _SYSTEM_PROMPT_V2_SECTION_ALIASES.get(normalized, normalized)
    if normalized in _SYSTEM_PROMPT_V2_SECTION_ORDER:
        return normalized
    return ""


def _sanitize_system_prompt_v2_section_value(value: object) -> str:
    if not isinstance(value, str):
        return ""
    trimmed = value.strip()
    if not trimmed:
        return ""
    return trimmed[:_SYSTEM_PROMPT_V2_MAX_SECTION_CHARS]


def _sanitize_system_prompt_v2_defaults(raw_sections: object) -> Dict[str, str]:
    if not isinstance(raw_sections, dict):
        return {}

    sanitized: Dict[str, str] = {}
    for key, value in raw_sections.items():
        normalized_key = _normalize_system_prompt_v2_section_key(key)
        if not normalized_key:
            continue
        normalized_value = _sanitize_system_prompt_v2_section_value(value)
        if normalized_value:
            sanitized[normalized_key] = normalized_value
    return sanitized


def _sanitize_system_prompt_v2_overrides(
    raw_sections: object,
) -> Dict[str, str | None]:
    if not isinstance(raw_sections, dict):
        return {}

    sanitized: Dict[str, str | None] = {}
    for key, value in raw_sections.items():
        normalized_key = _normalize_system_prompt_v2_section_key(key)
        if not normalized_key:
            continue
        if value is None:
            sanitized[normalized_key] = None
            continue
        if isinstance(value, str):
            sanitized[normalized_key] = _sanitize_system_prompt_v2_section_value(value)
    return sanitized


def _extract_system_prompt_v2_options(options: Dict[str, object] | None) -> Dict[str, object]:
    if not isinstance(options, dict):
        return {}

    raw_system_prompt = options.get("system_prompt_v2")
    if not isinstance(raw_system_prompt, dict):
        raw_system_prompt = options.get("systemPromptV2")
    if not isinstance(raw_system_prompt, dict):
        return {}

    enabled_raw = raw_system_prompt.get("enabled")
    enabled = enabled_raw if isinstance(enabled_raw, bool) else True
    defaults = _sanitize_system_prompt_v2_defaults(raw_system_prompt.get("defaults"))
    overrides = _sanitize_system_prompt_v2_overrides(raw_system_prompt.get("overrides"))

    return {
        "enabled": enabled,
        "defaults": defaults,
        "overrides": overrides,
    }


def _merge_system_prompt_v2_sections(
    defaults: Dict[str, str],
    overrides: Dict[str, str | None],
) -> Dict[str, str]:
    merged: Dict[str, str] = {}
    for section_name in _SYSTEM_PROMPT_V2_SECTION_ORDER:
        if section_name in overrides:
            override_value = overrides.get(section_name)
            # None is an explicit clear: do not inherit defaults.
            if override_value is None:
                continue
            # Empty string inherits defaults.
            if isinstance(override_value, str) and override_value:
                merged[section_name] = override_value
                continue
        default_value = defaults.get(section_name)
        if isinstance(default_value, str) and default_value:
            merged[section_name] = default_value
    return merged


def _compile_system_prompt_v2_text(sections: Dict[str, str]) -> str:
    blocks: List[str] = []
    for section_name in _SYSTEM_PROMPT_V2_SECTION_ORDER:
        section_value = sections.get(section_name)
        if not isinstance(section_value, str) or not section_value:
            continue
        section_title = _SYSTEM_PROMPT_V2_SECTION_TITLES.get(section_name, section_name)
        blocks.append(f"[{section_title}]\n{section_value}")
    return "\n\n".join(blocks).strip()


def _inject_builtin_rules(sections: Dict[str, str]) -> Dict[str, str]:
    """Prepend built-in rules to the rules section (if any), or create it."""
    builtin_text = "\n".join(_SYSTEM_PROMPT_V2_BUILTIN_RULES)
    existing_rules = sections.get("rules", "")
    if existing_rules:
        combined = builtin_text + "\n" + existing_rules
    else:
        combined = builtin_text
    return {**sections, "rules": combined}


def _build_system_prompt_v2_text_from_options(options: Dict[str, object] | None) -> str:
    normalized = _extract_system_prompt_v2_options(options)
    if not normalized:
        return ""

    if normalized.get("enabled") is not True:
        return ""

    defaults = normalized.get("defaults")
    overrides = normalized.get("overrides")
    merged = _merge_system_prompt_v2_sections(
        defaults if isinstance(defaults, dict) else {},
        overrides if isinstance(overrides, dict) else {},
    )
    merged = _inject_builtin_rules(merged)
    if not merged:
        return ""
    return _compile_system_prompt_v2_text(merged)


def _extract_agent_instructions(options: Dict[str, object] | None) -> str:
    if not isinstance(options, dict):
        return ""
    raw_value = options.get("agent_instructions")
    if not isinstance(raw_value, str):
        raw_value = options.get("agentInstructions")
    if not isinstance(raw_value, str):
        return ""
    return raw_value.strip()


def _build_effective_system_prompt_text(options: Dict[str, object] | None) -> str:
    system_prompt_text = _build_system_prompt_v2_text_from_options(options)
    agent_instructions = _extract_agent_instructions(options)
    if system_prompt_text and agent_instructions:
        return f"{system_prompt_text}\n\n{agent_instructions}".strip()
    return system_prompt_text or agent_instructions


def _prepend_system_message(
    messages: List[Dict[str, Any]],
    system_prompt_text: str,
) -> List[Dict[str, Any]]:
    text = system_prompt_text.strip()
    if not text:
        return messages
    return [{"role": "system", "content": text}, *messages]


def _normalize_history_content(content: object) -> str | List[Dict[str, object]] | None:
    if isinstance(content, str):
        trimmed = content.strip()
        return trimmed if trimmed else None

    if not isinstance(content, list):
        return None

    normalized_blocks: List[Dict[str, object]] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        normalized_blocks.append(copy.deepcopy(block))

    if not normalized_blocks:
        return None
    return normalized_blocks


def _normalize_stream_attachments(
    attachments: List[Dict[str, object]] | None,
) -> List[Dict[str, object]]:
    if not isinstance(attachments, list):
        return []

    normalized: List[Dict[str, object]] = []
    for item in attachments:
        if not isinstance(item, dict):
            continue
        normalized.append(copy.deepcopy(item))
    return normalized


def _build_current_user_content(
    message: str,
    attachments: List[Dict[str, object]],
) -> str | List[Dict[str, object]]:
    normalized_text = message.strip()
    if not attachments:
        return normalized_text

    content_blocks: List[Dict[str, object]] = []
    if normalized_text:
        content_blocks.append({"type": "text", "text": normalized_text})
    content_blocks.extend(copy.deepcopy(attachments))
    return content_blocks


def _normalize_messages(
    history: List[Dict[str, object]],
    message: str,
    attachments: List[Dict[str, object]] | None = None,
) -> List[Dict[str, Any]]:
    messages: List[Dict[str, Any]] = []

    for item in history:
        if not isinstance(item, dict):
            continue

        role = str(item.get("role", "")).strip()
        if role not in {"system", "user", "assistant"}:
            continue

        normalized_content = _normalize_history_content(item.get("content"))
        if normalized_content is None:
            continue

        messages.append({"role": role, "content": normalized_content})

    normalized_attachments = _normalize_stream_attachments(attachments)
    current_content = _build_current_user_content(message, normalized_attachments)

    if isinstance(current_content, str) and not current_content.strip():
        return messages

    if (
        not messages
        or messages[-1].get("role") != "user"
        or messages[-1].get("content") != current_content
    ):
        messages.append({"role": "user", "content": current_content})

    return messages


def _normalize_key_candidate(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()


def _extract_api_key_from_options(options: Dict[str, object] | None, provider: str) -> str:
    if not isinstance(options, dict):
        return ""

    provider = provider.strip().lower()
    provider_camel_key = "openaiApiKey" if provider == "openai" else "anthropicApiKey"
    provider_snake_key = f"{provider}_api_key"

    candidates = [
        options.get(provider_camel_key),
        options.get(provider_snake_key),
        options.get("apiKey"),
        options.get("api_key"),
        options.get("unchainApiKey"),
        options.get("unchain_api_key"),
    ]

    for candidate in candidates:
        normalized = _normalize_key_candidate(candidate)
        if normalized:
            return normalized

    return ""


def _extract_workspace_root_from_options(options: Dict[str, object] | None) -> str:
    if not isinstance(options, dict):
        return ""

    for key in ("workspaceRoot", "workspace_root"):
        candidate = options.get(key)
        if isinstance(candidate, str):
            normalized = candidate.strip()
            if normalized:
                return normalized
    return ""


def _extract_workspace_roots_from_options(options: Dict[str, object] | None) -> list[str]:
    """Return the ordered list of workspace root paths from options.

    Prefers the new ``workspace_roots`` array; falls back to the legacy
    ``workspaceRoot`` / ``workspace_root`` single-value keys for backward compat.
    Deduplicates while preserving order.
    """
    if not isinstance(options, dict):
        return []

    seen: set[str] = set()
    roots: list[str] = []

    # New multi-root field
    workspace_roots = options.get("workspace_roots")
    if isinstance(workspace_roots, list):
        for entry in workspace_roots:
            if isinstance(entry, str):
                normalized = entry.strip()
                if normalized and normalized not in seen:
                    seen.add(normalized)
                    roots.append(normalized)

    # Legacy single-root fallback
    if not roots:
        single = _extract_workspace_root_from_options(options)
        if single:
            roots.append(single)

    return roots


def _extract_toolkit_names(options: Dict[str, object] | None) -> list[str]:
    if not isinstance(options, dict):
        return []
    toolkits = options.get("toolkits")
    if not isinstance(toolkits, list):
        return []
    names: list[str] = []
    seen: set[str] = set()
    for entry in toolkits:
        if not isinstance(entry, str):
            continue
        name = entry.strip()
        if not name or name in seen:
            continue
        seen.add(name)
        names.append(name)
    return names


def _should_enable_tools(options: Dict[str, object] | None) -> bool:
    """Return True when the caller explicitly requests tool-enabled mode.

    The frontend sends ``options.toolkits`` (a non-empty list) when the user
    selects toolkits in the tool picker.  When the list is absent or empty we
    should *not* attach any toolkits to the agent so that providers which do
    not support tool calling (e.g. some Ollama models) never receive a
    ``tools`` parameter.
    """
    if not isinstance(options, dict):
        return False

    toolkits = options.get("toolkits")
    if isinstance(toolkits, list) and len(toolkits) > 0:
        return True

    # Also honour an explicit boolean flag if provided.
    enable_tools = options.get("enable_tools") or options.get("enableTools")
    if enable_tools is True:
        return True

    return False


def _extract_max_iterations_from_options(options: Dict[str, object] | None) -> int | None:
    if not isinstance(options, dict):
        return None

    candidate = options.get("maxIterations")
    if candidate is None:
        candidate = options.get("max_iterations")

    try:
        parsed = int(candidate)  # type: ignore[arg-type]
    except Exception:
        return None

    return max(1, parsed)


def _resolve_workspace_root(workspace_root: str) -> Path:
    candidate = Path(workspace_root).expanduser().resolve()
    if not candidate.exists():
        raise RuntimeError(f"workspace_root does not exist: {candidate}")
    if not candidate.is_dir():
        raise RuntimeError(f"workspace_root is not a directory: {candidate}")
    return candidate


def _mark_workspace_tools_for_confirmation(workspace_toolkit: Any) -> None:
    tools = getattr(workspace_toolkit, "tools", None)
    if not isinstance(tools, dict):
        return

    for tool_name in _CONFIRMATION_REQUIRED_TOOL_NAMES:
        tool_obj = tools.get(tool_name)
        if tool_obj is None:
            continue
        try:
            tool_obj.requires_confirmation = True
        except Exception:
            continue


def _resolve_workspace_toolkit_factory(toolkit_module: Any) -> Any:
    """Return the WorkspaceToolkit constructor from unchain.toolkits."""
    workspace_factory = getattr(toolkit_module, "WorkspaceToolkit", None)
    if callable(workspace_factory):
        return workspace_factory
    raise RuntimeError("Miso WorkspaceToolkit is unavailable")


def _resolve_workspace_roots(workspace_roots_raw: list[str]) -> list[str]:
    return [str(_resolve_workspace_root(raw)) for raw in workspace_roots_raw]


def _build_workspace_toolkit_for_root(
    toolkit_factory: Any,
    *,
    workspace_root: str,
) -> Any:
    build_attempts = []
    build_attempts.append(lambda: toolkit_factory(workspace_root=workspace_root))
    build_attempts.append(lambda: toolkit_factory(workspace_root))

    last_type_error = None
    for build_attempt in build_attempts:
        try:
            return build_attempt()
        except TypeError as error:
            last_type_error = error

    raise last_type_error or RuntimeError("Failed to create workspace toolkit")


def _build_generic_toolkit(
    toolkit_factory: Any,
    *,
    workspace_root: str | None,
) -> Any:
    build_attempts = []
    if workspace_root:
        build_attempts.append(lambda: toolkit_factory(workspace_root=workspace_root))
        build_attempts.append(lambda: toolkit_factory(workspace_root))
    build_attempts.append(lambda: toolkit_factory())

    last_type_error = None
    for build_attempt in build_attempts:
        try:
            return build_attempt()
        except TypeError as error:
            last_type_error = error

    raise last_type_error or RuntimeError("Failed to create toolkit")


def _try_build_workspace_toolkit_for_roots(
    toolkit_factory: Any,
    *,
    workspace_roots: list[str],
) -> Any | None:
    build_attempts = []
    build_attempts.append(lambda: toolkit_factory(workspace_roots=workspace_roots))
    build_attempts.append(lambda: toolkit_factory(workspace_roots))

    for build_attempt in build_attempts:
        try:
            return build_attempt()
        except TypeError:
            continue

    return None


def _build_workspace_tool_prefix(workspace_root: str, index: int) -> str:
    label = Path(workspace_root).name or f"workspace_{index}"
    slug = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
    slug = slug[:32] or "workspace"
    return f"workspace_{index}_{slug}"


def _build_multi_workspace_proxy_toolkit(
    toolkit_factory: Any,
    *,
    workspace_roots: list[str],
) -> Any:
    try:
        tools_module = importlib.import_module("unchain.tools")
    except Exception as import_error:
        raise RuntimeError(
            f"Failed to import unchain.tools for multi-workspace fallback: {import_error}"
        ) from import_error

    toolkit_cls = getattr(tools_module, "Toolkit", None)
    tool_cls = getattr(tools_module, "Tool", None)
    if not callable(toolkit_cls) or not callable(tool_cls):
        raise RuntimeError(
            "Miso multi-workspace fallback requires Toolkit and Tool exports"
        )

    merged_toolkit = toolkit_cls()
    workspace_entries = []

    for index, workspace_root in enumerate(workspace_roots, start=1):
        source_toolkit = _build_workspace_toolkit_for_root(
            toolkit_factory,
            workspace_root=workspace_root,
        )
        _mark_workspace_tools_for_confirmation(source_toolkit)
        workspace_entries.append(
            {
                "index": index,
                "root": workspace_root,
                "prefix": _build_workspace_tool_prefix(workspace_root, index),
                "toolkit": source_toolkit,
            }
        )

    default_entry = workspace_entries[0]
    for tool_name, tool_obj in getattr(default_entry["toolkit"], "tools", {}).items():
        merged_toolkit.tools[tool_name] = tool_obj

    for entry in workspace_entries[1:]:
        source_toolkit = entry["toolkit"]
        tool_prefix = entry["prefix"]
        workspace_root = entry["root"]

        for tool_name, tool_obj in getattr(source_toolkit, "tools", {}).items():
            proxy_name = f"{tool_prefix}_{tool_name}"
            proxy_description = (
                f"{getattr(tool_obj, 'description', '')} "
                f"Only for workspace '{tool_prefix}' at {workspace_root}."
            ).strip()

            def _make_proxy(
                current_toolkit: Any = source_toolkit,
                current_tool_name: str = tool_name,
            ) -> Any:
                def _proxy(**kwargs: Any) -> Any:
                    return current_toolkit.execute(current_tool_name, kwargs)

                return _proxy

            proxy_tool = tool_cls(
                name=proxy_name,
                description=proxy_description,
                func=_make_proxy(),
                parameters=list(getattr(tool_obj, "parameters", []) or []),
                observe=bool(getattr(tool_obj, "observe", False)),
                requires_confirmation=bool(
                    getattr(tool_obj, "requires_confirmation", False)
                    or tool_name in _CONFIRMATION_REQUIRED_TOOL_NAMES
                ),
            )
            _set_workspace_proxy_tool_metadata(
                proxy_tool,
                original_tool_name=tool_name,
            )
            merged_toolkit.register(proxy_tool)

    workspace_map = [
        {
            "tool_prefix": "default",
            "workspace_root": default_entry["root"],
            "default": True,
        }
    ]
    workspace_map.extend(
        {
            "tool_prefix": entry["prefix"],
            "workspace_root": entry["root"],
            "default": False,
        }
        for entry in workspace_entries[1:]
    )

    def list_available_workspaces() -> dict[str, Any]:
        return {
            "workspaces": workspace_map,
            "note": (
                "Use the original workspace tool names for the default workspace. "
                "Use the prefixed tool names for additional workspaces."
            ),
        }

    merged_toolkit.register(
        tool_cls(
            name="list_available_workspaces",
            description=(
                "List every available workspace root and the tool-name prefix "
                "for each additional workspace."
            ),
            func=list_available_workspaces,
        )
    )

    return merged_toolkit


def _build_workspace_toolkits(options: Dict[str, object] | None = None) -> list:
    workspace_roots_raw = _extract_workspace_roots_from_options(options)
    if not workspace_roots_raw:
        return []

    if not _should_enable_tools(options):
        return []

    try:
        toolkit_module = importlib.import_module("unchain.toolkits")
    except Exception as import_error:
        raise RuntimeError(
            f"Failed to import unchain.toolkits for workspace toolkit: {import_error}"
        ) from import_error

    toolkit_factory = _resolve_workspace_toolkit_factory(toolkit_module)
    resolved_roots = _resolve_workspace_roots(workspace_roots_raw)

    # Try a native multi-root constructor first if the toolkit supports it.
    multi_factory = getattr(toolkit_module, "WorkspaceToolkit", None)
    if callable(multi_factory) and len(resolved_roots) > 1:
        try:
            multi_toolkit = multi_factory(workspace_roots=resolved_roots)
        except TypeError:
            multi_toolkit = None
        else:
            _mark_workspace_tools_for_confirmation(multi_toolkit)
            return [multi_toolkit]

    if len(resolved_roots) == 1:
        workspace_toolkit = _build_workspace_toolkit_for_root(
            toolkit_factory,
            workspace_root=resolved_roots[0],
        )
        _mark_workspace_tools_for_confirmation(workspace_toolkit)
        return [workspace_toolkit]

    # Multi-root fallback when no native multi_workspace_toolkit.
    workspace_toolkit = _try_build_workspace_toolkit_for_roots(
        toolkit_factory,
        workspace_roots=resolved_roots,
    )
    if workspace_toolkit is None:
        workspace_toolkit = _build_multi_workspace_proxy_toolkit(
            toolkit_factory,
            workspace_roots=resolved_roots,
        )

    _mark_workspace_tools_for_confirmation(workspace_toolkit)
    return [workspace_toolkit]


def _build_selected_toolkits(options: Dict[str, object] | None = None) -> list:
    if not _should_enable_tools(options):
        return []

    toolkit_names = _extract_toolkit_names(options)
    if not toolkit_names:
        return []

    try:
        toolkit_module = importlib.import_module("unchain.toolkits")
    except Exception as import_error:
        raise RuntimeError(
            f"Failed to import unchain.toolkits for toolkit attachment: {import_error}"
        ) from import_error

    resolved_roots = _resolve_workspace_roots(_extract_workspace_roots_from_options(options))
    workspace_root = resolved_roots[0] if resolved_roots else None
    result: list = []

    for toolkit_name in toolkit_names:
        normalized_toolkit_name = _TOOLKIT_NAME_ALIASES.get(toolkit_name, toolkit_name)
        if normalized_toolkit_name == "WorkspaceToolkit":
            continue
        if toolkit_name == "builtin_toolkit":
            continue

        toolkit_factory = getattr(toolkit_module, normalized_toolkit_name, None)
        if not callable(toolkit_factory):
            raise RuntimeError(f"Requested toolkit is unavailable: {toolkit_name}")

        toolkit_instance = _build_generic_toolkit(
            toolkit_factory,
            workspace_root=workspace_root,
        )
        _mark_workspace_tools_for_confirmation(toolkit_instance)
        result.append(toolkit_instance)

    return result


# Block types whose ``text`` field should be extracted as plain content.
_TEXT_BLOCK_TYPES = {"text", "output_text", "input_text"}
# Block types that represent model reasoning / thinking.  We wrap them in
# ``<think>`` tags so the frontend ``ThinkBlock`` component can render them
# identically to reasoning tokens that arrived via ``token_delta``.
_THINKING_BLOCK_TYPES = {"reasoning", "thinking"}


def _content_to_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for block in content:
            if not isinstance(block, dict):
                continue
            btype = block.get("type")
            if btype in _TEXT_BLOCK_TYPES:
                text = block.get("text", "")
                if text:
                    parts.append(text if isinstance(text, str) else str(text))
            elif btype in _THINKING_BLOCK_TYPES:
                text = block.get("text", "") or block.get("thinking", "")
                if text:
                    raw = text if isinstance(text, str) else str(text)
                    parts.append(f"<think>{raw}</think>")
        return "".join(parts)
    if content is None:
        return ""
    return str(content)


def _create_agent(options: Dict[str, object] | None = None, session_id: str = ""):
    UnchainAgent = _UnchainAgent
    ToolsModule = _ToolsModule
    MemoryModule = _MemoryModule
    PoliciesModule = _PoliciesModule
    if UnchainAgent is None:
        raise RuntimeError("unchain agent is unavailable — check unchain installation")

    config = get_runtime_config(options)

    max_iterations = _extract_max_iterations_from_options(options)
    if max_iterations is None:
        max_iterations_raw = os.environ.get("UNCHAIN_MAX_ITERATIONS", "").strip()
        if max_iterations_raw:
            try:
                max_iterations = max(1, int(max_iterations_raw))
            except Exception:
                max_iterations = _DEFAULT_MAX_ITERATIONS
        else:
            max_iterations = _DEFAULT_MAX_ITERATIONS
    if _extract_workspace_roots_from_options(options) and _should_enable_tools(options):
        max_iterations = max(max_iterations, 2)

    api_key = (
        _extract_api_key_from_options(options, config["provider"])
        or (
            os.environ.get("UNCHAIN_API_KEY")
            or os.environ.get("OPENAI_API_KEY")
            or os.environ.get("ANTHROPIC_API_KEY")
            or ""
        ).strip()
    )

    if config["provider"] in {"openai", "anthropic"}:
        if not api_key:
            raise RuntimeError(
                f"Provider '{config['provider']}' requires API key. "
                "Set UNCHAIN_API_KEY or provider-specific API key env vars."
            )

    memory_requested = bool(isinstance(options, dict) and options.get("memory_enabled"))
    memory_runtime = {
        "requested": memory_requested,
        "available": False,
        "reason": "",
    }
    memory_manager = None
    if memory_requested and not session_id:
        memory_runtime["reason"] = "missing_session_id"

    if session_id and isinstance(options, dict) and memory_requested:
        try:
            from memory_factory import create_memory_manager_with_diagnostics

            mm, memory_reason = create_memory_manager_with_diagnostics(
                options,
                session_id=session_id,
            )
            if mm is not None:
                memory_manager = mm
                memory_runtime["available"] = True
            else:
                memory_runtime["reason"] = (
                    str(memory_reason).strip() if memory_reason else "memory_manager_unavailable"
                )
        except Exception as memory_error:
            memory_runtime["reason"] = f"memory_factory_failed: {memory_error}"

    # Collect toolkits
    toolkits = _build_workspace_toolkits(options)
    toolkits.extend(_build_selected_toolkits(options))

    # System prompt
    system_prompt = _build_effective_system_prompt_text(options)

    # Build modules
    modules: list = []
    if toolkits:
        modules.append(ToolsModule(tools=tuple(toolkits)))
    if memory_manager is not None:
        modules.append(MemoryModule(memory=memory_manager))
    modules.append(PoliciesModule(max_iterations=max_iterations))

    # Subagent module — gives the agent delegate / spawn_worker_batch tools
    SubagentModule = _SubagentModule
    SubagentTemplate = _SubagentTemplate
    SubagentPolicy = _SubagentPolicy
    _subagents_enabled = (
        SubagentModule is not None
        and SubagentTemplate is not None
        and SubagentPolicy is not None
        and toolkits  # subagents only useful when tools are available
        and _should_enable_tools(options)
    )
    if _subagents_enabled:
        worker_agent = UnchainAgent(
            name="pupu_worker",
            instructions=(
                "You are a focused worker agent. "
                "Complete the delegated task precisely and concisely. "
                "Return only the result — do not explain your process."
            ),
            provider=config["provider"],
            model=config["model"],
            api_key=api_key or None,
            modules=(ToolsModule(tools=tuple(toolkits)),),
        )
        subagent_templates = (
            SubagentTemplate(
                name="worker",
                description=(
                    "A general-purpose worker that can handle delegated "
                    "subtasks using all available tools. Use this to "
                    "parallelize independent tasks or delegate focused "
                    "subtasks that don't need the full conversation context."
                ),
                agent=worker_agent,
                allowed_modes=("delegate", "worker"),
                output_mode="summary",
                memory_policy="ephemeral",
                parallel_safe=True,
            ),
        )
        modules.append(
            SubagentModule(
                templates=subagent_templates,
                policy=SubagentPolicy(
                    max_depth=3,
                    max_children_per_parent=6,
                    max_total_subagents=20,
                    max_parallel_workers=3,
                    worker_timeout_seconds=60.0,
                    allow_dynamic_workers=False,
                    allow_dynamic_delegate=False,
                ),
            )
        )

    agent = UnchainAgent(
        name="pupu",
        instructions=system_prompt or "",
        provider=config["provider"],
        model=config["model"],
        api_key=api_key or None,
        modules=tuple(modules),
    )
    agent._memory_runtime = memory_runtime
    agent._max_iterations = max_iterations
    agent._toolkits = toolkits
    return agent


def _extract_last_assistant_text(messages: List[Dict[str, Any]]) -> str:
    for item in reversed(messages):
        if not isinstance(item, dict):
            continue
        if item.get("role") == "assistant":
            text = _content_to_text(item.get("content", ""))
            if text and text.strip():
                return text
        if item.get("type") == "message":
            text = _content_to_text(item.get("content", ""))
            if text and text.strip():
                return text
    return ""


def _memory_runtime_from_agent(agent: Any) -> Dict[str, Any]:
    raw_runtime = getattr(agent, "_memory_runtime", None)
    if not isinstance(raw_runtime, dict):
        return {"requested": False, "available": False, "reason": ""}
    return {
        "requested": bool(raw_runtime.get("requested")),
        "available": bool(raw_runtime.get("available")),
        "reason": str(raw_runtime.get("reason") or "").strip(),
    }


# ---------------------------------------------------------------------------
# unchain adapter helpers
# ---------------------------------------------------------------------------

def _build_bundle_from_result(result, agent) -> Dict[str, Any]:
    """Build a PuPu-compatible bundle dict from a KernelRunResult."""
    return {
        "model": getattr(agent, "model", ""),
        "consumed_tokens": int(getattr(result, "consumed_tokens", 0) or 0),
        "input_tokens": int(getattr(result, "input_tokens", 0) or 0),
        "output_tokens": int(getattr(result, "output_tokens", 0) or 0),
        "status": getattr(result, "status", "completed"),
        "iteration": int(getattr(result, "iteration", 0) or 0),
        "previous_response_id": getattr(result, "previous_response_id", None),
    }


def _make_human_input_callback(emit_event, cancel_event=None):
    """Create an on_human_input blocking callback for unchain ask_user_question.

    Follows the same threading.Event blocking pattern as _make_tool_confirm_callback.
    Emits PuPu-format tool_call events so the frontend can render the selector UI.
    """
    normalized_cancel_event = cancel_event if isinstance(cancel_event, threading.Event) else None

    def on_human_input(request):
        confirmation_id = str(_uuid.uuid4())
        interact_config = request.to_dict()

        emit_payload = {
            "type": "tool_call",
            "tool_name": "ask_user_question",
            "tool_display_name": "Ask User",
            "call_id": request.request_id,
            "arguments": interact_config,
            "description": getattr(request, "question", ""),
            "confirmation_id": confirmation_id,
            "requires_confirmation": True,
            "interact_type": "single" if getattr(request, "selection_mode", "") == "single" else "multi",
            "interact_config": interact_config,
        }

        waiter: Dict[str, Any] = {
            "event": threading.Event(),
            "response": None,
            "cancel_event": normalized_cancel_event,
        }
        with _pending_confirmations_lock:
            _pending_confirmations[confirmation_id] = waiter

        try:
            if callable(emit_event):
                emit_event(emit_payload)

            if normalized_cancel_event is not None and normalized_cancel_event.is_set():
                cancel_tool_confirmations(normalized_cancel_event)

            event = waiter.get("event")
            if isinstance(event, threading.Event):
                event.wait()
        finally:
            with _pending_confirmations_lock:
                _pending_confirmations.pop(confirmation_id, None)

        response = waiter.get("response")

        if normalized_cancel_event is not None and normalized_cancel_event.is_set():
            raise RuntimeError("stream cancelled during human input")

        if not isinstance(response, dict) or not response.get("approved"):
            raise RuntimeError("human input denied or cancelled")

        user_response = (response.get("modified_arguments") or {}).get("user_response", {})
        if not isinstance(user_response, dict):
            user_response = {}

        selected_values = (
            user_response.get("selected_values")
            or user_response.get("values")
            or ([user_response["value"]] if "value" in user_response else [])
        )
        if isinstance(selected_values, str):
            selected_values = [selected_values]

        return {
            "request_id": request.request_id,
            "selected_values": list(selected_values),
            "other_text": user_response.get("other_text"),
        }

    return on_human_input


def stream_chat(
    *,
    message: str,
    history: List[Dict[str, object]],
    attachments: List[Dict[str, object]] | None = None,
    options: Dict[str, object],
    session_id: str = "",
) -> Iterable[str]:
    agent = _create_agent(options, session_id=session_id)
    memory_runtime = _memory_runtime_from_agent(agent)
    if (
        memory_runtime["requested"]
        and not memory_runtime["available"]
        and not history
    ):
        reason = memory_runtime["reason"] or "memory_manager_unavailable"
        raise RuntimeError(f"{_MEMORY_UNAVAILABLE_CODE}: {reason}")

    messages = _normalize_messages(history, message, attachments)
    payload = _build_payload(agent.provider, options)

    token_queue: "queue.Queue[object]" = queue.Queue()
    done_marker = object()
    output_holder: Dict[str, object] = {
        "error": None,
        "messages": None,
        "final_text": "",
        "has_streamed_delta": False,
    }

    def on_event(event: Dict) -> None:
        event_type = event.get("type")
        if event_type == "token_delta":
            delta = event.get("delta")
            if isinstance(delta, str) and delta:
                output_holder["has_streamed_delta"] = True
                token_queue.put(delta)
            return

        if event_type == "final_message":
            final_text = event.get("content")
            if isinstance(final_text, str):
                output_holder["final_text"] = final_text

    def run_agent() -> None:
        try:
            result = agent.run(
                messages=messages,
                payload=payload,
                callback=on_event,
                max_iterations=agent._max_iterations,
                **({"session_id": session_id} if session_id else {}),
            )
            output_holder["messages"] = result.messages
        except Exception as run_error:  # pragma: no cover
            output_holder["error"] = run_error
        finally:
            token_queue.put(done_marker)

    worker = threading.Thread(target=run_agent, name="unchain-runner", daemon=True)
    worker.start()

    while True:
        item = token_queue.get()
        if item is done_marker:
            break
        if isinstance(item, str) and item:
            yield item

    error = output_holder.get("error")
    if error is not None:
        raise RuntimeError(str(error))

    if not output_holder.get("has_streamed_delta"):
        final_text = str(output_holder.get("final_text") or "")
        if not final_text:
            final_text = _extract_last_assistant_text(output_holder.get("messages") or [])
        if final_text:
            yield final_text


def stream_chat_events(
    *,
    message: str,
    history: List[Dict[str, object]],
    attachments: List[Dict[str, object]] | None = None,
    options: Dict[str, object],
    session_id: str = "",
    cancel_event: threading.Event | None = None,
) -> Iterable[Dict[str, Any]]:
    agent = _create_agent(options, session_id=session_id)
    messages = _normalize_messages(history, message, attachments)
    payload = _build_payload(agent.provider, options)
    memory_runtime = _memory_runtime_from_agent(agent)
    if memory_runtime["requested"] and not memory_runtime["available"]:
        fallback_reason = memory_runtime["reason"] or "memory_manager_unavailable"
        yield {
            "type": "memory_prepare",
            "run_id": "",
            "iteration": 0,
            "timestamp": time.time(),
            "session_id": session_id,
            "applied": False,
            "fallback_reason": fallback_reason,
        }
        if not history:
            yield {
                "type": "error",
                "run_id": "",
                "iteration": 0,
                "timestamp": time.time(),
                "code": _MEMORY_UNAVAILABLE_CODE,
                "message": "Memory is enabled but unavailable for this request",
                "fallback_reason": fallback_reason,
            }
            return

    event_queue: "queue.Queue[object]" = queue.Queue()
    done_marker = object()
    output_holder: Dict[str, object] = {
        "error": None,
        "messages": None,
        "seen_final_message": False,
        "last_run_id": "",
        "last_iteration": 0,
        "bundle": None,
    }

    # Build workspace tool display name map for multi-workspace proxy tools
    _ws_display_names: Dict[str, str] = {}
    for _tk in getattr(agent, "_toolkits", []):
        for _tn, _to in getattr(_tk, "tools", {}).items():
            _orig = getattr(_to, _WORKSPACE_PROXY_ORIGINAL_TOOL_NAME_ATTR, "")
            if isinstance(_orig, str) and _orig.strip() and _orig != _tn:
                _prefix = _tn[: -len(_orig) - 1] if _tn.endswith("_" + _orig) else ""
                _ws_label = _prefix.split("_", 2)[2] if _prefix.count("_") >= 2 else _prefix
                _ws_display_names[_tn] = f"{_orig} @{_ws_label}" if _ws_label else _orig

    def on_event(event: Dict[str, Any]) -> None:
        if not isinstance(event, dict):
            return
        event_type = event.get("type")
        # Suppress unchain-native events that are replaced by our callbacks
        if event_type == "human_input_requested":
            return
        if event_type == "run_max_iterations":
            return
        # Suppress the bare tool_call for ask_user_question — our on_human_input
        # callback emits the proper PuPu-format tool_call with interact_config
        if event_type == "tool_call" and event.get("tool_name") == "ask_user_question":
            return
        # Enrich tool_call events with workspace display names
        if event_type == "tool_call" and _ws_display_names:
            tn = event.get("tool_name", "")
            if tn in _ws_display_names:
                event["tool_display_name"] = _ws_display_names[tn]
        if event_type == "tool_result" and _ws_display_names:
            tn = event.get("tool_name", "")
            if tn in _ws_display_names:
                event["tool_display_name"] = _ws_display_names[tn]
        if event_type == "final_message":
            output_holder["seen_final_message"] = True
        run_id = event.get("run_id")
        if isinstance(run_id, str):
            output_holder["last_run_id"] = run_id
        iteration = event.get("iteration")
        if isinstance(iteration, int):
            output_holder["last_iteration"] = iteration
        event_queue.put(event)

    confirm_cb = _make_tool_confirm_callback(
        lambda event: event_queue.put(event),
        cancel_event=cancel_event,
    )
    human_input_cb = _make_human_input_callback(
        lambda event: event_queue.put(event),
        cancel_event=cancel_event,
    )
    max_iterations_cb = _make_continuation_callback(
        lambda event: event_queue.put(event),
        cancel_event=cancel_event,
    )
    if isinstance(cancel_event, threading.Event):
        def watch_stream_cancel() -> None:
            cancel_event.wait()
            cancel_tool_confirmations(cancel_event)

        cancel_watcher = threading.Thread(
            target=watch_stream_cancel,
            name="unchain-stream-confirm-cancel",
            daemon=True,
        )
        cancel_watcher.start()

    def run_agent() -> None:
        try:
            memory_namespace = str(options.get("memory_namespace") or "").strip()
            result = agent.run(
                messages=messages,
                payload=payload,
                callback=on_event,
                max_iterations=agent._max_iterations,
                on_tool_confirm=confirm_cb,
                on_human_input=human_input_cb,
                on_max_iterations=max_iterations_cb,
                **({"session_id": session_id} if session_id else {}),
                **({"memory_namespace": memory_namespace} if memory_namespace else {}),
            )
            output_holder["messages"] = result.messages
            bundle = _build_bundle_from_result(result, agent)
            if bundle:
                output_holder["bundle"] = bundle
        except Exception as run_error:
            import traceback as _tb
            output_holder["error_traceback"] = _tb.format_exc()
            output_holder["error"] = run_error
        finally:
            event_queue.put(done_marker)

    worker = threading.Thread(target=run_agent, name="unchain-runner-events", daemon=True)
    worker.start()

    while True:
        item = event_queue.get()
        if item is done_marker:
            break
        if isinstance(item, dict):
            yield item

    error = output_holder.get("error")
    if error is not None:
        tb = output_holder.get("error_traceback", "")
        if tb:
            import sys as _sys
            print(f"[unchain run_agent error]\n{tb}", file=_sys.stderr, flush=True)
        raise RuntimeError(str(error))

    if not output_holder.get("seen_final_message"):
        final_text = _extract_last_assistant_text(output_holder.get("messages") or [])
        if final_text:
            yield {
                "type": "final_message",
                "run_id": output_holder.get("last_run_id", ""),
                "iteration": output_holder.get("last_iteration", 0),
                "timestamp": time.time(),
                "content": final_text,
            }

    bundle = output_holder.get("bundle")
    if isinstance(bundle, dict) and bundle:
        yield {
            "type": "stream_summary",
            "run_id": str(output_holder.get("last_run_id") or ""),
            "iteration": int(output_holder.get("last_iteration") or 0),
            "timestamp": time.time(),
            "bundle": bundle,
        }
