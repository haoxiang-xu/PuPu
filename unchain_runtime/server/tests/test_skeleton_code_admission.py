"""Source admission uses actual store/preflight; no SDK or HTTP calls."""
from copy import deepcopy

import pytest

from skeleton_code_admission import prepare_code_execution_material
from skeleton_code_closure import FrozenSkeletonCodeClosure, FrozenCodeRuntimeSnapshot
from skeleton_resource_store import SkeletonResourceStore, SkeletonResourceError
from tests.test_skeleton_resource_store import agent, binding, output


SOURCE = 'def main(input, context):\n    return {"message": "Stored: " + input["message"]}\n'


def code_agent(identity='source-agent', child_source=None):
    document = agent(identity, child_source=child_source)
    document['nodes'][1]['config']['kernel']['profile'].update(
        id='openai-profile', provider='openai', credential_ref='openai', endpoint='https://api.openai.com/v1')
    document['nodes'].append({'id': 'code', 'type': 'code', 'config': {
        'execution': {'inputs': [binding('message', 'kernel', ['message'])],
                      'outputs': [output('message', 'result', ['message'])]},
        'code': {'source': {'kind': 'file', 'path': 'external.py'}, 'environment_profile_id': 'builtin',
                 'timeout_ms': 5000, 'max_result_bytes': 10000, 'max_log_bytes': 10000,
                 'result_schema': {'type': 'object', 'properties': {'message': {'type': 'string'}},
                                   'required': ['message'], 'additionalProperties': False}}}})
    document['edges'][1]['target_node_id'] = 'code'
    document['edges'].append({'id': 'code-end', 'kind': 'flow', 'source_node_id': 'code',
                             'source_port_id': 'out', 'target_node_id': 'end', 'target_port_id': 'in'})
    document['nodes'][2]['config']['execution']['inputs'][0]['value']['node_id'] = 'code'
    return document


def request(document, sources, token=None):
    return {'schema': 'pupu.skeleton-edit.v2', 'document': document,
            'expected_edit_token': token, 'managed_sources': sources}


def select(identity):
    return {'skeleton_selection': {'schema': 'pupu.skeleton_chat_selection.v1',
                                   'kind': 'resource', 'resource_id': identity}}


@pytest.fixture
def store(tmp_path):
    return SkeletonResourceStore(tmp_path / 'skeletons')


def test_root_sources_are_in_same_immutable_admission_as_selection(store):
    saved = store.save_managed_draft(request(code_agent(), [{'node_path': ['nodes', 3], 'text': SOURCE}]))
    selection, workflows = prepare_code_execution_material(select('source-agent'), store=store)
    assert set(selection.to_dict()) == {'ok', 'id', 'kind', 'definition_digest', 'edit_token',
                                         'document', 'diagnostics', 'dependencies', 'subagents'}
    assert selection.code_sources is not None
    closure = FrozenSkeletonCodeClosure.restore(selection.code_sources, selection, workflows)
    runtime = FrozenCodeRuntimeSnapshot.prepare(closure, workspace_root=None)
    path = saved['resource']['document']['nodes'][3]['config']['code']['source']['path']
    assert runtime.resolver(path).content == SOURCE.encode()
    original = selection.snapshot_digest
    document = deepcopy(saved['resource']['document'])
    store.save_managed_draft(request(document, [{'node_path': ['nodes', 3], 'text': SOURCE + '# changed\n'}],
                                      saved['resource']['edit_token']))
    newer, _ = prepare_code_execution_material(select('source-agent'), store=store)
    assert newer.snapshot_digest != original
    assert runtime.resolver(path).content == SOURCE.encode()



@pytest.mark.parametrize('change', [lambda v: v['owners'][0].update(document=[]),
    lambda v: v['contents'][0].update(sha256=[]), lambda v: v['owners'][0].update(kind=[]),
    lambda v: v['owners'][0].update(managed=1)])
def test_unreadable_retained_closure_is_a_typed_refusal(store, change):
    store.save_managed_draft(request(code_agent(), [{'node_path': ['nodes', 3], 'text': SOURCE}]))
    selected, workflows = prepare_code_execution_material(select('source-agent'), store=store)
    value = deepcopy(selected.code_sources); change(value)
    with pytest.raises(SkeletonResourceError):
        FrozenSkeletonCodeClosure.restore(value, selected, workflows)


def test_runtime_limit_is_checked_before_launch_not_only_during_restore(store, monkeypatch):
    import skeleton_code_closure as module
    store.save_managed_draft(request(code_agent(), [{'node_path': ['nodes', 3], 'text': SOURCE}]))
    selected, workflows = prepare_code_execution_material(select('source-agent'), store=store)
    closure = FrozenSkeletonCodeClosure.restore(selected.code_sources, selected, workflows)
    monkeypatch.setattr(module, '_MAX_BYTES', len(SOURCE.encode()) - 1)
    with pytest.raises(SkeletonResourceError):
        FrozenCodeRuntimeSnapshot.prepare(closure, workspace_root=None)


@pytest.mark.parametrize('change', [lambda v: v.update(schema='future'), lambda v: v.update(extra=True),
    lambda v: v['external'].append({'path': 'undeclared.py', 'sha256': '0' * 64, 'base64': ''}),
    lambda v: v['closure']['contents'][0].update(text='changed retained bytes')])
def test_retained_runtime_refuses_tampering_without_live_lookup(store, change, monkeypatch):
    store.save_managed_draft(request(code_agent(), [{'node_path': ['nodes', 3], 'text': SOURCE}]))
    selected, workflows = prepare_code_execution_material(select('source-agent'), store=store)
    closure = FrozenSkeletonCodeClosure.restore(selected.code_sources, selected, workflows)
    value = FrozenCodeRuntimeSnapshot.prepare(closure, workspace_root=None).to_dict(); change(value)
    monkeypatch.setattr(SkeletonResourceStore, 'get_managed_resource', lambda *a: pytest.fail('live source fallback'))
    with pytest.raises(SkeletonResourceError):
        FrozenCodeRuntimeSnapshot.restore(value, selected, workflows)


def test_reference_owner_is_the_child_resource_not_the_parent(store):
    child = store.save_managed_draft(request(code_agent('child'), [{'node_path': ['nodes', 3], 'text': SOURCE}]))
    store.save_draft(agent('parent', child_source={'kind': 'agent_ref', 'agent_id': 'child'}))
    selection, workflows = prepare_code_execution_material(select('parent'), store=store)
    closure = FrozenSkeletonCodeClosure.restore(selection.code_sources, selection, workflows)
    owners = closure.to_dict()['owners']
    assert {(row['id'], row['revision']) for row in owners} >= {('child', child['resource']['edit_token'])}
    runtime = FrozenCodeRuntimeSnapshot.prepare(closure, workspace_root=None)
    path = child['resource']['document']['nodes'][3]['config']['code']['source']['path']
    assert runtime.resolver(path).content == SOURCE.encode()


def test_embedded_source_is_owned_at_its_typed_parent_address(store):
    child = code_agent('embedded')
    parent = agent('parent', child_source={'kind': 'embedded', 'document': child})
    address = ['nodes', 3, 'config', 'subagents', 0, 'source', 'document', 'nodes', 3]
    saved = store.save_managed_draft(request(parent, [{'node_path': address, 'text': SOURCE}]))
    selection, workflows = prepare_code_execution_material(select('parent'), store=store)
    closure = FrozenSkeletonCodeClosure.restore(selection.code_sources, selection, workflows)
    assert len(closure.to_dict()['owners']) == 1
    assert closure.to_dict()['bindings'][0]['document_path'] == address[:-2]
    path = saved['resource']['document']['nodes'][3]['config']['subagents'][0]['source']['document']['nodes'][3]['config']['code']['source']['path']
    assert FrozenCodeRuntimeSnapshot.prepare(closure, workspace_root=None).resolver(path).content == SOURCE.encode()


@pytest.mark.parametrize('change', [
    lambda v: v.update(extra=True),
    lambda v: v.update(schema='pupu.skeleton-code-closure.v99'),
    lambda v: v['contents'][0].update(text='changed'),
    lambda v: v['owners'][0].update(revision='edit-forged'),
    lambda v: v['bindings'][0].update(document_path=['nodes', True]),
    lambda v: v['bindings'].clear(),
    lambda v: v['contents'].clear(),
])
def test_source_closure_refuses_corruption_wrong_owner_or_omitted_binding(store, change):
    store.save_managed_draft(request(code_agent(), [{'node_path': ['nodes', 3], 'text': SOURCE}]))
    selection, workflows = prepare_code_execution_material(select('source-agent'), store=store)
    value = deepcopy(selection.code_sources); change(value)
    with pytest.raises(SkeletonResourceError):
        FrozenSkeletonCodeClosure.restore(value, selection, workflows)


def test_mixed_sources_are_frozen_before_dispatch_and_resume_does_not_reread_workspace(store, tmp_path):
    document = code_agent()
    code = deepcopy(document['nodes'][3]); code['id'] = 'external'; document['nodes'].append(code)
    # The second Code is an explicit flow predecessor, not an unreachable fixture.
    document['edges'][-1]['target_node_id'] = 'external'
    document['edges'].append({'id': 'external-end', 'kind': 'flow', 'source_node_id': 'external',
        'source_port_id': 'out', 'target_node_id': 'end', 'target_port_id': 'in'})
    document['nodes'][4]['config']['execution']['inputs'][0]['value']['node_id'] = 'code'
    document['nodes'][2]['config']['execution']['inputs'][0]['value']['node_id'] = 'external'
    store.save_managed_draft(request(document, [{'node_path': ['nodes', 3], 'text': SOURCE}]))
    selection, workflows = prepare_code_execution_material(select('source-agent'), store=store)
    closure = FrozenSkeletonCodeClosure.restore(selection.code_sources, selection, workflows)
    workspace = tmp_path / 'work'; workspace.mkdir(); file = workspace / 'external.py'; file.write_bytes(SOURCE.encode())
    runtime = FrozenCodeRuntimeSnapshot.prepare(closure, workspace_root=str(workspace))
    saved = runtime.to_dict()
    file.write_text('different')
    restored = FrozenCodeRuntimeSnapshot.restore(saved, selection, workflows)
    assert restored.resolver('external.py').content == SOURCE.encode()
    file.unlink()
    assert restored.resolver('external.py').content == SOURCE.encode()


def test_workspace_requirement_is_preserved_for_declared_external_code(store):
    document = code_agent(); second = deepcopy(document['nodes'][3]); second['id'] = 'external'
    document['nodes'].append(second)
    # Do not rely on unreachable-node admission to prove workspace behavior.
    document['edges'][-1]['target_node_id'] = 'external'
    document['edges'].append({'id': 'external-end', 'kind': 'flow', 'source_node_id': 'external',
        'source_port_id': 'out', 'target_node_id': 'end', 'target_port_id': 'in'})
    second['config']['execution']['inputs'][0]['value']['node_id'] = 'code'
    document['nodes'][2]['config']['execution']['inputs'][0]['value']['node_id'] = 'external'
    store.save_managed_draft(request(document, [{'node_path': ['nodes', 3], 'text': SOURCE}]))
    selection, workflows = prepare_code_execution_material(select('source-agent'), store=store)
    closure = FrozenSkeletonCodeClosure.restore(selection.code_sources, selection, workflows)
    with pytest.raises(SkeletonResourceError) as caught:
        FrozenCodeRuntimeSnapshot.prepare(closure, workspace_root=None)
    assert caught.value.code == 'workspace_unavailable'


def test_unmanaged_selection_keeps_original_digest_and_no_source_extension(store):
    from hashlib import sha256
    from skeleton_production_state import canonical
    store.save_draft(agent('plain'))
    selection, _ = prepare_code_execution_material(select('plain'), store=store)
    assert selection.code_sources is None
    assert selection.snapshot_digest == sha256(canonical(selection.to_dict())).hexdigest()
