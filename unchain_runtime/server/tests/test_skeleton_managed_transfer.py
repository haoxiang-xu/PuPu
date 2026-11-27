"""Real producer -> complete-source import; no Code/SDK execution."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from hashlib import sha256
from threading import Barrier
import importlib
import json
import pytest
from skeleton_resource_store import SkeletonResourceStore, SkeletonResourceError
from skeleton_code_sources import prepare_managed_code_edit
from test_skeleton_code_sources import edit
from test_skeleton_code_source_store import response_snapshot, logical_state


def source(tmp_path, text='# café\r\ndef main(input, context):\r\n    return {"rows": 9}\r\n'):
    origin=SkeletonResourceStore(tmp_path/'origin')
    request=edit(text);request['document']['nodes'][1]['config']['code']['environment_profile_id']='foreign-python'
    saved=origin.save_managed_draft(request)
    return origin,response_snapshot(saved)


def payload(frame, profile='builtin'):
    return {'schema':'pupu.skeleton-import.v2','source_json':json.dumps(frame,ensure_ascii=False,separators=(',',':'),sort_keys=True),'runtime_bindings':[
        {'node_path':deepcopy(e['node_path']),'environment_profile_id':profile} for e in frame['sources_manifest']['entries']]}


def importing(store,value):
    method=getattr(store,'import_managed_resource',None)
    assert callable(method),'v2 create-or-identical import producer is required'
    return method(value)


def exporting(store,identity):
    method=getattr(store,'export_managed_resource',None)
    assert callable(method),'complete owned source export producer is required'
    return method(identity)


def test_export_is_the_existing_closed_source_snapshot_without_local_registry(tmp_path):
    origin,frame=source(tmp_path);before=logical_state(origin)
    result=exporting(origin,frame['document']['id'])
    assert set(result)=={'schema','source_json','sha256'} and result['schema']=='pupu.skeleton-export.v2'
    assert json.loads(result['source_json'])==frame
    assert sha256(result['source_json'].encode()).hexdigest()==result['sha256']
    assert logical_state(origin)==before


def test_import_rebinds_only_profile_and_preserves_exact_source_and_origin(tmp_path):
    origin,frame=source(tmp_path);before=logical_state(origin);destination=SkeletonResourceStore(tmp_path/'destination')
    request=payload(frame);unchanged=deepcopy(request)
    result=importing(destination,request)
    expected=deepcopy(frame['document']);expected['nodes'][1]['config']['code']['environment_profile_id']='builtin'
    assert result['resource']['document']==expected
    assert result['contents']==frame['contents'] and result['sources_manifest']==frame['sources_manifest']
    assert request==unchanged and logical_state(origin)==before
    assert SkeletonResourceStore(destination.root).get_managed_resource(expected['id'])==result


def test_exact_repeat_has_no_token_schema_blob_or_table_change(tmp_path):
    _,frame=source(tmp_path);store=SkeletonResourceStore(tmp_path/'destination');request=payload(frame)
    first=importing(store,request);before=logical_state(store)
    assert importing(store,deepcopy(request))==first and logical_state(store)==before


@pytest.mark.parametrize('mutation',['body','name'])
def test_conflicting_import_cannot_replace_or_leave_source_blobs(tmp_path,mutation):
    _,frame=source(tmp_path);store=SkeletonResourceStore(tmp_path/'destination');first=importing(store,payload(frame))
    before=logical_state(store)
    if mutation=='name':frame['document']['name']='Different name'
    else:frame['contents'][0]['text']='new body'
    # Real canonical producer for the alternate valid file, not an inconsistent hash fake.
    request=edit(frame['contents'][0]['text']);request['document']=deepcopy(frame['document'])
    other=prepare_managed_code_edit(request).snapshot()
    with pytest.raises(SkeletonResourceError) as error:importing(store,payload(other))
    assert error.value.code=='import_conflict' and error.value.path==('source_json','document','id')
    assert logical_state(store)==before and store.get_managed_resource(first['resource']['id'])==first


def test_no_implicit_binding_even_if_builtin_or_same_local_name_exists(tmp_path):
    _,frame=source(tmp_path);store=SkeletonResourceStore(tmp_path/'destination');request=payload(frame);request['runtime_bindings']=[]
    before=logical_state(store)
    with pytest.raises(SkeletonResourceError) as error:importing(store,request)
    assert error.value.code=='runtime_binding_required' and error.value.path==('runtime_bindings',)
    assert logical_state(store)==before


@pytest.mark.parametrize('mode,code,path',[('missing','profile_missing',('runtime_bindings',0,'environment_profile_id')),('duplicate','duplicate_identity',('runtime_bindings',1,'node_path')),('wrong-target','invalid_target',('runtime_bindings',0,'node_path')),('unknown-key','unknown_field',('runtime_bindings',0,'executable')),('bool-target','invalid_target',('runtime_bindings',0,'node_path'))])
def test_binding_refusals_precede_all_writes(tmp_path,mode,code,path):
    _,frame=source(tmp_path);store=SkeletonResourceStore(tmp_path/'destination');request=payload(frame)
    if mode=='missing':request['runtime_bindings'][0]['environment_profile_id']='not-registered'
    if mode=='duplicate':request['runtime_bindings'].append(deepcopy(request['runtime_bindings'][0]))
    if mode=='wrong-target':request['runtime_bindings'][0]['node_path']=['nodes',0]
    if mode=='unknown-key':request['runtime_bindings'][0]['executable']='/file/must/not/launch'
    if mode=='bool-target':request['runtime_bindings'][0]['node_path']=['nodes',True]
    before=logical_state(store)
    with pytest.raises(SkeletonResourceError) as error:importing(store,request)
    assert error.value.code==code and error.value.path==path
    assert logical_state(store)==before


@pytest.mark.parametrize('mode',['text','missing-body','missing-binding','future','extra'])
def test_forged_or_incomplete_file_refuses_without_schema_upgrade(tmp_path,mode):
    _,frame=source(tmp_path);store=SkeletonResourceStore(tmp_path/'destination');request=payload(frame)
    decoded=json.loads(request['source_json'])
    if mode=='text':decoded['contents'][0]['text']+='corruption'
    if mode=='missing-body':decoded['contents']=[]
    if mode=='missing-binding':
        decoded=deepcopy(frame['document'])
    if mode=='future':decoded['schema']='pupu.skeleton-code-snapshot.v99'
    if mode=='extra':request['expected_edit_token']=None
    request['source_json']=json.dumps(decoded,ensure_ascii=False)
    before=logical_state(store)
    with pytest.raises(SkeletonResourceError):importing(store,request)
    assert logical_state(store)==before


def test_export_refuses_graph_only_digest_path_without_its_owned_bytes(tmp_path):
    _,frame=source(tmp_path);store=SkeletonResourceStore(tmp_path/'destination');store.import_resource(frame['document']);before=logical_state(store)
    with pytest.raises(SkeletonResourceError) as error:exporting(store,frame['document']['id'])
    assert error.value.code=='managed_source_required'
    assert logical_state(store)==before


def native_graph():
    doc=deepcopy(edit()['document']);doc['nodes']=[doc['nodes'][0],doc['nodes'][-1]]
    doc['nodes'][1]['config']['execution']['inputs'][0]['value']={'kind':'literal','value':3}
    doc['edges']=[{'id':'direct','kind':'flow','source_node_id':'start','source_port_id':'out','target_node_id':'end','target_port_id':'in'}]
    return doc


def test_native_no_code_import_and_graph_only_exact_repeat_are_preserved(tmp_path):
    store=SkeletonResourceStore(tmp_path/'destination');document=native_graph();old=store.import_resource(document);before=logical_state(store)
    result=importing(store,{'schema':'pupu.skeleton-import.v2','source_json':json.dumps(document),'runtime_bindings':[]})
    assert result['resource']['edit_token']==old['edit_token'] and logical_state(store)==before
    assert result['contents']==[]


def test_native_workflow_with_agent_retains_actual_validation_reason(tmp_path):
    store=SkeletonResourceStore(tmp_path/'destination');doc=native_graph();doc['nodes'][1]['type']='agent';before=logical_state(store)
    with pytest.raises(SkeletonResourceError) as error:importing(store,{'schema':'pupu.skeleton-import.v2','source_json':json.dumps(doc),'runtime_bindings':[]})
    assert error.value.code=='invalid_value' and error.value.path==('source_json','nodes',1,'type')
    assert logical_state(store)==before


def test_late_old_import_cannot_replace_a_new_editor_save(tmp_path):
    _,frame=source(tmp_path);store=SkeletonResourceStore(tmp_path/'destination');first=importing(store,payload(frame))
    value=edit('new author text');value['document']=deepcopy(first['resource']['document']);value['expected_edit_token']=first['resource']['edit_token']
    second=store.save_managed_draft(value);before=logical_state(store)
    with pytest.raises(SkeletonResourceError) as error:importing(store,payload(frame))
    assert error.value.code=='import_conflict' and logical_state(store)==before
    assert store.get_managed_resource(second['resource']['id'])==second


@pytest.mark.parametrize('different',[False,True])
def test_concurrent_imports_are_one_commit_or_exact_idempotence(tmp_path,different):
    _,frame=source(tmp_path);store=SkeletonResourceStore(tmp_path/'destination');requests=[payload(frame),payload(frame)]
    if different:
        request=edit('different concurrent body');request['document']=deepcopy(frame['document'])
        requests[1]=payload(prepare_managed_code_edit(request).snapshot())
    assert callable(getattr(store,'import_managed_resource',None))
    ready=Barrier(2)
    def run(request):
        ready.wait(timeout=5)
        try:return importing(store,request)
        except SkeletonResourceError as e:return e.code
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(run,requests))
    if different:assert sum(type(x) is dict for x in results)==1 and results.count('import_conflict')==1
    else:assert results[0]==results[1]
    with store._connect() as c:assert c.execute('SELECT count(*) FROM code_source_blobs').fetchone()[0]==1


def test_database_failure_rolls_back_schema_and_new_source(tmp_path):
    _,frame=source(tmp_path);store=SkeletonResourceStore(tmp_path/'destination')
    with store._connect() as c:c.execute("CREATE TRIGGER qa_reject BEFORE INSERT ON resources BEGIN SELECT RAISE(ABORT,'qa-only forced failure'); END")
    before=logical_state(store)
    with pytest.raises(SkeletonResourceError) as error:importing(store,payload(frame))
    assert error.value.code=='source_store_unavailable' and logical_state(store)==before


def test_transfer_capability_is_closed_and_bound_to_actual_runtime():
    module=importlib.import_module('skeleton_source_transfer')
    answer=module.managed_transfer_capabilities()
    assert set(answer)=={'schema','import_schema','export_schema','source_schema','native_graph_version','binding_policy','identity_policy','scope','file_bytes','request_bytes','runtime_manifest_digest'}
    assert answer['schema']=='pupu.skeleton-transfer-capabilities.v1'
    assert answer['import_schema']=='pupu.skeleton-import.v2' and answer['source_schema']=='pupu.skeleton-code-snapshot.v1'
    assert answer['binding_policy']=='explicit-all-owned-code-nodes' and answer['identity_policy']=='create-or-identical' and answer['scope']=='one-resource'
    from unchain.runtime.runtime_protocol import runtime_protocol_manifest
    assert answer['runtime_manifest_digest']==runtime_protocol_manifest()['manifest_digest']


def test_raw_file_preserves_python_float_negative_zero_and_large_integer(tmp_path):
    request=edit();request['document']['nodes'][1]['config']['execution']['inputs'][0]['value']={'kind':'literal','value':[1.0,-0.0,9007199254740993]}
    frame=prepare_managed_code_edit(request).snapshot();value=payload(frame);store=SkeletonResourceStore(tmp_path/'destination')
    assert '1.0' in value['source_json'] and '-0.0' in value['source_json'] and '9007199254740993' in value['source_json']
    result=importing(store,value);numbers=result['resource']['document']['nodes'][1]['config']['execution']['inputs'][0]['value']['value']
    assert type(numbers[0]) is float and type(numbers[1]) is float and numbers[2]==9007199254740993
    exported=exporting(store,frame['document']['id'])
    assert '-0.0' in exported['source_json'] and '9007199254740993' in exported['source_json']


@pytest.mark.parametrize('text',['{"schema":1,"schema":2}','not JSON','{"schema_version":NaN}'])
def test_ambiguous_or_non_json_file_never_writes(tmp_path,text):
    store=SkeletonResourceStore(tmp_path/'destination');before=logical_state(store)
    with pytest.raises(SkeletonResourceError) as error:importing(store,{'schema':'pupu.skeleton-import.v2','source_json':text,'runtime_bindings':[]})
    assert error.value.code=='invalid_json' and error.value.path==('source_json',)
    assert logical_state(store)==before


def test_same_local_profile_name_still_requires_an_explicit_binding(tmp_path):
    import sys
    _,frame=source(tmp_path);store=SkeletonResourceStore(tmp_path/'destination')
    store.save_python_profile('foreign-python',sys.executable)
    request=payload(frame,'foreign-python');request['runtime_bindings']=[];before=logical_state(store)
    with pytest.raises(SkeletonResourceError) as error:importing(store,request)
    assert error.value.code=='runtime_binding_required' and logical_state(store)==before
    result=importing(store,payload(frame,'foreign-python'))
    assert result['resource']['document']==frame['document']


def http_client(store,monkeypatch):
    from flask import Flask
    # Production imports all decorators before registering the Blueprint.
    from routes import api_blueprint
    import route_skeleton_code_sources as routes
    monkeypatch.setattr(routes,'SkeletonResourceStore',lambda:store)
    app=Flask(__name__);app.config['UNCHAIN_AUTH_TOKEN']='qa-transfer-only';app.register_blueprint(api_blueprint)
    return app.test_client()


def test_http_auth_and_closed_capability_query(tmp_path,monkeypatch):
    store=SkeletonResourceStore(tmp_path/'destination');client=http_client(store,monkeypatch);url='/skeleton_resources/v2/transfer/capabilities';headers={'x-unchain-auth':'qa-transfer-only'}
    assert client.get(url).status_code==401
    response=client.get(url,headers=headers);assert response.status_code==200
    assert response.get_json()['schema']=='pupu.skeleton-transfer-capabilities.v1'
    bad=client.get(url+'?path=/elsewhere',headers=headers)
    assert bad.status_code==400 and bad.get_json()['error']['code']=='unknown_field'


def test_http_source_file_import_export_and_exact_refusal(tmp_path,monkeypatch):
    _,frame=source(tmp_path);store=SkeletonResourceStore(tmp_path/'destination');client=http_client(store,monkeypatch);headers={'x-unchain-auth':'qa-transfer-only'}
    request=payload(frame);answer=client.post('/skeleton_resources/v2/import',json=request,headers=headers)
    assert answer.status_code==200
    exported=client.get('/skeleton_resources/v2/'+frame['document']['id']+'/export',headers=headers)
    assert exported.status_code==200 and json.loads(exported.get_json()['source_json'])['contents']==frame['contents']
    before=logical_state(store);bad=client.post('/skeleton_resources/v2/import',json={**request,'expected_edit_token':None},headers=headers)
    assert bad.status_code==400 and bad.get_json()['error']['path']==['expected_edit_token']
    assert logical_state(store)==before


def test_code_occurrence_addresses_keep_distinct_profiles(tmp_path):
    import sys
    value=edit();doc=value['document'];doc['nodes'].insert(2,deepcopy(doc['nodes'][1]));doc['nodes'][2]['id']='second-code'
    value['managed_sources'].append({'node_path':['nodes',2],'text':'second body'})
    frame=prepare_managed_code_edit(value).snapshot();store=SkeletonResourceStore(tmp_path/'destination')
    store.save_python_profile('second-python',sys.executable)
    request=payload(frame);request['runtime_bindings'][1]['environment_profile_id']='second-python'
    result=importing(store,request)
    assert [n['config']['code']['environment_profile_id'] for n in result['resource']['document']['nodes'][1:3]]==['builtin','second-python']
    assert result['contents']==frame['contents'] and result['sources_manifest']==frame['sources_manifest']


def test_embedded_owned_code_is_imported_without_creating_child_resources(tmp_path):
    inner1=deepcopy(edit()['document']);inner1.update(kind='agent',id='inner-one')
    inner2=deepcopy(inner1);inner2['id']='inner-two'
    doc=native_graph();doc.update(kind='agent',id='owned-parent')
    doc['nodes'].append({'id':'pool','type':'subagent_pool','config':{'subagents':[
        {'id':'one','name':'One','source':{'kind':'embedded','document':inner1}},
        {'id':'two','name':'Two','source':{'kind':'embedded','document':inner2}}]}})
    paths=[['nodes',2,'config','subagents',i,'source','document','nodes',1] for i in range(2)]
    request={'schema':'pupu.skeleton-edit.v2','document':doc,'expected_edit_token':None,'managed_sources':[
        {'node_path':paths[0],'text':'first owned text'},{'node_path':paths[1],'text':'second owned text'}]}
    frame=prepare_managed_code_edit(request).snapshot();store=SkeletonResourceStore(tmp_path/'destination');result=importing(store,payload(frame))
    assert result['contents']==frame['contents'] and result['sources_manifest']==frame['sources_manifest']
    assert len(store.list_resources())==1 and store.list_resources()[0]['id']=='owned-parent'
    assert json.loads(exporting(store,'owned-parent')['source_json'])['document']==result['resource']['document']


def test_global_blob_is_not_borrowed_by_an_unbound_resource_export(tmp_path):
    _,frame=source(tmp_path);store=SkeletonResourceStore(tmp_path/'destination')
    other=edit(frame['contents'][0]['text']);other['document']['id']='other-owner';store.save_managed_draft(other)
    store.import_resource(frame['document']);before=logical_state(store)
    with pytest.raises(SkeletonResourceError) as error:exporting(store,frame['document']['id'])
    assert error.value.code=='managed_source_required' and logical_state(store)==before


def test_changed_local_environment_is_not_silently_rebound(tmp_path):
    import sys
    _,frame=source(tmp_path);store=SkeletonResourceStore(tmp_path/'destination');executable=tmp_path/'python-alias';executable.symlink_to(sys.executable)
    store.save_python_profile('changed-python',str(executable));executable.unlink();executable.symlink_to('/usr/bin/true')
    before=logical_state(store)
    with pytest.raises(SkeletonResourceError) as error:importing(store,payload(frame,'changed-python'))
    assert error.value.code=='environment_changed' and error.value.path==('runtime_bindings',0,'environment_profile_id')
    assert logical_state(store)==before
