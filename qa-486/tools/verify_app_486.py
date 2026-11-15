"""Independent physical Journal/CAS verifier. No Builder-test projection helper.

Reads a checkpointed private copy after all product processes have exited, then
rebuilds each retained root plan from its launch artifact and compares actual
committed state/output/inputs against the page's final public observations.
"""
from collections import Counter
from hashlib import sha256
import json,os,shutil,sqlite3,sys,zipfile
from pathlib import Path
from skeleton_production_state import canonical,validate_launch_descriptor
from skeleton_runtime_capability import validate_skeleton_runtime_manifest
from unchain.journal import ArtifactRef,AttemptRef
from unchain.journal.models import _thaw_json
from unchain.persistence.sqlite_v2 import open_existing_execution_journal_readonly
from unchain.skeleton.agent_preparation import execution_definition_digest
from unchain.skeleton.durable_store import WorkflowExecutionStore
from unchain.journal.provider_wire import provider_wire_snapshot_event_fields
from unchain.providers.wire_envelope import ProviderWireEnvelope
out=Path(os.environ['QA_OUT'])
def read(name):return json.loads((out/name).read_text())
def require(ok,reason):
    if not ok:raise AssertionError(reason)
def sidecar_processes(g):
    rows=[p for p in g['processes_at_ready'] if Path(p['exe']).name=='unchain-server']
    require(bool(rows),'sidecar_identity')
    by_pid={p['pid']:p for p in rows}
    require(len(by_pid)==len(rows),'sidecar_duplicate_pid')
    roots=[p for p in rows if p['parent'] not in by_pid]
    # PyInstaller --onefile has a bootloader and a runtime child. They must
    # form one owned tree rooted directly in this Electron Main, not two hosts.
    require(len(roots)==1 and roots[0]['parent']==g['main']['pid'],'sidecar_root_identity')
    root=roots[0]['pid']
    for row in rows:
        seen=set();current=row
        while current['pid']!=root:
            require(current['pid'] not in seen and current['parent'] in by_pid,'sidecar_process_chain')
            seen.add(current['pid']);current=by_pid[current['parent']]
    return rows
def runtime_import_check(g,number):
    lines=[]
    console=out/'runtime-import-console.json'
    if console.exists():lines.extend(row['text'] for row in json.loads(console.read_text()) if row['generation']==number)
    log=out/f'app-{number}.log'
    if log.exists():lines.extend(log.read_text(errors='replace').splitlines())
    records=[]
    for line in lines:
        if 'PUPU_RUNTIME_IMPORT ' not in line:continue
        text=line.split('PUPU_RUNTIME_IMPORT ',1)[1].lstrip()
        record,_=json.JSONDecoder().raw_decode(text)
        require(set(record)=={'schema','pid','executable','frozen','bundle_root','modules','manifest_digest'},'runtime_observation_shape')
        require(record['schema']=='pupu.runtime-import-observation.v1' and record['frozen'] is True,'runtime_not_frozen')
        group=sidecar_processes(g)
        require(record['pid'] in {p['pid'] for p in group},'runtime_consumer_pid')
        require(record['executable'] in {p['exe'] for p in group},'runtime_consumer_executable')
        root=Path(record['bundle_root']);require(root.is_absolute() and root.name.startswith('_MEI'),'runtime_bundle_origin')
        require(set(record['modules'])=={'unchain','unchain.runtime.runtime_protocol'},'runtime_modules_missing')
        for name,member in [('unchain','unchain/__init__.py'),('unchain.runtime.runtime_protocol','unchain/runtime/runtime_protocol.py')]:
            module=record['modules'][name];require(set(module)=={'file','loader'},'runtime_module_shape')
            origin=Path(module['file']);require(origin.is_relative_to(root),'runtime_source_shadow')
            relative=origin.relative_to(root).with_suffix('.py').as_posix()
            require(relative==member and module['loader'].startswith('pyimod') and module['loader'].endswith('.PyiFrozenLoader'),'runtime_frozen_module_mapping')
        actual=validate_skeleton_runtime_manifest(g['runtime_capabilities']['runtime_manifest'])
        require(record['manifest_digest']==actual['manifest_digest']==os.environ['QA_MANIFEST'],'runtime_consumer_manifest')
        records.append(record)
    require(bool(records),'runtime_consumer_evidence_missing')
    require(len({(r['pid'],r['bundle_root'],r['manifest_digest']) for r in records})==1,'runtime_consumer_identity_changed')
    return records[0]
def workspace_check(root,effects):
    expected={'a-first.txt','b-first.txt','b-second.txt','hook.txt'}
    require({p.name for p in root.iterdir()}==expected,'workspace_extra_or_missing')
    for p in root.iterdir():
        require(p.is_file() and not p.is_symlink(),'workspace_not_regular')
        require(p.read_bytes()==b'qa486 approved once','workspace_bytes')
    require(Counter(row['name'] for row in effects)==Counter({key:1 for key in expected}),'effects_not_exactly_once')
def main():
    functional=read('functional-result.json');require(functional['verdict']=='APP_486_FUNCTIONAL_RECORDED','functional_incomplete')
    require(functional.get('product_findings')==[],'product_findings_unresolved')
    require(read('fixture-errors.json')==[],'fixture_error')
    wires=read('provider-wires.json');require(len(wires)==9,'provider_request_count')
    for i,row in enumerate(wires):
        body=json.loads(row['raw']);require(body['model'] in {'qa486-model','qa486-human','qa486-hook','qa486-parent','qa486-child'} and body['options']['num_ctx']==8192 and body['options']['num_predict']==128,'kernel_authority')
        require(sha256(row['raw'].encode()).hexdigest()==row['request_sha256'],'wire_digest')
        require(type(row['response_message']) is dict and row['response_message']['role']=='assistant','provider_response_missing')
    require('Offline answer 1' in wires[1]['raw'],'server_history_missing')
    require(Counter(json.loads(r['raw'])['model'] for r in wires)==Counter({'qa486-model':2,'qa486-human':2,'qa486-hook':2,'qa486-parent':2,'qa486-child':1}),'model_call_counts')
    require(read('ordinary-before.json')==read('ordinary-after.json'),'ordinary_chat_changed')
    generations=read('process-generations.json');require(len(generations)==3,'cold_generations');runtime_imports=[]
    for i,g in enumerate(generations):
        require(g['all_owned_dead'],'processes_alive')
        require(g['sidecar_owned'],'sidecar_not_owned')
        runtime_imports.append(runtime_import_check(g,i+1))
        sidecars=sidecar_processes(g)
        require(all(sha256(Path(p['exe']).read_bytes()).hexdigest()==os.environ['QA_BINARY_SHA'] for p in sidecars),'sidecar_binary_hash')
        if i:require(int(generations[i-1]['stopped_ns'])<int(g['started_ns']),'cold_order')
    require(len({g['main']['pid'] for g in generations})==3,'main_pid_reused')
    (out/'actual-runtime-consumers.json').write_text(json.dumps(runtime_imports,indent=2)+'\n')
    workspace_check(out/'workspace',read('effects.json'))
    databases=list((out/'home').rglob('context_v2.sqlite3'));require(len(databases)==1,'context_database_count')
    copied=out/'journal-verification-copy';shutil.copytree(databases[0].parent,copied)
    database=copied/'context_v2.sqlite3'
    with sqlite3.connect(database) as db:
        require(db.execute('PRAGMA integrity_check').fetchone()==('ok',),'database_corrupt');db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    latest={}
    for snap in read('snapshots.json'):
        session=snap['value']['session']['id']
        for run in snap['value']['runs']:
            latest[(session,run['id'])]=(snap['resource'],run)
    results=[];wire_receipts={}
    for (session,root),(resource,run) in latest.items():
        require(run['status'] in {'completed','cancelled','failed','outcome_unknown','ready'},'unsettled_test_run')
        if run['status']=='ready':
            require(resource=='qa486-missing' and run['graphs']==[] and run['events']==[] and run['output'] is None,'credential_refusal_effect')
            results.append({'resource':resource,'session':session,'root':root,'status':'ready','output':None});continue
        journal=open_existing_execution_journal_readonly(database_path=database,object_directory=copied/'objects',execution_id=session)
        events=journal.capture_snapshot().events
        for event in events:
            if event.event_type!='provider.wire_snapshot' or (session,event.event_id) in wire_receipts:continue
            fields=provider_wire_snapshot_event_fields(event)
            raw_envelope=journal.read_full_verified(artifact=fields.artifact)
            envelope=ProviderWireEnvelope.from_dict(json.loads(raw_envelope))
            require(envelope.canonical_bytes()==raw_envelope,'wire_envelope_canonical')
            require(envelope.attempt==event.attempt,'wire_attempt_binding')
            require(envelope.envelope_sha256==fields.envelope_sha256,'wire_envelope_digest')
            require(len(envelope.routes)==1,'unexpected_wire_routes')
            route=envelope.to_dict()['routes'][0]
            wire_receipts[(session,event.event_id)]={'execution':session,'attempt':event.attempt.attempt_id,'request':route['request'],'request_sha256':route['request_sha256'],'event_id':event.event_id}
        launches=[e for e in events if e.event_type=='pupu.skeleton.launch' and e.attempt.attempt_id==root];require(len(launches)==1,'launch_not_unique')
        launch=launches[0];payload=_thaw_json(launch.payload);raw=journal.read_full_verified(artifact=ArtifactRef.from_dict(payload['launch_ref']));require(sha256(raw).hexdigest()==payload['launch_sha256'],'launch_digest')
        descriptor=json.loads(raw);require(canonical(descriptor)==raw,'launch_noncanonical')
        require(descriptor['runtime_manifest']['manifest_digest']==os.environ['QA_MANIFEST'],'manifest_identity')
        selection,deps,plan=validate_launch_descriptor(descriptor,session_id=session,root_run_id=root,expected_owner_chat_id=session)
        require(selection.resource_id==resource and selection.edit_token==run['edit_token'],'resource_or_token')
        require(execution_definition_digest(plan)==run['definition_digest'],'definition_digest')
        store=WorkflowExecutionStore(journal,plan,graph_id=descriptor['graph_id'],attempt=AttemptRef(launch.attempt.generation,root));state=store.load().state
        require(state['status']==run['status'],'physical_status')
        require(descriptor['inputs']==run['inputs'] if descriptor['schema']=='pupu.skeleton-workflow-launch.v1' else descriptor['inputs']['message']==run['inputs']['message'],'normalized_inputs')
        if run['status']=='completed':
            require(state['root_committed'],'root_not_committed')
            output=store.read_json(state['completed'][-1]['output_ref']);require(output==run['output'],'physical_End_output')
        else:require(run['output'] is None,'cancelled_output')
        results.append({'resource':resource,'session':session,'root':root,'status':state['status'],'token':run['edit_token'],'output':run['output'],'events':len(events),'definition_digest':run['definition_digest'],'launch_sha256':payload['launch_sha256']})
    require(len(results)==15,'root_count')
    canonical_body=lambda value:json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)
    require(Counter(canonical_body(r['request']) for r in wire_receipts.values())==Counter(canonical_body(json.loads(w['raw'])) for w in wires),'physical_wire_request_bijection')
    (out/'wire-receipts.json').write_text(json.dumps(list(wire_receipts.values()),indent=2)+'\n')
    retain=[r for r in results if r['resource']=='qa486-retain'];require([r['output'] for r in retain]==[{'tag':'A'},{'tag':'B'},None],'A_B_snapshot_output')
    # Negative controls target an exact reason, not any thrown exception.
    controls=[]
    test=out/'negative-workspace';shutil.copytree(out/'workspace',test)
    for name,mutate,reason in [
      ('extra',lambda:(test/'unexpected').write_text('x'),'workspace_extra_or_missing'),
      ('alias',lambda:(test/'a-first.txt').rename(test/'alias'),'workspace_extra_or_missing'),
      ('bytes',lambda:(test/'b-first.txt').write_text('qa486 approved oncf'),'workspace_bytes')]:
        if test.exists():shutil.rmtree(test)
        shutil.copytree(out/'workspace',test);mutate()
        try:workspace_check(test,read('effects.json'))
        except AssertionError as e:require(str(e)==reason,'negative_wrong_reason');controls.append({'name':name,'reason':str(e)})
        else:raise AssertionError('negative_accepted')
    shutil.rmtree(test)
    imported=[]
    with zipfile.ZipFile(os.environ['QA_WHEEL']) as wheel:
        for name,module in sorted(sys.modules.items()):
            if not name.startswith('unchain.') or not getattr(module,'__file__',None):continue
            p=Path(module.__file__).resolve()
            if p.suffix!='.py':continue
            member=p.relative_to(Path(os.environ['QA_SITE']).resolve()).as_posix()
            require(p.read_bytes()==wheel.read(member),'import_module_bytes')
            imported.append({'module':name,'member':member,'sha256':sha256(p.read_bytes()).hexdigest()})
    require(len(imported)>250,'import_module_coverage')
    (out/'imported-modules.json').write_text(json.dumps(imported,indent=2)+'\n')
    (out/'verification.json').write_text(json.dumps({'verdict':'PACKAGED_486_PHYSICAL_ACCEPTED','checks':functional['checks'],'roots':results,'negative_controls':controls,'manifest':os.environ['QA_MANIFEST'],'wheel':os.environ['QA_WHEEL_SHA']},indent=2)+'\n')
if __name__=='__main__':main()
