"""Exercise real runtime scenarios, shadowing each context with full-history reads.

The shadow uses the SAME journal identity/state and exact pre-cache sources.
No ID/timestamp normalization. Whole requests/results (including canonical
messages and envelope digest) must agree, and shadow builds must not append
events. Existing scenario assertions independently check final provider sends,
tool effects, artifact-only policies, approval identities and child scopes.
"""
import importlib

import pytest

from cache_checkpoint_fixture import (
    OriginalFactorySnapshotSource, OriginalCoordinatorSnapshotSource,
    fixture, make_attempt,
)
from unchain.context.coordinator import ContextCompileCoordinator
from unchain.context.request_factory import JournalContextRequestFactory
from unchain.context.projector import CanonicalSemanticEventProjector
from unchain.context import ArtifactService
from unchain.journal import DurableEventSink


@pytest.fixture
def differential(monkeypatch):
    observed = dict(requests=0, compilations=0)
    factory_call = JournalContextRequestFactory.__call__
    compile_call = ContextCompileCoordinator.compile

    def compare_request(self, context):
        actual = factory_call(self, context)
        source = self._journal_snapshot_source
        try:
            self._journal_snapshot_source = OriginalFactorySnapshotSource(source.journal)
            expected = factory_call(self, context)
        finally:
            self._journal_snapshot_source = source
        assert actual == expected, 'cache changed the complete compile request'
        observed['requests'] += 1
        return actual

    def compare_compile(self, request):
        actual = compile_call(self, request)
        before = self.journal.capture_snapshot()
        source = self._journal_snapshot_source
        try:
            self._journal_snapshot_source = OriginalCoordinatorSnapshotSource(self.journal)
            expected = compile_call(self, request)
        finally:
            self._journal_snapshot_source = source
        assert actual == expected, 'cache changed canonical messages or context envelope'
        assert self.journal.capture_snapshot() == before, 'shadow replay appended durable events'
        observed['compilations'] += 1
        return actual

    monkeypatch.setattr(JournalContextRequestFactory, '__call__', compare_request)
    monkeypatch.setattr(ContextCompileCoordinator, 'compile', compare_compile)
    return observed


SCENARIOS = [
    ('test_context_provider_turn_boundary', 'test_enabled_runtime_owns_the_final_kernel_provider_send'),
    ('test_context_provider_turn_boundary', 'test_graph_agent_mode_uses_the_same_durable_provider_boundary'),
    ('test_context_provider_turn_boundary', 'test_graph_tool_turn_projects_artifact_only_before_second_provider_turn'),
    ('test_context_provider_turn_boundary', 'test_subagent_fork_uses_a_distinct_durable_attempt_boundary'),
    ('test_context_provider_turn_boundary', 'test_subagent_tool_turn_projects_artifact_only_before_second_provider_turn'),
    ('test_context_provider_turn_boundary', 'test_tool_bearing_turn_persists_result_and_continues_through_same_boundary'),
    ('test_context_provider_turn_approval_resume', 'test_official_context_boundary_sync_approval_resume_uses_bound_toolkit'),
    ('test_context_provider_turn_approval_resume', 'test_official_context_boundary_cold_approval_resume_reuses_original_attempt'),
    ('test_context_provider_turn_approval_resume', 'test_cold_resume_projects_artifact_only_before_second_provider_turn'),
    ('test_context_provider_turn_approval_resume', 'test_official_context_boundary_starts_a_new_approval_after_resume'),
]


@pytest.mark.parametrize('module,name', SCENARIOS, ids=[name for _, name in SCENARIOS])
def test_runtime_scenario_matches_full_context(tmp_path, differential, module, name):
    scenario = getattr(importlib.import_module('tests.context_v2.' + module), name)
    scenario(tmp_path)
    assert differential['requests'] > 0
    assert differential['compilations'] > 0


def test_sqlite_tool_continuation_eviction_and_reopen_match_full_context(tmp_path, differential):
    journal, factory, coordinator, context = fixture(tmp_path, 25, after_tool=True)
    expected = coordinator.compile(factory(context))
    factory._journal_snapshot_source.invalidate()
    assert coordinator.compile(factory(context)) == expected
    # Reconstruct all journal/cache/compiler objects from the same durable DB.
    _, cold_factory, cold_coordinator, cold_context = fixture(tmp_path, 25, after_tool=True)
    assert cold_coordinator.compile(cold_factory(cold_context)) == expected


def test_incomplete_tool_pair_matches_full_context(tmp_path, differential):
    journal, factory, coordinator, context = fixture(tmp_path, 1)
    coordinator.compile(factory(context))
    artifacts = ArtifactService(journal.wrapped, sanitizer=lambda content, _: content)
    attempt = make_attempt(1)
    projector = CanonicalSemanticEventProjector(
        attempt=attempt, artifacts=artifacts, payload_sanitizer=lambda _, payload: payload)
    sink = DurableEventSink(journal.wrapped, attempt, projector)
    sink(dict(type='tool_call', run_id=attempt.attempt_id, iteration=0,
              tool_name='lookup', call_id='pending-tool', arguments={'q': 'pending'}))
    # A pending result must never be invented by either path. Depending on the
    # admitted trigger, the compiler may retain the prior input or refuse it.
    source = factory._journal_snapshot_source
    outcomes = []
    for candidate in (source, OriginalFactorySnapshotSource(journal)):
        factory._journal_snapshot_source = candidate
        try:
            result = coordinator.compile(factory(context))
            outcomes.append(('ok', result))
            assert 'durable tool output' not in repr(result.messages)
        except (ValueError, RuntimeError) as error:
            outcomes.append((type(error), str(error)))
    assert outcomes[0] == outcomes[1]


def test_large_artifact_and_duplicate_result_preserve_full_context(tmp_path, differential):
    from tests.context_v2.test_context_ingress_request_factory import _tool_subject
    journal, factory, coordinator, context = fixture(tmp_path, 25)
    coordinator.compile(factory(context))
    artifacts = ArtifactService(journal.wrapped, sanitizer=lambda content, _: content)
    attempt = make_attempt(25)
    projector = CanonicalSemanticEventProjector(
        attempt=attempt, artifacts=artifacts, payload_sanitizer=lambda _, payload: payload)
    sink = DurableEventSink(journal.wrapped, attempt, projector)
    intent = sink(dict(type='tool_call', run_id=attempt.attempt_id, iteration=0,
                       tool_name='lookup', call_id='large-tool', arguments={'q': 'large'}))
    subject = _tool_subject(intent.cursor)
    # Adapt the test's subject fence to this fixture's execution identity.
    from dataclasses import replace
    from unchain.execution import ExecutionFence
    subject = replace(subject, execution_fence=ExecutionFence(journal.execution_id, 'checkpoint-owner', 1))
    event = dict(type='tool_result', run_id=attempt.attempt_id, iteration=0,
                 tool_name='lookup', call_id='large-tool', execution_subject=subject.to_dict(),
                 execution_subject_sha256=subject.sha256, result={'text': 'large-result-' * 12000})
    receipt = sink(event)
    assert receipt.event.payload['result_bytes'] > 128000
    assert receipt.event.payload['full_output_ref']
    first = coordinator.compile(factory(context))
    before = journal.capture_snapshot()
    duplicate = sink(event)
    assert duplicate.duplicate
    assert journal.capture_snapshot() == before
    assert coordinator.compile(factory(context)) == first


@pytest.mark.parametrize('provider', ['openai', 'anthropic', 'gemini', 'ollama', 'hyperspace'])
@pytest.mark.parametrize('after_tool', [False, True])
def test_exact_provider_wire_matches_cache_off(tmp_path, monkeypatch, provider, after_tool):
    from tests import test_provider_wire_preparer as helper
    from unchain.providers.wire_preparer import build_prepared_provider_request_payload, prepare_provider_wire
    from unchain.providers.wire_envelope import ProviderWireEnvelope
    journal, factory, coordinator, context = fixture(tmp_path, 25, after_tool=after_tool)
    cached = coordinator.compile(factory(context))
    before = journal.capture_snapshot()
    factory._journal_snapshot_source = OriginalFactorySnapshotSource(journal)
    coordinator._journal_snapshot_source = OriginalCoordinatorSnapshotSource(journal)
    full = coordinator.compile(factory(context))
    assert cached == full
    assert journal.capture_snapshot() == before
    monkeypatch.setattr(helper, 'ATTEMPT', make_attempt(25))
    model_io = helper._ModelIO(provider)

    def wire(result):
        payload = build_prepared_provider_request_payload(
            provider=provider, messages=result.to_dict()['messages'], effective_payload={},
            request_model=model_io.model, response_format={'kind': 'none', 'value': None},
            previous_response_id=None, fallback_messages=None, context_mode='semantic')
        prepared, draft = helper._prepared_turn_for_request(model_io=model_io, request_payload=payload)
        envelope = prepare_provider_wire(prepared, model_io=model_io, attempt=make_attempt(25),
                                         iteration=7, transport_target_sha256='a' * 64)
        assert ProviderWireEnvelope.from_dict(envelope.to_dict()) == envelope
        assert envelope.verify_against_catalog(draft.catalog) is envelope
        return envelope.canonical_bytes()

    assert wire(cached) == wire(full)
