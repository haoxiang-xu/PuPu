import json,os,pathlib
from mcp.types import Tool as MCPTool
from unchain.toolkits.mcp import MCPToolkit
from unchain.tools.confirmation import execute_confirmable_tool_call
from unchain.kernel.types import ToolCall
w=pathlib.Path(os.environ['VERIFY_WORK']);out=pathlib.Path(os.environ['VERIFY_OUT']);records=[]
for f in (w/'probe-inputs').glob('*-mcp-probe.json'):
 j=json.loads(f.read_text());meta=[];tk=MCPToolkit(command='/bin/false')
 for raw in j.get('tools',[]):
  t=tk._convert_mcp_tool(MCPTool.model_validate(raw));meta.append({'name':t.name,'requiresConfirmation':t.requires_confirmation,'annotations':raw.get('annotations')})
 records.append({'id':j['toolkitId'],'convertedTools':meta})
ws=w/'sandbox/real-runtime-fs';ws.mkdir(exist_ok=True);env={k:v for k,v in os.environ.items() if k in ['PATH','HOME','TMPDIR']};tk=MCPToolkit(command='/Users/red/.nvm/versions/node/v24.18.0/bin/node',args=[str(w/'runtimes/mcp.workspace.filesystem/node_modules/@modelcontextprotocol/server-filesystem/dist/index.js'),str(ws)],env=env,cwd=str(ws));seen=[]
def deny(x):seen.append('requested');return {'approved':False}
try:
 tk.connect();target=ws/'new-directory-2';r=execute_confirmable_tool_call(toolkit=tk,tool_call=ToolCall(call_id='synthetic-mkdir',name='create_directory',arguments={'path':str(target)}),on_tool_confirm=deny,loop=None,callback=None,run_id='synthetic',iteration=0);effect={'tool':'create_directory','confirmationRequests':len(seen),'denied':r.denied,'directoryCreated':target.is_dir(),'result':r.tool_result}
finally:tk.disconnect()
print(json.dumps({'sourceCommit':'8cd775905758833aa6e7bdcf75d6e4d12c7d9ad1','scope':'Real Unchain conversion and dispatcher; real filesystem MCP; no packaged PuPu or model','conversion':records,'effect':effect},indent=2))
