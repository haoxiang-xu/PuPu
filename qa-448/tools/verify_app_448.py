"""QA-only independent raw-evidence verifier. Never trusts fixture verdicts."""
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import sys

ROOT=Path(os.environ['QA_OUT'])
COUNTS={}
def require(value, reason):
    if not value:raise AssertionError(reason)
    COUNTS[reason]=COUNTS.get(reason,0)+1
def read(name):return json.loads((ROOT/name).read_text())
def raw(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
def sha(value):return hashlib.sha256(value).hexdigest()
def strings(value):
    if isinstance(value,str):yield value
    elif isinstance(value,dict):
        for item in value.values():yield from strings(item)
    elif isinstance(value,list):
        for item in value:yield from strings(item)
def dictionaries(value):
    if isinstance(value,dict):
        yield value
        for item in value.values():yield from dictionaries(item)
    elif isinstance(value,list):
        for item in value:yield from dictionaries(item)
    elif isinstance(value,str) and value[:1] in '{[':
        try:yield from dictionaries(json.loads(value))
        except (ValueError,RecursionError):pass
def pattern(i):return f'QA448_PATTERN_{i}_'+'x'*(40*1024)+'_é🂡'
def locator(value):
    prefix='unchain://context/v1/'
    require(value.startswith(prefix),'locator_namespace')
    token=value[len(prefix):]
    result=json.loads(base64.urlsafe_b64decode(token+'='*(-len(token)%4)))
    require(set(result)=={'kind','id','revision','fragment'},'locator_closed_shape')
    require(result['revision']==1 and result['fragment']=='','locator_identity')
    return result
def main():
    result=read('direct-result.json')
    require(result['tree']==os.environ['QA_CANDIDATE_TREE'],'candidate_tree')
    require(result['verdict']=='APP_448_PATHS_RECORDED','driver_completed')
    require(read('errors.json')==[],'renderer_errors')
    generations=read('process-generations.json')
    require(len(generations)==2,'actual_two_process_generations')
    for row in generations:
        require(row['all_owned_dead'] and row['sidecar_owned'],'owned_process_identity_and_exit')
        require(not row.get('stray_sidecars_reaped'),'no_untracked_sidecar')
        require(any(Path(p['exe']).name=='unchain-server' for p in row['processes_at_ready']),'ready_sidecar_pid')
    require(generations[0]['main']['pid']!=generations[1]['main']['pid'],'main_pid_changed')
    pids=[{p['pid'] for p in g['processes_at_ready'] if Path(p['exe']).name=='unchain-server'} for g in generations]
    require(pids[0] and pids[1] and pids[0].isdisjoint(pids[1]),'sidecar_pid_changed')
    require(int(generations[0]['stopped_ns'])<int(generations[1]['started_ns']),'old_processes_dead_before_restart')
    hot,cold=read('hot-chat.json'),read('cold-chat.json')
    require(hot['chatId']==cold['chatId'] and hot['session']==cold['session'],'cold_chat_identity')
    require(hot['messages']==cold['messages'],'cold_message_exact')
    hot_events=[e for p in read('hot-events.json') for e in p['response']['events']]
    cold_events=[e for p in read('cold-events.json') for e in p['response']['events']]
    require(len(hot_events)>0,'hot_event_pages_nonempty')
    require(cold_events[:len(hot_events)]==hot_events,'cold_events_preserve_exact_prefix')
    iso=read('isolation-probe.json')
    require(iso['positive_nonce'] and len(iso['controls'])==4 and all(c['refused'] for c in iso['controls']),'isolation_controls')
    require(read('routes.json')==[],'private_namespace_no_route')
    require(all(not c['hits'] for c in read('blocked-service-canaries.json')),'forbidden_service_zero_connections')
    require('ISOLATION_CONTROLS_ACCEPTED' in (ROOT/'isolation-probe.log').read_text(),'isolation_process_passed')
    require(json.loads((ROOT/'sdk-qualification.json').read_text())['verdict']=='REAL_SDK_TLS_FIXTURE_ACCEPTED','real_installed_sdk_tls')
    tests=read('installed-448-receipt.json')
    require(tests['exit']==0,'installed_five_regressions')
    require(tests['manifest']['manifest_digest']==os.environ['QA_MANIFEST'],'installed_manifest')
    import zipfile
    wheel=next((ROOT.parents[1]/'wheel').glob('*.whl'))
    require(sha(wheel.read_bytes())=='c1213803c1b3bb58f4fc78a03b1a00f80e001d63be00c4afae53ab4d972b12ec','canonical_wheel')
    with zipfile.ZipFile(wheel) as archive:
        for module in tests['imports']:
            relative='unchain/'+module['path'].split('/unchain/',1)[1]
            require(sha(archive.read(relative))==module['sha256'],'actual_import_matches_wheel')
    wires=read('provider-wires.json')
    require(all(not w.get('error') for w in wires),'fixture_no_refusals')
    sdk=[w for w in wires if w.get('kind')=='sdk']
    qualification=[w for w in sdk if 'QA448_QUALIFY' in w['request_text']]
    require(len(qualification)==1,'exactly_one_sdk_positive_before_app')
    normal=[w for w in sdk if w not in qualification]
    require(len(normal)==result['normal_requests'],'normal_provider_count')
    require(all(w['authorization_is_sentinel'] and w['url']=='/v1/responses' for w in sdk),'official_fixture_route_and_credential')
    # Read physical retained DB via SQLite backup. Raw source is never modified.
    paths=list((ROOT/'journal-state').rglob('context_v2.sqlite3'))
    require(len(paths)==1,'one_physical_context_database')
    source=sqlite3.connect(paths[0].as_uri()+'?mode=ro',uri=True)
    physical=ROOT/'verified-physical.sqlite3';dest=sqlite3.connect(physical);source.backup(dest);dest.close();source.close()
    db=sqlite3.connect(physical.as_uri()+'?mode=ro&immutable=1',uri=True);db.row_factory=sqlite3.Row
    require(db.execute('pragma integrity_check').fetchone()[0]=='ok','physical_sqlite_integrity')
    objects={}
    for row in db.execute('select * from objects'):
        candidates=list(paths[0].parent.rglob(row['sha256']))
        require(len(candidates)==1,'physical_object_unique')
        data=candidates[0].read_bytes();require(len(data)==row['byte_length'] and sha(data)==row['sha256'],'physical_object_digest_and_bytes');objects[row['sha256']]=data
    from unchain.journal import JournalEvent, ResourceRef, journal_event_to_semantic_event
    from unchain.context_content import validate_context_content_page, project_context_output_for_model
    events=[]
    for row in db.execute('select * from events order by execution_id,store_seq'):
        data=bytes(row['event_json']);require(sha(data)==row['event_sha256'],'physical_event_digest')
        event=json.loads(data);require(raw(event)==data,'physical_event_canonical')
        require(JournalEvent.from_dict(event).to_dict()==event,'official_event_parser')
        require(event['event_id']==row['event_id'] and event['store_seq']==row['store_seq'] and event['event_type']==row['event_type'],'physical_event_index')
        require(event['attempt']['generation']['execution_id']==row['execution_id'],'event_execution_identity');events.append(event)
    for row in db.execute('select * from artifacts'):
        data=bytes(row['artifact_json']);require(sha(data)==row['artifact_record_sha256'],'artifact_descriptor_digest')
        descriptor=json.loads(data);require(descriptor['sha256']==row['object_sha256'] and descriptor['byte_length']==row['byte_length'],'artifact_row_object_binding')
    require(not any(e['event_type'] in {'run_failed','run_cancelled'} for e in events),'no_failed_or_cancelled_run')
    own=[e for e in events if e['attempt']['generation']['execution_id']==hot['session']]
    require(bool(own),'physical_owner_session')
    calls={e['payload']['call_id']:e for e in own if e['event_type']=='tool_call'}
    results={e['payload']['call_id']:e for e in own if e['event_type']=='tool_result'}
    grep_calls=[e for e in own if e['event_type']=='tool_call' and e['payload']['tool_name']=='grep']
    require(len(grep_calls)==8,'eight_real_grep_calls')
    for i in range(8):
        e=calls[f'qa448_grep_{i}'];args=e['payload']['arguments'];parsed=json.loads(args) if isinstance(args,str) else args;require(parsed['pattern']==pattern(i),'canonical_original_arguments_exact')
        r=results[f'qa448_grep_{i}'];require(e['store_seq']<r['store_seq'],'tool_receipt_sequence')
        require(r['payload']['tool_name']=='grep','result_tool_identity')
    wire_events=[e for e in own if e['event_type']=='provider.wire_snapshot']
    require(len(wire_events)==len(normal),'all_sdk_calls_have_physical_wire_event')
    for event,captured in zip(wire_events,normal):
        envelope=json.loads(objects[event['payload']['wire_artifact']['sha256']]);require(envelope['attempt']==event['attempt'],'wire_attempt_identity')
        routes=envelope['routes'];require(len(routes)==1,'one_provider_route_no_recovery')
        body=json.loads(captured['request_text']);require(routes[0]['request']==body,'native_wire_equals_captured_sdk_request')
        require(sha(raw(body))==routes[0]['request_sha256'],'request_digest_recomputed')
    histories=[]
    for row in normal:
        body=json.loads(row['request_text'])
        for text in strings(body['input']):
            if text.startswith('[MEMORY_V2_EVIDENCE_HISTORY]'):
                h=json.loads(text.split('\n',2)[2]);histories.append((body,text,h))
    qualifying=[entry for entry in histories if [x['call_id'] for x in entry[2]['tool_exchanges']]==[f'qa448_grep_{i}' for i in range(7)]]
    require(len(qualifying)>0,'historical_seven_exchanges_projected')
    body,marker,h=qualifying[0];original=json.loads(json.dumps(h));original_argument_bytes=0
    event_by_id={e['event_id']:e for e in own}
    for i,x in enumerate(h['tool_exchanges']):
        arg=x['arguments'];require(arg['truncated'] is True,'historical_arguments_compacted')
        args=calls[f'qa448_grep_{i}']['payload']['arguments'];original_argument_bytes+=len(raw(args));require(sha(raw(args))==arg['projected_value_sha256'] and len(raw(args))==arg['projected_value_bytes'],'projected_argument_metadata')
        ref=locator(arg['full_output_ref']);require(ref['kind']=='context_event' and ref['id']==calls[f'qa448_grep_{i}']['event_id'],'arguments_read_ref_binds_exact_event')
        original['tool_exchanges'][i]['arguments']=args
    require(original_argument_bytes>256*1024,'real_completed_arguments_alone_exceed_byte_cap')
    require(len(raw(original))>len(marker.encode()) and len(marker.encode())<256*1024,'meaningful_serialized_history_reduction')
    native=[x for x in body['input'] if x.get('type')=='function_call'];require([x['call_id'] for x in native]==['qa448_grep_7'],'latest_batch_not_projected')
    require(native[0]['arguments']==calls['qa448_grep_7']['payload']['arguments'],'latest_arguments_unchanged')
    output=[x for x in body['input'] if x.get('type')=='function_call_output' and x.get('call_id')=='qa448_grep_7'];require(len(output)==1,'latest_result_once')
    semantic=journal_event_to_semantic_event(JournalEvent.from_dict(results['qa448_grep_7']))
    expected=project_context_output_for_model(semantic['model_projection']['result'],source_ref=ResourceRef.from_dict(semantic['full_output_ref']))
    require(json.loads(output[0]['output'])==expected,'latest_native_result_unchanged')
    from unchain.context.compiler import _estimate
    estimated_before=_estimate([{'role':'user','content':raw(original).decode()}]).total_tokens
    estimated_after=_estimate([{'role':'user','content':marker}]).total_tokens
    require(estimated_after<estimated_before,'actual_history_token_estimate_reduced')
    # Official cold read pages must reproduce physical event and artifact exactly.
    state=read('fixture-state.json')
    cold_pages=state['cold_pages'];result_pages=state['result_pages']
    def combine(pages):
        require(bool(pages),'official_read_pages_exist');offset=0;chunks=[]
        for page in pages:
            require(validate_context_content_page(page)==page,'closed_official_page_contract')
            require(page['ref']==pages[0]['ref'] and page['sha256']==pages[0]['sha256'] and page['total_bytes']==pages[0]['total_bytes'],'page_source_identity_stable')
            b=page['content']['text'].encode();require(page['offset']==offset and page['page_bytes']==len(b),'contiguous_official_pages');chunks.append(b);offset+=len(b)
        data=b''.join(chunks);require(len(data)==pages[-1]['total_bytes'] and sha(data)==pages[-1]['sha256'],'official_page_full_digest');return data
    event_data=combine(cold_pages);require(event_data==raw(calls['qa448_grep_0']),'cold_official_reader_equals_physical_event')
    result_data=combine(result_pages);ref=locator(h['tool_exchanges'][0]['full_output_ref'])
    row=db.execute('select * from artifacts where execution_id=? and artifact_id=? and revision=?',(hot['session'],ref['id'],ref['revision'])).fetchone();require(row is not None,'cold_result_exact_artifact_identity');require(result_data==objects[row['object_sha256']],'cold_official_reader_equals_physical_result')
    require(json.loads(result_data)['match_count']==1,'actual_grep_result')
    for call_id,page in [('qa448_hot_read',state['hot_page'])]+[(f'qa448_cold_{i}',p) for i,p in enumerate(cold_pages+result_pages)]:
        semantic=journal_event_to_semantic_event(JournalEvent.from_dict(results[call_id]));ref=semantic['full_output_ref']
        row=db.execute('select * from artifacts where execution_id=? and artifact_id=? and revision=?',(hot['session'],ref['id'],ref['revision'])).fetchone()
        require(row is not None and json.loads(objects[row['object_sha256']])==page,'reader_page_equals_physical_tool_result')
    third_body=json.loads(normal[-1]['request_text'])
    require('QA448_FOLLOWUP_3' in json.dumps(third_body['input']),'third_input_is_normal_continuation')
    for page in [cold_pages[-1],result_pages[-1]]:
        cursor={key:page[key] for key in ['ref','offset','page_bytes','next_offset','eof','next_read']}
        require(any(all(d.get(k)==v for k,v in cursor.items()) for d in dictionaries(third_body['input'])),'latest_reader_cursor_preserved_next_input')
    replies=[e for e in own if e['event_type']=='final_message'];require(len(replies)==3,'three_normal_turn_finals')
    completed=[e for e in own if e['event_type']=='run_completed'];require(len(completed)==3,'three_normal_turn_completions')
    for final in replies:require(any(e['attempt']==final['attempt'] and e['store_seq']>final['store_seq'] for e in completed),'final_before_own_terminal')
    require(len([e for e in own if e['event_type']=='tool.started' and e['payload'].get('tool_name')=='grep'])==8,'eight_grep_executions_no_reexecution')
    proof=read('workspace-proof.json');require(proof['unchanged'] and proof['files']==['evidence.txt'],'readonly_workspace_exact')
    ledger=read('ledger.json');require(sum(r['kind']=='ui' and r['action']=='Enter' for r in ledger)==3,'three_trusted_composer_sends')
    # Entry recorder provides isTrusted; composer is not an IPC send substitute.
    for p in ROOT.glob('send-*.json'):
        value=json.loads(p.read_text());require(value['after']['value']=='','composer_send_consumed')
    report={'verdict':'APP_448_RAW_EVIDENCE_ACCEPTED','checks':COUNTS,'check_count':sum(COUNTS.values()),'events':len(events),'sdk_calls':len(normal),'physical_objects':len(objects),'original_historical_argument_bytes':original_argument_bytes,'projected_history_bytes':len(marker.encode()),'history_token_estimate_before':estimated_before,'history_token_estimate_after':estimated_after,'actual_cold_process_restart':True,'real_provider':'NOT_RUN (owner assigned to #458/#208)','renderer_sandbox':False}
    (ROOT/'raw-verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if __name__=='__main__':
    try:main()
    except Exception as error:
        print('Refused: '+str(error),file=sys.stderr);raise
