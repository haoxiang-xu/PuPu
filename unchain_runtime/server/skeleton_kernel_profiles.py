"""Candidate Kernel Loop profiles, derived from the runtime's own material.

A Kernel Loop node stores its profile inside the definition: the endpoint it
calls, the credential it refers to, the model's window and output cap, and
which capabilities it may be asked for. The runtime says whose job that is —
"Model/provider resolution stays host-owned" (``materialize_legacy_agent``) —
and ``SkeletonProductionBindings`` proves it by building its profile registry
*from the definition* and resolving nothing but credentials.

So the builder has to write a complete profile, and every field in it is a
fact about this deployment that the renderer cannot see. This module is where
those facts come from, and it invents none of them:

* the model list and each model's declared window and output cap come from the
  capability catalog the installed wheel ships
  (``unchain/runtime/resources/model_capabilities.json``, reached through
  ``unchain_adapter``). The *normalized* catalog cannot be used: it drops
  ``max_output_tokens`` on purpose, and that is the one number a reservation
  has to be bounded by;
* the protocol for a provider is the runtime's own ``_NATIVE_PROTOCOLS``,
  imported rather than copied, because ``kernel_profile._transport_for``
  raises when a brand it knows carries another brand's protocol — and it does
  so when the Kernel takes its first turn, which is far too late to be told;
* the endpoint for an official provider is ``_OFFICIAL``'s, imported from
  ``skeleton_production_bindings`` for the same reason: that is the exact
  string ``bind_profile`` compares against before it falls back to the host's
  configured API key. One character of difference and every run demands a
  dedicated credential binding instead;
* a model with no declared output cap is **not** given one. It is reported as
  unavailable with that reason. A cap is the ceiling a reply reservation is
  checked against, and the request actually sent carries the reservation
  itself, so a guessed ceiling would be sent to a provider as a real number.

Every profile this module emits is passed through the runtime's own
``validate_kernel_config`` before it is offered, inside a probe kernel. A
profile that cannot be admitted is reported as unavailable carrying the
validator's code and path, so the producer can never hand the editor a profile
the editor would have to refuse.
"""
from __future__ import annotations

import os
from typing import Any

from unchain.skeleton.errors import SkeletonValidationError
from unchain.skeleton.kernel_config import validate_kernel_config
from unchain.skeleton.kernel_profile import _NATIVE_PROTOCOLS

from skeleton_production_bindings import _OFFICIAL


#: The providers a profile can be derived for without asking the renderer for
#: anything. A custom provider's endpoint and twin live in the per-request
#: options PuPu sends with a chat, not in anything readable from here, so it
#: is absent rather than guessed.
_DERIVABLE = ("openai", "anthropic", "gemini", "ollama")

_OLLAMA_DEFAULT_ENDPOINT = "http://localhost:11434"


def _ollama_endpoint() -> str:
    raw = os.environ.get("OLLAMA_HOST", _OLLAMA_DEFAULT_ENDPOINT).strip()
    endpoint = (raw or _OLLAMA_DEFAULT_ENDPOINT).rstrip("/")
    # ``OLLAMA_HOST`` is also accepted by Ollama's own clients as a bare
    # host:port. The profile holds an address a transport is pointed at, and
    # the validator refuses one with no scheme.
    if "://" not in endpoint:
        endpoint = f"http://{endpoint}"
    return endpoint


def _endpoint_for(provider: str) -> str | None:
    official = _OFFICIAL.get(provider)
    if official is not None:
        return official[0]
    if provider == "ollama":
        return _ollama_endpoint()
    return None


def _capabilities(protocol: str, raw: dict[str, Any]) -> dict[str, bool]:
    """What this Kernel may be asked for, per the Kernel's own code paths.

    ``json_schema`` is decided by the protocol, not by the capability file's
    ``supports_response_format``. Two measurements say it must be:

    * the Kernel path does not read that file at all — ``bind_kernel_profile``
      binds "without consulting provider catalogs" and ``_catalog`` builds its
      own one-model entry — so the flag has no influence on what a Kernel can
      ask for;
    * ``_native_payload`` carries a JSON schema for every one of the four
      protocols: ``text.format`` for openai-responses, ``output_config`` for
      anthropic, ``response_json_schema`` for gemini, and for ollama through
      the ``ResponseFormat`` ``_response_format`` builds.

    The file's flag is false for every Anthropic model, which is a statement
    about the chat path's own ``ResponseFormat`` adapter — the one
    ``_response_format`` deliberately passes ``None`` for because it "would
    append a prompt instruction". Carrying that flag into a Kernel profile
    would deny Anthropic a capability this runtime has.

    Attachments are the other way round: they are per-model, so they come from
    the model's declared modalities. ``kernel_runtime`` checks ``images`` for
    an ``image/*`` attachment and ``files`` for anything else.
    """
    modalities = raw.get("input_modalities")
    declared = [item for item in modalities if isinstance(item, str)] if isinstance(modalities, list) else []
    return {
        "json_schema": protocol in {"openai-responses", "anthropic", "gemini", "ollama"},
        "images": "image" in declared,
        "files": any(item != "image" and item != "text" for item in declared),
    }


def _probe_kernel(profile: dict[str, Any]) -> dict[str, Any]:
    """The smallest kernel that exercises every rule about a profile."""
    return {
        "schema_version": 1,
        "profile": profile,
        "prompt": "",
        "max_iterations": 1,
        "output_tokens": 1,
        "history": "root",
        "overflow": "error",
        "json_schema": None,
    }


def _unavailable(provider: str, model: str, reason: str, **extra: Any) -> dict[str, Any]:
    return {"id": f"{provider}:{model}", "provider": provider, "model": model,
            "reason": reason, **extra}


def _positive_int(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if isinstance(value, float) and not value.is_integer():
        return None
    number = int(value)
    return number if number >= 1 else None


def kernel_profiles() -> dict[str, Any]:
    """Every Kernel profile this build can offer, and why the rest cannot be."""
    import unchain_adapter as adapter

    raw_catalog = adapter._load_raw_capability_catalog()
    offered: list[dict[str, Any]] = []
    unavailable: list[dict[str, Any]] = []

    for model_name in sorted(raw_catalog):
        raw = raw_catalog[model_name]
        if not isinstance(raw, dict):
            continue
        provider = str(raw.get("provider", "")).strip().lower()
        if provider not in _DERIVABLE:
            # Including ``hyperspace``: its endpoint is whatever custom
            # provider the renderer configured, which is not readable here.
            continue
        if adapter._is_embedding_model(raw):
            continue
        model = adapter._normalize_provider_model_name(provider, model_name)
        if not model:
            continue

        # Both are answerable for every provider in ``_DERIVABLE`` — that is
        # what makes it the derivable set — so there is no "unsupported
        # provider" case to report here. A provider that is not in it was
        # skipped above, with the reason in that comment.
        protocol = _NATIVE_PROTOCOLS[provider]
        endpoint = _endpoint_for(provider)
        # No model in the catalog this wheel ships is missing a window, so
        # this is a rule about the data and not a branch today's data reaches.
        # It is covered by a test that states a catalog without one, because
        # the catalog is a file a later wheel can change — unlike the
        # provider set above, which this module decides itself.
        context_window = _positive_int(raw.get("max_context_window_tokens"))
        if context_window is None:
            unavailable.append(_unavailable(provider, model, "context_window_unknown"))
            continue
        output_limit = _positive_int(raw.get("max_output_tokens"))
        if output_limit is None:
            unavailable.append(_unavailable(provider, model, "output_limit_unknown"))
            continue

        profile = {
            "id": f"{provider}:{model}",
            "provider": provider,
            "model": model,
            "protocol": protocol,
            "endpoint": endpoint,
            "credential_ref": provider,
            "context_window": context_window,
            "output_limit": output_limit,
            "capabilities": _capabilities(protocol, raw),
        }
        try:
            validate_kernel_config(_probe_kernel(profile))
        except SkeletonValidationError as exc:
            unavailable.append(_unavailable(
                provider, model, "profile_refused",
                code=exc.code, path=list(exc.path),
            ))
            continue
        offered.append(profile)

    return {"profiles": offered, "unavailable": unavailable}


__all__ = ["kernel_profiles"]
