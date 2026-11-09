/* QA-only (#448): packaged Linux App, loopback only, strict fake provider.
 * Store seeding uses the real v2 bridge (disclosed); every chat action is a real
 * GUI action; every observation is read both from the page and from the real
 * bridge/HTTP response, and bound to the Journal afterwards (verify_app_448.py).
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
const {createFixture,controls,KEY,GOAL,PROGRESS,pattern}=require('./fixture_448.cjs');

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
const fixture=createFixture(workspace), frameFor=fixture.frameFor;
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
      else {assert.equal(q.method,'POST');assert.equal(q.url,'/v1/responses');const event=frameFor(JSON.parse(raw));row.event=event;write('fixture-state.json',fixture.state);
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
        XDG_CACHE_HOME: path.join(home, '.cache'), PUPU_E2E: '1', PUPU_COMPUTER_USE: '0', UNCHAIN_MODEL: 'environment-decoy-448', OLLAMA_HOST: 'qa448-disabled://no-service' },
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


  const chats=[];
  async function allEvents(page, scope, label) {
    const pages=[];let after;
    for(let i=0;i<100;i++) {
      const payload={ownerChatId:scope.chatId,sessionId:scope.session,limit:100,includePayload:true,...(after?{after}:{})};
      const response=await page.evaluate(payload=>window.contextV2API.listEvents(payload),payload);
      pages.push({payload,response});
      if(!response.has_more){write(label,pages);return pages;}
      assert(response.next_after,'events_next_cursor');after=response.next_after;
    }throw new Error('event pagination exceeded explicit cap');
  }
  async function sendText(page,text,label) {
    const input=page.getByRole('textbox',{name:'Message PuPu...',exact:true});await input.fill(text);
    await sendOnce({page,input,label,out,mark,sleep,write});
  }
  async function waitReply(page,text,label) {
    await expect(page.getByText(text,{exact:true}).last()).toBeVisible({timeout:300000});
    const input=page.getByRole('textbox',{name:'Message PuPu...',exact:true});
    await until(async()=>await input.inputValue()==='',10000);
    const scope=await chatScope(page);assert.equal(scope.pending.status,'none');write(label,scope);chats.push(scope);return scope;
  }
  try {
    write('fixture-negative-controls.json',controls());
    const iso=await execAsync(process.env.QA_PYTHON,['-I','-B',path.join(__dirname,'isolation_probe.py'),out,'QA473_OWNED_NONCE'],{env:process.env});fs.writeFileSync(path.join(out,'isolation-probe.log'),iso.stdout+iso.stderr);
    const qual=await execAsync(process.env.QA_PYTHON,['-I','-B',path.join(__dirname,'qualify_sdk.py')],{env:process.env});fs.writeFileSync(path.join(out,'sdk-qualification.json'),qual.stdout);
    const evidence=Array.from({length:8},(_,i)=>pattern(i)).join('\n')+'\n';fs.writeFileSync(path.join(workspace,'evidence.txt'),evidence);
    const crypto=require('node:crypto'),workspaceDigest=()=>crypto.createHash('sha256').update(fs.readFileSync(path.join(workspace,'evidence.txt'))).digest('hex');const originalWorkspace=workspaceDigest();
    let page=await launch();
    const cred=await page.evaluate(key=>window.settingsStorageAPI.setProviderCredential('provider','openai',key),KEY);write('sentinel-credential-status.json',cred);assert.equal(cred.status,'stored');mark('fixture','write-only synthetic OpenAI credential, followed by full setup restart before model selection');
    await stop();page=await launch();
    const presence=await page.evaluate(()=>{const s=window.settingsStorageAPI.bootstrap();return {available:s.available,configuredCredentials:s.configuredCredentials,secretStorageStatus:s.secretStorageStatus};});write('credential-presence-after-restart.json',presence);assert(presence.configuredCredentials.includes('openai'),'stored_credential_not_present_after_restart');
    await openSidebarIfNeeded(page);await page.getByRole('button',{name:'Workspaces',exact:true}).click();
    const rootInput=page.getByRole('textbox',{name:'default-workspace-root',exact:true});await rootInput.fill(workspace);await rootInput.press('Enter');await expect(page.getByText('Saved.',{exact:true})).toBeVisible();await rootInput.press('Escape');await expect(rootInput).toHaveCount(0);mark('ui','authorize only private QA workspace');
    await page.getByRole('button',{name:'New chat',exact:true}).click();
    const model=page.locator('[data-testid="attach-row"] [role="combobox"]:not([data-testid="attach-agent-row"] [role="combobox"])');await expect(model).toHaveCount(1,{timeout:30000});write('model-before.json',{text:await model.innerText()});await model.click();
    const search=page.getByPlaceholder(/^Search models/);await search.fill('gpt-6-sol');
    await page.getByRole('listbox').getByText('gpt-6-sol',{exact:true}).click();
    await page.getByRole('textbox',{name:'Message PuPu...',exact:true}).click();
    write('plain-chat-before.json',await page.evaluate(()=>window.chatStorageAPI.bootstrap()));
    await sendText(page,GOAL+'\n'+PROGRESS,'448-long-turn');
    const hot=await waitReply(page,'QA448_DONE_T1','hot-chat.json');
    assert.equal(fixture.state.long,10,'long_request_count');assert(fixture.state.hot_page,'official_hot_page_missing');
    await allEvents(page,hot,'hot-events.json');await shot(page,'hot-complete');
    assert.equal(workspaceDigest(),originalWorkspace,'readonly_workload_changed');
    mark('supervisor','cold restart after completed long turn');await stop();page=await launch();
    const cold=await chatScope(page);assert.equal(cold.chatId,hot.chatId);assert.deepEqual(cold.messages,hot.messages,'cold_chat_bytes_changed');write('cold-chat.json',cold);
    await allEvents(page,cold,'cold-events.json');await expect(page.getByText('QA448_DONE_T1',{exact:true}).last()).toBeVisible();
    await sendText(page,'QA448_FOLLOWUP_2: recover the original first arguments and result; continue the same task.','448-cold-followup');
    await waitReply(page,'QA448_DONE_T2','followup-2-chat.json');
    assert(fixture.state.result_page,'official_cold_result_missing');
    await sendText(page,'QA448_FOLLOWUP_3: what remains for the original task?','448-third-turn');
    const third=await waitReply(page,'QA448_DONE_T3','followup-3-chat.json');await allEvents(page,third,'final-events.json');
    assert.equal(workspaceDigest(),originalWorkspace,'workspace_original_changed');assert.deepEqual(fs.readdirSync(workspace),['evidence.txt'],'unexpected_workspace_write');
    write('workspace-proof.json',{sha256:originalWorkspace,unchanged:true,files:fs.readdirSync(workspace),bytes:Buffer.byteLength(evidence)});
    assert.equal(fixture.state.qualification,1);assert.equal(fixture.state.third,1);assert.deepEqual(errors,[]);assert(wires.every(w=>!w.error),'fixture_refusal');
    write('fixture-state.json',fixture.state);write('direct-result.json',{verdict:'APP_448_PATHS_RECORDED',tree:process.env.QA_CANDIDATE_TREE,normal_requests:fixture.state.requests.filter(r=>r.stage!=='qualification').length,real_provider_requests:0,product_renderer_sandbox:false,chat:third.chatId});
  } finally {
    if(current?.page)await shot(current.page,'last-window');await stop();
    write('blocked-service-canaries.json',canaries.map(({port,hits})=>({port,hits})));assert(canaries.every(c=>!c.hits.length),'forbidden canary hit');
    await Promise.all([server,nonce,...canaries.map(c=>c.listener)].map(s=>new Promise(resolve=>s.close(resolve))));
    write('ledger.json',ledger);write('provider-wires.json',wires);write('errors.json',errors);write('process-generations.json',generations);write('renderer-console.json',consoleLines);
    write('fixture-state.json',fixture.state);
    const databases=[];const walk=(dir)=>{for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory()&&!['GPUCache','Code Cache','node_modules'].includes(item.name))walk(file);else if(item.isFile()&&item.name==='context_v2.sqlite3')databases.push(file);}};for(const dir of [home,workspace,path.join(out,'tmp')])if(fs.existsSync(dir))walk(dir);
    for(const [i,db]of databases.entries())fs.cpSync(path.dirname(db),path.join(out,'journal-state',String(i)),{recursive:true,filter:src=>{const s=fs.lstatSync(src);return s.isFile()||s.isDirectory();}});write('journal-copies.json',databases.map((db,i)=>({source:db,copy:`journal-state/${i}`})));
  }
}
main().catch(error=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'failure.txt'),String(error.stack||error));process.exitCode=1;});
