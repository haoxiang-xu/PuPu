/* QA only. NOT_RUN until hosted execution. Seed bridge is disclosed;
   all editor/Settings actions use physical CDP keyboard/mouse. No model calls. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const http=require('node:http'),https=require('node:https'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),{createRequire}=require('node:module');
const {createStartupWatch}=require('./app_first_run.cjs');
const candidate=path.resolve(process.env.QA_CANDIDATE_ROOT), requireCandidate=createRequire(path.join(candidate,'package.json'));
const {chromium}=requireCandidate('playwright'),{expect}=requireCandidate('@playwright/test');
const out=path.resolve(process.env.QA_OUT),app=path.resolve(process.env.QA_APP);
const home=path.join(out,'home'),userData=path.join(home,'profile'),workspace=path.join(out,'workspace');
const ledger=[],wires=[],generations=[],errors=[],consoleLines=[],cells=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
const mark=(kind,action,data={})=>ledger.push({at_ns:process.hrtime.bigint().toString(),wall_ms:Date.now(),kind,action,...data});
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'seed.json')));
const catalogs=Object.fromEntries(['en','zh-CN','de'].map(l=>[l,JSON.parse(fs.readFileSync(path.join(candidate,'src/locales',l+'.json')))]));
const text=(locale,key)=>key.split('.').reduce((o,k)=>o?.[k],catalogs[locale]);
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
 fs.mkdirSync(home,{recursive:true});fs.mkdirSync(workspace,{recursive:true});let current=null;
 const canaries=[];
 for(const port of [11434,18992]){const hits=[];const listener=http.createServer((q,r)=>{hits.push(q.url);r.end('FORBIDDEN');});listener.on('connection',()=>hits.push('connection'));await new Promise(r=>listener.listen(port,'127.0.0.1',r));canaries.push({port,hits,listener});}
 const nonce=http.createServer((q,r)=>r.end('QA473_OWNED_NONCE'));await new Promise(r=>nonce.listen(18990,'127.0.0.1',r));
 const server=https.createServer({key:fs.readFileSync(path.join(out,'certs/key.pem')),cert:fs.readFileSync(path.join(out,'certs/cert.pem'))},async(q,r)=>{const chunks=[];for await(const c of q)chunks.push(c);wires.push({method:q.method,url:q.url,at_ms:Date.now(),body:Buffer.concat(chunks).toString()});write('provider-wires.json',wires);r.writeHead(403);r.end('QA212: provider access forbidden');});await new Promise(r=>server.listen(18991,'127.0.0.1',r));
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
        XDG_CACHE_HOME: path.join(home, '.cache'), PUPU_E2E: '1', PUPU_COMPUTER_USE: '0', UNCHAIN_MODEL: 'qa212-unused', OLLAMA_HOST: 'qa212-disabled://no-service' },
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
    const gate = page.getByRole('button', { name: text(locale,'boot.click_to_start') });
    await expect(gate).toBeVisible({ timeout: 120000 }); await gate.click();
    record.startup = await startup.settle();
    // Readiness is the product's own answer: getPendingInteraction throws "Miso service is not ready" until the sidecar is up.
    await until(() => page.evaluate(() => window.unchainAPI.getPendingInteraction({ session_id: 'qa473-readiness-probe' }).then(() => true, () => false)), 180000);
    collect();
    record.ready_ns = process.hrtime.bigint().toString(); record.processes_at_ready = [...owned.values()];
    record.sidecar_owned = [...owned.values()].some(row => path.basename(row.exe) === 'unchain-server');
    assert.ok(owned.size > 1, 'ownership walk found no descendants of the Electron main process');
    assert.equal(record.sidecar_owned, true, 'sidecar is not a tracked descendant of the Electron main process');
    const sidecars=[...owned.values()].filter(row=>path.basename(row.exe)==='unchain-server'&&processIdentity(row.pid)?.start_ticks===row.start_ticks);assert(sidecars.length>0,'packaged sidecar required');
    record.sidecars=sidecars.map(row=>({...row,sha256:sha(fs.readFileSync('/proc/'+row.pid+'/exe'))}));
    for(const row of record.sidecars){assert.equal(row.sha256,process.env.QA_BINARY_SHA,'running sidecar differs from fixed pair');assert(row.exe.startsWith(path.dirname(app)+path.sep),'sidecar is outside packaged App');}
    // PyInstaller onefile has a bootloader parent and its server child.
    const leaves=record.sidecars.filter(row=>!record.sidecars.some(other=>other.parent===row.pid));assert.equal(leaves.length,1,'one serving sidecar leaf required');record.sidecar=leaves[0];record.home=home;record.profile=userData;
    record.proc_table_at_ready = fs.readdirSync('/proc').filter(n => /^\d+$/.test(n)).map(processIdentity).filter(Boolean)
      .map(row => ({ ...row, cmdline: (() => { try { return fs.readFileSync(`/proc/${row.pid}/cmdline`, 'utf8').split('\0').join(' ').slice(0, 200); } catch { return ''; } })() }));
    write('process-generations.json', generations);
    return page;
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
  const read=page=>page.evaluate(id=>window.unchainAPI.getManagedSkeletonResource(id),seed.document.id);
  let locale='en';
  async function shot(page,name){await page.screenshot({path:path.join(out,name+'.png')});fs.writeFileSync(path.join(out,name+'.aria.txt'),await page.locator('body').ariaSnapshot());}
  async function settingsViaTab(page,input){
    const ordinary=page.getByTestId('code-limits').locator('input').first();await expect(ordinary).toBeVisible();await ordinary.click();const trace=[];
    for(let n=0;n<300;n++){
      await page.keyboard.press('Tab');
      const active=await page.evaluate(()=>{const e=document.activeElement;return {tag:e?.tagName,role:e?.getAttribute('role'),text:e?.textContent,aria:e?.getAttribute('aria-label')};});trace.push(active);
      if((active.tag==='BUTTON'||active.role==='button')&&(active.text?.trim()===text(locale,'side_menu.settings')||active.aria===text(locale,'side_menu.settings'))){
        write('tab-route-'+ledger.length+'.json',trace);await page.keyboard.press('Enter');await expect(page.getByRole('button',{name:'Close settings',exact:true})).toBeVisible();return;
      }
    }
    write('unreachable-settings-tab-route.json',trace);throw new Error('Settings not reachable via real Tab; no hot-switch fallback allowed');
  }
  async function appearance(page,input,nextLocale,theme){
    const before=await read(page);mark('locale-start','locale-only interval',{locale,nextLocale,theme});
    await settingsViaTab(page,input);
    // Settings opens on Appearance by default. The two Select controls are the native theme/language primitives.
    const settings=page.getByRole('dialog').filter({has:page.getByRole('button',{name:'Close settings',exact:true})});await expect(settings).toHaveCount(1);
    const combos=settings.getByRole('combobox');
    const language=combos.filter({hasText:/English|简体中文|Deutsch/});await expect(language).toHaveCount(1);
    async function choose(combo,label){const listId=await combo.getAttribute('aria-controls');assert(listId);await combo.click();const list=page.locator('[id='+JSON.stringify(listId)+']');await expect(list).toHaveAttribute('role','listbox');await list.getByText(label,{exact:true}).click();}
    await choose(language,{'en':'English','zh-CN':'简体中文','de':'Deutsch'}[nextLocale]);locale=nextLocale;
    const labels=['light','dark','system'].map(value=>text(locale,'appearance.theme_'+value));
    const themeChoices=[];for(const combo of await combos.all())if(labels.includes((await combo.textContent()).trim()))themeChoices.push(combo);assert.equal(themeChoices.length,1,'unique Settings theme choice');
    await choose(themeChoices[0],text(locale,'appearance.theme_'+theme));
    await page.getByRole('button',{name:'Close settings',exact:true}).click();
    const after=await read(page);assert.deepEqual(after,before,'locale silently saved resource or changed raw author data');
    mark('locale-end','locale-only interval',{locale,theme,before,after});
  }
  async function selectNode(page,node){
    // Use the product's real Find node gesture: distant/covered canvas nodes
    // cannot be made clickable by DOM scrolling or a forced click.
    await page.keyboard.press('Control+f');
    const finder=page.getByTestId('recipe-node-palette');await expect(finder).toBeVisible();
    await finder.getByRole('textbox',{name:text(locale,'agents.palette.find'),exact:true}).fill(node);
    await finder.getByTestId('palette-node-'+node).click();await expect(finder).not.toBeVisible();
    mark('ui','Find node',{node,locale});
  }
  async function width(page,which){
    const handle=page.getByTestId('skeleton-detail-resize-handle');const b=await handle.boundingBox();assert(b);
    const shellLocator=page.getByTestId('skeleton-detail-panel-shell');const old=await shellLocator.boundingBox();assert(old);
    // recipes_page's ResizeObserver measures the parent of skeleton-workspace.
    const frame=await page.getByTestId('skeleton-workspace').locator('..').boundingBox();assert(frame);
    const expected=which==='min'?300:Math.max(300,Math.round(frame.width*0.5));
    const cssWidth=await shellLocator.evaluate(e=>parseFloat(getComputedStyle(e).width));
    const start={x:b.x+b.width/2,y:b.y+b.height/2};const destination=start.x+cssWidth-expected+(which==='min'?12:-12);
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(destination,start.y,{steps:20});await page.mouse.up();
    await until(async()=>Math.abs(await shellLocator.evaluate(e=>parseFloat(getComputedStyle(e).width))-expected)<1,5000);
    const shell=await shellLocator.boundingBox();assert(shell);assert(Math.abs(shell.width-(expected+2))<2,'actual bordered bound mismatch');return {...shell,frame,expected_css_width:expected};
  }
  async function panelCell(page,node,panel,theme,bound){
    await selectNode(page,node);await expect(page.getByTestId(panel)).toBeVisible();
    if(panel==='hooks-pool-section'){const edit=page.getByTestId('hook-row-0').getByRole('button',{name:text(locale,'agents.hooks.edit_hook').replace('{index}','1'),exact:true});if(await edit.isVisible().catch(()=>false))await edit.click();await expect(page.getByTestId('hook-0-editor')).toBeVisible();}
    const shell=await width(page,bound);
    const labelKey=panel==='code-section'?'agents.execution.code.runtime':panel==='workflow-call-section'?'agents.workflow.no_workflows':'agents.hooks.add_hook';
    const expectedLabel=text(locale,labelKey);const ownedLabel=panel==='hooks-pool-section'?page.getByTestId(panel).getByRole('button',{name:expectedLabel,exact:true}):page.getByTestId(panel).getByText(expectedLabel,{exact:true});await expect(ownedLabel).toBeVisible();const actualLabel=await ownedLabel.textContent();assert.equal(actualLabel,expectedLabel,'owned panel label did not change locale');
    const label=[panel,locale,theme,bound].join('-');await shot(page,label);
    const geometry=await page.getByTestId('recipe-detail-panel').evaluate(el=>({scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,text:el.innerText,controls:[...el.querySelectorAll('button,input,textarea,[role=combobox]')].map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,text:e.textContent,aria:e.getAttribute('aria-label'),width:r.width,height:r.height,visible:r.width>0&&r.height>0};})}));
    assert(geometry.clientWidth>0);assert(geometry.controls.some(c=>c.visible));
    // Overflow is evidence, never hidden by a QA CSS override. Code textareas may scroll by design.
    const clipping=await page.getByTestId('recipe-detail-panel').evaluate(root=>{const panel=root.getBoundingClientRect();const bad=[];for(const e of root.querySelectorAll('button,[role=combobox],label,h1,h2,h3,h4')){const r=e.getBoundingClientRect();if(!r.width||!r.height)continue;const style=getComputedStyle(e);if(r.left<panel.left-2||r.right>panel.right+2||((e.scrollWidth>e.clientWidth+2)&&style.textOverflow!=='ellipsis'))bad.push({text:e.textContent,aria:e.getAttribute('aria-label'),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,left:r.left,right:r.right});}return bad;});
    write(label+'-clipping.json',clipping);assert.deepEqual(clipping,[],'translated visible controls clip horizontally');cells.push({panel,node,locale,theme,bound,shell,geometry,label_probe:{key:labelKey,expected:expectedLabel,actual:actualLabel},screenshot:label+'.png',aria:label+'.aria.txt'});write('cells.json',cells);
  }
  try{
    const execProbe=require('node:util').promisify(require('node:child_process').execFile);await execProbe(process.env.QA_PYTHON,['-I','-B',path.join(__dirname,'isolation_probe.py'),out,'QA473_OWNED_NONCE']);
    let page=await launch();write('seed-edit.json',seed);
    // Only setup mutation through a bridge. No credentials or provider configured.
    const seeded=await page.evaluate(edit=>window.unchainAPI.saveManagedSkeletonResource(edit),seed);write('seeded-resource.json',seeded);
    assert.equal(seeded.schema,'pupu.skeleton-resource.v2');await openBuilder(page,seed.document.name);
    await selectNode(page,'score');
    const code=page.getByTestId('code-text-editor').getByRole('textbox');await expect(code).toBeVisible();
    const author=seed.managed_sources[0].text+'\n# QA212 explicit GUI edit résumé 中文 Deutsch\n';await code.fill(author);
    const identity=await code.elementHandle();assert(identity);const dirtyBefore=await code.inputValue();
    // Keep this exact DOM control alive while the actual Settings modal changes locale.
    for(const next of ['zh-CN','de','en']){await appearance(page,code,next,'light');assert.equal(await identity.evaluate(e=>e.isConnected),true,'dirty control remounted');assert.equal(await code.evaluate((e,held)=>e===held,identity),true,'dirty locator now points to replacement');assert.equal(await code.inputValue(),dirtyBefore,'dirty source lost');}
    write('hot-identity.json',{same_node_connected:true,dirty_text:dirtyBefore});
    const localeOnly=await read(page);assert.deepEqual(localeOnly,seeded);write('locale-only-resource.json',localeOnly);
    // Matrix uses real node clicks, Settings, and resize drag. Source remains dirty.
    for(const next of ['en','zh-CN','de'])for(const theme of ['light','dark']){
      await selectNode(page,'score');const input=page.getByTestId('code-text-editor').getByRole('textbox');await appearance(page,input,next,theme);
      for(const [node,panel] of [['score','code-section'],['qa212-workflow_call','workflow-call-section'],['qa212-hooks_pool','hooks-pool-section']])for(const bound of ['min','max'])await panelCell(page,node,panel,theme,bound);
    }
    await selectNode(page,'score');assert.equal(await page.getByTestId('code-text-editor').getByRole('textbox').inputValue(),author);
    mark('save-start','one explicit GUI Save');await page.getByTestId('skeleton-control-center').getByRole('button',{name:text(locale,'agents.save.save'),exact:true}).click();
    const saved=await until(async()=>{const r=await read(page);return r.resource.edit_token!==seeded.resource.edit_token&&r.contents.some(c=>c.text===author)?r:null;});write('saved-resource.json',saved);mark('save-end','one explicit GUI Save');
    assert.equal(saved.resource.document.id,seed.document.id);assert(saved.contents.some(c=>c.sha256===sha(author)),'saved source hash mismatch');assert.deepEqual(saved.resource.document.nodes[1].config.code.source,{kind:'file',path:'__pupu_code__/sha256/'+sha(author)+'.py'},'source path is not its content hash');
    // Graph must remain literal; only the managed source path changes with the GUI source edit.
    const expected=JSON.parse(JSON.stringify(seeded.resource.document));expected.nodes[1].config.code.source=saved.resource.document.nodes[1].config.code.source;assert.deepEqual(saved.resource.document,expected,'author prompt/node/id changed');
    await stop();page=await launch();const cold=await read(page);write('cold-resource.json',cold);assert.deepEqual(cold,saved,'cold read is not saved resource');
    // Sidebar and Agents are translated; use real localized names on cold launch.
    await openSidebarIfNeeded(page);await page.getByRole('button',{name:text(locale,'side_menu.agents'),exact:true}).click();await page.getByTestId('agent-explorer').getByText(seed.document.name,{exact:true}).click();
    await selectNode(page,'score');assert.equal(await page.getByTestId('code-text-editor').getByRole('textbox').inputValue(),author);await expect(page.getByTestId('code-runtime').getByText(text(locale,'agents.execution.code.runtime'),{exact:true})).toBeVisible();await shot(page,'cold-author');
    assert.deepEqual(errors,[]);assert.deepEqual(wires,[],'unexpected provider request');write('direct-result.json',{verdict:'RECORDED_NOT_VALIDATED',tree:process.env.QA_CANDIDATE_TREE,product_renderer_sandbox:false,model_requests:0,cells:cells.length,locale});
  }finally{
    if(current?.page)await shot(current.page,'last-window').catch(()=>{});await stop();
    write('ledger.json',ledger);write('provider-wires.json',wires);write('errors.json',errors);write('process-generations.json',generations);write('renderer-console.json',consoleLines);
    write('blocked-service-canaries.json',canaries.map(({port,hits})=>({port,hits})));await Promise.all([server,nonce,...canaries.map(c=>c.listener)].map(s=>new Promise(r=>s.close(r))));
    assert(canaries.every(c=>c.hits.length===0),'forbidden loopback canary hit');
    const databases=[];const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()&&!['GPUCache','Code Cache','node_modules'].includes(e.name))walk(p);else if(e.isFile()&&/\.(sqlite3?|db)$/.test(e.name))databases.push(p);}};walk(home);
    for(const [i,p]of databases.entries()){const dst=path.join(out,'db-'+i+'-'+path.basename(p));fs.copyFileSync(p,dst);for(const suffix of ['-wal','-shm'])if(fs.existsSync(p+suffix))fs.copyFileSync(p+suffix,dst+suffix);}write('database-copies.json',databases.map((p,i)=>({source:p,copy:'db-'+i+'-'+path.basename(p)})));
  }
}
main().catch(e=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'failure.txt'),e.stack||String(e));process.exitCode=1;});
