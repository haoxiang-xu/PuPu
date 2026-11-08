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
const HOOK_SEED = require('./hook-seed.json'); // Codex seed, integrity in ticket-210-close-20261107/hook-seed/integrity.json
const SCHEMA = 'pupu.skeleton-run-observation.v1';

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
const ledger = [], wires = [], generations = [], errors = [], observations = [];
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const write = (name, data) => fs.writeFileSync(path.join(out, name), `${JSON.stringify(data, null, 2)}\n`);
const mark = (kind, action, data = {}) => ledger.push({ at_ns: process.hrtime.bigint().toString(), kind, action, ...data });
const copy = (value) => JSON.parse(JSON.stringify(value));

function processIdentity(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const close = stat.lastIndexOf(')');
    const fields = stat.slice(close + 2).split(' ');
    return { pid, parent: Number(fields[1]), start_ticks: Number(fields[19]), exe: (() => { try { return fs.readlinkSync(`/proc/${pid}/exe`); } catch { return ''; } })() };
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

// ---- documents (seeded through the real v2 bridge; disclosed in the report) ----
const SENTINEL = 'qa210-child-End';
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
function agentDoc(id, model, name, { tools = true, revision = null, child = null, hook = false } = {}) {
  const output = { name: 'message', source: { kind: 'result', path: ['message'] } };
  const input = (node) => ({ name: 'message', value: { kind: 'ref', node_id: node, path: ['message'] }, missing: 'error' });
  const document = { schema_version: 1, kind: 'agent', id, name, nodes: [
    { id: 'start', type: 'start', config: { execution: { outputs: [output] } } },
    { id: 'kernel', type: 'agent', config: { execution: { inputs: [input('start')], outputs: [output] }, kernel: {
      schema_version: 1, profile: { id: model, provider: 'ollama', protocol: 'ollama', model, endpoint: `http://127.0.0.1:${port}`,
        credential_ref: 'ollama', auth_mode: 'none', context_window: 8192, output_limit: 512, capabilities: { json_schema: true, images: false, files: false } },
      prompt: 'QA210 kernel prompt.', max_iterations: 3, output_tokens: 128, history: 'root', overflow: 'error', json_schema: null } } },
    { id: 'end', type: 'end', config: { execution: { inputs: [input('kernel')], outputs: [{ name: 'message', source: { kind: 'input', path: ['message'] } }] } } },
  ], edges: [
    { id: 'first', kind: 'flow', source_node_id: 'start', source_port_id: 'out', target_node_id: 'kernel', target_port_id: 'in' },
    { id: 'last', kind: 'flow', source_node_id: 'kernel', source_port_id: 'out', target_node_id: 'end', target_port_id: 'in' },
  ] };
  if (tools) {
    document.nodes.push({ id: 'tools', type: 'toolkit_pool', config: { toolkits: [{ id: 'CoreToolkit', enabled_tools: ['write'] }], merge_with_user_selected: false,
      workflow_tools: [{ id: 'mutate', workflow: { workflow_id: 'qa210-workflow', revision_id: revision } }] } });
    document.edges.push({ id: 'attach-tools', kind: 'attach', source_node_id: 'kernel', source_port_id: 'attach_bot', target_node_id: 'tools', target_port_id: 'attach_top' });
  }
  if (hook) {
    // Codex's verified seed (REAL_STORE_EMBEDDED_HOOK_ATTACHMENT_ACCEPTED): before_tool_call on workflow_mutate, embedded owned Workflow answering continue.
    document.nodes.push(copy(HOOK_SEED.pool_node)); document.edges.push(copy(HOOK_SEED.attach_edge));
  }
  if (child) {
    document.nodes.push({ id: 'reviewers', type: 'subagent_pool', config: { subagents: [{ id: 'reviewer', name: 'Reviewer', description: 'review',
      source: { kind: 'embedded', document: child }, allowed_modes: ['delegate'], output_mode: 'summary', memory_policy: 'ephemeral',
      parallel_safe: true, allowed_tools: null, disabled_tools: [] }] } });
    document.edges.push({ id: 'attach-reviewer', kind: 'attach', source_node_id: 'kernel', source_port_id: 'attach_bot', target_node_id: 'reviewers', target_port_id: 'attach_top' });
  }
  return document;
}

// ---- strict loopback provider (Ollama wire) ----
const REPLY = { approve: 'QA210 approval done', parent: 'QA210 parent done', child: 'QA210 child evidence' };
const counts = {};
function frameFor(body) {
  const model = body.model; const at = counts[model] || 0; counts[model] = at + 1;
  assert.equal(body.stream, true); assert.equal(body.options.num_ctx, 8192); assert.equal(body.options.num_predict, 128);
  let message;
  if (model === 'qa210-approve' || model === 'qa210-cancel' || model === 'qa210-hook') {
    const label = model === 'qa210-approve' ? 'approve' : model === 'qa210-hook' ? 'hook' : 'cancel';
    const exposed = body.tools.find(tool => tool.function.name === 'workflow_mutate'); assert.ok(exposed, 'workflow tool not exposed');
    if (label === 'cancel') assert.ok(at < 1, 'cancelled run was re-dispatched');
    if (label === 'approve') assert.ok(at < 4, 'unexpected approval-model redispatch');
    if (label === 'hook') assert.ok(at < 2, 'unexpected hook-model redispatch');
    // turn 1: tool call → park; turn 1 resume: reply; turn 2 (after B saved): tool call then reply again
    message = at % 2 === 0
      ? { role: 'assistant', content: '', tool_calls: [{ id: `${label}-call-${at}`, type: 'function', function: { name: 'workflow_mutate', arguments: { inputs: { path: path.join(workspace, `${label}-${at}.txt`) } } } }] }
      : { role: 'assistant', content: `${REPLY.approve} ${at}` };
  } else if (model === 'qa210-parent') {
    assert.ok(at < 2);
    message = at === 0 ? { role: 'assistant', content: '', tool_calls: [{ id: 'parent-delegate', type: 'function', function: { name: 'delegate_to_subagent', arguments: { target: 'Reviewer', task: 'review once' } } }] }
      : { role: 'assistant', content: REPLY.parent };
    if (at === 1) assert.ok(JSON.stringify(body.messages).includes(REPLY.child), 'child reply missing from parent context');
  } else if (model === 'qa210-child') {
    assert.equal(at, 0); message = { role: 'assistant', content: REPLY.child };
  } else throw new Error(`unexpected model ${model}`);
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
    held.record.stopped_ns = process.hrtime.bigint().toString();
    held.record.all_owned_dead = true; held.record.processes = [...held.owned.values()];
    write('process-generations.json', generations); current = null;
  }
  async function launch() {
    const debug = 19220 + generations.length;
    const child = spawn(app, [`--remote-debugging-port=${debug}`, `--user-data-dir=${userData}`, '--password-store=gnome-libsecret'], {
      detached: true, env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local/share'),
        XDG_CACHE_HOME: path.join(home, '.cache'), PUPU_E2E: '1', PUPU_COMPUTER_USE: '0', UNCHAIN_MODEL: 'environment-decoy-210', OLLAMA_HOST: 'http://127.0.0.1:18992' },
      stdio: ['ignore', 'pipe', 'pipe'] });
    const generation = generations.length + 1;
    const log = fs.createWriteStream(path.join(out, `app-${generation}.log`)); child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false }); child.on('exit', () => log.end());
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
    await page.waitForLoadState('domcontentloaded'); await page.evaluate(installRecorder);
    const startup = createStartupWatch({ page, generation, out, write, mark, sleep });
    const gate = page.getByRole('button', { name: 'Click anywhere to start' });
    await expect(gate).toBeVisible({ timeout: 120000 }); await gate.click();
    record.startup = await startup.settle();
    await until(() => { collect(); return [...owned.values()].some(row => path.basename(row.exe) === 'unchain-server'); });
    record.ready_ns = process.hrtime.bigint().toString(); record.processes_at_ready = [...owned.values()];
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
  async function visibleApproval(page) {
    const allow = page.getByRole('button', { name: 'Approve', exact: true }).first();
    const detail = page.getByRole('button', { name: 'detail', exact: true }).first();
    await until(async () => await allow.isVisible() || await detail.isVisible());
    if (!(await allow.isVisible())) await detail.click();
    await expect(allow).toBeVisible({ timeout: 120000 }); return allow;
  }
  async function provenApproveCard(page, pending) {
    const cards = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Approve').map((button, index) => {
      const fiberKey = Object.keys(button).find(key => key.startsWith('__reactFiber$')); const keys = []; let frames = null;
      for (let fiber = button[fiberKey], depth = 0; fiber && depth < 200 && !frames; fiber = fiber.return, depth += 1) {
        for (const key of [fiber.key, fiber.memoizedProps?.item?.key]) if (typeof key === 'string') keys.push(key);
        if (Array.isArray(fiber.memoizedProps?.frames)) frames = fiber.memoizedProps.frames; }
      const seq = keys.map(key => /^(.+)-tool$/.exec(key)?.[1]).find(Boolean) ?? null;
      const frame = (frames || []).find(row => String(row.seq) === String(seq) && row.type === 'tool_call') || null; const payload = frame?.payload || {};
      return { index, run_id: frame?.run_id ?? null, call_id: payload.call_id ?? null, confirmation_id: payload.confirmation_id ?? null, interaction_id: payload.interaction_id ?? null }; }));
    const expected = { interaction_id: pending.interaction_id, call_id: pending.presentation?.tool_call?.call_id ?? null, source_run_id: pending.interaction_source_run_id ?? null, active_attempt_id: pending.active_attempt_id ?? null };
    const matching = cards.filter(c => c.confirmation_id === expected.interaction_id && c.interaction_id === expected.interaction_id && expected.call_id && c.call_id === expected.call_id);
    const bySource = matching.filter(c => c.run_id === expected.source_run_id); const byAttempt = matching.filter(c => c.run_id === expected.active_attempt_id);
    const proven = bySource.length === 1 ? bySource[0] : (bySource.length === 0 && byAttempt.length === 1 ? byAttempt[0] : null);
    write(`approve-identity-${Date.now()}.json`, { cards, pending, expected, proven_index: proven ? proven.index : null });
    if (!proven) throw new Error('APPROVAL_CARD_OWNERSHIP_UNPROVEN');
    const handle = await page.evaluateHandle(index => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Approve')[index], proven.index);
    return handle.asElement();
  }

  // ---- Builder / observation helpers ----
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
  async function observe(page, label, { expectGraphs = null, switchToSecond = false } = {}) {
    const scope = await chatScope(page);
    const before = await page.evaluate(({ owner, session, resource }) => window.unchainAPI.getSkeletonRunObservation({ owner_chat_id: owner, execution_id: session, resource_id: resource }),
      { owner: scope.chatId, session: scope.session, resource: observeResourceId });
    await page.getByRole('button', { name: 'Open the run menu', exact: true }).click();
    const view = page.getByRole('button', { name: 'View current chat run', exact: true });
    await expect(view).toBeVisible(); await view.click(); mark('ui', 'View current chat run', { label });
    await expect(page.getByTestId('skeleton-run-observation-view')).toBeVisible();
    await expect(page.getByTestId('run-observation-graph-state')).toBeVisible({ timeout: 60000 });
    const readPage = async () => page.evaluate(() => ({
      graph_state: document.querySelector('[data-testid="run-observation-graph-state"]')?.textContent ?? null,
      skipped: document.querySelector('[data-testid="run-observation-skipped"]')?.textContent ?? null,
      error: document.querySelector('[data-testid="run-observation-error"]')?.textContent ?? null,
      nodes: [...document.querySelectorAll('[data-testid^="run-node-state-"]')].map(el => ({ node_id: el.getAttribute('data-testid').slice('run-node-state-'.length), text: el.textContent.trim(), aria: el.getAttribute('aria-label'), run_state: el.getAttribute('data-run-state') })),
      picker_present: Boolean(document.querySelector('[data-testid="run-observation-graph-picker"]')),
      caption_present: Boolean([...document.querySelectorAll('span')].find(s => s.textContent.startsWith('Recorded state; live activity is unconfirmed'))),
    }));
    const pages = [await readPage()]; await shot(page, `observe-${label}`);
    if (switchToSecond && before.run.graphs.length > 1) {
      for (let index = 1; index < before.run.graphs.length; index += 1) {
        await page.getByTestId('run-observation-graph-picker').getByRole('combobox').click();
        const options = page.getByRole('listbox').getByRole('option'); await expect(options).toHaveCount(before.run.graphs.length);
        pages[0].picker_labels = pages[0].picker_labels || await options.allTextContents();
        await options.nth(index).click(); mark('ui', 'switch graph invocation', { label, index });
        await expect(page.getByTestId('run-observation-graph-state')).toBeVisible(); pages.push(await readPage()); await shot(page, `observe-${label}-graph${index}`);
      }
    }
    const after = await page.evaluate(({ owner, session, resource }) => window.unchainAPI.getSkeletonRunObservation({ owner_chat_id: owner, execution_id: session, resource_id: resource }),
      { owner: scope.chatId, session: scope.session, resource: observeResourceId });
    const record = { label, scope: { owner_chat_id: scope.chatId, execution_id: scope.session, resource_id: observeResourceId }, pending: scope.pending, bridge_before: before, bridge_after: after, pages_by_graph_index: pages };
    observations.push(record); write('observations.json', observations);
    for (const reply of [before, after]) { assert.equal(reply && reply.schema, SCHEMA, 'raw bridge reply schema'); assert.ok(reply.run, `${label}: run is null`); }
    assert.equal(before.run.high_watermark, after.run.high_watermark, `${label}: observing moved the watermark`);
    if (expectGraphs !== null) assert.equal(after.run.graphs.length, expectGraphs, 'graph count');
    return record;
  }
  async function backToEditor(page) { await page.getByRole('button', { name: 'Back to editor', exact: true }).click(); await expect(page.getByTestId('skeleton-run-observation-view')).toHaveCount(0); }

  let observeResourceId = null;
  try {
    let page = await launch();
    // authorised workspace through the real Workspaces editor (the write tool needs one)
    await page.getByRole('button', { name: 'Workspaces', exact: true }).click();
    const rootInput = page.getByRole('textbox', { name: 'default-workspace-root', exact: true });
    await rootInput.fill(workspace); await rootInput.press('Enter');
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible(); await rootInput.press('Escape'); await expect(rootInput).toHaveCount(0);
    mark('ui', 'default workspace saved through the editor');
    // seed (disclosed)
    const seeded = await page.evaluate(async ({ wf, source, approve, cancel, parent }) => {
      const api = window.unchainAPI;
      const saved = await api.saveManagedSkeletonResource({ schema: 'pupu.skeleton-edit.v2', document: wf, expected_edit_token: null, managed_sources: [{ node_path: ['nodes', 2], text: source }] });
      const published = await api.publishManagedSkeletonWorkflow(wf.id, saved.resource.edit_token);
      const docs = {}; for (const document of [approve, cancel, hook]) { const tools = document.nodes.find(n => n.id === 'tools'); tools.config.workflow_tools[0].workflow.revision_id = published.version.revision_id;
        docs[document.id] = await api.saveManagedSkeletonResource({ schema: 'pupu.skeleton-edit.v2', document, expected_edit_token: null, managed_sources: [] }); }
      docs[parent.id] = await api.saveManagedSkeletonResource({ schema: 'pupu.skeleton-edit.v2', document: parent, expected_edit_token: null, managed_sources: [] });
      return { saved, published, docs, capabilities: await api.getSkeletonWorkflowToolCapabilities() };
    }, { wf: workflow(), source: codeSource, approve: agentDoc('qa210-approve-agent', 'qa210-approve', 'QA210 Approval Agent'), cancel: agentDoc('qa210-cancel-agent', 'qa210-cancel', 'QA210 Cancel Agent'),
      hook: agentDoc('qa210-hook-agent', 'qa210-hook', 'QA210 Hook Agent', { hook: true }),
      parent: agentDoc('qa210-parent-agent', 'qa210-parent', 'QA210 Parent Agent', { tools: false, child: agentDoc('qa210-child-agent', 'qa210-child', 'Reviewer Agent', { tools: false }) }) });
    write('seed-v2-bridge.json', seeded); mark('seed', 'workflow published and four Agents saved through the real v2 bridge; no UI authoring claim');

    // 1+2: real run parks on approval; observe waiting
    await begin(page, 'QA210 Approval Agent', 'QA210 approve turn 1'); await visibleApproval(page);
    const waiting = await chatScope(page); assert.equal(waiting.pending.status, 'awaiting_response'); write('approve-waiting-chat.json', waiting);
    observeResourceId = 'qa210-approve-agent';
    await openBuilder(page, 'QA210 Approval Agent');
    // 6: an unsaved draft survives opening and closing the view
    await page.getByTestId('skeleton-node-kernel').click(); await page.keyboard.press('F2');
    const dialog = page.getByRole('dialog', { name: 'Rename node', exact: true }); await dialog.getByRole('textbox').fill('Kernel B'); await dialog.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(page.getByTestId('skeleton-save-state')).toHaveText('Unsaved changes'); mark('ui', 'draft B renamed kernel, unsaved');
    const obsWaiting = await observe(page, 'approve-waiting', { expectGraphs: 2, switchToSecond: true });
    await backToEditor(page);
    await expect(page.getByTestId('skeleton-save-state')).toHaveText('Unsaved changes');
    await expect(page.getByTestId('recipe-detail-panel-header')).toContainText('Kernel B'); mark('ui', 'draft preserved after Back to editor');
    // 4: save B while A waits; A's observation keeps A's digest
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByTestId('skeleton-save-state')).toHaveText('Saved'); mark('ui', 'B saved while A waits');
    const savedB = await page.evaluate(() => window.unchainAPI.getManagedSkeletonResource('qa210-approve-agent')); write('saved-B.json', savedB);
    const obsAfterB = await observe(page, 'approve-waiting-after-B-saved', { expectGraphs: 2 });
    assert.equal(obsAfterB.bridge_after.run.definition_digest, obsWaiting.bridge_after.run.definition_digest, 'A digest changed after B saved');
    assert.equal(obsAfterB.bridge_after.run.high_watermark, obsWaiting.bridge_after.run.high_watermark, 'observation changed the journal');
    await backToEditor(page); await closeBuilder(page);
    // 3: approve → resume → completed
    await (await provenApproveCard(page, waiting.pending)).click(); mark('ui', 'Approve');
    await expect(page.getByText(`${REPLY.approve} 1`, { exact: true })).toBeVisible({ timeout: 120000 });
    const approved = await chatScope(page); assert.equal(approved.pending.status, 'none'); write('approved-chat.json', approved);
    await openBuilder(page, 'QA210 Approval Agent'); const obsDone = await observe(page, 'approve-completed', { expectGraphs: 2, switchToSecond: true }); await backToEditor(page); await closeBuilder(page);
    // 4b: a new turn in the same chat uses B
    const input = page.getByRole('textbox', { name: 'Message PuPu...', exact: true }); await input.fill('QA210 approve turn 2');
    await sendOnce({ page, input, label: 'approve-turn-2', out, mark, sleep, write }); await visibleApproval(page);
    const waiting2 = await chatScope(page); await (await provenApproveCard(page, waiting2.pending)).click();
    await expect(page.getByText(`${REPLY.approve} 3`, { exact: true })).toBeVisible({ timeout: 120000 });
    const turn2 = await chatScope(page); write('approve-turn2-chat.json', turn2);
    await openBuilder(page, 'QA210 Approval Agent'); const obsB = await observe(page, 'turn2-uses-B', { expectGraphs: 2 });
    assert.notEqual(obsB.bridge_after.run.definition_digest, obsDone.bridge_after.run.definition_digest, 'turn 2 did not use B');
    await backToEditor(page); await closeBuilder(page);
    // 3b: cancel
    await begin(page, 'QA210 Cancel Agent', 'QA210 cancel'); await visibleApproval(page);
    const cancelWaiting = await chatScope(page); write('cancel-waiting-chat.json', cancelWaiting);
    observeResourceId = 'qa210-cancel-agent';
    await openBuilder(page, 'QA210 Cancel Agent'); await observe(page, 'cancel-waiting', { expectGraphs: 2 }); await backToEditor(page); await closeBuilder(page);
    const stopButton = page.locator(`button:has(path[d^="${STOP_ICON}"])`); await expect(stopButton).toHaveCount(1); await stopButton.click(); mark('ui', 'Stop the waiting run');
    await until(async () => (await chatScope(page)).pending.status === 'none'); const cancelled = await chatScope(page); write('cancelled-chat.json', cancelled);
    await openBuilder(page, 'QA210 Cancel Agent'); await observe(page, 'cancelled', { expectGraphs: 2 }); await backToEditor(page); await closeBuilder(page);
    // 5a: Hook invocation (before_tool_call → embedded owned Workflow → workflow tool child parks on approval)
    await begin(page, 'QA210 Hook Agent', 'QA210 hook'); await visibleApproval(page);
    const hookWaiting = await chatScope(page); write('hook-waiting-chat.json', hookWaiting);
    observeResourceId = 'qa210-hook-agent';
    await openBuilder(page, 'QA210 Hook Agent'); await observe(page, 'hook-waiting', { expectGraphs: 3, switchToSecond: true }); await backToEditor(page); await closeBuilder(page);
    await (await provenApproveCard(page, hookWaiting.pending)).click(); mark('ui', 'Approve (hook chat)');
    await expect(page.getByText(`${REPLY.approve} 1`, { exact: true }).last()).toBeVisible({ timeout: 120000 });
    const hookDone = await chatScope(page); write('hook-completed-chat.json', hookDone);
    await openBuilder(page, 'QA210 Hook Agent'); await observe(page, 'hook-completed', { expectGraphs: 3, switchToSecond: true }); await backToEditor(page); await closeBuilder(page);
    // 5b: subagent invocation
    await begin(page, 'QA210 Parent Agent', 'QA210 parent'); await expect(page.getByText(REPLY.parent, { exact: true })).toBeVisible({ timeout: 120000 });
    const parentDone = await chatScope(page); write('parent-chat.json', parentDone);
    observeResourceId = 'qa210-parent-agent';
    await openBuilder(page, 'QA210 Parent Agent'); await observe(page, 'parent-child', { expectGraphs: 2, switchToSecond: true }); await backToEditor(page); await closeBuilder(page);
    // 7: cold restart, read back the parent run
    mark('supervisor', 'cold restart'); await stop(); page = await launch();
    const coldScope = await chatScope(page); assert.equal(coldScope.session, parentDone.session, 'active chat changed across restart');
    await openBuilder(page, 'QA210 Parent Agent'); const cold = await observe(page, 'cold-parent-child', { expectGraphs: 2, switchToSecond: true }); await backToEditor(page);
    const hot = observations.find(o => o.label === 'parent-child');
    assert.deepEqual(cold.bridge_after.run, hot.bridge_after.run, 'cold observation differs from the hot one');
    assert.deepEqual(errors, []);
    write('functional-result.json', { verdict: 'APP_210_OBSERVATION_RECORDED', observations: observations.map(o => o.label), provider_requests: wires.length, real_provider_requests: 0,
      seeding: 'real v2 bridge (disclosed); hook pool from Codex hook-seed.json', hook_invocation: 'RUN', product_renderer_sandbox: false });
  } finally {
    if (current?.page) await shot(current.page, 'last-window');
    await stop(); await new Promise(resolve => server.close(resolve));
    write('ledger.json', ledger); write('provider-wires.json', wires); write('errors.json', errors); write('process-generations.json', generations); write('observations.json', observations);
  }
}
main().catch(error => { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'failure.txt'), String(error.stack || error)); process.exitCode = 1; });
