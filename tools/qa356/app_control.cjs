/* QA-only: real packaged App entry for the fixed Workflow-as-tool contract.
 * Store seeding uses the real v2 bridge; edits and sends use physical controls.
 * Only the loopback Ollama HTTP service is substituted, never Main or runtime.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');
const { createStartupWatch } = require('./app_first_run.cjs');
const { installRecorder } = require('./enter_probe.cjs');
const { sendOnce } = require('./composer_send.cjs');
const candidate = path.resolve(process.env.QA_CANDIDATE_ROOT);
const requireCandidate = createRequire(path.join(candidate, 'package.json'));
const { chromium } = requireCandidate('playwright');
const { expect } = requireCandidate('@playwright/test');
const out = path.resolve(process.env.QA_OUT);
const app = path.resolve(process.env.QA_APP);
const home = path.join(out, 'home');
const userData = path.join(home, 'profile');
const port = 18991;
const sentinel = 'committed-workflow-End-only';
const codeSource = `import sys\ndef main(input, context):\n    return {"receipt": "${sentinel}", "interpreter": sys.executable}\n`;
const final = (turn) => `Desktop Workflow Tool root reply ${turn}`;
const ledger = [], wires = [], generations = [], errors = [];
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const write = (name, data) => fs.writeFileSync(path.join(out, name), `${JSON.stringify(data, null, 2)}\n`);
const mark = (kind, action, data = {}) => ledger.push({ at_ns: process.hrtime.bigint().toString(), kind, action, ...data });

function processIdentity(pid) {
  try {
    const raw = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = raw.slice(raw.lastIndexOf(')') + 2).trim().split(/\s+/);
    if (fields[0] === 'Z') return null;
    return { pid: Number(pid), parent: Number(fields[1]), start_ticks: fields[19],
      exe: fs.readlinkSync(`/proc/${pid}/exe`),
      command: fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ') };
  } catch (_error) { return null; }
}

async function until(read, timeout = 120000) {
  const limit = Date.now() + timeout;
  let last;
  while (Date.now() < limit) {
    try { const value = await read(); if (value) return value; } catch (error) { last = error; }
    await sleep(200);
  }
  throw last || new Error('QA condition did not become true');
}

function workflow() {
  return { schema_version: 1, kind: 'workflow', id: 'desktop-wf356', name: 'Desktop fixed Workflow',
    nodes: [
      { id: 'start', type: 'start', config: { execution: { outputs: [{ name: 'value', source: { kind: 'result', path: ['value'] } }] } } },
      { id: 'end', type: 'end', config: { execution: {
        inputs: [{ name: 'receipt', value: { kind: 'literal', value: sentinel }, missing: 'error' }],
        outputs: [{ name: 'receipt', source: { kind: 'input', path: ['receipt'] } }],
      } } },
    ], edges: [{ id: 'flow', kind: 'flow', source_node_id: 'start', source_port_id: 'out', target_node_id: 'end', target_port_id: 'in' }] };
}

function agent(revision) {
  const output = { name: 'message', source: { kind: 'result', path: ['message'] } };
  const input = (node) => ({ name: 'message', value: { kind: 'ref', node_id: node, path: ['message'] }, missing: 'error' });
  return { schema_version: 1, kind: 'agent', id: 'desktop-agent356', name: 'Desktop Workflow Tool Agent', nodes: [
    { id: 'start', type: 'start', config: { execution: { outputs: [output] } } },
    { id: 'kernel', type: 'agent', config: { execution: { inputs: [input('start')], outputs: [output] }, kernel: {
      schema_version: 1, profile: { id: 'desktop-local356', provider: 'ollama', protocol: 'ollama', model: 'qa356-kernel',
        endpoint: `http://127.0.0.1:${port}`, credential_ref: 'ollama', auth_mode: 'none', context_window: 8192,
        output_limit: 512, capabilities: { json_schema: true, images: false, files: false } },
      prompt: 'Use the fixed Workflow tool before answering.', max_iterations: 3, output_tokens: 128,
      history: 'root', overflow: 'error', json_schema: null,
    } } },
    { id: 'end', type: 'end', config: { execution: { inputs: [input('kernel')], outputs: [{ name: 'message', source: { kind: 'input', path: ['message'] } }] } } },
    { id: 'tools', type: 'toolkit_pool', config: { toolkits: [], merge_with_user_selected: false,
      workflow_tools: [{ id: 'before_edit', workflow: { workflow_id: 'desktop-wf356', revision_id: revision } }] } },
  ], edges: [
    { id: 'first', kind: 'flow', source_node_id: 'start', source_port_id: 'out', target_node_id: 'kernel', target_port_id: 'in' },
    { id: 'last', kind: 'flow', source_node_id: 'kernel', source_port_id: 'out', target_node_id: 'end', target_port_id: 'in' },
    { id: 'attach', kind: 'attach', source_node_id: 'kernel', source_port_id: 'attach_bot', target_node_id: 'tools', target_port_id: 'attach_top' },
  ] };
}

function codeWorkflow() {
  const document = workflow();
  document.nodes.splice(1, 0, { id: 'step', type: 'code', config: {
    code: { source: { kind: 'file', path: 'worker.py' }, environment_profile_id: 'builtin',
      timeout_ms: 10000, max_result_bytes: 10000, max_log_bytes: 10000,
      result_schema: { type: 'object', properties: { receipt: { type: 'string' }, interpreter: { type: 'string' } },
        required: ['receipt', 'interpreter'], additionalProperties: false } },
    execution: { inputs: [{ name: 'value', value: { kind: 'ref', node_id: 'start', path: ['value'] }, missing: 'error' }],
      outputs: ['receipt', 'interpreter'].map(name => ({ name, source: { kind: 'result', path: [name] } })) },
  } });
  document.nodes[2].config.execution = {
    inputs: ['receipt', 'interpreter'].map(name => ({ name, value: { kind: 'ref', node_id: 'step', path: [name] }, missing: 'error' })),
    outputs: ['receipt', 'interpreter'].map(name => ({ name, source: { kind: 'input', path: [name] } })),
  };
  document.edges = [['start', 'step'], ['step', 'end']].map(([source, target], index) => ({ id: `flow-${index}`,
    kind: 'flow', source_node_id: source, source_port_id: 'out', target_node_id: target, target_port_id: 'in' }));
  return document;
}

async function run_packaged_workflow_tool_control() {
  fs.mkdirSync(home, { recursive: true });
  assert.ok(fs.statSync(app).isFile());
  let current = null;
  const lifecycle = require('./app_lifecycle.cjs').createLifecycleControl({ out, write, mark, expect, until, agent, port, sendOnce, sleep });
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    try {
      for await (const chunk of request) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      const body = JSON.parse(bytes.toString('utf8'));
      const index = wires.length, turn = Math.floor(index / 2) + 1;
      const record = { index, method: request.method, url: request.url, headers: request.headers,
        request_text: bytes.toString('utf8'), body, at_ns: process.hrtime.bigint().toString() };
      wires.push(record); write('provider-wires.json', wires);
      const lifecycleFrame = lifecycle.responseFor(body);
      if (lifecycleFrame) {
        assert.equal(request.method, 'POST'); assert.equal(request.url, '/api/chat');
        assert.equal(request.headers.authorization, undefined);
        record.scenario = 'lifecycle'; record.response = lifecycleFrame; write('provider-wires.json', wires);
        response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        response.end(`${JSON.stringify(lifecycleFrame)}\n`); return;
      }
      assert.ok(index < 4, 'unexpected extra provider request');
      assert.equal(request.method, 'POST'); assert.equal(request.url, '/api/chat');
      assert.equal(request.headers.authorization, undefined);
      assert.equal(body.model, 'qa356-kernel'); assert.equal(body.stream, true);
      assert.equal(body.options.num_ctx, 8192); assert.equal(body.options.num_predict, 128);
      const definition = body.tools.find(row => row.function.name === 'workflow_echo_run');
      assert.ok(definition, 'the UI-saved Workflow tool was not exposed');
      assert.deepEqual(definition.function.parameters.required, ['inputs']);
      const toolMessages = body.messages.filter(row => row.role === 'tool');
      if (index % 2 === 0) {
        assert.equal(toolMessages.length, 0, 'previous tool output leaked into the next root');
        if (turn === 2) assert.ok(JSON.stringify(body.messages).includes(final(1)), 'first root reply missing in second root context');
      } else assert.ok(toolMessages.some(row => JSON.stringify(row.content).includes(sentinel)), 'committed child End absent from parent input');
      const message = index % 2 === 0
        ? { role: 'assistant', content: '', tool_calls: [{ id: `workflow-call-${turn}`, type: 'function',
          function: { name: 'workflow_echo_run', arguments: { inputs: { value: `input-${turn}` } } } }] }
        : { role: 'assistant', content: final(turn) };
      const frame = { model: body.model, message, done: true, done_reason: 'stop', prompt_eval_count: 40, eval_count: 8 };
      record.response = frame; write('provider-wires.json', wires);
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson' }); response.end(`${JSON.stringify(frame)}\n`);
    } catch (error) {
      errors.push(String(error.stack || error)); write('fixture-errors.json', errors);
      response.writeHead(500); response.end('strict offline fixture refused the request');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });

  async function stop() {
    if (!current) return;
    const held = current;
    held.collect(); clearInterval(held.timer);
    await held.browser.close().catch(() => {});
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      for (const identity of [...held.owned.values()].reverse()) {
        const alive = processIdentity(identity.pid);
        if (alive && alive.start_ticks === identity.start_ticks) {
          try { process.kill(identity.pid, signal); } catch (_error) { /* already gone */ }
        }
      }
      await until(() => [...held.owned.values()].every(identity => {
        const alive = processIdentity(identity.pid); return !alive || alive.start_ticks !== identity.start_ticks;
      }), signal === 'SIGTERM' ? 10000 : 5000).catch(error => { if (signal === 'SIGKILL') throw error; });
    }
    held.record.stopped_ns = process.hrtime.bigint().toString();
    held.record.all_owned_dead = [...held.owned.values()].every(identity => {
      const alive = processIdentity(identity.pid); return !alive || alive.start_ticks !== identity.start_ticks;
    });
    assert.equal(held.record.all_owned_dead, true);
    held.record.supervisor_cleanup = true;
    held.record.processes = [...held.owned.values()];
    write('process-generations.json', generations); current = null;
  }

  async function launch() {
    const debug = 19220 + generations.length;
    const child = spawn(app, [`--remote-debugging-port=${debug}`, `--user-data-dir=${userData}`, '--password-store=gnome-libsecret'], {
      detached: true, env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'),
        XDG_DATA_HOME: path.join(home, '.local/share'), XDG_CACHE_HOME: path.join(home, '.cache'),
        PUPU_E2E: '1', PUPU_COMPUTER_USE: '0', UNCHAIN_MODEL: 'environment-decoy-356', OLLAMA_HOST: 'http://127.0.0.1:18992' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const generation = generations.length + 1;
    const log = fs.createWriteStream(path.join(out, `app-${generation}.log`));
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
    child.on('exit', () => log.end());
    const owned = new Map();
    const collect = () => {
      const table = fs.readdirSync('/proc').filter(name => /^\d+$/.test(name)).map(processIdentity).filter(Boolean);
      let changed = true;
      while (changed) {
        changed = false;
        for (const row of table) if (!owned.has(row.pid) && (row.pid === child.pid || owned.has(row.parent))) {
          owned.set(row.pid, row); changed = true;
        }
      }
    };
    collect(); const timer = setInterval(collect, 100);
    const record = { generation, main: processIdentity(child.pid), started_ns: process.hrtime.bigint().toString() };
    generations.push(record);
    current = { child, owned, collect, timer, record, browser: { close: async () => {} } };
    const ws = await until(async () => {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('packaged App exited');
      const reply = await fetch(`http://127.0.0.1:${debug}/json/version`);
      return reply.ok && (await reply.json()).webSocketDebuggerUrl;
    });
    const browser = await chromium.connectOverCDP(ws); current.browser = browser;
    const page = await until(() => browser.contexts().flatMap(context => context.pages()).find(candidate => /^file:|^app:/.test(candidate.url())));
    current.page = page;
    page.on('pageerror', error => { errors.push(String(error)); write('page-errors.json', errors); });
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(installRecorder);
    const startup = createStartupWatch({ page, generation, out, write, mark, sleep });
    const gate = page.getByRole('button', { name: 'Click anywhere to start' });
    await expect(gate).toBeVisible({ timeout: 120000 }); await gate.click();
    record.startup = await startup.settle();
    await until(() => { collect(); return [...owned.values()].some(row => path.basename(row.exe) === 'unchain-server'); });
    record.ready_ns = process.hrtime.bigint().toString(); record.processes_at_ready = [...owned.values()];
    write('process-generations.json', generations);
    return page;
  }

  try {
    let page = await launch();
    const wf = codeWorkflow();
    const seeded = await page.evaluate(async ({ wf, agent, codeSource }) => {
      const api = window.unchainAPI;
      const builtin = await api.probeSkeletonPythonProfile('builtin');
      const saved = await api.saveManagedSkeletonResource({ schema: 'pupu.skeleton-edit.v2', document: wf,
        expected_edit_token: null, managed_sources: [{ node_path: ['nodes', 1], text: codeSource }] });
      const published = await api.publishManagedSkeletonWorkflow(wf.id, saved.resource.edit_token);
      agent.nodes.find(row => row.id === 'tools').config.workflow_tools[0].workflow.revision_id = published.version.revision_id;
      const root = await api.saveManagedSkeletonResource({ schema: 'pupu.skeleton-edit.v2', document: agent,
        expected_edit_token: null, managed_sources: [] });
      return { builtin, saved, published, root, capabilities: await api.getSkeletonWorkflowToolCapabilities() };
    }, { wf, codeSource, agent: agent('temporary-never-dispatched') });
    write('seed-v2-bridge.json', seeded); mark('seed', 'workflow publish and Agent save through real v2 bridge');
    // The labelled "Open sidebar" button lives in the width-0, overflow-hidden
    // side menu while it is closed; a pointer at its laid-out position reaches
    // the title-bar toggle instead. Read-only hit test, then one real pointer
    // click at the hit control's own centre; no force/dispatchEvent/DOM writes.
    const hitTest = (el) => {
      const describe = (node) => {
        if (!node) return null;
        const r = node.getBoundingClientRect(), s = getComputedStyle(node);
        return { tag: node.tagName.toLowerCase(), aria_label: node.getAttribute('aria-label'),
          text: (node.textContent || '').trim().slice(0, 60),
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          width: s.width, overflow: s.overflow, z_index: s.zIndex, app_region: s.webkitAppRegion || s.getPropertyValue('-webkit-app-region') };
      };
      const chain = [];
      for (let node = el.parentElement; node && chain.length < 4; node = node.parentElement) chain.push(describe(node));
      const r = el.getBoundingClientRect();
      const probe = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      const hit = document.elementFromPoint(probe.x, probe.y);
      const target = hit && hit.closest('button');
      let click = null, confirm = null;
      if (target) {
        const t = target.getBoundingClientRect();
        click = { x: t.x + t.width / 2, y: t.y + t.height / 2 };
        const again = document.elementFromPoint(click.x, click.y);
        confirm = { element: describe(again), same_button: Boolean(again && again.closest('button') === target) };
      }
      return { labelled: describe(el), ancestors: chain, probe, hit: describe(hit), target: describe(target),
        target_is_labelled: target === el, click, confirm, viewport: { width: innerWidth, height: innerHeight } };
    };
    const sidebar = page.getByRole('button', { name: 'Open sidebar', exact: true });
    await expect(sidebar).toHaveCount(1);
    await page.screenshot({ path: path.join(out, 'sidebar-before.png') });
    fs.writeFileSync(path.join(out, 'sidebar-before-aria.txt'), await page.locator('body').ariaSnapshot());
    const sidebarHit = await sidebar.evaluate(hitTest);
    write('sidebar-hit-test.json', sidebarHit);
    assert.ok(sidebarHit.target, 'no button under the laid-out Open sidebar position');
    assert.equal(sidebarHit.confirm.same_button, true);
    mark('ui', 'pointer click sidebar toggle', { at: sidebarHit.click, target: sidebarHit.target });
    await page.mouse.click(sidebarHit.click.x, sidebarHit.click.y);
    await expect(page.getByRole('button', { name: 'Close sidebar', exact: true })).toBeVisible();
    const agents = page.getByRole('button', { name: 'Agents', exact: true });
    await expect(agents).toBeVisible();
    // Side menu opens with a 0.3 s width transition; poll the read-only hit test.
    let agentsHit;
    const agentsReached = await until(async () => {
      agentsHit = await agents.evaluate(hitTest);
      return agentsHit.target_is_labelled;
    }, 10000).catch(() => false);
    write('agents-hit-test.json', agentsHit);
    await page.screenshot({ path: path.join(out, 'sidebar-after.png') });
    fs.writeFileSync(path.join(out, 'sidebar-after-aria.txt'), await page.locator('body').ariaSnapshot());
    assert.equal(agentsReached, true, 'Agents is not the element a pointer reaches');
    await agents.click();
    await page.getByTestId('agent-explorer').getByText('Desktop Workflow Tool Agent', { exact: true }).click();
    await page.getByTestId('skeleton-node-tools').click();
    const section = page.getByTestId('native-workflow-tools-ready');
    await expect(section).toBeVisible();
    await expect(section.getByText(/Pinned: revision/)).toBeVisible();
    await section.getByRole('textbox').first().fill('echo_run'); mark('ui', 'edit Workflow tool id');
    await expect(page.getByTestId('skeleton-save-state')).toHaveText('Unsaved changes');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('skeleton-save-state')).toHaveText('Saved'); mark('ui', 'save edited Workflow tool');
    const saved = await page.evaluate(() => window.unchainAPI.getManagedSkeletonResource('desktop-agent356'));
    write('ui-saved-agent.json', saved);
    assert.equal(saved.resource.document.nodes.find(row => row.id === 'tools').config.workflow_tools[0].id, 'echo_run');
    assert.equal(saved.resource.document.nodes.find(row => row.id === 'tools').config.workflow_tools[0].workflow.revision_id, seeded.published.version.revision_id);
    await page.screenshot({ path: path.join(out, 'saved-tool.png') });
    await page.getByRole('button', { name: 'Close builder', exact: true }).click();
    await page.getByRole('button', { name: 'New chat', exact: true }).click();
    const picker = page.getByTestId('attach-agent-row').getByRole('combobox');
    await picker.click();
    await page.getByRole('listbox').getByText('Desktop Workflow Tool Agent', { exact: true }).click();
    for (const turn of [1, 2]) {
      if (turn === 2) {
        mark('supervisor', 'cold restart after completed first root'); await stop(); page = await launch();
        const cold = await page.evaluate(() => window.unchainAPI.getManagedSkeletonResource('desktop-agent356'));
        write('cold-read-agent.json', cold); assert.deepEqual(cold, saved);
        await expect(page.getByText(final(1), { exact: true })).toBeVisible();
      }
      const input = page.getByRole('textbox', { name: 'Message PuPu...', exact: true });
      await input.fill(`QA356 question ${turn}`); mark('ui', 'composer filled', { turn });
      await sendOnce({ page, input, label: `turn-${turn}`, out, mark, sleep, write });
      await expect(page.getByText(final(turn), { exact: true })).toBeVisible({ timeout: 120000 });
      await expect(page.getByText(final(1), { exact: true })).toBeVisible();
      await page.screenshot({ path: path.join(out, `turn-${turn}.png`) });
      fs.writeFileSync(path.join(out, `turn-${turn}-aria.txt`), await page.locator('body').ariaSnapshot());
      mark('ui', 'root reply visible', { turn, content: final(turn) });
    }
    assert.equal(wires.length, 4); assert.deepEqual(errors, []);
    write('normal-chat.json', await page.evaluate(() => {
      const chatId = window.chatStorageAPI.bootstrap().activeChatId;
      return { chatId, messages: window.chatStorageAPI.readMessages(chatId) };
    }));
    await lifecycle.run({ getPage: () => page, stop, launch });
    assert.equal(wires.length, 10); assert.deepEqual(errors, []);
    write('functional-result.json', { verdict: 'APP_ENTRY_ACCEPTED', roots: 2, offline_provider_requests: wires.length,
      lifecycle_cases: 3,
      real_provider_requests: 0, source: 'real v2 seed; GUI edit/save/picker/Enter; loopback provider transport',
      product_renderer_sandbox: false, product_quit_acceptance: 'NOT_RUN' });
  } finally {
    if (current?.page) {
      await current.page.screenshot({ path: path.join(out, 'last-window.png') }).catch(() => {});
      fs.writeFileSync(path.join(out, 'last-aria.txt'), await current.page.locator('body').ariaSnapshot().catch(String));
    }
    await stop(); await new Promise(resolve => server.close(resolve));
    write('ledger.json', ledger); write('provider-wires.json', wires); write('errors.json', errors);
    write('process-generations.json', generations);
  }
}

run_packaged_workflow_tool_control().catch(error => {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'failure.txt'), String(error.stack || error));
  process.exitCode = 1;
});
