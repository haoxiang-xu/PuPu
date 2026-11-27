"""Independent producer consumption, real v2 persistence and fixed query shape."""
from copy import deepcopy
from contextlib import closing
import importlib
import json
from hashlib import sha256

import pytest
from skeleton_code_admission import _AdmissionStore
from skeleton_resource_store import SkeletonResourceStore,SkeletonResourceError
from skeleton_runtime_capability import SkeletonRuntimeCompatibilityError
from test_skeleton_hook_enabled import hooked,edit,select
from test_skeleton_resource_store import workflow

EXPECTED={'schema':'unchain.skeleton_hook_tool_set.v1','field':'tool_name',
          'legacy_types':['null','string'],'set_type':'array','minimum_size':1,
          'duplicates':'reject','names':'nonblank_exact','normalization':'none'}


def capability():
    getter=getattr(importlib.import_module('skeleton_hook_capability'),'hook_tool_set_capabilities',None)
    assert callable(getter),'the host needs a real independent tool-set capability consumer'
    return getter()


def test_actual_producer_reply_is_closed_and_the_old_enable_reply_keeps_its_shape():
    answer=capability()
    assert set(answer)=={'schema','runtime_manifest_digest','tool_matcher'}
    assert answer['schema']=='pupu.skeleton_hook_tool_set_capabilities.v1'
    assert answer['tool_matcher']==EXPECTED
    from unchain.runtime.runtime_protocol import runtime_protocol_manifest
    assert answer['runtime_manifest_digest']==runtime_protocol_manifest()['manifest_digest']
    old=importlib.import_module('skeleton_hook_capability').hook_enable_capabilities()
    assert set(old)=={'schema','runtime_manifest_digest','hook_entry'}
    assert old['hook_entry']['optional_fields']==['enabled']

@pytest.mark.parametrize('mutation',['unknown','schema','field','legacy','set','minimum-bool','minimum','duplicates','names','normalization','throw','absent'])
def test_malformed_or_missing_real_getter_fails_closed(monkeypatch,mutation):
    import unchain.skeleton.hooks_config as core
    raw=deepcopy(EXPECTED)
    if mutation=='unknown':raw['unknown']=True
    elif mutation=='schema':raw['schema']='future'
    elif mutation=='field':raw['field']='title'
    elif mutation=='legacy':raw['legacy_types']=['string','null']
    elif mutation=='set':raw['set_type']='string'
    elif mutation=='minimum-bool':raw['minimum_size']=True
    elif mutation=='minimum':raw['minimum_size']=0
    elif mutation=='duplicates':raw['duplicates']='allow'
    elif mutation=='names':raw['names']='pattern'
    elif mutation=='normalization':raw['normalization']='trim'
    if mutation=='throw':
        def boom():raise RuntimeError('sentinel-must-not-leak')
        monkeypatch.setattr(core,'hook_tool_set_contract',boom,raising=False)
    else:monkeypatch.setattr(core,'hook_tool_set_contract',None if mutation=='absent' else lambda:deepcopy(raw),raising=False)
    with pytest.raises(SkeletonRuntimeCompatibilityError) as rejected:capability()
    assert rejected.value.code=='skeleton_hook_tool_set_unavailable'
    assert 'sentinel-must-not-leak' not in str(rejected.value)


def without_feature(monkeypatch):
    from unchain.runtime import runtime_protocol
    manifest=runtime_protocol.runtime_protocol_manifest()
    protocol=next(p for p in manifest['protocols'] if p['id']=='skeleton_execution')
    if 'hook_tool_set_v1' in protocol['features']:protocol['features'].remove('hook_tool_set_v1')
    body={key:manifest[key] for key in ('protocols','runtime','schema')}
    raw=json.dumps(body,ensure_ascii=False,allow_nan=False,sort_keys=True,separators=(',',':')).encode()
    manifest['manifest_digest']='sha256:'+sha256(b'unchain.runtime_protocol_manifest.v1\\u0000'+raw).hexdigest()
    monkeypatch.setattr(runtime_protocol,'runtime_protocol_manifest',lambda:deepcopy(manifest))


def test_array_needs_manifest_feature_even_when_disabled_and_does_not_rewrite_storage(tmp_path,monkeypatch):
    store=SkeletonResourceStore(tmp_path/'resources');doc=hooked(False)
    doc['nodes'][-1]['config']['hooks'][0]['tool_name']=['read','write']
    saved=store.save_managed_draft(edit(doc));assert saved==store.get_managed_resource(doc['id'])
    without_feature(monkeypatch)
    with pytest.raises(SkeletonResourceError) as rejected:select(store)
    assert (rejected.value.code,rejected.value.status)==('skeleton_hook_tool_set_unavailable',409)
    assert saved==store.get_managed_resource(doc['id'])
    # Missing tool-set support must not block an old enabled/string definition.
    legacy=hooked(False);legacy['nodes'][-1]['config']['hooks'][0]['tool_name']='read'
    current=store.save_managed_draft(edit(legacy,saved['resource']['edit_token']))
    _,frozen=select(store);assert frozen.dependencies==[]
    assert current==store.get_managed_resource(doc['id'])


def publish_policy(store):
    wf=workflow('policy-workflow');wf['nodes']=[wf['nodes'][0],wf['nodes'][-1]]
    wf['nodes'][0]['config']['execution']['outputs']=[]
    wf['nodes'][-1]['config']['execution']={'inputs':[
        {'name':'decision','value':{'kind':'literal','value':'continue'},'missing':'error'},
        {'name':'require_approval','value':{'kind':'literal','value':False},'missing':'error'}],
        'outputs':[{'name':name,'source':{'kind':'input','path':[name]}} for name in ['decision','require_approval']]}
    wf['edges']=[{'id':'flow','kind':'flow','source_node_id':'start','source_port_id':'out','target_node_id':'end','target_port_id':'in'}]
    made=store.save_managed_draft(edit(wf))
    return store.publish_managed_workflow(wf['id'],{'schema':'pupu.skeleton-publish.v2','expected_edit_token':made['resource']['edit_token']})['version']


def test_store_selection_retains_old_exact_set_after_later_definition_edit(tmp_path):
    store=SkeletonResourceStore(tmp_path/'resources');version=publish_policy(store);doc=hooked(True)
    entry=doc['nodes'][-1]['config']['hooks'][0];entry['tool_name']=['read','write'];entry['workflow']['revision_id']=version['revision_id']
    first=store.save_managed_draft(edit(doc));before,pins=select(store);snapshot=deepcopy(before.to_dict())
    changed=deepcopy(doc);changed['nodes'][-1]['config']['hooks'][0]['tool_name']=['echo']
    after=store.save_managed_draft(edit(changed,first['resource']['edit_token']));current,new_pins=select(store)
    assert after==store.get_managed_resource(doc['id'])
    assert before.to_dict()==snapshot and snapshot['document']['nodes'][-1]['config']['hooks'][0]['tool_name']==['read','write']
    assert current.to_dict()['document']['nodes'][-1]['config']['hooks'][0]['tool_name']==['echo']
    assert before.definition_digest!=current.definition_digest
    assert len(pins.dependencies)==len(new_pins.dependencies)==1
    with closing(store._connect()) as conn,conn:
        conn.execute('BEGIN');assert _AdmissionStore(store,conn).preflight(doc['id'])['ok'] is True

@pytest.fixture
def capability_client():
    from flask import Flask
    from route_skeleton_resources import api_blueprint
    app=Flask(__name__);app.config['UNCHAIN_AUTH_TOKEN']='sentinel-test-token';app.register_blueprint(api_blueprint)
    return app.test_client()


def test_new_fixed_query_returns_the_real_contract_and_no_query_keeps_enable(capability_client):
    client=capability_client;headers={'x-unchain-auth':'sentinel-test-token'}
    assert client.get('/skeleton_hooks/capabilities?contract=tool_set_v1').status_code==401
    answer=client.get('/skeleton_hooks/capabilities?contract=tool_set_v1',headers=headers)
    assert answer.status_code==200 and answer.get_json()==capability()
    old=client.get('/skeleton_hooks/capabilities',headers=headers)
    assert old.status_code==200
    assert old.get_json()==importlib.import_module('skeleton_hook_capability').hook_enable_capabilities()

@pytest.mark.parametrize('query,code', [('contract=future','unknown_variant'),
    ('contract=tool_set_v1&contract=tool_set_v1','invalid_shape'),
    ('contract=tool_set_v1&other=true','unknown_field')])
def test_query_selector_is_closed_and_single(capability_client,query,code):
    reply=capability_client.get('/skeleton_hooks/capabilities?'+query,headers={'x-unchain-auth':'sentinel-test-token'})
    assert reply.status_code==400 and reply.get_json()['error']['code']==code
