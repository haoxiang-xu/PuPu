/* QA only: real packaged Electron IPC, production Host/SDK, loopback fixture.
 * Seeds use the real v2 bridge and are explicitly recorded. Starts, responses,
 * cancellations, author edits and saves are driven exclusively by GUI input. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {spawn}=require('node:child_process'),{createRequire}=require('node:module');
const {createStartupWatch}=require('./app_first_run.cjs');
const candidate=path.resolve(process.env.QA_CANDIDATE_ROOT),req=createRequire(path.join(candidate,'package.json'));
const {chromium}=req('playwright'),{expect}=req('@playwright/test');
const out=path.resolve(process.env.QA_OUT),app=process.env.QA_APP,home=path.join(out,'home'),userData=path.join(home,'profile'),workspace=path.join(out,'workspace');
const wires=[],errors=[],ledger=[],generations=[],snapshots=[],checks=[],consoleLines=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const write=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n');
const mark=(kind,action,data={})=>{ledger.push({kind,action,at_ns:process.hrtime.bigint().toString(),...data});write('ledger.json',ledger);};
const copy=v=>JSON.parse(JSON.stringify(v));
function flow(ids){return ids.slice(1).map((id,i)=>({id:'f'+i,kind:'flow',source_node_id:ids[i],source_port_id:'out',target_node_id:id,target_port_id:'in'}));}
const output=(name,kind,p)=>({name,source:{kind,path:p}}),binding=(name,node,p)=>({name,value:{kind:'ref',node_id:node,path:p},missing:'error'});
function plain(id='qa486-values',name='QA486 Values'){
 return {schema_version:1,kind:'workflow',id,name,input_schema:{type:'object',properties:{city:{type:'string'},days:{type:'integer',default:1},flag:{type:'boolean',default:true},text:{type:'string',default:'fallback'},nil:{type:'null',default:null},object:{type:'object',default:{}},array:{type:'array',default:[]}},required:['city'],additionalProperties:false},
 nodes:[{id:'start',type:'start',config:{execution:{outputs:[output('args','result',[])]}}},{id:'end',type:'end',config:{execution:{inputs:[binding('args','start',['args'])],outputs:[output('args','input',['args'])]}}}],edges:flow(['start','end'])};
}
const HOOK_SEED=require('./hook-seed.json');
const source=tag=>`def main(input, context):\n    return {'tag': '${tag}'}\n`;
function approval(){const d=plain('qa486-retain','QA486 Retain');
 d.input_schema={type:'object',properties:{path:{type:'string'},second_path:{type:'string'}},required:['path','second_path'],additionalProperties:false};
 const tool=(id,key,on_error)=>({id,type:'tool_call',config:{tool:{name:'write',on_error,approval_timeout_ms:600000},execution:{inputs:[binding('path','start',['args',key]),{name:'content',value:{kind:'literal',value:'qa486 approved once'},missing:'error'}],outputs:[]}}});
 d.nodes.splice(1,0,tool('write','path','stop'),{id:'code',type:'code',config:{code:{source:{kind:'file',path:'source.py'},environment_profile_id:'builtin',timeout_ms:10000,max_result_bytes:10000,max_log_bytes:10000,result_schema:{type:'object',properties:{tag:{type:'string'}},required:['tag'],additionalProperties:false}},execution:{inputs:[],outputs:[output('tag','result',['tag'])]}}},tool('write2','second_path','continue'));
 d.nodes.splice(3,0,{id:'child',type:'workflow_call',config:{workflow:{workflow_id:'qa486-values',revision_id:'PINNED_BY_REAL_PUBLICATION'},execution:{inputs:[{name:'city',value:{kind:'literal',value:'nested fixed child'},missing:'error'}],outputs:[]}}});
 d.nodes.at(-1).config.execution={inputs:[binding('tag','code',['tag'])],outputs:[output('tag','input',['tag'])]};d.edges=flow(['start','write','code','child','write2','end']);return d;
}
function agent(id='qa486-agent',name='QA486 Agent',model='qa486-model'){
 return {schema_version:1,kind:'agent',id,name,nodes:[{id:'start',type:'start',config:{execution:{outputs:[output('message','result',['message'])]}}},
 {id:'kernel',type:'agent',config:{execution:{inputs:[binding('message','start',['message'])],outputs:[output('message','result',['message'])]},kernel:{schema_version:1,profile:{id:model,provider:'ollama',protocol:'ollama',model,endpoint:'http://127.0.0.1:18991',credential_ref:'ollama',auth_mode:'none',context_window:8192,output_limit:1024,capabilities:{json_schema:true,images:false,files:false}},prompt:'QA486 offline test.',max_iterations:4,output_tokens:128,history:'root',overflow:'error',json_schema:null}}},
 {id:'end',type:'end',config:{execution:{inputs:[binding('message','kernel',['message'])],outputs:[output('message','input',['message'])]}}}],edges:flow(['start','kernel','end'])};
}
function toolAgent(id,name,model,tool){const d=agent(id,name,model);d.nodes.push({id:'tools',type:'toolkit_pool',config:{toolkits:[{id:'CoreToolkit',enabled_tools:[tool]}],merge_with_user_selected:false}});d.edges.push({id:'tools-attach',kind:'attach',source_node_id:'kernel',source_port_id:'attach_bot',target_node_id:'tools',target_port_id:'attach_top'});return d;}
function humanAgent(){return toolAgent('qa486-human','QA486 Human','qa486-human','ask_user_question');}
function hookAgent(){const d=toolAgent('qa486-hook','QA486 Hook','qa486-hook','write');const pool=copy(HOOK_SEED.pool_node);pool.config.hooks[0].tool_name='write';d.nodes.push(pool);d.edges.push(copy(HOOK_SEED.attach_edge));return d;}
function parentAgent(){const d=agent('qa486-parent','QA486 Parent','qa486-parent');d.nodes.push({id:'reviewers',type:'subagent_pool',config:{subagents:[{id:'reviewer',name:'Reviewer',description:'review once',source:{kind:'embedded',document:agent('qa486-child','QA486 Child','qa486-child')},allowed_modes:['delegate'],output_mode:'summary',memory_policy:'ephemeral',parallel_safe:true,allowed_tools:null,disabled_tools:[]}]}});d.edges.push({id:'child-attach',kind:'attach',source_node_id:'kernel',source_port_id:'attach_bot',target_node_id:'reviewers',target_port_id:'attach_top'});return d;}
function failedWorkflow(id,name){const d=approval();d.id=id;d.name=name;d.input_schema={type:'object',properties:{},required:[],additionalProperties:false};d.nodes=d.nodes.filter(n=>['start','code','end'].includes(n.id));d.edges=flow(['start','code','end']);return d;}
function missingAgent(){const d=agent('qa486-missing','QA486 Missing','unused');const p=d.nodes[1].config.kernel.profile;Object.assign(p,{id:'missing-credential',provider:'openai',protocol:'openai-responses',model:'gpt-4.1',endpoint:'https://api.openai.com/v1',credential_ref:'openai'});delete p.auth_mode;return d;}
function legacy(whole){const d=plain(whole?'qa486-legacy-whole':'qa486-legacy-named',whole?'QA486 Legacy Whole':'QA486 Legacy Named');delete d.input_schema;if(!whole){d.nodes[0].config.execution.outputs=[output('city','result',['city'])];d.nodes[1].config.execution={inputs:[binding('city','start',['city'])],outputs:[output('city','input',['city'])]};}return d;}
function processIdentity(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const close = stat.lastIndexOf(')');
    const fields = stat.slice(close + 2).split(' ');
    // /proc names arrive as strings; the ownership walk compares them with numeric ppids, so normalise here.
    return { pid: Number(pid), parent: Number(fields[1]), start_ticks: Number(fields[19]), exe: (() => { try { return fs.readlinkSync(`/proc/${pid}/exe`); } catch { return ''; } })() };
  } catch { return null; }
}
async function until(read, timeout = 120000) {
  const end = Date.now() + timeout;
  for (;;) {
    let value = null;
    try { value = await read(); } catch (error) { if (Date.now() > end) throw error; }
    if (value) return value;
    if (Date.now() > end) throw new Error('until: timed out');
    await sleep(100);
  }
}


async function main(){
 fs.mkdirSync(home,{recursive:true});fs.mkdirSync(workspace,{recursive:true});
 let current=null;let activeName=null;
 const fixture=http.createServer(async(request,response)=>{
  const chunks=[];for await(const chunk of request)chunks.push(chunk);const raw=Buffer.concat(chunks).toString();
  const row={at_ns:process.hrtime.bigint().toString(),method:request.method,url:request.url,raw};wires.push(row);
  try{assert.equal(request.method,'POST');assert.equal(request.url,'/api/chat');const body=JSON.parse(raw);
   assert(['qa486-model','qa486-human','qa486-hook','qa486-parent','qa486-child'].includes(body.model));assert.equal(body.options.num_ctx,8192);assert.equal(body.options.num_predict,128);assert.equal(body.stream,true);
   const n=wires.filter(w=>{try{return JSON.parse(w.raw).model===body.model;}catch{return false;}}).length;let text='Offline answer '+n;let message;
   if(body.model==='qa486-model')message={role:'assistant',content:text};
   else if(body.model==='qa486-human'){text='Human answered';message=n===1?{role:'assistant',content:'',tool_calls:[{id:'human-call',type:'function',function:{name:'ask_user_question',arguments:{title:'QA486 question',question:'Choose the offline answer',selection_mode:'single',options:[{label:'Use fixture',value:'fixture'}],allow_other:false}}}]}:{role:'assistant',content:text};}
   else if(body.model==='qa486-hook'){text='Hook completed';message=n===1?{role:'assistant',content:'',tool_calls:[{id:'hook-write',type:'function',function:{name:'write',arguments:{path:path.join(workspace,'hook.txt'),content:'qa486 approved once'}}}]}:{role:'assistant',content:text};}
   else if(body.model==='qa486-parent'){text='Parent completed';message=n===1?{role:'assistant',content:'',tool_calls:[{id:'parent-delegate',type:'function',function:{name:'delegate_to_subagent',arguments:{target:'Reviewer',task:'review once'}}}]}:{role:'assistant',content:text};if(n===2)assert(JSON.stringify(body.messages).includes('Child completed'));}
   else if(body.model==='qa486-child'){assert.equal(n,1);text='Child completed';message={role:'assistant',content:text};}
   else throw Error('unexpected model');
   row.response=text;row.response_message=message;row.request_sha256=require('crypto').createHash('sha256').update(raw).digest('hex');
   response.writeHead(200,{'Content-Type':'application/x-ndjson'});
   response.write(JSON.stringify({model:body.model,message,done:false})+'\n');
   setTimeout(()=>response.end(JSON.stringify({model:body.model,message:{role:'assistant',content:''},done:true,prompt_eval_count:16,eval_count:4})+'\n'),150);
  }catch(error){errors.push(String(error));response.writeHead(500);response.end('fixture refused');}
  write('provider-wires.json',wires);write('fixture-errors.json',errors);
 });
 await new Promise((resolve,reject)=>{fixture.once('error',reject);fixture.listen(18991,'127.0.0.1',resolve);});
  async function stop() {
    if (!current) return; const held = current; held.collect(); clearInterval(held.timer);
    await held.browser.close().catch(() => {});
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      for (const identity of [...held.owned.values()].reverse()) {
        const alive = processIdentity(identity.pid);
        if (alive && alive.start_ticks === identity.start_ticks) { try { process.kill(identity.pid, signal); } catch { /* gone */ } }
      }
      await until(() => [...held.owned.values()].every(identity => { const alive = processIdentity(identity.pid); return !alive || alive.start_ticks !== identity.start_ticks; }),
        signal === 'SIGTERM' ? 10000 : 5000).catch(error => { if (signal === 'SIGKILL') throw error; });
    }
    const strays = [...held.owned.values()].map(row=>processIdentity(row.pid)).filter(row => row && path.basename(row.exe) === 'unchain-server');
    for (const row of strays) { try { process.kill(row.pid, 'SIGKILL'); } catch { /* gone */ } }
    held.record.stray_sidecars_reaped = strays;
    held.record.stopped_ns = process.hrtime.bigint().toString();
    held.record.all_owned_dead = [...held.owned.values()].every(identity => { const alive = processIdentity(identity.pid); return !alive || alive.start_ticks !== identity.start_ticks; });
    assert.equal(held.record.all_owned_dead, true); held.record.processes = [...held.owned.values()];
    write('process-generations.json', generations); current = null;
  }
  process.once('SIGTERM',async()=>{await stop();fixture.close();process.exit(143);});
  async function launch() {
    const debug = 19220 + generations.length;
    const generation = generations.length + 1;
    const logFd = fs.openSync(path.join(out, `app-${generation}.log`), 'a');
    const productEnv={...process.env};for(const key of ['PYTHONPATH','UNCHAIN_SOURCE_PATH','PYTHONHOME','VIRTUAL_ENV'])delete productEnv[key];
    const child = spawn(app, [`--remote-debugging-port=${debug}`, `--user-data-dir=${userData}`, '--password-store=gnome-libsecret'], {
      detached: true, env: { ...productEnv, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local/share'),
        XDG_CACHE_HOME: path.join(home, '.cache'), PUPU_E2E: '1', PUPU_COMPUTER_USE: '0', UNCHAIN_MODEL: 'environment-decoy-486', OLLAMA_HOST: 'http://127.0.0.1:18992' },
      stdio: ['ignore', logFd, logFd] });
    fs.closeSync(logFd);
    const owned = new Map();
    const collect = () => { const table = fs.readdirSync('/proc').filter(n => /^\d+$/.test(n)).map(processIdentity).filter(Boolean); let changed = true;
      while (changed) { changed = false; for (const row of table) if (!owned.has(row.pid) && (row.pid === child.pid || owned.has(row.parent))) { owned.set(row.pid, row); changed = true; } } };
    collect(); const timer = setInterval(collect, 100);
    const record = { generation, main: processIdentity(child.pid), started_ns: process.hrtime.bigint().toString() }; generations.push(record);
    current = { child, owned, collect, timer, record, browser: { close: async () => {} } };
    const ws = await until(async () => { if (child.exitCode !== null || child.signalCode !== null) throw new Error('packaged App exited');
      const reply = await fetch(`http://127.0.0.1:${debug}/json/version`); return reply.ok && (await reply.json()).webSocketDebuggerUrl; });
    const browser = await chromium.connectOverCDP(ws); current.browser = browser;
    const page = await until(() => browser.contexts().flatMap(c => c.pages()).find(p => /^file:|^app:/.test(p.url())));
    current.page = page;
    page.on('pageerror', error => { errors.push(String(error)); write('page-errors.json', errors); });
    page.on('console', message => { consoleLines.push({ at_ns: process.hrtime.bigint().toString(), type: message.type(), text: message.text().slice(0, 500) }); if (consoleLines.length % 20 === 0) write('renderer-console.json', consoleLines); });
    await page.waitForLoadState('domcontentloaded');
    const startup = createStartupWatch({ page, generation, out, write, mark, sleep });
    const gate = page.getByRole('button', { name: 'Click anywhere to start' });
    await expect(gate).toBeVisible({ timeout: 120000 }); await gate.click();
    record.startup = await startup.settle();
    // Readiness is the product's own answer: getPendingInteraction throws "Miso service is not ready" until the sidecar is up.
    await until(() => page.evaluate(() => window.unchainAPI.getPendingInteraction({ session_id: 'qa486-readiness-probe' }).then(() => true, () => false)), 180000);
    collect();
    record.ready_ns = process.hrtime.bigint().toString(); record.processes_at_ready = [...owned.values()];
    record.sidecar_owned = [...owned.values()].some(row => path.basename(row.exe) === 'unchain-server');
    assert.ok(owned.size > 1, 'ownership walk found no descendants of the Electron main process');
    assert.equal(record.sidecar_owned, true, 'sidecar is not a tracked descendant of the Electron main process');
    record.proc_table_at_ready = fs.readdirSync('/proc').filter(n => /^\d+$/.test(n)).map(processIdentity).filter(Boolean)
      .map(row => ({ ...row, cmdline: (() => { try { return fs.readFileSync(`/proc/${row.pid}/cmdline`, 'utf8').split('\0').join(' ').slice(0, 200); } catch { return ''; } })() }));
    record.sidecar_environment=[...owned.values()].filter(row=>path.basename(row.exe)==='unchain-server').map(row=>{const env=Object.fromEntries(fs.readFileSync(`/proc/${row.pid}/environ`,'utf8').split('\0').filter(Boolean).map(pair=>{const i=pair.indexOf('=');return[pair.slice(0,i),pair.slice(i+1)];}));for(const key of ['PYTHONPATH','UNCHAIN_SOURCE_PATH','PYTHONHOME','VIRTUAL_ENV'])assert.equal(env[key],undefined,`packaged sidecar inherited ${key}`);return{pid:row.pid,source_overrides_absent:true,runtime_directory:env.PUPU_MCP_RUNTIME_DIR};});
    write('process-generations.json', generations);
    return page;
  }
 const shot=async(name)=>{await current.page.screenshot({path:path.join(out,name+'.png')});fs.writeFileSync(path.join(out,name+'.aria.txt'),await current.page.locator('body').ariaSnapshot());};
 async function sidebar(){const p=current.page;if(await p.getByRole('button',{name:'Close sidebar',exact:true}).isVisible().catch(()=>false))return;
  const hit=await p.getByRole('button',{name:'Open sidebar',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button');if(!h)return null;const b=h.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};});
  assert(hit);await p.mouse.click(hit.x,hit.y);await expect(p.getByRole('button',{name:'Close sidebar',exact:true})).toBeVisible();}
 async function open(name){activeName=name;const p=current.page;const close=p.getByRole('button',{name:'Close builder',exact:true});if(await close.isVisible().catch(()=>false))await close.click();const explorer=p.getByTestId('agent-explorer');if(!await explorer.isVisible().catch(()=>false)){await sidebar();await p.getByRole('button',{name:'Agents',exact:true}).click();}await explorer.getByText(name,{exact:true}).click();await expect(p.getByTestId('skeleton-resource-page')).toBeVisible();if(await explorer.isVisible().catch(()=>false)){await p.getByRole('button',{name:'Close sidebar',exact:true}).click();await expect(explorer).not.toBeVisible();}mark('ui','open Builder',{name});}
 async function test(){await current.page.getByTestId('skeleton-control-center-run').click();await expect(current.page.getByTestId('builder-test-panel')).toBeVisible();await expect(current.page.getByTestId('builder-test-panel')).toContainText(activeName);mark('ui','open Test',{resource_name:activeName});}
 async function read(resource,label){const value=await current.page.evaluate(async resource=>{const opened=await window.unchainAPI.builderTestCommand({op:'open',resource_id:resource,kind:['qa486-agent','qa486-human','qa486-hook','qa486-parent','qa486-missing'].includes(resource)?'agent':'workflow'});return window.unchainAPI.builderTestCommand({op:'read',resource_id:resource,session_id:opened.session.id});},resource);const previous=snapshots.findLast(s=>s.resource===resource);if(!previous||JSON.stringify(previous.value)!==JSON.stringify(value)){snapshots.push({label,resource,at_ns:process.hrtime.bigint().toString(),value});write('snapshots.json',snapshots);}return value;}
 async function waitState(resource,status,label){return until(async()=>{const v=await read(resource,label);const last=v.runs.at(-1);if(last?.status==='failed'&&status!=='failed')throw Error('Run failed: '+JSON.stringify(last.error));return last?.status===status?v:null;});}
 async function save(){const p=current.page;await p.getByRole('button',{name:'Save',exact:true}).click();await expect(p.getByTestId('skeleton-save-state')).toHaveText('Saved');mark('ui','explicit Save');}
 async function rename(id,text){const p=current.page;await p.getByTestId('skeleton-node-'+id).click();await p.keyboard.press('F2');const f=p.locator(`[data-flow-node-id="${id}"] [data-node-title-field]`);await expect(f).toBeVisible();await f.fill(text);await f.press('Enter');await expect(p.getByTestId('skeleton-save-state')).toHaveText('Unsaved changes');mark('ui','inline rename',{id,text});}
 async function tools(){const p=current.page;if(!await p.getByRole('combobox').filter({hasText:'No workspace'}).isVisible().catch(()=>false))await p.getByRole('button',{name:'Tools and workspace',exact:true}).click();await p.getByRole('combobox').filter({hasText:'No workspace'}).click();await p.getByRole('option',{name:'QA486 Workspace',exact:true}).click();await p.getByRole('combobox').filter({hasText:'Tools'}).click();await p.getByRole('option',{name:'core',exact:true}).click();await p.keyboard.press('Escape');}
 async function runPaths(a,b){const p=current.page;await p.getByRole('textbox',{name:'path',exact:true}).fill(path.join(workspace,a));await p.getByRole('textbox',{name:'second_path',exact:true}).fill(path.join(workspace,b));await p.getByRole('button',{name:'Run Workflow',exact:true}).click();mark('ui','Run Workflow',{a,b});}
 async function answer(resource,approved,label){const p=current.page;const before=await waitState(resource,'waiting',label+'-before');const run=before.runs.at(-1);assert(run.pending);const card=p.getByTestId('test-turn-'+run.id).getByTestId('test-pending');await expect(card).toHaveCount(1);await expect(p.getByTestId('builder-test-panel').getByRole('button',{name:approved?'Approve':'Deny',exact:true})).toHaveCount(1);await card.getByRole('button',{name:approved?'Approve':'Deny',exact:true}).click();mark('ui',approved?'Approve':'Deny',{run_id:run.id,interaction:run.pending.interaction_id,label});return run;}
 async function theme(mode){const p=current.page;await sidebar();await p.getByRole('button',{name:'Settings',exact:true}).click();const combo=p.getByRole('combobox').filter({hasText:/^(System|Light|Dark)$/});await expect(combo).toHaveCount(1);await combo.click();await p.getByRole('option',{name:mode,exact:true}).click();await p.getByRole('button',{name:'Close settings',exact:true}).click();await expect(p.getByRole('button',{name:'Close settings',exact:true})).toHaveCount(0);mark('ui','theme changed',{mode});}
 async function sizePanel(direction,label){const p=current.page;const handle=p.getByTestId('skeleton-detail-resize-handle');const box=await handle.boundingBox();assert(box);await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.mouse.move(direction==='narrow'?1250:400,box.y+box.height/2,{steps:12});await p.mouse.up();const layout=await p.getByTestId('builder-test-panel').evaluate(panel=>({width:panel.clientWidth,body_width:panel.children[2].clientWidth,body_scroll_width:panel.children[2].scrollWidth,color:getComputedStyle(panel).color,background:getComputedStyle(document.documentElement).getPropertyValue('--pupu-background')}));assert.equal(layout.body_width,layout.body_scroll_width);write('layout-'+label+'.json',layout);await shot('layout-'+label);}
 const ordinary=async()=>current.page.evaluate(()=>{const b=window.chatStorageAPI.bootstrap();return{activeChatId:b.activeChatId,meta:b.chatMetasById?.[b.activeChatId]||b.chatsById?.[b.activeChatId],messages:window.chatStorageAPI.readMessages(b.activeChatId)};});
 try{
  let p=await launch();await sidebar();await p.getByRole('button',{name:'Workspaces',exact:true}).click();await p.getByRole('button',{name:/Add Workspace/}).click();await p.getByRole('textbox',{name:'workspace-name',exact:true}).fill('QA486 Workspace');await p.getByRole('textbox',{name:'workspace-path',exact:true}).fill(workspace);await p.getByRole('textbox',{name:'workspace-path',exact:true}).press('Enter');await expect(p.getByRole('textbox',{name:'workspace-path',exact:true})).toHaveCount(0);await p.keyboard.press('Escape');mark('ui','workspace registered');
  const seed=await p.evaluate(async({agent,values,retain,source,extra})=>{const results={};const childSaved=await window.unchainAPI.saveManagedSkeletonResource({schema:'pupu.skeleton-edit.v2',document:values,expected_edit_token:null,managed_sources:[]});const published=await window.unchainAPI.publishManagedSkeletonWorkflow(values.id,childSaved.resource.edit_token);retain.nodes.find(n=>n.id==='child').config.workflow.revision_id=published.version.revision_id;results[values.id]=childSaved;results.published=published;for(const document of [agent,retain,...extra])results[document.id]=await window.unchainAPI.saveManagedSkeletonResource({schema:'pupu.skeleton-edit.v2',document,expected_edit_token:null,managed_sources:document.id==='qa486-retain'?[{node_path:['nodes',2],text:source}]:document.id==='qa486-failed'?[{node_path:['nodes',1],text:'def main(input, context):\n    return {"tag": 4}\n'}]:document.id==='qa486-unknown'?[{node_path:['nodes',1],text:'def main(input, context):\n    raise RuntimeError("offline intentional failure")\n'}]:[]});return results;},{agent:agent(),values:plain(),retain:approval(),source:source('A'),extra:[humanAgent(),hookAgent(),parentAgent(),legacy(true),legacy(false),failedWorkflow('qa486-failed','QA486 Failed'),failedWorkflow('qa486-unknown','QA486 Unknown'),missingAgent()]});write('seed.json',seed);mark('seed','real v2 bridge; not empty-canvas authoring');
  await p.getByRole('textbox',{name:'Message PuPu...',exact:true}).fill('Ordinary draft must survive Test Run');await sleep(500);const normalBefore=await ordinary();assert.equal(normalBefore.meta.draft.text,'Ordinary draft must survive Test Run');write('ordinary-before.json',normalBefore);
  await open('QA486 Agent');await rename('kernel','Saved QA kernel');await test();assert.equal(wires.length,0);checks.push('open-no-dispatch');
  const msg=p.getByRole('textbox',{name:'Test message',exact:true});await msg.fill('first native App test');await p.getByRole('button',{name:'Save and test',exact:true}).click();
  await expect(p.getByTestId('test-agent-reply').last()).toHaveText('Offline answer 1',{timeout:120000});await expect(p.getByTestId('skeleton-save-state')).toHaveText('Saved');const first=await read('qa486-agent','agent-first');assert.equal(first.runs.at(-1).status,'completed');checks.push('explicit-save-and-test');
  await msg.fill('second native App test');await msg.press('Enter');await expect(p.getByTestId('test-agent-reply').last()).toHaveText('Offline answer 2',{timeout:120000});const second=await read('qa486-agent','agent-second');assert.equal(second.session.id,first.session.id);assert.equal(second.runs.length,2);assert(JSON.stringify(JSON.parse(wires[1].raw)).includes('Offline answer 1'));checks.push('agent-two-turns-kernel-and-server-history');
  await p.getByRole('button',{name:'New conversation',exact:true}).click();await expect(p.getByTestId('test-agent-reply')).toHaveCount(0);const fresh=await read('qa486-agent','agent-new');assert.notEqual(fresh.session.id,first.session.id);assert.equal(wires.length,2);checks.push('new-conversation-no-dispatch');await shot('agent');await theme('Dark');await sizePanel('narrow','agent-dark-narrow');await sizePanel('wide','agent-dark-wide');await theme('Light');await sizePanel('narrow','agent-light-narrow');await sizePanel('wide','agent-light-wide');checks.push('real-theme-and-panel-resize');
  await open('QA486 Values');await test();const run=p.getByRole('button',{name:'Run Workflow',exact:true});await expect(run).toBeDisabled();await p.getByRole('textbox',{name:'city',exact:true}).fill('Vancouver');await p.getByRole('textbox',{name:'days',exact:true}).fill('not a number');await expect(run).toBeDisabled();assert.equal((await read('qa486-values','invalid-form')).runs.length,0);await p.getByRole('textbox',{name:'days',exact:true}).fill('0');await p.getByRole('textbox',{name:'flag',exact:true}).fill('false');await p.getByRole('textbox',{name:'text',exact:true}).fill('');
  // Empty string is supplied explicitly by typing then clearing; an untouched empty field means omission.
  await p.getByRole('textbox',{name:'text',exact:true}).fill('x');await p.getByRole('textbox',{name:'text',exact:true}).fill('');await p.getByRole('textbox',{name:'nil',exact:true}).fill('null');await p.getByRole('textbox',{name:'object',exact:true}).fill('{"n":0}');await p.getByRole('textbox',{name:'array',exact:true}).fill('[false,0,null]');await run.click();
  const typed=await waitState('qa486-values','completed','typed');assert.deepEqual(typed.runs.at(-1).output,{args:{city:'Vancouver',days:0,flag:false,text:'',nil:null,object:{n:0},array:[false,0,null]}});await expect(p.getByTestId('test-workflow-output').last()).toContainText('Vancouver');checks.push('typed-json-and-invalid-before-effects');assert.equal(wires.length,2);
  await p.getByTestId('workflow-test-input-days').getByRole('button').click();await run.click();const defaulted=await until(async()=>{const v=await read('qa486-values','defaulted');return v.runs.length===2&&v.runs.at(-1).status==='completed'?v:null;});assert.equal(defaulted.runs.at(-1).output.args.days,1);checks.push('omission-default-distinct-from-zero');
  await p.getByRole('button',{name:'View run',exact:true}).last().click();await expect(p.getByTestId('run-observation-graph-state')).toBeVisible();await shot('workflow-observation');await p.getByRole('button',{name:'Back to editor',exact:true}).click();await expect(p.getByTestId('builder-test-panel')).toBeVisible();checks.push('recorded-run-and-back');await theme('Dark');await sizePanel('narrow','workflow-dark-narrow');await theme('Light');await sizePanel('wide','workflow-light-wide');
  await open('QA486 Retain');await test();await tools();await runPaths('a-first.txt','a-second.txt');const a=await waitState('qa486-retain','waiting','a-wait');const firstInteraction=a.runs.at(-1).pending.interaction_id;assert.equal(fs.existsSync(path.join(workspace,'a-first.txt')),false);assert.equal(await p.getByRole('button',{name:'Approve',exact:true}).count(),1);
  await p.getByTestId('skeleton-detail-panel-shell-close').click();await test();assert.equal((await read('qa486-retain','reattach')).runs.at(-1).pending.interaction_id,firstInteraction);checks.push('detach-reattach-no-effect');
  await p.getByTestId('skeleton-node-code').click();const editor=p.getByTestId('code-text-editor').locator('textarea');await expect(editor).toBeVisible();await editor.fill(source('B'));await expect(p.getByTestId('skeleton-save-state')).toHaveText('Unsaved changes');await p.getByTestId('skeleton-node-start').click();await p.getByRole('button',{name:'Add parameter',exact:true}).click();const added=p.getByTestId('workflow-parameter-2');await added.getByRole('textbox',{name:'Parameter name',exact:true}).fill('note');await added.getByRole('combobox').nth(1).click();await p.getByRole('option',{name:'Default value',exact:true}).click();await added.getByRole('textbox',{name:'Default value',exact:true}).fill('B note');await save();const savedB=await p.evaluate(()=>window.unchainAPI.getManagedSkeletonResource('qa486-retain'));write('saved-B.json',savedB);await test();await expect(p.getByRole('textbox',{name:'path',exact:true})).toHaveValue('');const afterB=await read('qa486-retain','a-after-B');assert.deepEqual(afterB.runs.at(-1).inputs,a.runs.at(-1).inputs);assert.equal(afterB.runs.at(-1).definition_digest,a.runs.at(-1).definition_digest);checks.push('saved-B-does-not-change-waiting-A');
  mark('supervisor','cold App restart while waiting');await stop();p=await launch();await open('QA486 Retain');await test();await expect(p.getByRole('button',{name:'Approve',exact:true})).toBeVisible({timeout:120000});const cold=await read('qa486-retain','a-cold');assert.equal(cold.session.id,a.session.id);assert.equal(cold.runs.at(-1).pending.interaction_id,firstInteraction);assert.equal(cold.runs.at(-1).definition_digest,a.runs.at(-1).definition_digest);checks.push('cold-native-Main-sidecar-same-A');
  await answer('qa486-retain',true,'a-first');await until(async()=>{const v=await read('qa486-retain','a-second-wait');return v.runs.at(-1).pending?.interaction_id!==firstInteraction&&v.runs.at(-1).status==='waiting'?v:null;});assert.equal(fs.readFileSync(path.join(workspace,'a-first.txt'),'utf8'),'qa486 approved once');assert.equal(fs.existsSync(path.join(workspace,'a-second.txt')),false);await answer('qa486-retain',false,'a-deny-second');const aDone=await waitState('qa486-retain','completed','a-done');assert.deepEqual(aDone.runs.at(-1).output,{tag:'A'});assert.equal(fs.existsSync(path.join(workspace,'a-second.txt')),false);checks.push('old-Code-A-two-waits-deny-no-second-write');
  // Context choices are intentionally not silently restored as author defaults.
  await tools();await runPaths('b-first.txt','b-second.txt');const bFirst=await answer('qa486-retain',true,'b-first');await until(async()=>{const v=await read('qa486-retain','b-second-wait');return v.runs.at(-1).status==='waiting'&&v.runs.at(-1).pending?.interaction_id!==bFirst.pending.interaction_id?v:null;});await answer('qa486-retain',true,'b-second');const bDone=await waitState('qa486-retain','completed','b-done');assert.deepEqual(bDone.runs.at(-1).output,{tag:'B'});assert.equal(bDone.runs.at(-1).inputs.note,'B note');assert.equal(Object.hasOwn(aDone.runs.at(-1).inputs,'note'),false);assert.notEqual(bDone.runs.at(-1).id,a.runs.at(-1).id);assert.notEqual(bDone.runs.at(-1).edit_token,a.runs.at(-1).edit_token);checks.push('new-B-Code-and-normalized-inputs');
  await runPaths('cancel-first.txt','cancel-second.txt');await waitState('qa486-retain','waiting','cancel-wait');await p.getByRole('button',{name:'Stop test',exact:true}).click();await waitState('qa486-retain','cancelled','cancelled');assert.equal(fs.existsSync(path.join(workspace,'cancel-first.txt')),false);assert.equal(fs.existsSync(path.join(workspace,'cancel-second.txt')),false);checks.push('Stop-no-protected-effect');
  const hot=await read('qa486-retain','hot-final');await stop();p=await launch();await open('QA486 Retain');await test();const coldFinal=await read('qa486-retain','cold-final');assert.deepEqual(coldFinal,hot);checks.push('second-cold-restart-records-identical');
  await open('QA486 Human');await test();await tools();await p.getByRole('textbox',{name:'Test message',exact:true}).fill('ask one question');await p.getByRole('button',{name:'Send test message',exact:true}).click();const human=await waitState('qa486-human','waiting','human-wait');assert.equal(human.runs.at(-1).pending.kind,'human_input');await p.getByTestId('test-pending').getByText('Use fixture',{exact:true}).click();await p.getByTestId('test-pending').getByRole('button',{name:'Submit',exact:true}).click();await waitState('qa486-human','completed','human-done');await expect(p.getByTestId('test-agent-reply').last()).toHaveText('Human answered');checks.push('human-input-exact-controller');
  await open('QA486 Hook');await test();await tools();await p.getByRole('textbox',{name:'Test message',exact:true}).fill('write once with hook');await p.getByRole('button',{name:'Send test message',exact:true}).click();await answer('qa486-hook',true,'hook-approve');const hook=await waitState('qa486-hook','completed','hook-done');assert(hook.runs.at(-1).graphs.length>=2);checks.push('Hook-child-real-tool-approval');
  await open('QA486 Parent');await test();await p.getByRole('textbox',{name:'Test message',exact:true}).fill('delegate once');await p.getByRole('button',{name:'Send test message',exact:true}).click();const parent=await waitState('qa486-parent','completed','parent-done');assert.equal(parent.runs.at(-1).graphs.length,2);await expect(p.getByTestId('test-agent-reply').last()).toHaveText('Parent completed');await p.getByRole('button',{name:'View run',exact:true}).last().click();await expect(p.getByTestId('run-observation-graph-picker')).toBeVisible();const picker=p.getByTestId('run-observation-graph-picker').getByRole('combobox');const pickerBox=await picker.boundingBox();await picker.click({position:{x:pickerBox.width-20,y:pickerBox.height/2}});await p.getByRole('option').filter({hasText:'QA486 Child'}).click();await expect(picker).toContainText('QA486 Child');await expect(p.getByTestId('run-node-state-kernel')).toContainText('Succeeded');await shot('parent-child');await p.getByRole('button',{name:'Back to editor',exact:true}).click();checks.push('real-subagent-and-child-observation');
  await open('QA486 Legacy Whole');await test();await p.getByTestId('workflow-test-input-whole-control').fill('{"city":"legacy","days":0}');await p.getByRole('button',{name:'Run Workflow',exact:true}).click();const whole=await waitState('qa486-legacy-whole','completed','legacy-whole');assert.deepEqual(whole.runs.at(-1).output,{args:{city:'legacy',days:0}});
  await open('QA486 Legacy Named');await test();await p.getByRole('textbox',{name:'city',exact:true}).fill('legacy named');await p.getByRole('button',{name:'Run Workflow',exact:true}).click();const named=await waitState('qa486-legacy-named','completed','legacy-named');assert.deepEqual(named.runs.at(-1).output,{city:'legacy named'});checks.push('legacy-signatures-not-rewritten');
  await open('QA486 Failed');await test();await p.getByRole('button',{name:'Run Workflow',exact:true}).click();const failed=await waitState('qa486-failed','failed','failed-Code');assert.equal(failed.runs.at(-1).output,null);checks.push('invalid-Code-result-failed');
  await open('QA486 Unknown');await test();await p.getByRole('button',{name:'Run Workflow',exact:true}).click();const unknown=await waitState('qa486-unknown','outcome_unknown','unknown-Code');assert.equal(unknown.runs.at(-1).output,null);checks.push('handler-error-not-completed');
  await open('QA486 Missing');await test();await p.getByRole('textbox',{name:'Test message',exact:true}).fill('must not call a real provider');await p.getByRole('button',{name:'Send test message',exact:true}).click();await expect(p.getByRole('alert').first()).toContainText(/credential|api.?key|secret/i);const refused=await read('qa486-missing','credential-refused');assert(refused.runs.every(r=>r.status==='ready'));checks.push('Main-missing-credential-refused-before-dispatch');
  assert.deepEqual(await ordinary(),normalBefore);write('ordinary-after.json',await ordinary());checks.push('ordinary-chat-byte-equivalent');assert.equal(wires.length,9);assert.deepEqual(errors,[]);await shot('final');
  write('functional-result.json',{verdict:'APP_486_FUNCTIONAL_RECORDED',checks,provider_requests:wires.length});
 }catch(error){write('failure.json',{error:String(error.stack||error),checks});if(current){await shot('failure').catch(()=>{});fs.writeFileSync(path.join(out,'failure.html'),await current.page.content().catch(String));}throw error;
 }finally{await stop();await new Promise(r=>fixture.close(r));write('snapshots.json',snapshots);write('checks.json',checks);write('process-generations.json',generations);write('renderer-console.json',consoleLines);}
}
main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
