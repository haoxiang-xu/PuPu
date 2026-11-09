import hashlib, importlib, json, os, sys
from pathlib import Path
root=Path(os.environ['QA_OUT'])
candidate=Path(os.environ['QA_CANDIDATE_ROOT'])
sys.path[:0]=[str(candidate/'unchain_runtime/server'),str(candidate/'unchain_runtime/server/tests')]
os.environ['UNCHAIN_DATA_DIR']=str(root/'test-data')
os.environ['UNCHAIN_SOURCE_PATH']=str(Path(importlib.import_module('unchain').__file__).parent.parent)
manifest=importlib.import_module('unchain.runtime.runtime_protocol').runtime_protocol_manifest()
assert manifest['manifest_digest']==os.environ['QA_MANIFEST']
import pytest
status=pytest.main(['-q','-o','addopts=','-p','no:cacheprovider',str(candidate/'unchain_runtime/server/tests/test_ticket_448_current_turn_projection.py'),'--basetemp='+str(root/'pytest'), '--junitxml='+str(root/'installed-448-junit.xml')])
imports=[]
for name,module in sorted(sys.modules.items()):
    filename=getattr(module,'__file__',None)
    if (name=='unchain' or name.startswith('unchain.')) and filename and filename.endswith('.py'):
        p=Path(filename).resolve();imports.append({'module':name,'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(root/'installed-448-receipt.json').write_text(json.dumps({'exit':status,'manifest':manifest,'imports':imports},indent=2)+'\n')
raise SystemExit(status)
