"""Freeze responses from the actual authenticated Flask/Store/runtime chain."""
import hashlib
import json
import os
from pathlib import Path
import sys
import zipfile

from flask import Flask
from test_skeleton_production_chat import production  # noqa: F401


def test_real_test_run_producer_capture(production,monkeypatch,tmp_path):
    import routes
    import route_skeleton_resources  # noqa: F401
    import skeleton_builder_tests
    from route_blueprint import api_blueprint
    from skeleton_builder_tests import BuilderTestSessions
    from skeleton_builder_tests import freeze_test_context
    from test_skeleton_workflow_parameters import workflow
    from test_builder_test_workflow import _workflow_write
    from skeleton_runtime_capability import require_skeleton_runtime
    # Only scheduling is made synchronous; every operation, guard, receipt,
    # worker, Journal and CAS implementation is the deployed production one.
    monkeypatch.setattr(skeleton_builder_tests,'BuilderTestSessions',lambda:BuilderTestSessions(background=False))
    monkeypatch.setattr(routes,'_is_authorized',lambda:True)
    app=Flask(__name__); app.register_blueprint(api_blueprint); client=app.test_client()
    def command(op,**values):
        if op=='prepare':values.setdefault('context',freeze_test_context({}))
        response=client.post('/skeleton_tests/command',json={'schema':'pupu.builder-test.v1','op':op,**values})
        assert response.status_code==200,response.json
        return response.json
    packets={'capabilities':command('capabilities')}
    store,options,calls=production
    saved=store.get_resource('production-agent')
    saved['document']['nodes'][1]['config']['kernel']['profile'].update(id='official',credential_ref='openai',endpoint='https://api.openai.com/v1')
    saved=store.save_draft(saved['document'],expected_edit_token=saved['edit_token'])
    opened=command('open',resource_id=saved['id'],kind='agent'); packets['agent-open']=opened
    session=opened['session']['id']
    for index,message in enumerate(('first real test','second real test')):
        prepared=command('prepare',session_id=session,resource_id=saved['id'],expected_edit_token=saved['edit_token'],inputs={'message':message},request_id='agent-request-'+str(index))
        packets['agent-prepare-'+str(index)]=prepared
        options={'skeleton_credentials':{'openai':{'provider':'openai','endpoint':'https://api.openai.com/v1','api_key':'SENTINEL_TEST'}},
            'skeleton_credential_scope':prepared['requirements']['scope'],'openaiApiKey':'SENTINEL_TEST','openai_api_key':'SENTINEL_TEST',
            'disable_workspace_root':True,'toolkits':[]}
        packets['agent-turn-'+str(index)]=command('execute',session_id=session,resource_id=saved['id'],run_id=prepared['run_id'],options=options)
        assert packets['agent-turn-'+str(index)]['runs'][-1]['status']=='completed'
    assert len(calls)==2
    pure=workflow();pure['id']='pure-test'
    saved=store.save_draft(pure)
    opened=command('open',resource_id=saved['id'],kind='workflow'); packets['workflow-open']=opened
    session=opened['session']['id']
    prepared=command('prepare',session_id=session,resource_id=saved['id'],expected_edit_token=saved['edit_token'],inputs={'city':'Vancouver'},request_id='workflow-request')
    packets['workflow-prepare']=prepared
    packets['workflow-completed']=command('execute',session_id=session,resource_id=saved['id'],run_id=prepared['run_id'],options={'skeleton_credentials':{},'disable_workspace_root':True,'toolkits':[]})
    assert packets['workflow-completed']['runs'][-1]['output']=={'args':{'city':'Vancouver','days':1}}
    options,_calls,selection,_deps=_workflow_write(production,tmp_path)
    resource=selection.resource_id
    opened=command('open',resource_id=resource,kind='workflow');session=opened['session']['id']
    for outcome in ('deny','cancel','approve'):
        prepared=command('prepare',session_id=session,resource_id=resource,expected_edit_token=selection.edit_token,inputs={'city':outcome},request_id='request-'+outcome,
            context=freeze_test_context(options))
        # Only the closed Main-owned context is admitted by the HTTP route.
        host_options={key:value for key,value in options.items() if key in ('skeleton_credentials','workspace_root','toolkits')}
        waiting=command('execute',session_id=session,resource_id=resource,run_id=prepared['run_id'],options=host_options)
        packets['workflow-waiting-'+outcome]=waiting
        pending=waiting['runs'][-1]['pending'];assert pending is not None,(outcome,waiting['runs'][-1]['status'],waiting['runs'][-1]['error'])
        packets['workflow-'+outcome]=command('cancel',session_id=session,resource_id=resource,run_id=prepared['run_id']) if outcome=='cancel' else command('respond',
            session_id=session,resource_id=resource,run_id=prepared['run_id'],interaction_id=pending['interaction_id'],approved=outcome=='approve',answer=None,options={'skeleton_credentials':{}})
    assert packets['workflow-approve']['runs'][-1]['status']=='completed'
    assert packets['workflow-cancel']['runs'][-1]['status']=='cancelled'
    assert (tmp_path/'workflow-once.txt').read_text()=='approved workflow'
    assert len(calls)==2
    assert 'SENTINEL_TEST' not in json.dumps(packets)
    imported=[]
    installed=Path(os.environ['UNCHAIN_SOURCE_PATH']).resolve()
    configured_wheel=os.environ.get('UNCHAIN_ARTIFACT_PATH')
    if configured_wheel:
        wheel=Path(configured_wheel).resolve(strict=True)
    else:
        # CI installs into site-packages; the local isolated capture uses an
        # adjacent installed/ and wheel/. Neither layout is a runtime contract.
        candidates=[Path(__file__).resolve().parents[3]/'.release-qa'/'unchain-artifact'/'unchain-0.2.0-py3-none-any.whl',
                    installed.parent/'wheel'/'unchain-0.2.0-py3-none-any.whl']
        available=[candidate for candidate in candidates if candidate.is_file()]
        assert len(available)==1, 'Set UNCHAIN_ARTIFACT_PATH to the exact installed wheel'
        wheel=available[0]
    with zipfile.ZipFile(wheel) as archive:
        for name,module in sorted(sys.modules.items()):
            if not name.startswith('unchain.') or not getattr(module,'__file__',None):continue
            path=Path(module.__file__).resolve()
            if path.suffix!='.py':continue
            relative=path.relative_to(installed).as_posix()
            assert path.read_bytes()==archive.read(relative)
            imported.append({'module':name,'member':relative,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    assert len(imported)>250
    capture=os.environ.get('BUILDER_TEST_CAPTURE')
    if capture:
        Path(capture).write_text(json.dumps({'schema':'pupu.builder-test-producer.v1','packets':packets,
            'runtime_manifest':require_skeleton_runtime(),'wheel_sha256':hashlib.sha256(wheel.read_bytes()).hexdigest(),
            'imported_modules':imported},ensure_ascii=False,indent=2)+'\n')
