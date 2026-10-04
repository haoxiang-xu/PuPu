"""Safe #383 producer fixture: real installed Unchain wheel, deterministic fake model I/O."""
from __future__ import annotations
import copy
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import socket
import unchain
from unchain.events import RuntimeEventBridge
from unchain.kernel import KernelLoop, ModelTurnResult, ToolCall
from unchain.tools import Toolkit, Tool
from unchain.tools.execution import ToolExecutionHarness
from unchain.runtime.runtime_protocol import runtime_protocol_manifest

ROOT = Path(__file__).resolve().parent
NETWORK_ATTEMPTS = []
def deny_network(*args, **kwargs):
    NETWORK_ATTEMPTS.append({'args': repr(args), 'kwargs': repr(kwargs)})
    raise AssertionError('Producer fixture attempted network access')
socket.create_connection = deny_network
socket.socket.connect = deny_network

class FakeModelIO:
    provider = 'openai'
    model = 'gpt-test'
    def __init__(self, case, sequential):
        self.case, self.sequential = case, sequential
        self.main_turns = 0
        self.requests = []
    def fetch_turn(self, request):
        self.requests.append({'run_id': request.run_id, 'iteration': request.iteration,
            'emit_stream': request.emit_stream, 'messages': copy.deepcopy(request.messages),
            'payload': copy.deepcopy(request.payload)})
        if request.run_id == 'observe':
            text = 'Fixture output reviewed safely'
            return ModelTurnResult(assistant_messages=[{'role':'assistant','content':text}],
                tool_calls=[], final_text=text, response_id=f'{self.case}-observation-{len(self.requests)}')
        self.main_turns += 1
        if self.main_turns == 1 or self.sequential and self.main_turns == 2:
            indices = [self.main_turns] if self.sequential else [1, 2]
            calls = [ToolCall(call_id=f'{self.case}-call-{i}', name='read_file',
                arguments={'path':f'fixture-{i}.txt'}) for i in indices]
            messages = [{'type':'function_call', 'name':c.name, 'call_id':c.call_id,
                'arguments':json.dumps(c.arguments)} for c in calls]
            return ModelTurnResult(assistant_messages=messages, tool_calls=calls,
                response_id=f'{self.case}-main-{self.main_turns}')
        return ModelTurnResult(assistant_messages=[{'role':'assistant','content':'Fixture complete'}],
            tool_calls=[], final_text='Fixture complete', response_id=f'{self.case}-main-{self.main_turns}')

def produce(case, observe=False, content=False, sequential=False):
    io = FakeModelIO(case, sequential)
    executed = []
    def read_file(path: str):
        # Pure in-memory tool. Never opens the apparent path or performs side effects.
        executed.append(path)
        return {'content': f'fixture contents for {path}'} if content else {}
    toolkit = Toolkit({'read_file': Tool(name='read_file', description='Safe in-memory fixture',
        func=read_file, observe=observe)})
    raw = []
    loop = KernelLoop(model_io=io, harnesses=[ToolExecutionHarness()])
    run_id, session_id = f'{case}-run', f'{case}-session'
    result = loop.run([{'role':'user','content':'Run both safe fixture calls'}],
        callback=lambda e: raw.append(copy.deepcopy(e)), toolkit=toolkit,
        run_id=run_id, session_id=session_id, provider=io.provider, model=io.model)
    count = 0
    def next_id():
        nonlocal count
        count += 1
        return f'{case}-event-{count:03d}'
    bridge = RuntimeEventBridge(session_id=session_id, root_run_id=run_id,
        root_agent_id='developer', id_factory=next_id,
        clock=lambda: datetime(2026, 10, 2, 3, 15, tzinfo=timezone.utc))
    canonical = [e.to_dict() for r in raw for e in bridge.normalize(r)]
    assert result.status == 'completed'
    assert executed == ['fixture-1.txt','fixture-2.txt'], executed
    starts = [e for e in canonical if e['type']=='step.started' and e['payload'].get('step_type')=='tool']
    completed = [e for e in canonical if e['type']=='step.completed' and e['payload'].get('step_type')=='tool']
    assert len(starts) == len(completed) == 2
    assert {e['links']['tool_call_id'] for e in starts} == {f'{case}-call-1',f'{case}-call-2'}
    assert all(e['payload']['status']=='success' for e in completed), completed
    output = {'case':case, 'fixture_kind':'EXECUTED_REAL_WHEEL_FAKE_MODEL',
        'tool_is_pure_in_memory':True, 'network_attempts':NETWORK_ATTEMPTS,
        'inputs':{'observe':observe,'content':content,'sequential':sequential},
        'executed_paths':executed, 'kernel_result':asdict(result), 'model_requests':io.requests,
        'raw_events':raw, 'canonical_events':canonical, 'bridge_diagnostics':bridge.diagnostics()}
    (ROOT/f'{case}.json').write_text(json.dumps(output,indent=2,ensure_ascii=False)+'\n')
    (ROOT/f'{case}.raw-events.json').write_text(json.dumps(raw,indent=2,ensure_ascii=False)+'\n')
    (ROOT/f'{case}.runtime-events.json').write_text(json.dumps(canonical,indent=2,ensure_ascii=False)+'\n')
    return {'case':case,'raw_event_types':[r['type'] for r in raw],
        'canonical_event_types':[e['type'] for e in canonical],
        'dropped_event_types':[e['type'] for e in bridge.diagnostics()['dropped_events']],
        'calls': [{k:e['payload'].get(k) for k in ['tool_name','tool_display_name','toolkit_id','call_id']} for e in starts],
        'tool_results':[e['payload'] for e in completed]}

summaries = [produce('silent-batch'), produce('content-batch',content=True),
    produce('observed-batch',observe=True,content=True),
    produce('observed-sequential',observe=True,content=True,sequential=True)]
assert NETWORK_ATTEMPTS == []
identity = {'source_revision':'1ec49ddfc28d3b42ba035debada5e3db759dad1b',
    'module_origin':unchain.__file__, 'distribution_version':importlib.metadata.version('unchain'),
    'direct_url':json.loads(importlib.metadata.distribution('unchain').read_text('direct_url.json')),
    'runtime_manifest':runtime_protocol_manifest(), 'network_attempts':NETWORK_ATTEMPTS,
    'case_summaries':summaries}
(ROOT/'producer-evidence.json').write_text(json.dumps(identity,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'origin':identity['module_origin'],'manifest_digest':identity['runtime_manifest']['manifest_digest'],
    'cases':summaries},indent=2))
