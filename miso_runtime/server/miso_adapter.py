import json
import os
import queue
import re
import sys
import threading
from pathlib import Path
from typing import Dict, Iterable, List

_BROTH_CLASS = None
_IMPORT_ERROR = None
_RESOLVED_MISO_SOURCE = None


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


def get_capability_catalog() -> Dict[str, List[str]]:
    providers: Dict[str, List[str]] = {
        "openai": [],
        "anthropic": [],
        "ollama": [],
    }

    for candidate in _capability_file_candidates():
        if not candidate.exists() or not candidate.is_file():
            continue

        try:
            raw = json.loads(candidate.read_text(encoding="utf-8"))
        except Exception:
            continue

        if not isinstance(raw, dict):
            continue

        for model_name, capabilities in raw.items():
            if not isinstance(model_name, str) or not isinstance(capabilities, dict):
                continue

            provider = str(capabilities.get("provider", "")).strip().lower()
            if provider in providers:
                providers[provider].append(
                    _normalize_provider_model_name(provider, model_name),
                )

        break

    for provider_key in providers:
        providers[provider_key] = sorted({name for name in providers[provider_key] if name})

    return providers


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


def _normalize_messages(history: List[Dict[str, str]], message: str) -> List[Dict[str, str]]:
    messages: List[Dict[str, str]] = []

    for item in history:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role", "")).strip()
        content = str(item.get("content", ""))
        if role not in {"system", "user", "assistant"}:
            continue
        if not content.strip():
            continue
        messages.append({"role": role, "content": content})

    if not messages or messages[-1].get("role") != "user" or messages[-1].get("content") != message:
        messages.append({"role": "user", "content": message})

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

    return agent


def _extract_last_assistant_text(messages: List[Dict[str, str]]) -> str:
    for item in reversed(messages):
        if isinstance(item, dict) and item.get("role") == "assistant":
            return str(item.get("content", ""))
    return ""


def stream_chat(
    *,
    message: str,
    history: List[Dict[str, str]],
    options: Dict[str, object],
) -> Iterable[str]:
    agent = _create_agent(options)
    messages = _normalize_messages(history, message)
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
