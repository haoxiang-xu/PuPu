import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
const state=JSON.parse(fs.readFileSync('/tmp/pupu-third-party-state.json'));const w=state.work,out=state.out;
const sdk='/tmp/pupu-283-mcp-brave/node_modules/@modelcontextprotocol/sdk/dist/esm';
const {Client}=await import(pathToFileURL(sdk+'/client/index.js'));const {StdioClientTransport}=await import(pathToFileURL(sdk+'/client/stdio.js'));const {StreamableHTTPClientTransport}=await import(pathToFileURL(sdk+'/client/streamableHttp.js'));
const entries=JSON.parse(fs.readFileSync(out+'/catalog-snapshot.json')).mcp.entries;
const env=JSON.parse(fs.readFileSync(w+'/environment.json'));const sha=t=>crypto.createHash('sha256').update(t).digest('hex');
function effects(d){return fs.readdirSync(d,{recursive:true}).filter(p=>fs.statSync(path.join(d,p)).isFile()).map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(d,p)))}))}
async function probe(e){
 const id=e.toolkitId;let j=JSON.parse(fs.readFileSync(out+'/subjects/'+id+'.json'));if(j.ecosystem!=='pypi')return;
 const scratch=path.join(w,'sandbox',id);fs.mkdirSync(scratch,{recursive:true});fs.writeFileSync(scratch+'/canary.txt','PUPU_SYNTHETIC_LOCAL_ONLY');
 const rec={toolkitId:id,scope:'Direct MCP protocol; no real PuPu model/confirmation path',credentialMode:'No real credential; synthetic token for stdio requiring one',before:effects(scratch)};let transport;
 if(e.mcp.transport==='http'){transport=new StreamableHTTPClientTransport(new URL(e.mcp.url),{requestInit:{redirect:'error'}});rec.endpoint=e.mcp.url;}
 else {
  const args=e.mcp.args;const from=args.indexOf('--from');let pos=from+2;while(args[pos]==='--with')pos+=2;const command=args[pos];const extra=args.slice(pos+1).map(a=>a.replaceAll('${WORKSPACE}',scratch));const bin=path.join(w,'runtimes',id,'venv','bin',command);
  const vars={...env,ANONYMIZED_TELEMETRY:'false',BROWSER_USE_SETUP_LOGGING:'false'};for(const s of e.secrets||[])vars[s.key]=s.key.endsWith('_URL')?'http://127.0.0.1:9':'PUPU_SYNTHETIC_INVALID_CREDENTIAL';
  transport=new StdioClientTransport({command:'/usr/bin/sandbox-exec',args:['-f',w+'/sandbox.sb',bin,...extra],env:vars,cwd:scratch,stderr:'pipe'});rec.artifactSha256=j.runtimeArtifact?.sha256||j.artifactSha256;rec.lockSha256=j.resolvedLockSha256;
 }
 let log='';transport.stderr?.on('data',b=>{if(log.length<12000)log+=b.toString()});const c=new Client({name:'pupu-scoped-verifier',version:'0.1'});const timer=setTimeout(()=>c.close().catch(()=>{}),35000);
 try{
  await c.connect(transport,{timeout:25000});rec.initialize='PASS';rec.server=c.getServerVersion();let list=await c.listTools({}, {timeout:25000});rec.tools=list.tools;rec.toolsSha256=sha(JSON.stringify(list.tools));rec.previewMissing=(e.tools||[]).map(t=>t.name).filter(n=>!list.tools.some(t=>t.name===n));rec.extraTools=list.tools.map(t=>t.name).filter(n=>!(e.tools||[]).some(t=>t.name===n));
  for(const [name,fn] of [['resources',()=>c.listResources({}, {timeout:2500})],['prompts',()=>c.listPrompts({}, {timeout:2500})]]){try{rec[name]=await fn()}catch(x){rec[name]={error:String(x.message).slice(0,250)}}}
  const tests=id==='mcp.workspace.markitdown'?[{name:'convert_to_markdown',arguments:{uri:'data:text/plain,PUPU_SYNTHETIC_CONVERSION'}}]:id==='mcp.workspace.sqlite'?[{name:'list_tables',arguments:{}},{name:'read_query',arguments:{query:'SELECT 1 AS positive'}},{name:'read_query',arguments:{query:'CREATE TABLE forbidden(id INTEGER)'}}]:id==='mcp.workspace.fetch'?[{name:'fetch',arguments:{url:'file:///pupu-synthetic-not-present'}},{name:'fetch',arguments:{url:'http://127.0.0.1:9/synthetic'}}]:id==='mcp.dev.microsoft-learn'?[{name:'microsoft_docs_search',arguments:{query:'Microsoft Learn MCP server'}},{name:'microsoft_docs_fetch',arguments:{url:'file:///pupu-synthetic-not-present'}}]:id==='mcp.workspace.filesystem'?[{name:'list_allowed_directories',arguments:{}},{name:'read_text_file',arguments:{path:scratch+'/canary.txt'}},{name:'read_text_file',arguments:{path:path.join(w,'sandbox','outside-canary.txt')}}]:id==='mcp.memory.memory'?[{name:'read_graph',arguments:{}}]:id==='mcp.productivity.brave-search'?[{name:'brave_web_search',arguments:{query:'PUPU_SYNTHETIC_QUERY'}}]:id==='mcp.productivity.tavily'?[{name:'tavily_search',arguments:{query:'PUPU_SYNTHETIC_QUERY',max_results:1}}]:id==='mcp.productivity.firecrawl'?[{name:'firecrawl_scrape',arguments:{url:'https://example.com'}}]:[];
  rec.calls=[];for(const call of tests){try{const result=await c.callTool(call,undefined,{timeout:7000});rec.calls.push({call,result});}catch(x){rec.calls.push({call,error:String(x.message).slice(0,1200)})}}
 }catch(x){rec.error=String(x.message).slice(0,1800)}finally{clearTimeout(timer);await c.close().catch(()=>{});rec.stderr=log.replaceAll('PUPU_SYNTHETIC_INVALID_CREDENTIAL','[synthetic credential]');rec.after=effects(scratch);fs.writeFileSync(out+'/'+id+'-mcp-probe.json',JSON.stringify(rec,null,2));console.log(id,rec.initialize||rec.error,'tools',rec.tools?.length||0);}
}
fs.writeFileSync(w+'/sandbox/outside-canary.txt','PUPU_SYNTHETIC_OUTSIDE_WORKSPACE');
// Bound batches; process mutations occur inside separate synthetic fixture directories.
for(let i=0;i<entries.length;i+=3)await Promise.allSettled(entries.slice(i,i+3).map(probe));
