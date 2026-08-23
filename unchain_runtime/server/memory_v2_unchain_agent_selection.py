"""PuPu host-side model selection for the official Unchain Memory Agent.

The selector is deliberately additive and inert: it does not enter the active
runtime bridge and it never constructs an agent during selection.  A Ready
result contains a callable that the host may invoke later with its own bound
external-reference codec.
"""

from __future__ import annotations

import copy
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from memory_v2_unchain_agent_factory import (
    build_pupu_official_memory_agent_invoker,
)
from memory_v2_unchain_model_invoker import (
    PupuOfficialMemoryAgentModelInvoker,
)
from unchain.memory.curator import (
    CuratorRunRequest,
    CuratorRunResult,
    CuratorRunnerFailure,
    FailureRetryability,
)
from unchain.memory.toolkit import MemoryToolkitRunBinding
from unchain.memory.toolkit.capabilities import BoundExternalReferenceCodec
from unchain.tools import Toolkit


_MEMORY_AGENT_CONFIG_OPTION = "_memory_v2_memory_agent_config"
_PROVIDER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_MODEL_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$")
_PENDING_RETRY_DELAY_MS = 60_000


class PupuMemoryAgentSelectionStatus(StrEnum):
    READY = "Ready"
    PENDING = "Pending"
    FAILED = "Failed"


class PupuMemoryAgentSelectionError(RuntimeError):
    """A Ready selection could not be used at the host boundary."""

    def __init__(self, code: str) -> None:
        self.code = str(code or "memory_agent_selection_failed")
        super().__init__(self.code)


class PupuOfficialMemoryAgentInvokerFactory:
    """Late-bound official invoker factory captured by a Ready selection."""

    __slots__ = ("_options", "model_id", "provider")

    def __init__(
        self,
        *,
        options: Mapping[str, Any],
        provider: str,
        model_id: str,
    ) -> None:
        try:
            self._options = copy.deepcopy(dict(options))
        except Exception as error:
            raise PupuMemoryAgentSelectionError(
                "memory_agent_request_options_invalid"
            ) from error
        self.provider = provider
        self.model_id = model_id

    def __call__(
        self,
        reference_codec: BoundExternalReferenceCodec,
    ) -> PupuOfficialMemoryAgentModelInvoker:
        if not isinstance(reference_codec, BoundExternalReferenceCodec):
            raise PupuMemoryAgentSelectionError(
                "memory_agent_reference_codec_invalid"
            )
        return build_pupu_official_memory_agent_invoker(
            options=copy.deepcopy(self._options),
            provider=self.provider,
            model_id=self.model_id,
            reference_codec=reference_codec,
        )


class PupuUnavailableMemoryAgentInvoker:
    """Official runner-shaped sentinel for an unavailable model selection."""

    __slots__ = ("reason", "reference_codec", "selection_status")

    def __init__(
        self,
        *,
        status: PupuMemoryAgentSelectionStatus,
        reason: str,
        reference_codec: BoundExternalReferenceCodec,
    ) -> None:
        self.selection_status = status
        self.reason = reason
        self.reference_codec = reference_codec

    def run(
        self,
        request: CuratorRunRequest,
        *,
        toolkit: Toolkit,
        binding: MemoryToolkitRunBinding,
    ) -> CuratorRunResult:
        del request, toolkit, binding
        if self.selection_status is PupuMemoryAgentSelectionStatus.PENDING:
            raise CuratorRunnerFailure(
                self.reason,
                retryability=FailureRetryability.RETRYABLE,
                retry_delay_ms=_PENDING_RETRY_DELAY_MS,
            )
        raise CuratorRunnerFailure(self.reason)


class PupuUnavailableMemoryAgentInvokerFactory:
    """Bind a codec without resolving or falling back to another model."""

    __slots__ = ("reason", "selection_status")

    def __init__(
        self,
        *,
        status: PupuMemoryAgentSelectionStatus,
        reason: str,
    ) -> None:
        if status is PupuMemoryAgentSelectionStatus.READY or not reason:
            raise ValueError("unavailable selection must be Pending or Failed")
        self.selection_status = status
        self.reason = reason

    def __call__(
        self,
        reference_codec: BoundExternalReferenceCodec,
    ) -> PupuUnavailableMemoryAgentInvoker:
        if not isinstance(reference_codec, BoundExternalReferenceCodec):
            raise PupuMemoryAgentSelectionError(
                "memory_agent_reference_codec_invalid"
            )
        return PupuUnavailableMemoryAgentInvoker(
            status=self.selection_status,
            reason=self.reason,
            reference_codec=reference_codec,
        )


@dataclass(frozen=True, slots=True)
class PupuMemoryAgentSelection:
    """Auditable selection result without an eagerly constructed agent."""

    status: PupuMemoryAgentSelectionStatus
    reason: str = ""
    provider: str = ""
    model_id: str = ""
    source: str = ""
    invoker_factory: PupuOfficialMemoryAgentInvokerFactory | None = field(
        default=None,
        repr=False,
    )

    def __post_init__(self) -> None:
        if self.status is PupuMemoryAgentSelectionStatus.READY:
            if (
                not self.provider
                or not self.model_id
                or not self.source
                or not callable(self.invoker_factory)
                or self.reason
            ):
                raise ValueError("Ready selection is incomplete")
            return
        if not self.reason or self.invoker_factory is not None:
            raise ValueError("Pending/Failed selection must retain a reason")

    @property
    def is_ready(self) -> bool:
        return self.status is PupuMemoryAgentSelectionStatus.READY

    def require_invoker_factory(
        self,
    ) -> PupuOfficialMemoryAgentInvokerFactory:
        if self.invoker_factory is None:
            raise PupuMemoryAgentSelectionError(self.reason)
        return self.invoker_factory

    def host_invoker_factory(
        self,
    ) -> (
        PupuOfficialMemoryAgentInvokerFactory
        | PupuUnavailableMemoryAgentInvokerFactory
    ):
        """Always return a host-safe factory without changing selection."""

        if self.status is PupuMemoryAgentSelectionStatus.READY:
            return self.require_invoker_factory()
        return PupuUnavailableMemoryAgentInvokerFactory(
            status=self.status,
            reason=self.reason,
        )


ProviderDefaultResolver = Callable[[str], Mapping[str, Any] | str | None]


class _SelectionInputError(ValueError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def _optional_provider(value: Any, field_name: str) -> str:
    if value is None or value == "":
        return ""
    if not isinstance(value, str):
        raise _SelectionInputError(f"{field_name}_invalid")
    normalized = value.strip().casefold()
    if _PROVIDER_RE.fullmatch(normalized) is None:
        raise _SelectionInputError(f"{field_name}_invalid")
    return normalized


def _optional_model_id(value: Any, field_name: str) -> str:
    if value is None or value == "":
        return ""
    if not isinstance(value, str):
        raise _SelectionInputError(f"{field_name}_invalid")
    normalized = value.strip()
    if _MODEL_ID_RE.fullmatch(normalized) is None:
        raise _SelectionInputError(f"{field_name}_invalid")
    return normalized


def _config_model_id(config: Mapping[str, Any]) -> str:
    camel_value = config.get("modelId")
    snake_value = config.get("model_id")
    if (
        camel_value not in (None, "")
        and snake_value not in (None, "")
        and camel_value != snake_value
    ):
        raise _SelectionInputError("memory_agent_model_alias_conflict")
    return _optional_model_id(
        camel_value if camel_value not in (None, "") else snake_value,
        "memory_agent_model_id",
    )


def _ready(
    *,
    options: Mapping[str, Any],
    provider: str,
    model_id: str,
    source: str,
) -> PupuMemoryAgentSelection:
    try:
        invoker_factory = PupuOfficialMemoryAgentInvokerFactory(
            options=options,
            provider=provider,
            model_id=model_id,
        )
    except PupuMemoryAgentSelectionError as error:
        return PupuMemoryAgentSelection(
            status=PupuMemoryAgentSelectionStatus.FAILED,
            reason=error.code,
            provider=provider,
        )
    return PupuMemoryAgentSelection(
        status=PupuMemoryAgentSelectionStatus.READY,
        provider=provider,
        model_id=model_id,
        source=source,
        invoker_factory=invoker_factory,
    )


def _failed(
    reason: str,
    *,
    provider: str = "",
) -> PupuMemoryAgentSelection:
    return PupuMemoryAgentSelection(
        status=PupuMemoryAgentSelectionStatus.FAILED,
        reason=reason,
        provider=provider,
    )


def _pending(
    reason: str,
    *,
    provider: str = "",
) -> PupuMemoryAgentSelection:
    return PupuMemoryAgentSelection(
        status=PupuMemoryAgentSelectionStatus.PENDING,
        reason=reason,
        provider=provider,
    )


def _resolve_same_provider_default(
    *,
    resolver: ProviderDefaultResolver,
    provider: str,
) -> tuple[str, str]:
    """Return ``(model_id, unavailable_reason)`` for exactly one provider."""

    try:
        resolved = resolver(provider)
    except Exception:
        return "", "provider_default_unavailable"
    if resolved is None or resolved == "":
        return "", ""
    if isinstance(resolved, str):
        return _optional_model_id(
            resolved,
            "provider_default_model_id",
        ), ""
    if not isinstance(resolved, Mapping):
        raise _SelectionInputError("provider_default_invalid")

    resolved_provider = _optional_provider(
        resolved.get("provider"),
        "provider_default_provider",
    )
    if resolved_provider and resolved_provider != provider:
        raise _SelectionInputError("provider_default_cross_provider")
    return _config_model_id(resolved), ""


def select_pupu_memory_agent_invoker(
    *,
    options: Mapping[str, Any],
    chat_provider: str,
    chat_model_id: str,
    provider_default_resolver: ProviderDefaultResolver,
) -> PupuMemoryAgentSelection:
    """Select explicit, then same-provider default, then same-provider chat.

    Selection never calls the official invoker builder.  It also never imports
    or calls PuPu's legacy Curator worker/adapter.
    """

    if not isinstance(options, Mapping):
        return _failed("memory_agent_request_options_invalid")
    if not callable(provider_default_resolver):
        return _failed("provider_default_resolver_invalid")

    try:
        raw_config = options.get(_MEMORY_AGENT_CONFIG_OPTION)
        if raw_config is None:
            config: Mapping[str, Any] = {}
        elif isinstance(raw_config, Mapping):
            config = raw_config
        else:
            raise _SelectionInputError("memory_agent_config_invalid")

        explicit_provider = _optional_provider(
            config.get("provider"),
            "memory_agent_provider",
        )
        explicit_model_id = _config_model_id(config)
        current_provider = _optional_provider(
            chat_provider,
            "chat_provider",
        )
        current_model_id = _optional_model_id(
            chat_model_id,
            "chat_model_id",
        )
    except _SelectionInputError as error:
        return _failed(error.code)

    if explicit_model_id and not explicit_provider:
        return _failed("explicit_model_requires_provider")
    if current_model_id and not current_provider:
        return _failed("chat_model_requires_provider")
    if explicit_provider and explicit_model_id:
        return _ready(
            options=options,
            provider=explicit_provider,
            model_id=explicit_model_id,
            source="user_explicit",
        )

    selected_provider = explicit_provider or current_provider
    if not selected_provider:
        return _pending("memory_agent_provider_unavailable")

    try:
        default_model_id, default_unavailable_reason = (
            _resolve_same_provider_default(
                resolver=provider_default_resolver,
                provider=selected_provider,
            )
        )
    except _SelectionInputError as error:
        return _failed(error.code, provider=selected_provider)

    if default_model_id:
        return _ready(
            options=options,
            provider=selected_provider,
            model_id=default_model_id,
            source="provider_default",
        )
    if current_provider == selected_provider and current_model_id:
        return _ready(
            options=options,
            provider=selected_provider,
            model_id=current_model_id,
            source="chat_same_provider",
        )
    if default_unavailable_reason:
        return _pending(
            default_unavailable_reason,
            provider=selected_provider,
        )
    if explicit_provider:
        return _pending(
            "explicit_provider_model_unavailable",
            provider=selected_provider,
        )
    return _pending(
        "memory_agent_model_unavailable",
        provider=selected_provider,
    )


__all__ = [
    "ProviderDefaultResolver",
    "PupuMemoryAgentSelection",
    "PupuMemoryAgentSelectionError",
    "PupuMemoryAgentSelectionStatus",
    "PupuOfficialMemoryAgentInvokerFactory",
    "PupuUnavailableMemoryAgentInvoker",
    "PupuUnavailableMemoryAgentInvokerFactory",
    "select_pupu_memory_agent_invoker",
]
