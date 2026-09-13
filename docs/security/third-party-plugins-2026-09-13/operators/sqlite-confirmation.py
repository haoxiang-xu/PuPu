import pathlib,json,subprocess,hashlib
s=json.load(open('/tmp/pupu-third-party-state.json'));w=pathlib.Path(s['work']);out=pathlib.Path(s['out']);env=json.loads((w/'environment.json').read_text());profile=(w/'sandbox.sb').read_text().replace('(subpath "/Users/red/.nvm/versions/node/v24.18.0")','(subpath "/Users/red/.nvm/versions/node/v24.18.0") (subpath "/Users/red/Desktop/GITRepo/unchain/.venv")');(w/'runtime-sandbox.sb').write_text(profile);(out/'runtime-sandbox.sb').write_text(profile);env.update({'PYTHONPATH':'/private/tmp/pupu-official-verify-mj1zxup1/unchain/src','VERIFY_WORK':str(w),'VERIFY_OUT':str(out)})
code='''import json,os,pathlib
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
ws=w/'sandbox/real-runtime-sqlite';ws.mkdir(exist_ok=True);env={k:v for k,v in os.environ.items() if k in ['PATH','HOME','TMPDIR']};tk=MCPToolkit(command=str(w/'runtimes/mcp.workspace.sqlite/venv/bin/mcp-server-sqlite'),args=['--db-path',str(ws/'synthetic.sqlite')],env=env,cwd=str(ws));seen=[]
def deny(x):seen.append('requested');return {'approved':False}
try:
 tk.connect();r=execute_confirmable_tool_call(toolkit=tk,tool_call=ToolCall(call_id='synthetic-create-table',name='create_table',arguments={'query':'CREATE TABLE approval_boundary_probe(id INTEGER)'}),on_tool_confirm=deny,loop=None,callback=None,run_id='synthetic',iteration=0)
 import sqlite3
 with sqlite3.connect(ws/'synthetic.sqlite') as db:created=bool(db.execute("SELECT name FROM sqlite_master WHERE name='approval_boundary_probe'").fetchone())
 effect={'tool':'create_table','catalogRequiresConfirmation':True,'convertedRequiresConfirmation':tk.tools['create_table'].requires_confirmation,'confirmationRequests':len(seen),'denied':r.denied,'tableCreated':created,'result':r.tool_result}
finally:tk.disconnect()
print(json.dumps({'sourceCommit':'8cd775905758833aa6e7bdcf75d6e4d12c7d9ad1','scope':'Real Unchain conversion and dispatcher; real SQLite MCP; no packaged PuPu or model','conversion':records,'effect':effect},indent=2))
'''
(w/'sqlite-runtime-check.py').write_text(code);(out/'sqlite-runtime-check.py').write_text(code);r=subprocess.run(['/usr/bin/sandbox-exec','-f',str(w/'runtime-sandbox.sb'),'/Users/red/Desktop/GITRepo/unchain/.venv/bin/python',str(w/'sqlite-runtime-check.py')],env=env,cwd=w/'sandbox',capture_output=True,text=True,timeout=45);(out/'sqlite-confirmation-check.json').write_text(r.stdout or '{}');(out/'sqlite-confirmation-check.log').write_text(r.stderr);print('exit',r.returncode,r.stderr[-1500:]);print(r.stdout[-1400:])
