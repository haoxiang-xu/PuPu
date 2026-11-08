/* QA-only (#210): packaged Linux App, loopback only, strict fake provider.
 * Store seeding uses the real v2 bridge (disclosed); every chat action is a real
 * GUI action; every observation is read both from the page and from the real
 * bridge/HTTP response, and bound to the Journal afterwards (verify_app_210.py).
 * Reuses the #356 B4 helpers in this directory unchanged. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawn } = require('child_process');
const { createStartupWatch } = require('./app_first_run.cjs');
const { installRecorder } = require('./enter_probe.cjs');
const { sendOnce, STOP_ICON } = require('./composer_send.cjs');
const https=require('node:https');
const {execFile}=require('node:child_process');
const execAsync=require('node:util').promisify(execFile);
const {frameFor,controls,KEY}=require('./fixture_473.cjs');
const SEEDS=require('./legacy-seeds.json');

const candidate = path.resolve(process.env.QA_CANDIDATE_ROOT);
const requireCandidate = createRequire(path.join(candidate, 'package.json'));
const { chromium } = requireCandidate('playwright');
const { expect } = requireCandidate('@playwright/test');
const out = path.resolve(process.env.QA_OUT);
const app = path.resolve(process.env.QA_APP);
const home = path.join(out, 'home');
const userData = path.join(home, 'profile');
const workspace = path.join(out, 'workspace');
const port = 18991;
const ledger = [], wires = [], generations = [], errors = [], observations = [], consoleLines = [];
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const write = (name, data) => fs.writeFileSync(path.join(out, name), `${JSON.stringify(data, null, 2)}\n`);
const mark = (kind, action, data = {}) => ledger.push({ at_ns: process.hrtime.bigint().toString(), kind, action, ...data });
const copy = (value) => JSON.parse(JSON.stringify(value));

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

async function main() {
  fs.mkdirSync(home,{recursive:true}); fs.mkdirSync(workspace,{recursive:true});
  assert.ok(fs.statSync(app).isFile()); let current=null;
  const canaries=[];
  for(const port of [11434,18992]) {const hits=[];const listener=http.createServer((q,r)=>{hits.push(q.url);r.writeHead(500);r.end('FORBIDDEN');});
    listener.on('connection',()=>hits.push('connection')); await new Promise(resolve=>listener.listen(port,'127.0.0.1',resolve)); canaries.push({port,hits,listener});}
  const nonce=http.createServer((q,r)=>r.end('QA473_OWNED_NONCE'));await new Promise(resolve=>nonce.listen(18990,'127.0.0.1',resolve));
  const server=https.createServer({key:fs.readFileSync(path.join(out,'certs/key.pem')),cert:fs.readFileSync(path.join(out,'certs/cert.pem'))},async(q,r)=>{
    const chunks=[];for await(const chunk of q)chunks.push(chunk);const raw=Buffer.concat(chunks).toString('utf8');
    const row={index:wires.length,method:q.method,url:q.url,authorization_is_sentinel:q.headers.authorization===`Bearer ${KEY}`,at_ns:process.hrtime.bigint().toString(),request_text:raw};wires.push(row);
    try {assert(row.authorization_is_sentinel,'fixture_authorization');
      if(q.method==='GET'&&q.url==='/v1/models'){r.setHeader('Content-Type','application/json');r.end(JSON.stringify({object:'list',data:[{id:'gpt-6-sol',object:'model',owned_by:'qa473'}]}));row.kind='catalog';}
      else {assert.equal(q.method,'POST');assert.equal(q.url,'/v1/responses');const event=frameFor(JSON.parse(raw));row.event=event;
        r.writeHead(200,{'Content-Type':'text/event-stream'});r.end(`event: response.completed\ndata: ${JSON.stringify(event)}\n\n`);row.kind='sdk';}
    }catch(e){row.error=String(e);r.writeHead(500);r.end(JSON.stringify({error:{message:String(e)}}));}finally{write('provider-wires.json',wires);}
  });await new Promise(resolve=>server.listen(18991,'127.0.0.1',resolve));
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
    const strays = fs.readdirSync('/proc').filter(n => /^\d+$/.test(n)).map(processIdentity).filter(row => row && path.basename(row.exe) === 'unchain-server');
    for (const row of strays) { try { process.kill(row.pid, 'SIGKILL'); } catch { /* gone */ } }
    held.record.stray_sidecars_reaped = strays;
    held.record.stopped_ns = process.hrtime.bigint().toString();
    held.record.all_owned_dead = [...held.owned.values()].every(identity => { const alive = processIdentity(identity.pid); return !alive || alive.start_ticks !== identity.start_ticks; });
    assert.equal(held.record.all_owned_dead, true); held.record.processes = [...held.owned.values()];
    write('process-generations.json', generations); current = null;
  }
  async function launch() {
    const debug = 19220 + generations.length;
    const generation = generations.length + 1;
    const logFd = fs.openSync(path.join(out, `app-${generation}.log`), 'a');
    const child = spawn(app, [`--remote-debugging-port=${debug}`, `--user-data-dir=${userData}`, '--password-store=gnome-libsecret'], {
      detached: true, env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local/share'),
        XDG_CACHE_HOME: path.join(home, '.cache'), PUPU_E2E: '1', PUPU_COMPUTER_USE: '0', UNCHAIN_MODEL: 'environment-decoy-473', OLLAMA_HOST: 'http://127.0.0.1:18992' },
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
    await page.waitForLoadState('domcontentloaded'); await page.evaluate(installRecorder);
    const startup = createStartupWatch({ page, generation, out, write, mark, sleep });
    const gate = page.getByRole('button', { name: 'Click anywhere to start' });
    await expect(gate).toBeVisible({ timeout: 120000 }); await gate.click();
    record.startup = await startup.settle();
    // Readiness is the product's own answer: getPendingInteraction throws "Miso service is not ready" until the sidecar is up.
    await until(() => page.evaluate(() => window.unchainAPI.getPendingInteraction({ session_id: 'qa473-readiness-probe' }).then(() => true, () => false)), 180000);
    collect();
    record.ready_ns = process.hrtime.bigint().toString(); record.processes_at_ready = [...owned.values()];
    record.sidecar_owned = [...owned.values()].some(row => path.basename(row.exe) === 'unchain-server');
    assert.ok(owned.size > 1, 'ownership walk found no descendants of the Electron main process');
    assert.equal(record.sidecar_owned, true, 'sidecar is not a tracked descendant of the Electron main process');
    record.proc_table_at_ready = fs.readdirSync('/proc').filter(n => /^\d+$/.test(n)).map(processIdentity).filter(Boolean)
      .map(row => ({ ...row, cmdline: (() => { try { return fs.readFileSync(`/proc/${row.pid}/cmdline`, 'utf8').split('\0').join(' ').slice(0, 200); } catch { return ''; } })() }));
    write('process-generations.json', generations);
    return page;
  }
  const shot = async (page, name) => { await page.screenshot({ path: path.join(out, `${name}.png`) }).catch(() => {}); fs.writeFileSync(path.join(out, `${name}-aria.txt`), await page.locator('body').ariaSnapshot().catch(String)); };

  // ---- chat helpers (from the B4 lifecycle control) ----
  async function chatScope(page) {
    return page.evaluate(async () => {
      const chatId = window.chatStorageAPI.bootstrap().activeChatId;
      const messages = window.chatStorageAPI.readMessages(chatId);
      const recorded = [...messages].reverse().find(m => m.role === 'assistant' && typeof m.meta?.executionSessionId === 'string' && m.meta.executionSessionId);
      const session = recorded ? recorded.meta.executionSessionId : chatId;
      return { chatId, messages, session, pending: await window.unchainAPI.getPendingInteraction({ session_id: session }) };
    });
  }
  async function begin(page, name, text) {
    await page.getByRole('button', { name: 'New chat', exact: true }).click();
    await page.getByTestId('attach-agent-row').getByRole('combobox').click();
    await page.getByRole('listbox').getByText(name, { exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Message PuPu...', exact: true });
    await input.fill(text);
    await sendOnce({ page, input, label: name.toLowerCase().replaceAll(' ', '-') + '-' + Date.now(), out, mark, sleep, write });
  }
  async function openSidebarIfNeeded(page) {
    if (await page.getByRole('button', { name: 'Close sidebar', exact: true }).isVisible().catch(() => false)) return;
    const sidebar = page.getByRole('button', { name: 'Open sidebar', exact: true });
    const hit = await sidebar.evaluate(el => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); const t = h && h.closest('button');
      if (!t) return null; const b = t.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    assert.ok(hit, 'no button under the Open sidebar position'); await page.mouse.click(hit.x, hit.y);
    await expect(page.getByRole('button', { name: 'Close sidebar', exact: true })).toBeVisible();
  }
  async function openBuilder(page, agentName) {
    await openSidebarIfNeeded(page);
    const agents = page.getByRole('button', { name: 'Agents', exact: true });
    await until(() => agents.evaluate(el => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === el; }), 10000);
    await agents.click();
    await page.getByTestId('agent-explorer').getByText(agentName, { exact: true }).click();
    await expect(page.getByTestId('skeleton-resource-page')).toBeVisible();
  }
  async function closeBuilder(page) { await page.getByRole('button', { name: 'Close builder', exact: true }).click(); }

  const resources={},upgrades=[],chats=[];
  async function catalog(page){return page.evaluate(()=>window.unchainAPI.listSkeletonResources(false));}
  async function readResource(page,id){return page.evaluate(id=>window.unchainAPI.getManagedSkeletonResource(id),id);}
  async function snapshot(page,label){const list=await catalog(page);write(`resources-${label}.json`,list);return list;}
  async function chooseKernel(scope,page){const model=scope.getByTestId('kernel-model').getByRole('combobox');await model.click();await page.getByRole('listbox').getByText('openai · gpt-6-sol',{exact:true}).click();await scope.getByText('Keep',{exact:true}).locator('..').getByRole('textbox').fill('128');}
  async function acknowledge(wizard){const boxes=wizard.getByRole('checkbox');for(let i=0;i<await boxes.count();i++){const b=boxes.nth(i);const label=await b.getAttribute('aria-label');if(label==='Accept this Kernel projection'||label==='Discard unsupported toolkit settings'||label?.startsWith('Acknowledge '))await b.check();}}
  async function preview(wizard,page,label){for(let attempt=0;attempt<5;attempt++){
      await acknowledge(wizard); const button=wizard.getByRole('button',{name:/^Preview(?: again)?$/});await expect(button).toBeEnabled();await button.click();
      await until(async()=>['ready','previewed','prewrite_refused','unconfirmed'].includes(await wizard.getAttribute('data-phase')),30000);
      await shot(page,`${label}-preview-${attempt}`);if(await wizard.getAttribute('data-phase')==='previewed')return;
      const unaccepted=await wizard.getByRole('checkbox').evaluateAll(bs=>bs.filter(b=>!b.checked&&b.getAttribute('aria-label')?.startsWith('Acknowledge ')).map(b=>b.getAttribute('aria-label')));
      const problems=await wizard.getByTestId('legacy-upgrade-problems').innerText();
      assert(/legacy_prompt_review_required|legacy_setting_ignored|unused_choice|toolkit_choice_required|toolkit_config_review_required/.test(problems),`unexpected preview refusal: ${problems}`);
      mark('ui','review Host refusal and deliberately Preview again',{label,attempt,problems,unaccepted});
      const added=wizard.getByTestId('legacy-upgrade-slot-toolkit');for(let i=0;i<await added.count();i++){
        const slot=added.nth(i);mark('ui','keep exact legacy toolkit id',{label,id:await slot.getByPlaceholder('toolkit id').inputValue()});
        await slot.getByRole('button',{name:label==='Default'?'All tools':'Choose tools',exact:true}).click();
      }
    }throw new Error('preview never accepted');}
  async function upgrade(page,name,{configureFirst=false,oldConvert=false,structured=false,tools=false}={}){
    await openBuilder(page,name); const list=await catalog(page);const rows=list.resources||list;assert(Array.isArray(rows),'resource list shape');const row=rows.find(r=>r.name===name);assert(row,`missing migrated ${name}`);resources[name]=row.id;
    const before=await readResource(page,row.id);write(`${name.replaceAll(' ','-')}-before.json`,before);
    if(configureFirst){const agents=before.resource.document.nodes.filter(n=>n.type==='agent');assert.equal(agents.length,1);await page.getByTestId(`skeleton-node-${agents[0].id}`).click();await chooseKernel(page.getByTestId('skeleton-kernel'),page);await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByTestId('skeleton-save-state')).toHaveText('Saved');}
    if(oldConvert){const pool=before.resource.document.nodes.find(n=>n.type==='subagent_pool');await page.getByTestId(`skeleton-node-${pool.id}`).click();await page.getByRole('button',{name:'Convert to Agent entries',exact:true}).click();}
    else await page.getByTestId('skeleton-legacy-upgrade-open').click();
    const wizard=page.getByTestId('legacy-upgrade-wizard');await expect(wizard).toBeVisible();await until(async()=>await wizard.getAttribute('data-phase')==='ready');
    const kernels=wizard.getByTestId('legacy-upgrade-slot-kernel');for(let i=0;i<await kernels.count();i++){const slot=kernels.nth(i);await chooseKernel(slot,page);await slot.getByRole('combobox').filter({hasText:'Preserve the legacy model'}).click();await page.getByRole('listbox').getByText("Replace with this Kernel's model",{exact:true}).click();mark('ui','explicit legacy model replacement',{name,model:'gpt-6-sol',reply_budget:128});}
    const toolkits=wizard.getByTestId('legacy-upgrade-slot-toolkit');for(let i=0;i<await toolkits.count();i++){const slot=toolkits.nth(i);mark('ui','keep exact legacy toolkit id',{name,id:await slot.getByPlaceholder('toolkit id').inputValue()});if(!tools)await slot.getByRole('button',{name:name==='Default'?'All tools':'Choose tools',exact:true}).click();}
    await acknowledge(wizard);
    if(tools){await wizard.getByRole('checkbox',{name:'write',exact:true}).check();await preview(wizard,page,'tools-keeps-missing-name');const missing=wizard.getByRole('checkbox',{name:'qa473_missing_tool',exact:true});await expect(missing).toBeChecked();await missing.click();await expect(missing).toHaveCount(0);mark('ui','remove missing tool explicitly; row disappears after deselection');}
    if(structured){await preview(wizard,page,'structured-preserve');const combo=kernels.first().getByRole('combobox').filter({hasText:'Preserve the legacy prompt'});await combo.click();await page.getByRole('listbox').getByText('Replace with the built-in prompt',{exact:true}).click();}
    await preview(wizard,page,name.replaceAll(' ','-'));const reviewed=await wizard.getByTestId('legacy-upgrade-preview').innerText();mark('ui','explicit Upgrade',{name,reviewed});
    await wizard.getByTestId('legacy-upgrade-apply').click();await expect(wizard).toHaveCount(0,{timeout:45000});await expect(page.getByTestId('skeleton-save-state')).toHaveText('Saved');
    const saved=await readResource(page,row.id);assert(!saved.resource.document.nodes.some(n=>n.config?.legacy_source),'legacy node remains');write(`${name.replaceAll(' ','-')}-saved.json`,saved);
    upgrades.push({name,id:row.id,before,saved,reviewed});write('upgrades.json',upgrades);await shot(page,`${name.replaceAll(' ','-')}-upgraded`);await closeBuilder(page);return saved;
  }
  async function runChat(page,name,kind,turn=1,newChat=true){if(newChat)await begin(page,name,`QA473_RUN_${kind}_T${turn}`);else{const input=page.getByRole('textbox',{name:'Message PuPu...',exact:true});await input.fill(`QA473_RUN_${kind}_T${turn}`);await sendOnce({page,input,label:`${kind}-${turn}`,out,mark,sleep,write});}
    await expect(page.getByText(`QA473 done ${kind} ${turn}`,{exact:true}).last()).toBeVisible({timeout:120000});const scope=await chatScope(page);chats.push({name,kind,turn,...scope});write('chats.json',chats);await shot(page,`chat-${kind}-${turn}`);return scope;}
  try {
    write('fixture-controls.json',controls());
    const iso=await execAsync(process.env.QA_PYTHON,['-I','-B',path.join(__dirname,'isolation_probe.py'),out,'QA473_OWNED_NONCE'],{env:process.env});fs.writeFileSync(path.join(out,'isolation-probe.log'),iso.stdout+iso.stderr);
    const qual=await execAsync(process.env.QA_PYTHON,['-I','-B',path.join(__dirname,'qualify_sdk.py')],{env:process.env});fs.writeFileSync(path.join(out,'sdk-qualification.json'),qual.stdout);
    const originals=path.join(home,'.pupu/agent_recipes');fs.mkdirSync(originals,{recursive:true});for(const [file,doc]of Object.entries(SEEDS))fs.writeFileSync(path.join(originals,file),JSON.stringify(doc,null,2)+'\n');
    const sha=require('node:crypto');const hashes=()=>Object.fromEntries(fs.readdirSync(originals).filter(n=>n.startsWith('QA473')).map(n=>[n,sha.createHash('sha256').update(fs.readFileSync(path.join(originals,n))).digest('hex')]));const originalHashes=hashes();write('legacy-originals-before.json',originalHashes);
    let page=await launch();
    const cred=await page.evaluate(key=>window.settingsStorageAPI.setProviderCredential('provider','openai',key),KEY);write('sentinel-credential-status.json',cred);mark('fixture','write-only synthetic OpenAI credential, never read');
    await snapshot(page,'initial');write('real-toolkit-catalog.json',await page.evaluate(()=>window.unchainAPI.listToolModalCatalog({strict:true})));
    await openSidebarIfNeeded(page);await page.getByRole('button',{name:'Workspaces',exact:true}).click();
    const rootInput=page.getByRole('textbox',{name:'default-workspace-root',exact:true});await rootInput.fill(workspace);await rootInput.press('Enter');await expect(page.getByText('Saved.',{exact:true})).toBeVisible();await rootInput.press('Escape');await expect(rootInput).toHaveCount(0);mark('ui','authorize only the private QA workspace');
    await page.getByRole('button',{name:'New chat',exact:true}).click();await page.getByTestId('attach-agent-row').getByRole('combobox').click();await page.getByRole('listbox').getByText('QA473 Flat',{exact:true}).click();write('old-chat-selection-before-upgrade.json',await page.evaluate(()=>window.chatStorageAPI.bootstrap()));mark('ui','legacy name selected before upgrade, not sent yet');
    for(const name of ['Explore','Default','QA473 Flat','QA473 Structured','QA473 Tools','QA473 Child'])await upgrade(page,name,{structured:name==='QA473 Structured',tools:name==='QA473 Tools'});
    // Owned old graph starts with authored Kernel controls, then the zero-choice/native inventory and the old Convert route.
    // The separately reproduced v2-save -> inventory 409 is blocking. Run independent direct-upgrade paths first; reproduce that failure LAST, never count it as passed.
    await upgrade(page,'QA473 Parent');
    await upgrade(page,'QA473 Native',{configureFirst:true,oldConvert:true});
    await runChat(page,'QA473 Flat','Flat',1,false);await runChat(page,'Default','Default');
    const hot=await snapshot(page,'hot');const hotResources={};for(const [name,id]of Object.entries(resources))hotResources[name]=await readResource(page,id);write('hot-resources.json',hotResources);
    mark('supervisor','cold restart');await stop();page=await launch();const cold=await snapshot(page,'cold');assert.deepEqual(cold,hot,'cold catalog changed');const coldResources={};for(const[name,id]of Object.entries(resources))coldResources[name]=await readResource(page,id);assert.deepEqual(coldResources,hotResources,'cold resource changed');write('cold-resources.json',coldResources);
    await expect(page.getByText('QA473 done Default 1',{exact:true}).last()).toBeVisible();const coldDefault=await chatScope(page);assert.deepEqual(coldDefault.messages,chats.at(-1).messages,'cold Default messages changed');write('cold-default-chat.json',coldDefault);
    await openSidebarIfNeeded(page);await page.getByText('QA473_RUN_Flat_T1',{exact:true}).click();const coldOld=await chatScope(page);assert.equal(coldOld.chatId,chats[0].chatId);assert.deepEqual(coldOld.messages,chats[0].messages,'cold old-reference messages changed');write('cold-old-chat.json',coldOld);
    await runChat(page,'QA473 Flat','Flat',2,false);assert.deepEqual(hashes(),originalHashes,'legacy originals changed');write('legacy-originals-after.json',hashes());
    assert.deepEqual(errors,[]);assert(wires.every(w=>!w.error),'fixture refused a request');assert(canaries.every(c=>!c.hits.length),'forbidden service was reached');
    await runChat(page,'QA473 Parent','Parent');
    await runChat(page,'QA473 Native','Native');
    assert.deepEqual(hashes(),originalHashes,'legacy originals changed after delegated runs');
    assert.deepEqual(errors,[]);assert(wires.every(w=>!w.error),'fixture refused a request');
    assert(canaries.every(c=>!c.hits.length),'forbidden service was reached');
    const childRequests=wires.filter(w=>{try{return (JSON.parse(w.request_text).input||[]).some(item=>item.role==='user'&&JSON.stringify(item.content).includes('QA473_CHILD_TASK'));}catch{return false;}});
    assert.equal(childRequests.length,1,'exactly one child model request');
    const settled=wires.flatMap(w=>{try{return JSON.parse(w.request_text).input||[];}catch{return [];}}).filter(item=>item.type==='function_call_output'&&item.call_id==='call_473_delegate').map(item=>{const p=JSON.parse(item.output);return JSON.parse(p.preview);});
    assert(settled.length>0&&settled.every(s=>s.status==='completed'&&s.template_name==='QA473 Child'),'committed child completion required');
    write('delegate-success.json',{settlements:settled,child_model_calls:childRequests.length,scope:await chatScope(page)});
    write('direct-result.json',{verdict:'APP_473_DIRECT_PATHS_RECORDED',tree:process.env.QA_CANDIDATE_TREE,upgrades:upgrades.map(u=>u.name),provider_requests:wires.filter(w=>w.kind==='sdk').length,real_provider_requests:0,product_renderer_sandbox:false,repaired_blockers:['R-473-APP-01','R-473-APP-02']});
  } finally {
    if(current?.page)await shot(current.page,'last-window');await stop();
    write('blocked-service-canaries.json',canaries.map(({port,hits})=>({port,hits})));assert(canaries.every(c=>!c.hits.length),'forbidden canary hit');
    await Promise.all([server,nonce,...canaries.map(c=>c.listener)].map(s=>new Promise(resolve=>s.close(resolve))));
    write('ledger.json',ledger);write('provider-wires.json',wires);write('errors.json',errors);write('process-generations.json',generations);write('renderer-console.json',consoleLines);
    const store=path.join(home,'.pupu');if(fs.existsSync(store))fs.cpSync(store,path.join(out,'state'),{recursive:true});
    const databases=[];const walk=(dir)=>{for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory()&&!['GPUCache','Code Cache','node_modules'].includes(item.name))walk(file);else if(item.isFile()&&item.name==='context_v2.sqlite3')databases.push(file);}};for(const dir of [home,workspace,path.join(out,'tmp')])if(fs.existsSync(dir))walk(dir);
    for(const [i,db]of databases.entries())fs.cpSync(path.dirname(db),path.join(out,'journal-state',String(i)),{recursive:true,filter:src=>{const s=fs.lstatSync(src);return s.isFile()||s.isDirectory();}});write('journal-copies.json',databases.map((db,i)=>({source:db,copy:`journal-state/${i}`}))); 
  }
}
main().catch(error=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'failure.txt'),String(error.stack||error));process.exitCode=1;});
