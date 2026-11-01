"""Real published Hook child waits across old/new after-hook policies."""
from copy import deepcopy
from dataclasses import replace
from hashlib import sha256
import json
from pathlib import Path

import pytest

import test_skeleton_agent_runtime as base
from skeleton_resource_store import SkeletonResourceStore
from unchain.execution import ExecutionRuntime
from unchain.memory import JsonFileSessionStore, KernelMemoryRuntime
from unchain.skeleton import SkeletonToolRuntime
from unchain.skeleton.agent_preparation import prepare_agent_graph
from unchain.skeleton.errors import SkeletonValidationError
from unchain.skeleton.hooks_runtime import SkeletonAfterToolHookDispatcher, apply_after_decision
from unchain.tools import Tool
from unchain.tools.toolkit import Toolkit


def _writer(name):
    # Keep the frozen writer fixture in this suite: wheels ship runtime code,
    # never the companion repository's tests. Source and hashes are unchanged
    # from Core 966be76c's hook-denial upgrade qualification.
    fixture = json.loads((Path(__file__).parent / 'fixtures/hook_denial_upgrade_writers.json').read_text())
    record = fixture['writers'][name]
    source = record['source']
    assert sha256(source.encode()).hexdigest() == record['function_sha256']
    namespace = {'__name__': 'unchain.skeleton._frozen_test_writer',
        '__package__': 'unchain.skeleton', 'deepcopy': deepcopy,
        'SkeletonValidationError': SkeletonValidationError,
        'apply_after_decision': apply_after_decision}
    exec(compile(source, 'frozen-' + name + '-after-hook.py', 'exec'), namespace)
    return namespace['__call__']


def _edge(source, target):
    return {'id': source + '-' + target, 'kind': 'flow', 'source_node_id': source,
        'source_port_id': 'out', 'target_node_id': target, 'target_port_id': 'in'}


def _literal(name, value):
    return {'name': name, 'value': {'kind': 'literal', 'value': value}, 'missing': 'error'}


def _workflow(resource_id, *, gated):
    nodes = [{'id': 'start', 'type': 'start', 'config': {'execution': {'outputs': [
        {'name': 'event', 'source': {'kind': 'result', 'path': ['event']}}]}}}]
    if gated:
        nodes.append({'id': 'audit', 'type': 'tool_call', 'config': {
            'tool': {'name': 'hook_audit', 'on_error': 'stop', 'approval_timeout_ms': 30000},
            'execution': {'inputs': [_literal('value', 'one audit')], 'outputs': [
                {'name': 'logged', 'source': {'kind': 'result', 'path': ['result', 'logged']}}]}}})
    exports = {'decision': 'continue'} if gated else {'decision': 'replace', 'result': {'visible': 'redacted'}}
    nodes.append({'id': 'end', 'type': 'end', 'config': {'execution': {
        'inputs': [_literal(name, value) for name, value in exports.items()],
        'outputs': [{'name': name, 'source': {'kind': 'input', 'path': [name]}} for name in exports]}}})
    edges = [_edge('start', 'audit'), _edge('audit', 'end')] if gated else [_edge('start', 'end')]
    return {'schema_version': 1, 'kind': 'workflow', 'id': resource_id,
        'name': resource_id, 'nodes': nodes, 'edges': edges}


@pytest.mark.parametrize('writer,approved,corrupt_terminal,pinned_fault', [
    ('legacy', False, False, None), ('protected', False, False, None),
    ('protected', True, False, None), ('protected', False, True, None),
    ('protected', False, False, 'foreign_call'),
    ('protected', False, False, 'unknown_field'),
    ('protected', False, False, 'not_an_object'),
])
def test_published_after_hook_wait_reuses_its_pinned_input_without_repeating_tools(tmp_path, monkeypatch, writer, approved, corrupt_terminal, pinned_fault):
    from unchain.context.runtime import ContextRuntime
    hook_observations = []
    original_project = ContextRuntime._project_after_hook_child_wait

    def observe_project(self, context, binding, bundle, wait):
        if corrupt_terminal:
            binding = replace(binding, request=replace(binding.request, subject=replace(
                binding.request.subject, terminal_handler_manifest_sha256='0' * 64)))
        try:
            return original_project(self, context, binding, bundle, wait)
        except BaseException as error:
            hook_observations.append({'projection_error': {
                'type': type(error).__name__, 'message': str(error),
                'approval_state': str(binding.request.subject.approval_state),
                'subject_terminal': binding.request.subject.terminal_handler_manifest_sha256,
                'route_terminal': binding.route.terminal_handler_manifest_sha256 if binding.route else None}})
            raise

    monkeypatch.setattr(ContextRuntime, '_project_after_hook_child_wait', observe_project)
    original_hook = base.PupuSkeletonAgentExecution._run_hook_workflow

    def observe_hook(self, **kwargs):
        observed = {'hook_id': kwargs['binding'].hook['id'], 'inputs': deepcopy(kwargs['inputs'])}
        hook_observations.append(observed)
        try:
            return original_hook(self, **kwargs)
        except BaseException as error:
            observed['error'] = {'type': type(error).__name__, 'code': getattr(error, 'code', None), 'message': str(error)}
            raise

    monkeypatch.setattr(base.PupuSkeletonAgentExecution, '_run_hook_workflow', observe_hook)
    resources = SkeletonResourceStore(tmp_path / 'resources')
    revisions = []
    for name, gated in [('redactor', False), ('approval-audit', True)]:
        saved = resources.save_draft(_workflow(name, gated=gated))
        revisions.append(resources.publish_workflow(name, expected_edit_token=saved['edit_token'])['revision_id'])
    document = base._document_with_hook_pool(base._agent_document(), workflow_id='redactor', revision_id=revisions[0])
    kernel = next(node for node in document['nodes'] if node['type'] == 'agent')
    kernel['config']['kernel']['max_iterations'] = 3
    hooks = next(node for node in document['nodes'] if node['type'] == 'hooks_pool')['config']['hooks']
    hooks[0]['event'] = 'after_tool_call'
    hooks.append({**deepcopy(hooks[0]), 'id': 'audit', 'order': 20,
        'workflow': {'workflow_id': 'approval-audit', 'revision_id': revisions[1]}})
    plan = prepare_agent_graph(document)
    bridge = base._bridge(tmp_path, monkeypatch, execution_id='after-hook-upgrade-' + writer)
    memory = JsonFileSessionStore(tmp_path / 'sessions')
    parent_effects, hook_effects = [], []
    toolkit = Toolkit()

    @toolkit.tool(name='hook_audit', requires_confirmation=True)
    def hook_audit(value: str):
        hook_effects.append(value)
        return {'logged': True}

    client = base._StrictOpenAIClient([base._approval_tool_response(), base._final_response('finished')])

    def host(guard):
        return base._host_execution(plan, bridge, client=client, guard=guard,
            memory=KernelMemoryRuntime.from_config(store=memory),
            tools_for_node=lambda _context: (Tool.from_callable(
                lambda value: parent_effects.append(value) or {'value': value},
                name='dangerous_tool', requires_confirmation=True),),
            child_handlers_factory=lambda _store, child_plan: {'tool_call': SkeletonToolRuntime(
                child_plan, toolkit, session_id=bridge.execution_id, clock_ms=lambda: 100)},
            hook_workflow_resolver=resources.resolve_published_workflow)

    with monkeypatch.context() as old:
        old.setattr(SkeletonAfterToolHookDispatcher, '__call__', _writer(writer))
        with ExecutionRuntime(memory).scope(bridge.execution_id) as guard:
            execution = host(guard)
            execution.create({})
            initial, receipt = execution.run(original_task='deny parent and approve only the audit')
            assert initial.status == 'waiting' and receipt is None
            first = deepcopy(execution.store.load().state['active'])
        with ExecutionRuntime(memory).scope(bridge.execution_id) as guard:
            execution = host(guard)
            waiting, receipt = execution.resume_interaction(first['wait']['id'], approved,
                node_invocation_id=first['node_invocation_id'], original_task='deny parent and approve only the audit')
            print('AFTER_HOOK_UPGRADE_STAGE ' + json.dumps({'writer': writer, 'status': waiting.status,
                'error': waiting.error, 'hooks': hook_observations}, sort_keys=True))
            (tmp_path / 'staging-journal.json').write_text(json.dumps(
                [event.to_dict() for event in execution.store.journal.capture_snapshot().events], indent=2))
            if corrupt_terminal:
                assert waiting.status == 'outcome_unknown' and receipt is None
                assert parent_effects == hook_effects == []
                return
            assert waiting.status == 'waiting' and receipt is None
            active = deepcopy(execution.store.load().state['active'])
            request = execution.store.read_json(active['wait']['request_ref'])
            assert request['subject']['hook_child_wait']['hook_id'] == 'audit'
            events = [event.to_dict() for event in execution.store.journal.capture_snapshot().events]
    assert parent_effects == (['approved child value'] if approved else [])
    assert hook_effects == []
    if pinned_fault:
        # The host reader is not authority: malformed/unrelated fixed inputs
        # must fail before the child audit can execute, even from an embedding.
        original_reader = getattr(base.PupuSkeletonAgentExecution, '_read_hook_workflow_inputs', None)

        def wrong_inputs(self, **kwargs):
            pinned = (original_reader(self, **kwargs) if original_reader else deepcopy(kwargs['inputs']))
            if pinned_fault == 'foreign_call':
                pinned['call_id'] = 'another-call'
            elif pinned_fault == 'unknown_field':
                pinned['unknown'] = 'not in the fixed event'
            else:
                pinned = []
            return pinned

        monkeypatch.setattr(base.PupuSkeletonAgentExecution, '_read_hook_workflow_inputs', wrong_inputs, raising=False)
    with ExecutionRuntime(memory).scope(bridge.execution_id) as guard:
        execution = host(guard)
        result, receipt = execution.resume_interaction(active['wait']['id'], True,
            node_invocation_id=active['node_invocation_id'], original_task='deny parent and approve only the audit')
        final_events = [event.to_dict() for event in execution.store.journal.capture_snapshot().events]
        evidence = {'writer': writer, 'status': result.status, 'error': result.error,
            'parent_effects': parent_effects, 'hook_effects': hook_effects,
            'root_committed': execution.store.load().state['root_committed'],
            'sdk_requests': len(client.requests)}
        print('AFTER_HOOK_UPGRADE_HOST ' + json.dumps(evidence, sort_keys=True))
        assert final_events[:len(events)] == events
        if pinned_fault:
            assert result.status == 'outcome_unknown' and receipt is None, evidence
            assert parent_effects == hook_effects == []
            assert len(client.requests) == 1
            return
        assert result.status == 'completed' and receipt is not None, evidence
        assert execution.store.load().state['root_committed'] is True
        parent_results = [event for event in execution.store.journal.capture_snapshot().events
            if event.event_type == 'tool_result' and event.payload.get('call_id') == 'child-approval-call']
        assert len(parent_results) == 1
        assert parent_results[0].payload['execution_subject']['approval_state'] == ('approved' if approved else 'denied')
        if not approved:
            assert parent_results[0].payload['result'].get('denied') is True
    assert parent_effects == (['approved child value'] if approved else [])
    assert hook_effects == ['one audit']
    assert len(client.requests) == 2
