"""The stored enable bit and the real frozen dependency closure agree."""
from copy import deepcopy
import importlib

import pytest

from skeleton_resource_store import SkeletonResourceStore, SkeletonResourceError
from skeleton_code_admission import prepare_code_execution_material, _AdmissionStore
from skeleton_runtime_capability import SkeletonRuntimeCompatibilityError
from test_skeleton_resource_store import agent, workflow


def hooked(enabled=False):
    document = agent('hook-enabled-agent')
    hook = {'id': 'policy', 'event': 'before_tool_call', 'order': 3,
            'tool_name': None, 'force_approval': True,
            'workflow': {'workflow_id': 'policy-workflow', 'revision_id': 'not-published'},
            'enabled': enabled}
    document['nodes'].append({'id': 'hooks', 'type': 'hooks_pool', 'config': {'hooks': [hook]}})
    document['edges'].append({'id': 'attach-hooks', 'kind': 'attach', 'source_node_id': 'kernel',
                             'source_port_id': 'attach_bot', 'target_node_id': 'hooks', 'target_port_id': 'attach_top'})
    return document


def edit(document, token=None):
    return {'schema': 'pupu.skeleton-edit.v2', 'document': document,
            'expected_edit_token': token, 'managed_sources': []}


def select(store):
    return prepare_code_execution_material({'skeleton_selection': {
        'schema': 'pupu.skeleton_chat_selection.v1', 'kind': 'resource',
        'resource_id': 'hook-enabled-agent'}}, store=store)


def test_disabled_hook_stays_in_store_but_needs_no_published_dependency(tmp_path):
    store = SkeletonResourceStore(tmp_path / 'resources')
    document = hooked(False)
    saved = store.save_managed_draft(edit(document))
    assert saved == store.get_managed_resource(document['id'])
    assert saved['resource']['document'] == document
    selected, frozen = select(store)
    assert frozen.dependencies == []
    assert selected.to_dict()['document'] == document


def test_new_selection_sees_disable_while_the_previous_fixed_definition_and_dependencies_survive(tmp_path):
    store = SkeletonResourceStore(tmp_path / 'resources')
    wf = workflow('policy-workflow')
    wf['nodes'] = [wf['nodes'][0], wf['nodes'][-1]]
    wf['nodes'][0]['config']['execution']['outputs'] = []
    wf['nodes'][-1]['config']['execution'] = {
        'inputs': [{'name': 'decision', 'value': {'kind': 'literal', 'value': 'continue'}, 'missing': 'error'},
                   {'name': 'require_approval', 'value': {'kind': 'literal', 'value': False}, 'missing': 'error'}],
        'outputs': [{'name': key, 'source': {'kind': 'input', 'path': [key]}}
                    for key in ('decision', 'require_approval')]}
    wf['edges'] = [{'id': 'start-end', 'kind': 'flow', 'source_node_id': 'start', 'source_port_id': 'out',
                    'target_node_id': 'end', 'target_port_id': 'in'}]
    saved_wf = store.save_managed_draft(edit(wf))
    version = store.publish_managed_workflow('policy-workflow', {
        'schema': 'pupu.skeleton-publish.v2', 'expected_edit_token': saved_wf['resource']['edit_token']})['version']
    document = hooked(True)
    document['nodes'][-1]['config']['hooks'][0]['workflow']['revision_id'] = version['revision_id']
    first = store.save_managed_draft(edit(document))
    previous, previous_dependencies = select(store)
    retained = deepcopy(previous.to_dict())
    changed = deepcopy(document)
    changed['nodes'][-1]['config']['hooks'][0]['enabled'] = False
    store.save_managed_draft(edit(changed, first['resource']['edit_token']))
    current, current_dependencies = select(store)
    assert previous.to_dict() == retained
    assert previous.to_dict()['document']['nodes'][-1]['config']['hooks'][0]['enabled'] is True
    assert len(previous_dependencies.dependencies) == 1
    assert current.to_dict()['document']['nodes'][-1]['config']['hooks'][0]['enabled'] is False
    assert current_dependencies.dependencies == []
    assert previous.definition_digest != current.definition_digest


def test_capabilities_come_from_the_actual_imported_producer_and_are_closed():
    contract = importlib.import_module('skeleton_hook_capability').hook_enable_capabilities()
    assert set(contract) == {'schema', 'runtime_manifest_digest', 'hook_entry'}
    assert contract['schema'] == 'pupu.skeleton_hooks_capabilities.v1'
    assert contract['hook_entry']['optional_fields'] == ['enabled']
    from unchain.runtime.runtime_protocol import runtime_protocol_manifest
    assert contract['runtime_manifest_digest'] == runtime_protocol_manifest()['manifest_digest']


@pytest.mark.parametrize('mutation', ['unknown', 'wrong-schema', 'wrong-fields', 'wrong-default'])
def test_host_rejects_a_malformed_runtime_advertisement(monkeypatch, mutation):
    import unchain.skeleton.hooks_config as core
    raw = getattr(core, 'hook_entry_contract', lambda: {})()
    if mutation == 'unknown': raw['unknown'] = True
    elif mutation == 'wrong-schema': raw['schema'] = 'future'
    elif mutation == 'wrong-fields': raw['optional_fields'] = ['enabled', 'fail_open']
    else: raw['omitted_enabled'] = 1
    monkeypatch.setattr(core, 'hook_entry_contract', lambda: deepcopy(raw))
    api = importlib.import_module('skeleton_hook_capability')
    with pytest.raises(SkeletonRuntimeCompatibilityError) as rejected:
        api.hook_enable_capabilities()
    assert rejected.value.code == 'skeleton_hook_enable_unavailable'


def test_feature_is_required_from_actual_manifest_even_if_a_callable_producer_exists(tmp_path, monkeypatch):
    from hashlib import sha256
    import json
    from unchain.runtime import runtime_protocol
    manifest = runtime_protocol.runtime_protocol_manifest()
    next(p for p in manifest['protocols'] if p['id'] == 'skeleton_execution')['features'].remove('hook_enable_v1')
    body = {key: manifest[key] for key in ('protocols', 'runtime', 'schema')}
    raw = json.dumps(body, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(',', ':')).encode()
    manifest['manifest_digest'] = 'sha256:' + sha256(b'unchain.runtime_protocol_manifest.v1\\u0000' + raw).hexdigest()
    monkeypatch.setattr(runtime_protocol, 'runtime_protocol_manifest', lambda: deepcopy(manifest))
    store = SkeletonResourceStore(tmp_path / 'resources')
    document = hooked(False)
    saved = store.save_managed_draft(edit(document))
    before = store.get_managed_resource(document['id'])
    with pytest.raises(SkeletonResourceError) as rejected:
        select(store)
    assert (rejected.value.code, rejected.value.status) == ('skeleton_hook_enable_unavailable', 409)
    assert before == saved == store.get_managed_resource(document['id'])
    # Missing the new feature does not block an old definition with no enable bit.
    legacy = agent('legacy-no-enable-state')
    store.save_managed_draft(edit(legacy))
    from contextlib import closing
    with closing(store._connect()) as connection, connection:
        connection.execute('BEGIN')
        assert _AdmissionStore(store, connection).preflight(legacy['id'])['ok'] is True
