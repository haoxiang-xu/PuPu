"""Install/store/cold-rebind contracts against real PuPu producer, strict consumer."""
import hashlib,json,sys,tempfile
from pathlib import Path
from unittest import mock
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'unchain_runtime/server'))
import mcp_managed_runtime as managed
from mcp_zotero_profile import COMMAND,profile_args,source_digest
from mcp_toolkits import install_mcp_toolkit,build_mcp_runtime_toolkit,delete_mcp_toolkit,list_installed_mcp_toolkits
NAMES={'zotero_search_items','zotero_get_item_metadata'}
class StrictToolkit:
    calls=[]
    def __init__(self,**kwargs):
        self.kwargs=kwargs;self.tools={};self.calls.append(kwargs)
        assert kwargs['command'].endswith('/uv')
        assert kwargs['args']==['tool','run',*profile_args()]
        assert not kwargs.get('env',{}).get('ZOTERO_API_KEY')
    def connect(self):
        self.tools={n:type('Tool',(),{'name':n,'description':'Synthetic strict host contract','parameters':[],'requires_confirmation':False})() for n in NAMES};return self
    def disconnect(self):pass
with tempfile.TemporaryDirectory(prefix='pupu-zotero-host-') as folder:
    location=['/Applications/PuPu-v1.app/Resources']
    def bundled(*args):
        return {'command':location[0]+'/uv','args_prefix':['tool','run'],'managed_env':{'UV_PYTHON':location[0]+'/python'},'ephemeral_env':{},'managed_runtime':{'source':'bundled','source_command':'uvx','kind':'uv','version':'0.11.21','target':'darwin-arm64'}}
    with mock.patch.object(managed,'_bundled_runtime_root',return_value=Path('/bundle')),mock.patch.object(managed,'_resolve_bundled_runtime',side_effect=bundled):
        result=install_mcp_toolkit('workspace.zotero-readonly',data_dir=folder,toolkit_factory=StrictToolkit)
        assert {t['name'] for t in result['toolkit']['tools']}==NAMES
        store=json.loads((Path(folder)/'mcp_toolkits.json').read_text())
        record=store['toolkits'][0]
        assert record['command']==COMMAND and record['args']==[]
        assert '/Applications/' not in json.dumps(record)
        location[0]='/Applications/PuPu-v2.app/Resources'
        toolkit=build_mcp_runtime_toolkit('mcp.workspace.zotero-readonly',data_dir=folder,toolkit_factory=StrictToolkit)
        assert '/PuPu-v2.app/' in toolkit.kwargs['command']
        assert toolkit.kwargs['args']==StrictToolkit.calls[0]['args']
        delete_mcp_toolkit('mcp.workspace.zotero-readonly',data_dir=folder)
        assert list_installed_mcp_toolkits(data_dir=folder)==[]
    summary={'verdict':'PASS','adapterSha256':source_digest(),'installDiscovery':'strict consumer of actual producer args','persistentCommand':record['command'],'persistentArgs':record['args'],'coldRebindAfterRelocation':'PASS','uninstall':'PASS','network':'not performed; see independent actual stdio evidence'}
    (Path(__file__).parent/'host-results.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps(summary))
