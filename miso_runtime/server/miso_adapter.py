import inspect
import json
import importlib
import os
import pkgutil
import queue
import re
import copy
import sys
import threading
from pathlib import Path
from typing import Any, Dict, Iterable, List

try:
    import httpx as _httpx
except ImportError:  # pragma: no cover
    _httpx = None  # type: ignore

_BROTH_CLASS = None
_IMPORT_ERROR = None
_RESOLVED_MISO_SOURCE = None

_SUPPORTED_PROVIDERS = {"openai", "anthropic", "ollama"}
_ALLOWED_INPUT_MODALITIES = ("text", "image", "pdf")
_ALLOWED_INPUT_SOURCE_TYPES = ("url", "base64")
_INPUT_MODALITY_ALIAS_MAP = {
    "file": "pdf",
}
_KNOWN_TOOLKIT_EXPORTS = {
    "toolkit": "core",
    "builtin_toolkit": "builtin",
    "python_workspace_toolkit": "builtin",
    "mcp": "integration",
}


def _is_valid_miso_source(path: Path) -> bool:
    return (path / "miso" / "__init__.py").exists() and (path / "miso" / "broth.py").exists()


def _candidate_miso_sources() -> List[Path]:
    candidates: List[Path] = []

    configured = os.environ.get("MISO_SOURCE_PATH", "").strip()
    if configured:
        candidates.append(Path(configured).expanduser().resolve())

    current_file = Path(__file__).resolve()
    project_root = current_file.parents[2]
    sibling_miso_repo = project_root.parent / "miso"
    candidates.append(sibling_miso_repo)

    return candidates


def _load_broth_class() -> None:
    global _BROTH_CLASS, _IMPORT_ERROR, _RESOLVED_MISO_SOURCE

    errors: List[str] = []
    for source_root in _candidate_miso_sources():
        if not _is_valid_miso_source(source_root):
            errors.append(f"invalid source: {source_root}")
            continue

        source_str = str(source_root)
        if source_str not in sys.path:
            sys.path.insert(0, source_str)

        try:
            from miso import broth as Broth  # type: ignore

            _BROTH_CLASS = Broth
            _RESOLVED_MISO_SOURCE = source_str
            _IMPORT_ERROR = None
            return
        except Exception as import_error:  # pragma: no cover
            errors.append(f"import failed at {source_root}: {import_error}")

    _BROTH_CLASS = None
    _RESOLVED_MISO_SOURCE = None
    _IMPORT_ERROR = RuntimeError("; ".join(errors) if errors else "miso source not found")


_load_broth_class()


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
    base_provider = os.environ.get("MISO_PROVIDER", "ollama").strip().lower() or "ollama"
    provider = base_provider if base_provider in {"openai", "anthropic", "ollama"} else "ollama"

    provider_override = (overrides or {}).get("provider", "").strip().lower()
    if provider_override in {"openai", "anthropic", "ollama"}:
        provider = provider_override

    env_model = os.environ.get("MISO_MODEL", _provider_default_model(provider)).strip()
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
        "source": _RESOLVED_MISO_SOURCE or "",
    }


def get_runtime_config(options: Dict[str, object] | None = None) -> Dict[str, str]:
    overrides = _parse_model_overrides(options)
    return _get_runtime_config(overrides)


def get_model_name(options: Dict[str, object] | None = None) -> str:
    config = get_runtime_config(options)
    if not _BROTH_CLASS:
        return "miso-unavailable"
    return f"{config['provider']}:{config['model']}"


def _default_model_capabilities() -> Dict[str, object]:
    return {
        "input_modalities": ["text"],
        "input_source_types": {},
    }


def _capability_file_candidates() -> List[Path]:
    candidates: List[Path] = []

    if _RESOLVED_MISO_SOURCE:
        candidates.append(Path(_RESOLVED_MISO_SOURCE) / "miso" / "model_capabilities.json")

    current_file = Path(__file__).resolve()
    project_root = current_file.parents[2]
    candidates.append(project_root / "miso_runtime" / "miso" / "model_capabilities.json")
    candidates.append(project_root.parent / "miso" / "miso" / "model_capabilities.json")

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


def get_default_model_capabilities() -> Dict[str, object]:
    return _default_model_capabilities()


def _fetch_ollama_models() -> List[str]:
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

        providers[provider].append(
            _normalize_provider_model_name(provider, model_name),
        )

    # Merge dynamically discovered Ollama models so all locally installed
    # models appear as chips regardless of model_capabilities.json.
    for live_model in _fetch_ollama_models():
        normalized = _normalize_provider_model_name("ollama", live_model)
        if normalized:
            providers["ollama"].append(normalized)

    for provider_key in providers:
        providers[provider_key] = sorted({name for name in providers[provider_key] if name})

    return providers


def get_model_capability_catalog() -> Dict[str, Dict[str, object]]:
    catalog: Dict[str, Dict[str, object]] = {}

    raw_catalog = _load_raw_capability_catalog()
    for model_name, capabilities in raw_catalog.items():
        provider = str(capabilities.get("provider", "")).strip().lower()
        if provider not in _SUPPORTED_PROVIDERS:
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
        tool_module = importlib.import_module("miso.tool")
    except Exception:
        return None

    toolkit_base = getattr(tool_module, "toolkit", None)
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
    """Walk miso.builtin_toolkits and return concrete toolkit subclasses."""
    entries: List[Dict[str, object]] = []

    try:
        builtin_pkg = importlib.import_module("miso.builtin_toolkits")
    except Exception:
        return entries

    pkg_path = getattr(builtin_pkg, "__path__", None)
    if not pkg_path:
        return entries

    for _finder, submodule_name, _ispkg in pkgutil.iter_modules(pkg_path):
        full_name = f"miso.builtin_toolkits.{submodule_name}"
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
            entries.append({
                "name": submodule_name,
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
            "source": _RESOLVED_MISO_SOURCE or "",
        }

    entries: List[Dict[str, object]] = []
    seen: set[str] = set()

    # Mark the abstract base as seen so submodule walker skips it
    base_module = str(getattr(toolkit_base, "__module__", ""))
    seen.add(f"{base_module}:{toolkit_base.__name__}")

    # Walk miso.builtin_toolkits for concrete implementations
    entries.extend(_enumerate_builtin_submodule_toolkits(toolkit_base, seen))

    # Also pick up any top-level miso exports (python_workspace_toolkit, etc.)
    # that weren't already found via submodule walk
    try:
        miso_module = importlib.import_module("miso")
    except Exception:
        miso_module = None

    if miso_module is not None:
        for export_name, kind in _KNOWN_TOOLKIT_EXPORTS.items():
            if export_name == "toolkit":
                continue
            candidate = getattr(miso_module, export_name, None)
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
                "name": export_name,
                "class_name": class_name,
                "module": module_name,
                "kind": kind,
                "tools": tools,
            })

    return {
        "toolkits": entries,
        "count": len(entries),
        "source": _RESOLVED_MISO_SOURCE or "",
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
        options.get("misoApiKey"),
        options.get("miso_api_key"),
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


def _resolve_workspace_root(workspace_root: str) -> Path:
    candidate = Path(workspace_root).expanduser().resolve()
    if not candidate.exists():
        raise RuntimeError(f"workspace_root does not exist: {candidate}")
    if not candidate.is_dir():
        raise RuntimeError(f"workspace_root is not a directory: {candidate}")
    return candidate


def _attach_workspace_toolkit(agent: Any, options: Dict[str, object] | None = None) -> None:
    workspace_root_raw = _extract_workspace_root_from_options(options)
    if not workspace_root_raw:
        return

    if not hasattr(agent, "add_toolkit") or not callable(agent.add_toolkit):
        raise RuntimeError("Agent does not support add_toolkit")

    workspace_root = _resolve_workspace_root(workspace_root_raw)

    try:
        miso_module = importlib.import_module("miso")
    except Exception as import_error:
        raise RuntimeError(
            f"Failed to import miso for workspace toolkit: {import_error}"
        ) from import_error

    toolkit_factory = getattr(miso_module, "python_workspace_toolkit", None)
    if not callable(toolkit_factory):
        raise RuntimeError("miso.python_workspace_toolkit is unavailable")

    try:
        workspace_toolkit = toolkit_factory(
            workspace_root=str(workspace_root),
            include_python_runtime=True,
        )
    except TypeError:
        # Backward compatibility for older signatures.
        workspace_toolkit = toolkit_factory(workspace_root=str(workspace_root))

    agent.add_toolkit(workspace_toolkit)


def _content_to_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") in {"text", "output_text", "input_text"}:
                text = block.get("text", "")
                if text:
                    parts.append(text if isinstance(text, str) else str(text))
        return "".join(parts)
    if content is None:
        return ""
    return str(content)


def _create_agent(options: Dict[str, object] | None = None):
    if _IMPORT_ERROR is not None:
        raise RuntimeError(f"Failed to import miso.broth: {_IMPORT_ERROR}")
    if _BROTH_CLASS is None:
        raise RuntimeError("miso.broth is unavailable")

    config = get_runtime_config(options)

    agent = _BROTH_CLASS()
    agent.provider = config["provider"]
    agent.model = config["model"]

    max_iterations_raw = os.environ.get("MISO_MAX_ITERATIONS", "1").strip()
    try:
        max_iterations = max(1, int(max_iterations_raw))
    except Exception:
        max_iterations = 1
    if _extract_workspace_root_from_options(options):
        # Tool-call workflows need at least one extra round to produce
        # assistant-facing text after tool outputs are injected.
        max_iterations = max(max_iterations, 2)
    agent.max_iterations = max_iterations

    api_key = (
        _extract_api_key_from_options(options, config["provider"])
        or (
            os.environ.get("MISO_API_KEY")
            or os.environ.get("OPENAI_API_KEY")
            or os.environ.get("ANTHROPIC_API_KEY")
            or ""
        ).strip()
    )

    if config["provider"] in {"openai", "anthropic"}:
        if not api_key:
            raise RuntimeError(
                f"Provider '{config['provider']}' requires API key. "
                "Set MISO_API_KEY or provider-specific API key env vars."
            )
        agent.api_key = api_key

    _attach_workspace_toolkit(agent, options)

    return agent


def _extract_last_assistant_text(messages: List[Dict[str, Any]]) -> str:
    for item in reversed(messages):
        if not isinstance(item, dict):
            continue
        if item.get("role") == "assistant":
            text = _content_to_text(item.get("content", "")).strip()
            if text:
                return text
        if item.get("type") == "message":
            text = _content_to_text(item.get("content", "")).strip()
            if text:
                return text
    return ""


def stream_chat(
    *,
    message: str,
    history: List[Dict[str, object]],
    attachments: List[Dict[str, object]] | None = None,
    options: Dict[str, object],
) -> Iterable[str]:
    agent = _create_agent(options)
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
            messages_out, _bundle = agent.run(
                messages=messages,
                payload=payload,
                callback=on_event,
                max_iterations=agent.max_iterations,
            )
            output_holder["messages"] = messages_out
        except Exception as run_error:  # pragma: no cover
            output_holder["error"] = run_error
        finally:
            token_queue.put(done_marker)

    worker = threading.Thread(target=run_agent, name="miso-runner", daemon=True)
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
