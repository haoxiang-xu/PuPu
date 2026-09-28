from pathlib import Path
import json,os,sys
from unittest import mock
root=Path.cwd(); base=root/'.local/ticket-349-background-checkpoint-r6'
identity=json.loads((base/'identity.json').read_text()); wheel=Path(identity['wheel_path'])
os.environ['UNCHAIN_SOURCE_PATH']=str(wheel)
sys.path[:0]=list(map(str,[base/'server',base/'server/tests',wheel,root/'.local/ticket-349-cache-checkpoint/extra312']))
import unchain_adapter as adapter
from memory_v2_unchain_agent_selection import select_pupu_memory_agent_invoker
from memory_v2_unchain_agent_factory import build_pupu_official_memory_agent_factory
from memory_v2_unchain_model_invoker import PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT
from test_memory_v2_unchain_agent_factory import _toolkit,_Codec,_RawAgent
options={'reasoningEffort':'low','custom_provider':{'id':'auditgateway','protocol':'openai-responses',
    'base_url':'https://gateway.invalid/v1','auth':{'mode':'none'},'models':[{'id':'gpt-test'}]}}
kwargs=dict(provider='openai',model_id='gpt-test',system_prompt=PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT,
            toolkit=_toolkit(),display_name='Memory Agent')
with mock.patch.object(adapter,'_UnchainAgent',_RawAgent):
    baseline=build_pupu_official_memory_agent_factory(options)(**kwargs)
    selection=select_pupu_memory_agent_invoker(options=options,chat_provider='openai',
        chat_model_id='gpt-test',provider_default_resolver=lambda provider:None)
    invoker=selection.require_invoker_factory()(_Codec())
    current=invoker._agent_factory(**kwargs)
assert baseline._payload=={'reasoning':{'effort':'low'}}
assert current._payload=={}
assert 'model_io_factory' in _RawAgent.constructor_calls[-1]
result={'requested_effort':'low','payload_with_original_options':baseline._payload,
        'payload_after_current_selection':current._payload,'custom_transport_preserved':True,
        'outbound_requests':0,'candidate_digest':identity['pupu_server_snapshot_sha256']}
print(json.dumps(result,indent=2))
