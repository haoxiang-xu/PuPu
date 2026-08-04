from __future__ import annotations

from unittest import mock

import pytest

import memory_v2_unchain_agent_selection as selection_module
from memory_v2_unchain_agent_selection import (
    PupuMemoryAgentSelectionError,
    PupuMemoryAgentSelectionStatus,
    PupuUnavailableMemoryAgentInvoker,
    select_pupu_memory_agent_invoker,
)
from unchain.journal import ResourceRef
from unchain.memory.curator import CuratorRunnerFailure, FailureRetryability
from unchain.memory.curator.host import (
    MemoryAgentHostAdapter,
    MemoryAgentHostConfig,
)
from unchain.memory.toolkit import ReferencePurpose


class _Codec:
    binding_id = "binding-a"

    def encode(self, ref: ResourceRef) -> str:
        return f"ref:{ref.resource_id}"

    def decode(self, value: str, *, purpose: ReferencePurpose) -> ResourceRef:
        del value, purpose
        return ResourceRef("artifact", "artifact-a", 1)


class _HostBinding:
    binding_id = "binding-a"


def _select(
    *,
    config=None,
    chat_provider="openai",
    chat_model_id="chat-model",
    resolver=lambda provider: None,
    extra_options=None,
):
    options = dict(extra_options or {})
    if config is not None:
        options["_memory_v2_memory_agent_config"] = config
    return select_pupu_memory_agent_invoker(
        options=options,
        chat_provider=chat_provider,
        chat_model_id=chat_model_id,
        provider_default_resolver=resolver,
    )


def test_explicit_selection_wins_and_builds_only_after_codec_is_bound():
    resolver = mock.Mock(side_effect=AssertionError("must not resolve default"))
    options = {
        "_memory_v2_memory_agent_config": {
            "provider": "Anthropic",
            "modelId": "memory-model",
        },
        "nested": {"request": "original"},
    }
    sentinel = object()

    with mock.patch.object(
        selection_module,
        "build_pupu_official_memory_agent_invoker",
        return_value=sentinel,
    ) as build_invoker:
        selected = select_pupu_memory_agent_invoker(
            options=options,
            chat_provider="openai",
            chat_model_id="chat-model",
            provider_default_resolver=resolver,
        )
        options["nested"]["request"] = "mutated"

        assert selected.status is PupuMemoryAgentSelectionStatus.READY
        assert selected.source == "user_explicit"
        assert selected.provider == "anthropic"
        assert selected.model_id == "memory-model"
        assert callable(selected.invoker_factory)
        build_invoker.assert_not_called()

        built = selected.require_invoker_factory()(_Codec())

    assert built is sentinel
    build_invoker.assert_called_once()
    assert build_invoker.call_args.kwargs["provider"] == "anthropic"
    assert build_invoker.call_args.kwargs["model_id"] == "memory-model"
    assert build_invoker.call_args.kwargs["options"]["nested"] == {
        "request": "original"
    }
    assert isinstance(build_invoker.call_args.kwargs["reference_codec"], _Codec)
    resolver.assert_not_called()


def test_same_provider_default_precedes_current_chat_model():
    resolver = mock.Mock(
        return_value={"provider": "OPENAI", "modelId": "default-model"}
    )

    selected = _select(resolver=resolver)

    assert selected.status is PupuMemoryAgentSelectionStatus.READY
    assert selected.provider == "openai"
    assert selected.model_id == "default-model"
    assert selected.source == "provider_default"
    resolver.assert_called_once_with("openai")


def test_current_chat_model_is_used_only_for_the_selected_provider():
    same_provider = _select(
        config={"provider": "openai"},
        chat_provider="OPENAI",
        chat_model_id="chat-model",
    )
    cross_provider = _select(
        config={"provider": "anthropic"},
        chat_provider="openai",
        chat_model_id="chat-model",
    )

    assert same_provider.status is PupuMemoryAgentSelectionStatus.READY
    assert same_provider.source == "chat_same_provider"
    assert same_provider.model_id == "chat-model"
    assert cross_provider.status is PupuMemoryAgentSelectionStatus.PENDING
    assert cross_provider.reason == "explicit_provider_model_unavailable"
    assert cross_provider.provider == "anthropic"
    assert cross_provider.invoker_factory is None


def test_explicit_provider_uses_only_its_scoped_default():
    resolver = mock.Mock(return_value="provider-model")

    selected = _select(
        config={"provider": "anthropic"},
        chat_provider="openai",
        chat_model_id="chat-model",
        resolver=resolver,
    )

    assert selected.status is PupuMemoryAgentSelectionStatus.READY
    assert selected.provider == "anthropic"
    assert selected.model_id == "provider-model"
    assert selected.source == "provider_default"
    resolver.assert_called_once_with("anthropic")


def test_cross_provider_default_is_failed_not_silently_accepted_or_ignored():
    selected = _select(
        resolver=lambda provider: {
            "provider": "anthropic" if provider == "openai" else "openai",
            "modelId": "wrong-provider-model",
        }
    )

    assert selected.status is PupuMemoryAgentSelectionStatus.FAILED
    assert selected.reason == "provider_default_cross_provider"
    assert selected.provider == "openai"
    assert selected.invoker_factory is None


def test_resolver_outage_falls_back_to_same_provider_chat_or_stays_pending():
    def unavailable(_provider):
        raise RuntimeError("provider catalog offline")

    fallback = _select(resolver=unavailable)
    pending = _select(
        chat_provider="openai",
        chat_model_id="",
        resolver=unavailable,
    )

    assert fallback.status is PupuMemoryAgentSelectionStatus.READY
    assert fallback.source == "chat_same_provider"
    assert pending.status is PupuMemoryAgentSelectionStatus.PENDING
    assert pending.reason == "provider_default_unavailable"
    assert pending.provider == "openai"


@pytest.mark.parametrize(
    ("kwargs", "reason"),
    [
        (
            {"config": {"modelId": "model-without-provider"}},
            "explicit_model_requires_provider",
        ),
        (
            {"chat_provider": "", "chat_model_id": "orphan-model"},
            "chat_model_requires_provider",
        ),
        (
            {"config": "not-an-object"},
            "memory_agent_config_invalid",
        ),
        (
            {
                "config": {
                    "provider": "openai",
                    "modelId": "model-a",
                    "model_id": "model-b",
                }
            },
            "memory_agent_model_alias_conflict",
        ),
    ],
)
def test_invalid_inputs_fail_with_a_durable_reason(kwargs, reason):
    selected = _select(**kwargs)

    assert selected.status is PupuMemoryAgentSelectionStatus.FAILED
    assert selected.reason == reason
    assert selected.invoker_factory is None
    with pytest.raises(PupuMemoryAgentSelectionError) as error:
        selected.require_invoker_factory()
    assert error.value.code == reason


def test_missing_provider_or_model_remains_pending_with_reason():
    no_provider = _select(chat_provider="", chat_model_id="")
    no_model = _select(chat_provider="ollama", chat_model_id="")

    assert no_provider.status is PupuMemoryAgentSelectionStatus.PENDING
    assert no_provider.reason == "memory_agent_provider_unavailable"
    assert no_model.status is PupuMemoryAgentSelectionStatus.PENDING
    assert no_model.reason == "memory_agent_model_unavailable"


def test_ready_factory_rejects_an_unbound_reference_codec_before_building():
    selected = _select(
        config={"provider": "openai", "modelId": "memory-model"}
    )

    with mock.patch.object(
        selection_module,
        "build_pupu_official_memory_agent_invoker",
    ) as build_invoker:
        with pytest.raises(PupuMemoryAgentSelectionError) as error:
            selected.require_invoker_factory()(object())

    assert error.value.code == "memory_agent_reference_codec_invalid"
    build_invoker.assert_not_called()


def test_ready_host_factory_is_the_existing_official_factory():
    selected = _select(
        config={"provider": "openai", "modelId": "memory-model"}
    )

    assert selected.host_invoker_factory() is selected.invoker_factory


def test_pending_host_factory_binds_unavailable_invoker_without_model_fallback():
    selected = _select(chat_provider="", chat_model_id="")
    codec = _Codec()

    with mock.patch.object(
        selection_module,
        "build_pupu_official_memory_agent_invoker",
    ) as build_invoker:
        invoker = selected.host_invoker_factory()(codec)

        assert type(invoker) is PupuUnavailableMemoryAgentInvoker
        assert invoker.reference_codec is codec
        assert invoker.reason == "memory_agent_provider_unavailable"
        with pytest.raises(CuratorRunnerFailure) as error:
            invoker.run(object(), toolkit=object(), binding=object())

    assert error.value.code == "memory_agent_provider_unavailable"
    assert error.value.retryability is FailureRetryability.RETRYABLE
    assert error.value.retry_delay_ms == 60_000
    build_invoker.assert_not_called()


def test_pending_selection_does_not_block_official_host_construction():
    selected = _select(chat_provider="", chat_model_id="")
    invoker = selected.host_invoker_factory()(_Codec())

    host = MemoryAgentHostAdapter(
        _HostBinding(),
        capability_factory=_HostBinding(),
        model_invoker=invoker,
        config=MemoryAgentHostConfig(enabled=True),
    )

    assert host.enabled is True


def test_failed_host_factory_raises_terminal_runner_failure_at_run_time_only():
    selected = _select(
        resolver=lambda _provider: {
            "provider": "anthropic",
            "modelId": "cross-provider-model",
        }
    )

    invoker_factory = selected.host_invoker_factory()
    invoker = invoker_factory(_Codec())

    with pytest.raises(CuratorRunnerFailure) as error:
        invoker.run(object(), toolkit=object(), binding=object())

    assert error.value.code == "provider_default_cross_provider"
    assert error.value.retryability is FailureRetryability.TERMINAL
    assert error.value.retry_delay_ms == 0


def test_non_callable_default_resolver_fails_without_constructing_a_worker():
    selected = select_pupu_memory_agent_invoker(
        options={},
        chat_provider="openai",
        chat_model_id="chat-model",
        provider_default_resolver=None,
    )

    assert selected.status is PupuMemoryAgentSelectionStatus.FAILED
    assert selected.reason == "provider_default_resolver_invalid"
    assert selected.invoker_factory is None
