from pathlib import Path
import json,sys,tempfile,sqlite3
root=Path.cwd(); base=root/'.local/ticket-349-background-checkpoint-r7'
identity=json.loads((base/'identity.json').read_text()); wheel=Path(identity['wheel_path'])
sys.path[:0]=list(map(str,[base/'server',base/'server/tests',wheel,root/'.local/ticket-349-cache-checkpoint/extra312']))
import os
os.environ['UNCHAIN_SOURCE_PATH']=str(wheel)
import unchain
import unchain_adapter as adapter
import memory_v2_background_worker as bg
from memory_v2_unchain_agent_selection import select_pupu_memory_agent_invoker
from memory_v2_unchain_model_invoker import PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT
from test_memory_v2_unchain_agent_factory import _Codec,_toolkit
from unchain.runtime.runtime_protocol import runtime_protocol_manifest
assert str(unchain.__file__).startswith(str(wheel)+'/')
options={'reasoningEffort':'low','custom_provider':{'id':'auditgateway','protocol':'openai-responses','base_url':'https://gateway.invalid/v1','auth':{'mode':'none'},'models':[{'id':'test-model'}]}}
with tempfile.TemporaryDirectory() as directory:
 path=Path(directory)/'context_v2.sqlite3';sqlite3.connect(path).close()
 registry=bg.MemoryBackgroundRegistry(path)
 selection=select_pupu_memory_agent_invoker(options=options,chat_provider='openai',chat_model_id='test-model',provider_default_resolver=lambda provider:None)
 config,retained=bg.configuration_from_factory(selection.require_invoker_factory())
 registry.register('audit-chat','unchain',config,retained)
 row=registry.page()[0]
 factory=bg.resolve_invoker_factory(config,registry.options(row))
 invoker=factory(_Codec())
 agent=invoker._agent_factory(provider='openai',model_id='test-model',system_prompt=PUPU_MEMORY_AGENT_P0_SYSTEM_PROMPT,toolkit=_toolkit(),display_name='Memory Agent')
 assert agent._payload=={'reasoning':{'effort':'low'}}
 result={'payload':agent._payload,'raw_agent_class':adapter._UnchainAgent.__module__+'.'+adapter._UnchainAgent.__name__,'constructor_mocked':False,'model_run':False,'outbound_requests':0,'candidate_digest':identity['pupu_server_snapshot_sha256'],'runtime_manifest_digest':runtime_protocol_manifest()['manifest_digest']}
 print(json.dumps(result,indent=2))
 (root/'.local/ticket-349-step2-audit-r7/real-factory.json').write_text(json.dumps(result,indent=2)+'\n')
