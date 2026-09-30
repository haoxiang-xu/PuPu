import glob, hashlib, importlib.metadata, json, pathlib, sys
import unchain
from unchain.runtime.runtime_protocol import runtime_protocol_manifest
wheel=pathlib.Path('/tmp/pupu-292-wheel-final/unchain-0.2.0-py3-none-any.whl')
evidence=json.loads(wheel.with_name('unchain-artifact.json').read_text())
direct=json.loads(importlib.metadata.distribution('unchain').read_text('direct_url.json'))
manifest=runtime_protocol_manifest()
assert 'site-packages/unchain/' in unchain.__file__
assert 'sha256:'+hashlib.sha256(wheel.read_bytes()).hexdigest()==evidence['artifact']['sha256']
assert manifest==evidence['runtime_manifest']
assert direct['archive_info']['hashes']['sha256']==evidence['artifact']['sha256'].split(':')[1]
print(json.dumps({'module':unchain.__file__,'wheel':evidence['artifact']['sha256'],'manifest':manifest['manifest_digest'],'sdk':importlib.metadata.version('anthropic'),'httpx':importlib.metadata.version('httpx'),'source_revision':evidence['source']['revision']}),flush=True)
import pytest
if sys.argv[1]=='host':
    paths=glob.glob('unchain_runtime/server/tests/test_custom_provider*.py')+['unchain_runtime/server/tests/test_kimi_replay_wire_contract.py','unchain_runtime/server/tests/test_shipped_provider_wire_contract.py']
else:
    root='/Users/red/Desktop/GITRepo/unchain-292'
    sys.path.insert(0,root)
    paths=[root+'/tests/'+x for x in ['test_kimi_replay.py','test_provider_replay.py','test_model_turn_runtime.py','test_exact_provider_route_transport.py','context_v2/test_context_provider_turn_approval_cross_provider.py','context_v2/test_context_provider_turn_cross_provider.py','test_hyperspace_model_io.py']]
raise SystemExit(pytest.main(['-q',*paths]))
