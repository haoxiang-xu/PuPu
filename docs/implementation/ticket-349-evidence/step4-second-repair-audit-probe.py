import runpy,json,sys
from dataclasses import replace
from collections import Counter
f=runpy.run_path('/Users/red/Desktop/GITRepo/unchain-349/tests/context_v2/test_context_compile_coordinator.py')
base=f['_request'](pressured=True)
repo=f['RecordingCheckpointRepository']()
f['_coordinator'](request=base,checkpoints=repo).compile(base)
counts=Counter()
def profile(frame,event,arg):
    if event=='call' and frame.f_code.co_name in ('_canonical_journal_message_projection','_validated_projection_events','_neutral_context'):
        counts[frame.f_code.co_name]+=1
sys.setprofile(profile)
for i in range(3):
    f['_coordinator'](request=base,checkpoints=repo).compile(base)
sys.setprofile(None)
print('3 warm compiles:',dict(counts),'checkpoint reads:',len(repo.read_calls),'checkpoint payload bytes:',len(next(iter(repo.contents.values()))))
for count in (5,10,20):
    events=[]
    def add(kind,**payload):
        seq=len(events)+1
        events.append(dict(type=kind,event_id=f'e-{seq}',store_seq=seq,attempt_id='attempt-history',execution_id='execution-1',generation_id='generation-1',run_id='attempt-history',**payload))
    add('message.user',message={'role':'user','content':'old task'})
    for i in range(count):
        add('tool_call',call_id=f'call-{i}',tool_name='lookup',arguments={})
        add('tool_result',call_id=f'call-{i}',tool_name='lookup',result={'preview':'z'*1200},full_output_ref={'kind':'artifact','id':f'artifact-{i}','revision':1},result_bytes=1200,result_sha256='a'*64)
    add('message.assistant',message={'role':'assistant','content':'old answer'})
    add('message.user',message={'role':'user','content':'current'})
    events[-1].update(attempt_id='attempt-1',run_id='attempt-1')
    source=[e for e in events if e['type'].startswith('message.')]
    req=replace(base,source_messages=tuple(e['message'] for e in source),semantic_events=tuple(events),source_event_ids=tuple(e['event_id'] for e in source),source_event_store_seqs=tuple(e['store_seq'] for e in source))
    checkpoints=f['RecordingCheckpointRepository']()
    try:
        result=f['_coordinator'](request=req,checkpoints=checkpoints).compile(req)
        print('old completed tool pairs',count,': OK',len(result.envelope.checkpoint_refs))
    except Exception as err:
        print('old completed tool pairs',count,':',type(err).__name__,str(err),'checkpoint writes',len(checkpoints.calls))
# A committed base exists, then a completed old tool turn grows beyond its budget.
events=[]
for i,message in enumerate(base.source_messages[:2],start=1):
    events.append(dict(type='message.'+message['role'],event_id=f'event-{i}',store_seq=i,attempt_id='attempt-history',execution_id='execution-1',generation_id='generation-1',run_id='attempt-history',message=dict(message)))
add('message.user',message={'role':'user','content':'next old task'})
for i in range(20):
    add('tool_call',call_id=f'call-{i}',tool_name='lookup',arguments={})
    add('tool_result',call_id=f'call-{i}',tool_name='lookup',result={'preview':'z'*1200},full_output_ref={'kind':'artifact','id':f'artifact-{i}','revision':1},result_bytes=1200,result_sha256='a'*64)
add('message.assistant',message={'role':'assistant','content':'finished old task'})
add('message.user',message={'role':'user','content':'current'})
events[-1].update(attempt_id='attempt-1',run_id='attempt-1')
source=[e for e in events if e['type'].startswith('message.')]
req=replace(base,source_messages=tuple(e['message'] for e in source),semantic_events=tuple(events),source_event_ids=tuple(e['event_id'] for e in source),source_event_store_seqs=tuple(e['store_seq'] for e in source))
try:
    f['_coordinator'](request=req,checkpoints=repo).compile(req)
    print('existing base + completed tool suffix: OK')
except Exception as err:
    print('existing base + completed tool suffix:',type(err).__name__,str(err),'checkpoint count:',len(repo.calls))
