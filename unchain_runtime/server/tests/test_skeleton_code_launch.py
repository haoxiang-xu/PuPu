"""Real active host + offline SDK + exact Code worker; source retention, not UI."""
from copy import deepcopy
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

import durable_interaction_host as interactions
import unchain_adapter as adapter
from skeleton_credential_requirements import requirements_for_start, requirements_for_resume
from skeleton_production_state import load_launch, validate_launch_descriptor
from skeleton_resource_store import SkeletonResourceStore
from test_skeleton_production_chat import production, _approval_fixture
from tests.test_skeleton_code_admission import code_agent, request


SOURCE_A = 'def main(input, context):\n    return {"message": "A: " + input["message"]}\n'
SOURCE_B = SOURCE_A.replace('A: ', 'B: ')


def query(options, session, *, interaction=''):
    return {'schema': 'pupu.skeleton_credential_query.v1', 'mode': 'resume' if interaction else 'start',
        'session_id': session, 'owner_chat_id': options['_memory_v2_owner_chat_id'],
        'interaction_id': interaction, 'source_attempt_id': '',
        'selection': None if interaction else options['skeleton_selection'], 'recipe_name': '',
        'memory_agent_config': options.get('_memory_v2_memory_agent_config')}


def upgrade(store, options):
    current = store.get_resource('production-agent')
    document = deepcopy(current['document'])
    document['nodes'][1]['config']['kernel']['profile'].update(
        id='openai-profile', credential_ref='openai', endpoint='https://api.openai.com/v1')
    document['nodes'].append(deepcopy(code_agent()['nodes'][3]))
    index = len(document['nodes']) - 1
    document['edges'][1]['target_node_id'] = 'code'
    document['edges'].append({'id': 'code-end', 'kind': 'flow', 'source_node_id': 'code',
        'source_port_id': 'out', 'target_node_id': 'end', 'target_port_id': 'in'})
    document['nodes'][2]['config']['execution']['inputs'][0]['value']['node_id'] = 'code'
    saved = store.save_managed_draft(request(document, [{'node_path': ['nodes', index], 'text': SOURCE_A}], current['edit_token']))
    options['skeleton_credentials'] = {'openai': {'provider': 'openai', 'endpoint': 'https://api.openai.com/v1', 'api_key': 'SENTINEL_ROOT'}}
    options['openaiApiKey'] = 'SENTINEL_MEMORY'
    options.pop('workspace_root', None)
    options['disable_workspace_root'] = True
    return saved, index


def test_managed_start_uses_v2_scope_and_commits_exact_code_output_without_workspace(production):
    store, options, calls = production
    upgrade(store, options)
    issued = requirements_for_start(query(options, 'source-start'), memory_provider='openai', store=store)
    assert issued['schema'] == 'pupu.skeleton_credential_requirements.v2'
    assert issued['scope']['schema'] == 'pupu.skeleton_credential_scope.v2'
    if os.environ.get('G1_REQUIREMENTS_CAPTURE'):
        Path(os.environ['G1_REQUIREMENTS_CAPTURE']).write_text(json.dumps({'requirements': issued, 'query': query(options, 'source-start')}, indent=2) + '\n')
    options['skeleton_credential_scope'] = issued['scope']
    events = list(adapter.stream_chat_events(message='test input', history=[], options=options,
                                           session_id='source-start', attempt_id='source-root'))
    roots = [row for row in events if row.get('type') == 'final_message' and row.get('scope') == 'root']
    assert len(roots) == 1 and roots[0]['content'] == 'A: End production reply'
    assert len(calls) == 1
    launch = load_launch('source-start', 'source-root')
    assert launch.descriptor['schema'] == 'pupu.skeleton-launch.v2'
    assert launch.descriptor['workspace_root'] is None
    assert launch.store.load().state['root_committed'] is True
    assert 'SENTINEL_' not in json.dumps(launch.descriptor)


def test_two_approvals_and_fresh_process_keep_original_source_after_library_changes(production, monkeypatch):
    options, effects, calls = _approval_fixture(production, monkeypatch, count=2)
    store = production[0]
    workspace = options['workspace_root']
    saved, index = upgrade(store, options)
    # Core tools still require their original workspace grant. Managed Code
    # must not turn its own workspace exemption into a tool exemption.
    options.update(workspace_root=workspace, disable_workspace_root=False)
    session, root = 'source-waits', 'source-waits-root'
    options['skeleton_credential_scope'] = requirements_for_start(query(options, session), memory_provider='openai', store=store)['scope']
    list(adapter.stream_chat_events(message='approve exact source', history=[], options=options,
                                   session_id=session, attempt_id=root))
    original = load_launch(session, root)
    assert original.descriptor['schema'] == 'pupu.skeleton-launch.v2'
    path = saved['resource']['document']['nodes'][index]['config']['code']['source']['path']
    store.save_managed_draft(request(saved['resource']['document'], [{'node_path': ['nodes', index], 'text': SOURCE_B}], saved['resource']['edit_token']))
    # A distinct process validates the actual retained Journal artifact with no
    # graph/source library read and no provider factory. No cold resume is faked.
    script = '''import os,sys,json,socket
sys.path.insert(0, sys.argv[1])
def deny(*a,**k): raise AssertionError('network forbidden')
socket.socket.connect=socket.socket.connect_ex=socket.create_connection=socket.getaddrinfo=deny
from skeleton_resource_store import SkeletonResourceStore
def forbidden(*a,**k): raise AssertionError('live resource read during retained launch load')
SkeletonResourceStore.get_resource=SkeletonResourceStore.get_managed_resource=forbidden
from skeleton_production_state import load_launch
from skeleton_code_closure import FrozenCodeRuntimeSnapshot
value=load_launch(sys.argv[2],sys.argv[3])
snapshot=FrozenCodeRuntimeSnapshot.restore(value.descriptor['code_sources'],value.selection,value.workflows)
source=snapshot.resolver(sys.argv[4])
print(json.dumps({'pid':os.getpid(),'sha256':source.sha256,'text':source.content.decode(),'schema':value.descriptor['schema']}))
'''
    environment = os.environ | {'HOME': str(production[0].root.parent.parent), 'UNCHAIN_SOURCE_PATH': str(Path(sys.executable).parent.parent / 'lib/python3.12/site-packages')}
    child = subprocess.run([sys.executable, '-I', '-B', '-c', script, str(Path(__file__).resolve().parents[1]), session, root, path],
                           env=environment, capture_output=True, text=True, timeout=20, check=True)
    proof = json.loads(child.stdout.strip().splitlines()[-1])
    assert proof['pid'] != os.getpid() and proof['text'] == SOURCE_A
    monkeypatch.setattr(SkeletonResourceStore, 'get_resource', lambda *a, **k: pytest.fail('live graph read on resume'))
    monkeypatch.setattr(SkeletonResourceStore, 'get_managed_resource', lambda *a, **k: pytest.fail('live source read on resume'))
    for step in range(2):
        pending = interactions.get_pending_interaction(session)
        interactions.record_interaction_receipt(session_id=session, interaction_id=pending['interaction_id'], approved=True)
        issued = requirements_for_resume(query(options, session, interaction=pending['interaction_id']), memory_provider='openai')
        assert issued['scope']['schema'] == 'pupu.skeleton_credential_scope.v2'
        options['skeleton_credential_scope'] = issued['scope']
        events = list(adapter.resume_chat_interaction_events(session_id=session, interaction_id=pending['interaction_id'],
            options=options, attempt_id='source-resume-' + str(step), source_attempt_id=root))
        assert len(effects) == step + 1
    roots = [row for row in events if row.get('type') == 'final_message' and row.get('scope') == 'root']
    assert len(roots) == 1 and roots[0]['content'] == 'A: Approved End'
    final = load_launch(session, root)
    assert final.descriptor == original.descriptor
    assert final.store.load().state['root_committed'] is True
    assert len(calls) == 3


@pytest.mark.parametrize('change', ['stale', 'old-schema', 'missing'])
def test_bad_source_scope_is_refused_before_execution_registration(production, monkeypatch, change):
    store, options, calls = production
    saved, index = upgrade(store, options)
    issued = requirements_for_start(query(options, 'source-fenced'), memory_provider='openai', store=store)
    options['skeleton_credential_scope'] = deepcopy(issued['scope'])
    if change == 'stale':
        store.save_managed_draft(request(saved['resource']['document'], [{'node_path': ['nodes', index], 'text': SOURCE_B}], saved['resource']['edit_token']))
    elif change == 'old-schema':
        options['skeleton_credential_scope']['schema'] = 'pupu.skeleton_credential_scope.v1'
    else:
        del options['skeleton_credential_scope']
    control = adapter._execution_control_call
    def checked(operation, *args, **kwargs):
        assert operation not in {'register', 'mark_running'}, 'invalid source scope reached execution registration'
        return control(operation, *args, **kwargs)
    monkeypatch.setattr(adapter, '_execution_control_call', checked)
    with pytest.raises(interactions.DurableInteractionHostError):
        list(adapter.stream_chat_events(message='must not run', history=[], options=options,
                                       session_id='source-fenced', attempt_id='source-refused'))
    assert calls == []
