/* QA-only (#210 final directed Stop check): the retained, hash-verified sealed Linux App,
 * loopback only, strict fake provider. One App generation, one seed, two fresh chats:
 *   A (control): approval parks -> Stop once.
 *   B (target):  approval parks -> Builder -> View current chat run -> Back to editor -> Close builder -> Stop once.
 * Reads only, besides the disclosed Store seed and the real GUI actions. No force-click, no synthetic
 * events, no DOM/store mutation, no bridge cancel, no approve, no second Stop, no retry.
 * Helpers are the #210 round-9 driver's (app_control_210.cjs), copied unchanged where used. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawn } = require('child_process');
const { createStartupWatch } = require('./app_first_run.cjs');
const { installRecorder } = require('./enter_probe.cjs');
const { sendOnce, STOP_ICON } = require('./composer_send.cjs');

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
const OUTBOX_KEY = 'pupu.execution_cancel_outbox.v1';
const STOP_WAIT_MS = Number(process.env.QA_STOP_WAIT_MS || 60000); // bounded; expiry is retained as a failure
const ledger = [], wires = [], generations = [], errors = [], consoleLines = [], pageErrors = [], chats = [];
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const write = (name, data) => fs.writeFileSync(path.join(out, name), `${JSON.stringify(data, null, 2)}\n`);
const mark = (kind, action, data = {}) => ledger.push({ at_ns: process.hrtime.bigint().toString(), at_ms: Date.now(), kind, action, ...data });


function processIdentity(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const close = stat.lastIndexOf(')');
    const fields = stat.slice(close + 2).split(' ');
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

// ---- documents (same shapes as round 9; seeded through the real v2 bridge; disclosed) ----
const SENTINEL = 'qa210-stop-End';
function workflow() {
  return { schema_version: 1, kind: 'workflow', id: 'qa210-workflow', name: 'QA210 write workflow', nodes: [
    { id: 'start', type: 'start', config: { execution: { outputs: [{ name: 'path', source: { kind: 'result', path: ['path'] } }] } } },
    { id: 'write', type: 'tool_call', config: { tool: { name: 'write', on_error: 'stop', approval_timeout_ms: 600000 },
      execution: { inputs: [{ name: 'path', value: { kind: 'ref', node_id: 'start', path: ['path'] }, missing: 'error' },
        { name: 'content', value: { kind: 'literal', value: 'approved-exactly-once' }, missing: 'error' }], outputs: [] } } },
    { id: 'code', type: 'code', config: { code: { source: { kind: 'file', path: 'source.py' }, environment_profile_id: 'builtin',
      timeout_ms: 10000, max_result_bytes: 10000, max_log_bytes: 10000,
      result_schema: { type: 'object', properties: { receipt: { type: 'string' } }, required: ['receipt'], additionalProperties: false } },
      execution: { inputs: [], outputs: [{ name: 'receipt', source: { kind: 'result', path: ['receipt'] } }] } } },
    { id: 'end', type: 'end', config: { execution: { inputs: [{ name: 'receipt', value: { kind: 'ref', node_id: 'code', path: ['receipt'] }, missing: 'error' }],
      outputs: [{ name: 'receipt', source: { kind: 'input', path: ['receipt'] } }] } } },
  ], edges: [['start', 'write'], ['write', 'code'], ['code', 'end']].map(([a, b], i) => ({ id: `f${i}`, kind: 'flow',
    source_node_id: a, source_port_id: 'out', target_node_id: b, target_port_id: 'in' })) };
}
const codeSource = `def main(input,context):\n return {'receipt':'${SENTINEL}'}\n`;
function agentDoc(id, model, name) {
  const output = { name: 'message', source: { kind: 'result', path: ['message'] } };
  const input = (node) => ({ name: 'message', value: { kind: 'ref', node_id: node, path: ['message'] }, missing: 'error' });
  const document = { schema_version: 1, kind: 'agent', id, name, nodes: [
    { id: 'start', type: 'start', config: { execution: { outputs: [output] } } },
    { id: 'kernel', type: 'agent', config: { execution: { inputs: [input('start')], outputs: [output] }, kernel: {
      schema_version: 1, profile: { id: model, provider: 'ollama', protocol: 'ollama', model, endpoint: `http://127.0.0.1:${port}`,
        credential_ref: 'ollama', auth_mode: 'none', context_window: 8192, output_limit: 512, capabilities: { json_schema: true, images: false, files: false } },
      prompt: 'QA210 kernel prompt.', max_iterations: 3, output_tokens: 128, history: 'root', overflow: 'error', json_schema: null } } },
    { id: 'end', type: 'end', config: { execution: { inputs: [input('kernel')], outputs: [{ name: 'message', source: { kind: 'input', path: ['message'] } }] } } },
    { id: 'tools', type: 'toolkit_pool', config: { toolkits: [{ id: 'CoreToolkit', enabled_tools: ['write'] }], merge_with_user_selected: false,
      workflow_tools: [{ id: 'mutate', workflow: { workflow_id: 'qa210-workflow', revision_id: null } }] } },
  ], edges: [
    { id: 'first', kind: 'flow', source_node_id: 'start', source_port_id: 'out', target_node_id: 'kernel', target_port_id: 'in' },
    { id: 'last', kind: 'flow', source_node_id: 'kernel', source_port_id: 'out', target_node_id: 'end', target_port_id: 'in' },
    { id: 'attach-tools', kind: 'attach', source_node_id: 'kernel', source_port_id: 'attach_bot', target_node_id: 'tools', target_port_id: 'attach_top' },
  ] };
  return document;
}

// ---- strict loopback provider (Ollama wire): one tool call per chat, never a resume reply ----
const counts = {};
function frameFor(body) {
  const model = body.model; const at = counts[model] || 0; counts[model] = at + 1;
  assert.equal(body.stream, true); assert.equal(body.options.num_ctx, 8192); assert.equal(body.options.num_predict, 128);
  assert.equal(model, 'qa210-stop', `unexpected model ${model}`);
  assert.ok(at < 2, 'a stopped run was re-dispatched');
  const exposed = body.tools.find(tool => tool.function.name === 'workflow_mutate'); assert.ok(exposed, 'workflow tool not exposed');
  const message = { role: 'assistant', content: '', tool_calls: [{ id: `stop-call-${at}`, type: 'function', function: { name: 'workflow_mutate', arguments: { inputs: { path: path.join(workspace, `stop-${at}.txt`) } } } }] };
  return { model, message, done: true, done_reason: 'stop', prompt_eval_count: 20, eval_count: 7 };
}

async function main() {
  fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(workspace, { recursive: true });
  assert.ok(fs.statSync(app).isFile());
  let current = null;
  const server = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    const record = { index: wires.length, method: request.method, url: request.url, headers: request.headers, request_text: bytes.toString('utf8'), at_ns: process.hrtime.bigint().toString() };
    wires.push(record); write('provider-wires.json', wires);
    try {
      assert.equal(request.method, 'POST'); assert.equal(request.url, '/api/chat'); assert.equal(request.headers.authorization, undefined);
      const frame = frameFor(JSON.parse(bytes.toString('utf8')));
      record.response = frame; write('provider-wires.json', wires);
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson' }); response.end(`${JSON.stringify(frame)}\n`);
    } catch (error) {
      errors.push(String(error.stack || error)); write('fixture-errors.json', errors);
      response.writeHead(500); response.end('strict offline fixture refused the request');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });

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
        XDG_CACHE_HOME: path.join(home, '.cache'), PUPU_E2E: '1', PUPU_COMPUTER_USE: '0', UNCHAIN_MODEL: 'environment-decoy-210', OLLAMA_HOST: 'http://127.0.0.1:18992' },
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
    page.on('pageerror', error => { pageErrors.push({ at_ms: Date.now(), error: String(error) }); write('page-errors.json', pageErrors); });
    page.on('console', message => { consoleLines.push({ at_ns: process.hrtime.bigint().toString(), at_ms: Date.now(), type: message.type(), text: message.text().slice(0, 800) }); if (consoleLines.length % 20 === 0) write('renderer-console.json', consoleLines); });
    await page.waitForLoadState('domcontentloaded'); await page.evaluate(installRecorder);
    const startup = createStartupWatch({ page, generation, out, write, mark, sleep });
    const gate = page.getByRole('button', { name: 'Click anywhere to start' });
    await expect(gate).toBeVisible({ timeout: 120000 }); await gate.click();
    record.startup = await startup.settle();
    await until(() => page.evaluate(() => window.unchainAPI.getPendingInteraction({ session_id: 'qa210-readiness-probe' }).then(() => true, () => false)), 180000);
    collect();
    record.ready_ns = process.hrtime.bigint().toString(); record.processes_at_ready = [...owned.values()];
    record.sidecar_owned = [...owned.values()].some(row => path.basename(row.exe) === 'unchain-server');
    assert.ok(owned.size > 1, 'ownership walk found no descendants of the Electron main process');
    assert.equal(record.sidecar_owned, true, 'sidecar is not a tracked descendant of the Electron main process');
    record.sidecar = [...owned.values()].filter(row => path.basename(row.exe) === 'unchain-server').map(row => ({ ...row, exe_sha256: (() => { try { return require('node:crypto').createHash('sha256').update(fs.readFileSync(row.exe)).digest('hex'); } catch { return null; } })() }));
    write('process-generations.json', generations);
    return page;
  }
  const shot = async (page, name) => { await page.screenshot({ path: path.join(out, `${name}.png`) }).catch(() => {}); fs.writeFileSync(path.join(out, `${name}-aria.txt`), await page.locator('body').ariaSnapshot().catch(String)); };

  // ---- chat helpers (round 9) ----
  async function chatScope(page) {
    return page.evaluate(async () => {
      const chatId = window.chatStorageAPI.bootstrap().activeChatId;
      const messages = window.chatStorageAPI.readMessages(chatId);
      const recorded = [...messages].reverse().find(m => m.role === 'assistant' && typeof m.meta?.executionSessionId === 'string' && m.meta.executionSessionId);
      const session = recorded ? recorded.meta.executionSessionId : chatId;
      return { chatId, messages, session, pending: await window.unchainAPI.getPendingInteraction({ session_id: session }) };
    });
  }
  const outbox = (page) => page.evaluate((key) => ({ raw: localStorage.getItem(key), keys: Object.keys(localStorage).filter(k => /cancel|outbox|mutation/i.test(k)) }), OUTBOX_KEY);
  async function begin(page, name, text, label) {
    await page.getByRole('button', { name: 'New chat', exact: true }).click();
    await page.getByTestId('attach-agent-row').getByRole('combobox').click();
    await page.getByRole('listbox').getByText(name, { exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Message PuPu...', exact: true });
    await input.fill(text);
    await sendOnce({ page, input, label, out, mark, sleep, write });
  }
  async function visibleApproval(page) {
    const allow = page.getByRole('button', { name: 'Approve', exact: true }).first();
    const detail = page.getByRole('button', { name: 'detail', exact: true }).first();
    await until(async () => await allow.isVisible() || await detail.isVisible());
    if (!(await allow.isVisible())) await detail.click();
    await expect(allow).toBeVisible({ timeout: 120000 }); return allow;
  }
  async function openSidebarIfNeeded(page) {
    if (await page.getByRole('button', { name: 'Close sidebar', exact: true }).isVisible().catch(() => false)) return;
    const sidebar = page.getByRole('button', { name: 'Open sidebar', exact: true });
    const hit = await sidebar.evaluate(el => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); const t = h && h.closest('button');
      return t ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; });
    assert.ok(hit, 'no button under the Open sidebar position'); await page.mouse.click(hit.x, hit.y);
    await expect(page.getByRole('button', { name: 'Close sidebar', exact: true })).toBeVisible();
  }
  async function openBuilder(page, agentName) {
    await openSidebarIfNeeded(page);
    const agents = page.getByRole('button', { name: 'Agents', exact: true });
    await until(() => agents.evaluate(el => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === el; }), 10000);
    await agents.click();
    await page.getByTestId('agent-explorer').getByText(agentName, { exact: true }).click();
    await expect(page.getByTestId('recipe-detail-panel-header')).toBeVisible();
    mark('ui', 'Builder opened', { agentName });
  }
  async function closeBuilder(page) { await page.getByRole('button', { name: 'Close builder', exact: true }).click(); mark('ui', 'Close builder'); await expect(page.getByRole('button', { name: 'Close builder', exact: true })).toHaveCount(0); }
  async function observe(page, scope, resourceId, label) {
    const read = () => page.evaluate(({ owner, session, resource }) => window.unchainAPI.getSkeletonRunObservation({ owner_chat_id: owner, execution_id: session, resource_id: resource }), { owner: scope.chatId, session: scope.session, resource: resourceId });
    const before = await read();
    await page.getByRole('button', { name: 'Open the run menu', exact: true }).click();
    const view = page.getByRole('button', { name: 'View current chat run', exact: true });
    await expect(view).toBeVisible(); await view.click(); mark('ui', 'View current chat run', { label });
    await expect(page.getByTestId('skeleton-run-observation-view')).toBeVisible();
    await expect(page.getByTestId('run-observation-graph-state')).toBeVisible({ timeout: 60000 });
    const pageRead = await page.evaluate(() => ({
      graph_state: document.querySelector('[data-testid="run-observation-graph-state"]')?.textContent ?? null,
      nodes: [...document.querySelectorAll('[data-testid^="run-node-state-"]')].map(el => ({ id: el.getAttribute('data-testid').slice('run-node-state-'.length), text: el.textContent, aria: el.getAttribute('aria-label'), state: el.getAttribute('data-run-state') })),
    }));
    await shot(page, `observe-${label}`);
    const after = await read();
    return { label, before, after, page: pageRead };
  }
  async function backToEditor(page) { await page.getByRole('button', { name: 'Back to editor', exact: true }).click(); mark('ui', 'Back to editor'); await expect(page.getByTestId('skeleton-run-observation-view')).toHaveCount(0); }

  // ---- the Stop under test: read the real control, hit-test it, one trusted click, then only observe ----
  async function stopOnce(page, label, waiting) {
    const diag = { label, wait_ms_bound: STOP_WAIT_MS };
    diag.pending_before = waiting.pending; diag.chat_id = waiting.chatId; diag.session = waiting.session;
    diag.assistant_meta_before = waiting.messages.filter(m => m.role === 'assistant').map(m => ({ id: m.id ?? null, meta: m.meta ?? null }));
    diag.outbox_before = await outbox(page);
    diag.workspace_before = fs.readdirSync(workspace).sort();
    diag.controls = await page.evaluate((icon) => {
      const buttons = [...document.querySelectorAll('button')].filter(b => (b.querySelector('path')?.getAttribute('d') || '').startsWith(icon));
      const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].map(d => ({ label: d.getAttribute('aria-label'), id: d.id || null }));
      const active = document.activeElement; const describe = (el) => el ? { tag: el.tagName, role: el.getAttribute('role'), aria: el.getAttribute('aria-label'), testid: el.getAttribute('data-testid'), text: (el.textContent || '').trim().slice(0, 80) } : null;
      return { stop_buttons: buttons.map((b) => { const r = b.getBoundingClientRect(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2; const hit = document.elementFromPoint(cx, cy);
        const propsKey = Object.keys(b).find(k => k.startsWith('__reactProps$')); const onClick = propsKey ? b[propsKey]?.onClick : null;
        return { rect: { x: r.x, y: r.y, w: r.width, h: r.height }, center: { x: cx, y: cy }, disabled: b.disabled, aria: b.getAttribute('aria-label'), title: b.getAttribute('title'),
          opacity: getComputedStyle(b).opacity, pointer_events: getComputedStyle(b).pointerEvents, visibility: getComputedStyle(b).visibility,
          hit_is_this_button: Boolean(hit && hit.closest('button') === b), hit_element: describe(hit), has_react_onclick: typeof onClick === 'function', onclick_name: typeof onClick === 'function' ? (onClick.name || '(anonymous)') : null }; }),
        approve_cards: [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Approve').length,
        reject_cards: [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Reject').length,
        waiting_text_visible: document.body.innerText.includes('waiting for your confirmation'),
        dialogs, active_element: describe(active), observation_view_present: Boolean(document.querySelector('[data-testid="skeleton-run-observation-view"]')),
        builder_present: Boolean(document.querySelector('[data-testid="recipe-detail-panel-header"]')) };
    }, STOP_ICON);
    assert.equal(diag.controls.stop_buttons.length, 1, `${label}: expected exactly one Stop control, found ${diag.controls.stop_buttons.length}`);
    const control = diag.controls.stop_buttons[0];
    assert.equal(control.hit_is_this_button, true, `${label}: the Stop control is not what the pointer would hit`);
    assert.equal(control.disabled, false, `${label}: Stop control is disabled`);
    await shot(page, `${label}-before-stop`);
    diag.click = { x: control.center.x, y: control.center.y, at_ms: Date.now(), at_ns: process.hrtime.bigint().toString(), kind: 'page.mouse.click (trusted CDP input), once' };
    await page.mouse.click(control.center.x, control.center.y); mark('ui', 'Stop clicked once', { label, x: control.center.x, y: control.center.y });
    // observe only: outbox every 250 ms, pending every 1 s, until pending none AND outbox drained, or the bound expires
    diag.timeline = []; const started = Date.now(); let last = null;
    for (;;) {
      const elapsed = Date.now() - started;
      const box = await outbox(page);
      let entry = { after_ms: elapsed, outbox_raw: box.raw };
      if (!last || elapsed - last >= 1000 || elapsed > STOP_WAIT_MS) {
        last = elapsed;
        const scope = await chatScope(page).catch(error => ({ error: String(error) }));
        entry = { ...entry, pending_status: scope.pending?.status ?? null, pending_kind: scope.pending?.kind ?? null, pending_interaction_id: scope.pending?.interaction_id ?? null, pending_error: scope.error ?? null,
          stop_buttons_now: await page.locator(`button:has(path[d^="${STOP_ICON}"])`).count(), approve_cards_now: await page.getByRole('button', { name: 'Approve', exact: true }).count() };
        diag.timeline.push(entry);
        const drained = box.raw === null || box.raw === '[]';
        if (entry.pending_status === 'none' && drained) { diag.outcome = 'PENDING_NONE_AND_OUTBOX_DRAINED'; diag.settled_after_ms = elapsed; break; }
        if (elapsed > STOP_WAIT_MS) { diag.outcome = entry.pending_status === 'none' ? 'PENDING_NONE_BUT_OUTBOX_NOT_DRAINED' : 'PENDING_STILL_PRESENT_AT_BOUND'; break; }
      } else if (box.raw !== (diag.timeline.at(-1)?.outbox_raw ?? null)) diag.timeline.push(entry);
      await sleep(250);
    }
    const after = await chatScope(page).catch(error => ({ error: String(error) }));
    diag.pending_after = after.pending ?? null; diag.assistant_meta_after = (after.messages || []).filter(m => m.role === 'assistant').map(m => ({ id: m.id ?? null, meta: m.meta ?? null, content_tail: String(m.content || '').slice(-200) }));
    diag.outbox_after = await outbox(page);
    diag.controls_after = await page.evaluate((icon) => ({ stop_buttons: document.querySelectorAll('button').length && [...document.querySelectorAll('button')].filter(b => (b.querySelector('path')?.getAttribute('d') || '').startsWith(icon)).length,
      approve_cards: [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Approve').length, waiting_text_visible: document.body.innerText.includes('waiting for your confirmation'),
      cancelled_text_visible: document.body.innerText.includes('Cancelled'), send_disabled: [...document.querySelectorAll('button')].filter(b => (b.querySelector('path')?.getAttribute('d') || '').startsWith('M11.9999 10.8284L7.0502')).map(b => b.disabled) }), STOP_ICON);
    diag.workspace_after = fs.readdirSync(workspace).sort();
    diag.unapproved_write_files = diag.workspace_after.filter(f => /^stop-\d+\.txt$/.test(f));
    diag.console_after_click = consoleLines.filter(l => l.at_ms >= diag.click.at_ms); diag.page_errors_after_click = pageErrors.filter(e => e.at_ms >= diag.click.at_ms);
    await shot(page, `${label}-after-stop`);
    write(`stop-${label}.json`, diag);
    return diag;
  }

  try {
    const page = await launch();
    await openSidebarIfNeeded(page);
    await page.getByRole('button', { name: 'Workspaces', exact: true }).click();
    const rootInput = page.getByRole('textbox', { name: 'default-workspace-root', exact: true });
    await rootInput.fill(workspace); await rootInput.press('Enter');
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible(); await rootInput.press('Escape'); await expect(rootInput).toHaveCount(0);
    mark('ui', 'default workspace saved through the editor');
    const seeded = await page.evaluate(async ({ wf, source, agent }) => {
      const api = window.unchainAPI;
      const saved = await api.saveManagedSkeletonResource({ schema: 'pupu.skeleton-edit.v2', document: wf, expected_edit_token: null, managed_sources: [{ node_path: ['nodes', 2], text: source }] });
      const published = await api.publishManagedSkeletonWorkflow(wf.id, saved.resource.edit_token);
      agent.nodes.find(n => n.id === 'tools').config.workflow_tools[0].workflow.revision_id = published.version.revision_id;
      const doc = await api.saveManagedSkeletonResource({ schema: 'pupu.skeleton-edit.v2', document: agent, expected_edit_token: null, managed_sources: [] });
      return { saved, published, doc };
    }, { wf: workflow(), source: codeSource, agent: agentDoc('qa210-stop-agent', 'qa210-stop', 'QA210 Stop Agent') });
    write('seed-v2-bridge.json', seeded); mark('seed', 'one workflow published and one Agent saved through the real v2 bridge (disclosed); the same seed serves both chats');

    // A (control): park -> Stop once
    await begin(page, 'QA210 Stop Agent', 'QA210 stop control A', 'chat-A'); await visibleApproval(page);
    const waitingA = await chatScope(page); write('chat-A-waiting.json', waitingA); assert.equal(waitingA.pending.status, 'awaiting_response');
    chats.push({ label: 'A', ...(await stopOnce(page, 'A', waitingA)) });

    // B (target): park -> Builder -> View current chat run -> Back -> Close builder -> Stop once
    await begin(page, 'QA210 Stop Agent', 'QA210 stop target B', 'chat-B'); await visibleApproval(page);
    const waitingB = await chatScope(page); write('chat-B-waiting.json', waitingB); assert.equal(waitingB.pending.status, 'awaiting_response');
    assert.notEqual(waitingB.chatId, waitingA.chatId);
    await openBuilder(page, 'QA210 Stop Agent');
    const observation = await observe(page, waitingB, 'qa210-stop-agent', 'B-waiting'); write('chat-B-observation.json', observation);
    await backToEditor(page); await closeBuilder(page);
    const afterReturn = await chatScope(page); write('chat-B-after-return.json', afterReturn);
    assert.equal(afterReturn.chatId, waitingB.chatId, 'active chat changed across Builder observe/return');
    chats.push({ label: 'B', ...(await stopOnce(page, 'B', afterReturn)), observation_before_stop: { label: observation.label, high_watermark_before: observation.before?.run?.high_watermark ?? null, high_watermark_after: observation.after?.run?.high_watermark ?? null } });

    write('functional-result.json', { verdict: 'STOP_DIAG_RECORDED', chats: chats.map(c => ({ label: c.label, outcome: c.outcome, settled_after_ms: c.settled_after_ms ?? null, unapproved_write_files: c.unapproved_write_files })), provider_requests: wires.length, real_provider_requests: 0, fixture_errors: errors });
  } finally {
    if (current?.page) await shot(current.page, 'last-window');
    await stop(); await new Promise(resolve => server.close(resolve));
    write('ledger.json', ledger); write('provider-wires.json', wires); write('fixture-errors.json', errors); write('process-generations.json', generations); write('renderer-console.json', consoleLines); write('page-errors.json', pageErrors);
  }
}
main().catch(error => { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'failure.txt'), String(error.stack || error)); process.exitCode = 1; })
  .finally(() => { setTimeout(() => { fs.writeFileSync(path.join(out, 'forced-exit.txt'), 'event loop still alive 60s after completion; forced exit'); process.exit(process.exitCode || 0); }, 60000).unref(); });
