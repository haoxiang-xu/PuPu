/* QA-only B4: real GUI approval/resume, Stop, cold read and child trace. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const copy = value => JSON.parse(JSON.stringify(value));
const { STOP_ICON } = require('./composer_send.cjs');

function createLifecycleControl({ out, write, mark, expect, until, agent, port, sendOnce, sleep }) {
  const workspace = path.join(out, 'lifecycle-workspace');
  fs.mkdirSync(workspace, { recursive: true });
  const counts = {};
  const cases = [];
  const reply = 'QA356 approval done';
  const childReply = 'QA356 child evidence';
  const parentReply = 'QA356 child parent done';
  function responseFor(body) {
    if (!['qa356-approval', 'qa356-cancel', 'qa356-parent', 'qa356-child'].includes(body.model)) return null;
    const at = counts[body.model] || 0;
    counts[body.model] = at + 1;
    assert.equal(body.options.num_ctx, 8192); assert.equal(body.options.num_predict, 128);
    let message;
    if (body.model === 'qa356-approval' || body.model === 'qa356-cancel') {
      const label = body.model === 'qa356-approval' ? 'approve' : 'cancel';
      assert.ok(at < (label === 'approve' ? 2 : 1), 'unexpected approval-model redispatch');
      const exposed = body.tools.find(tool => tool.function.name === 'workflow_mutate');
      assert.ok(exposed);
      assert.deepEqual(exposed.function.parameters.required, ['inputs']);
      message = at === 0 ? { role: 'assistant', content: '', tool_calls: [{ id: label + '-workflow-call', type: 'function',
        function: { name: 'workflow_mutate', arguments: { inputs: { path: path.join(workspace, label + '.txt') } } } }] }
        : { role: 'assistant', content: reply };
      if (at === 1) {
        assert.ok(JSON.stringify(body.messages.filter(row => row.role === 'tool')).includes('lifecycle-source-A'));
        assert.ok(!JSON.stringify(body.messages).includes('lifecycle-source-B'));
      }
    } else if (body.model === 'qa356-parent') {
      assert.ok(at < 2);
      message = at === 0 ? { role: 'assistant', content: '', tool_calls: [{ id: 'parent-delegate', type: 'function',
        function: { name: 'delegate_to_subagent', arguments: { target: 'Reviewer', task: 'review once' } } }] }
        : { role: 'assistant', content: parentReply };
      if (at === 1) assert.ok(JSON.stringify(body.messages).includes(childReply));
    } else {
      assert.equal(at, 0); message = { role: 'assistant', content: childReply };
    }
    return { model: body.model, message, done: true, done_reason: 'stop', prompt_eval_count: 20, eval_count: 7 };
  }
  function base(id, model, name) {
    const document = agent('not-used');
    document.id = id; document.name = name;
    const kernel = document.nodes.find(node => node.id === 'kernel').config.kernel;
    kernel.profile.id = model; kernel.profile.model = model;
    kernel.profile.endpoint = `http://127.0.0.1:${port}`;
    return document;
  }
  const workflow = { schema_version: 1, kind: 'workflow', id: 'qa356-lifecycle-workflow', name: 'Lifecycle write',
    nodes: [
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
    ], edges: [['start', 'write'], ['write', 'code'], ['code', 'end']].map(([a, b], index) => ({ id: 'f' + index,
      kind: 'flow', source_node_id: a, source_port_id: 'out', target_node_id: b, target_port_id: 'in' })) };
  const source = tag => `def main(input,context):\n return {'receipt':'lifecycle-source-${tag}'}\n`;

  async function run({ getPage, stop, launch }) {
    let page = getPage();
    // These cases use an explicit Core pool, so they need an authorized workspace.
    // Set it through the real Workspaces editor: a direct bridge write never
    // reaches the renderer's settings snapshot that the send path reads.
    await page.getByRole('button', { name: 'Workspaces', exact: true }).click();
    const rootInput = page.getByRole('textbox', { name: 'default-workspace-root', exact: true });
    await rootInput.fill(workspace); await rootInput.press('Enter');
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible(); mark('ui', 'default workspace saved through the editor');
    await until(() => page.evaluate(root => window.settingsStorageAPI.bootstrap().namespaces.runtime?.workspace_root === root, workspace), 10000);
    await rootInput.press('Escape'); await expect(rootInput).toHaveCount(0);
    const seeded = await page.evaluate(async ({ workflow, sourceA, approve, cancel, parent }) => {
      const api = window.unchainAPI;
      const saved = await api.saveManagedSkeletonResource({ schema: 'pupu.skeleton-edit.v2', document: workflow,
        expected_edit_token: null, managed_sources: [{ node_path: ['nodes', 2], text: sourceA }] });
      const published = await api.publishManagedSkeletonWorkflow(workflow.id, saved.resource.edit_token);
      const resources = [];
      for (const document of [approve, cancel]) {
        const config = document.nodes.find(node => node.id === 'tools').config;
        config.toolkits = [{ id: 'CoreToolkit', enabled_tools: ['write'] }];
        config.workflow_tools = [{ id: 'mutate', workflow: { workflow_id: workflow.id, revision_id: published.version.revision_id } }];
        resources.push(await api.saveManagedSkeletonResource({ schema: 'pupu.skeleton-edit.v2', document,
          expected_edit_token: null, managed_sources: [] }));
      }
      resources.push(await api.saveManagedSkeletonResource({ schema: 'pupu.skeleton-edit.v2', document: parent,
        expected_edit_token: null, managed_sources: [] }));
      return { saved, published, resources };
    }, { workflow, sourceA: source('A'),
      approve: base('qa356-approve-agent', 'qa356-approval', 'QA356 Approval Agent'),
      cancel: base('qa356-cancel-agent', 'qa356-cancel', 'QA356 Cancel Agent'), parent: (() => {
        const parent = base('qa356-parent-agent', 'qa356-parent', 'QA356 Parent Agent');
        const child = base('qa356-child-agent', 'qa356-child', 'Reviewer Agent');
        for (const document of [parent, child]) {
          document.nodes = document.nodes.filter(node => node.id !== 'tools');
          document.edges = document.edges.filter(edge => edge.kind === 'flow');
        }
        parent.nodes.push({ id: 'reviewers', type: 'subagent_pool', config: { subagents: [{ id: 'reviewer', name: 'Reviewer', description: 'review',
          source: { kind: 'embedded', document: child }, allowed_modes: ['delegate'], output_mode: 'summary', memory_policy: 'ephemeral',
          parallel_safe: true, allowed_tools: null, disabled_tools: [] }] } });
        parent.edges.push({ id: 'attach-reviewer', kind: 'attach', source_node_id: 'kernel', source_port_id: 'attach_bot',
          target_node_id: 'reviewers', target_port_id: 'attach_top' });
        return parent;
      })() });
    write('lifecycle-seed.json', seeded); mark('seed', 'lifecycle resources through real Store; no UI authoring claim');
    async function begin(name, text) {
      await page.getByRole('button', { name: 'New chat', exact: true }).click();
      await page.getByTestId('attach-agent-row').getByRole('combobox').click();
      await page.getByRole('listbox').getByText(name, { exact: true }).click();
      const input = page.getByRole('textbox', { name: 'Message PuPu...', exact: true });
      await input.fill(text);
      await sendOnce({ page, input, label: name.toLowerCase().replaceAll(' ', '-'), out, mark, sleep, write });
    }
    async function snapshot(label) {
      const data = await page.evaluate(async () => {
        const chatId = window.chatStorageAPI.bootstrap().activeChatId;
        const messages = window.chatStorageAPI.readMessages(chatId);
        const assistant = messages.filter(row => row.role === 'assistant');
        if (assistant.length !== 1) throw Error('one owner message required');
        const session = assistant[0].meta?.executionSessionId;
        if (!session) throw Error('exact owner session missing');
        return { chatId, messages, pending: await window.unchainAPI.getPendingInteraction({ session_id: session }) };
      });
      write('lifecycle-' + label + '.json', data);
      return data;
    }
    // Read each Approve card's own trace frame from React's fiber tree (read
    // only) and click only the card whose identity matches the real pending.
    async function provenApproveCard(current, pending) {
      const cards = await current.evaluate(() => [...document.querySelectorAll('button')]
        .filter(button => button.textContent.trim() === 'Approve').map((button, index) => {
          const fiberKey = Object.keys(button).find(key => key.startsWith('__reactFiber$'));
          const keys = []; let frames = null;
          for (let fiber = button[fiberKey], depth = 0; fiber && depth < 200 && !frames; fiber = fiber.return, depth += 1) {
            if (typeof fiber.key === 'string') keys.push(fiber.key);
            if (Array.isArray(fiber.memoizedProps?.frames)) frames = fiber.memoizedProps.frames;
          }
          const seq = keys.map(key => /^(.+)-tool$/.exec(key)?.[1]).find(Boolean) ?? null;
          const frame = (frames || []).find(row => String(row.seq) === String(seq) && row.type === 'tool_call') || null;
          const payload = frame?.payload || {};
          return { index, keys, seq, run_id: frame?.run_id ?? null, session_id: frame?.session_id ?? null, call_id: payload.call_id ?? null,
            confirmation_id: payload.confirmation_id ?? null, interaction_id: payload.interaction_id ?? null,
            tool_name: payload.tool_name ?? null, tool_display_name: payload.tool_display_name ?? null };
        }));
      const expected = { interaction_id: pending.interaction_id, call_id: pending.presentation?.tool_call?.call_id ?? null,
        source_run_id: pending.interaction_source_run_id ?? null, active_attempt_id: pending.active_attempt_id ?? null };
      const matching = cards.filter(card => card.confirmation_id === expected.interaction_id
        && card.interaction_id === expected.interaction_id && expected.call_id && card.call_id === expected.call_id);
      const bySource = matching.filter(card => card.run_id === expected.source_run_id);
      const byAttempt = matching.filter(card => card.run_id === expected.active_attempt_id);
      const proven = bySource.length === 1 ? bySource[0] : (bySource.length === 0 && byAttempt.length === 1 ? byAttempt[0] : null);
      write('lifecycle-approve-identity.json', { cards, pending, expected, matching: matching.map(card => card.index), proven_index: proven ? proven.index : null });
      if (!proven) throw new Error('APPROVAL_CARD_OWNERSHIP_UNPROVEN');
      const handle = await current.evaluateHandle(index => [...document.querySelectorAll('button')]
        .filter(button => button.textContent.trim() === 'Approve')[index], proven.index);
      return handle.asElement();
    }
    async function visibleApproval() {
      // `write` carries a code diff, whose card offers Approve and Reject.
      const allow = page.getByRole('button', { name: 'Approve', exact: true }).first();
      const detail = page.getByRole('button', { name: 'detail', exact: true }).first();
      await until(async () => await allow.isVisible() || await detail.isVisible());
      if (!(await allow.isVisible())) await detail.click();
      await expect(allow).toBeVisible({ timeout: 120000 });
      return allow;
    }
    await begin('QA356 Approval Agent', 'QA356 lifecycle approve');
    await visibleApproval();
    const waiting = await snapshot('approve-waiting');
    assert.equal(waiting.pending.status, 'awaiting_response');
    assert.equal(waiting.pending.kind, 'tool_approval');
    assert.ok(!fs.existsSync(path.join(workspace, 'approve.txt')));
    await page.evaluate(async ({ saved, text }) => window.unchainAPI.saveManagedSkeletonResource({ schema: 'pupu.skeleton-edit.v2',
      document: saved.resource.document, expected_edit_token: saved.resource.edit_token,
      managed_sources: [{ node_path: ['nodes', 2], text }] }), { saved: seeded.saved, text: source('B') });
    mark('seed', 'later draft B saved while A waits; fixed published pin unchanged');
    await (await provenApproveCard(page, waiting.pending)).click(); mark('ui', 'Approve');
    await expect(page.getByText(reply, { exact: true })).toBeVisible({ timeout: 120000 });
    await expect(page.locator('button[aria-label="Stop"],button[aria-label="Stop generating"]')).toHaveCount(0);
    assert.equal(fs.readFileSync(path.join(workspace, 'approve.txt'), 'utf8'), 'approved-exactly-once');
    const approved = await snapshot('approved'); assert.equal(approved.pending.status, 'none');
    cases.push({ name: 'approved', ...approved, expected: reply });

    await begin('QA356 Cancel Agent', 'QA356 lifecycle cancel');
    await visibleApproval(); const beforeCancel = await snapshot('cancel-waiting');
    assert.equal(beforeCancel.pending.status, 'awaiting_response');
    const stopButton = page.locator(`button:has(path[d^="${STOP_ICON}"])`);
    await expect(stopButton).toHaveCount(1); await stopButton.click(); mark('ui', 'Stop exact waiting Workflow tool');
    await until(async () => (await snapshot('cancel-after')).pending.status === 'none');
    await expect(page.getByText('Cancelled · not run', { exact: true }).first()).toBeVisible();
    assert.ok(!fs.existsSync(path.join(workspace, 'cancel.txt')));
    const cancelled = await snapshot('cancelled'); cases.push({ name: 'cancelled', ...cancelled, expected: null });
    await stop(); page = await launch(); mark('supervisor', 'cold read after approval and authoritative cancellation');
    const cold = await snapshot('cold-cancelled');
    assert.deepEqual(cold.messages, cancelled.messages); assert.equal(cold.pending.status, 'none');
    const oldApproved = await page.evaluate(chatId => window.chatStorageAPI.readMessages(chatId), approved.chatId);
    assert.deepEqual(oldApproved, approved.messages);
    await page.screenshot({ path: path.join(out, 'lifecycle-cold.png') });

    await begin('QA356 Parent Agent', 'QA356 lifecycle child');
    await expect(page.getByText(parentReply, { exact: true })).toBeVisible({ timeout: 120000 });
    const detail = page.getByRole('button', { name: 'detail', exact: true }).first();
    if (await detail.isVisible()) await detail.click();
    await expect(page.getByText(/reviewer\.1/).first()).toBeVisible();
    // Exercise the real nested trace control, with its own subtree kept in view.
    const collapse = page.getByRole('button', { name: 'Collapse', exact: true }).last();
    await expect(collapse).toBeVisible(); await collapse.click(); mark('ui', 'collapse child trace');
    await page.getByRole('button', { name: 'Expand', exact: true }).last().click(); mark('ui', 'expand child trace');
    await expect(page.getByText(childReply, { exact: true }).last()).toBeVisible();
    const child = await snapshot('child-completed'); cases.push({ name: 'child', ...child, expected: parentReply });
    fs.writeFileSync(path.join(out, 'lifecycle-child-aria.txt'), await page.locator('body').ariaSnapshot());
    await page.screenshot({ path: path.join(out, 'lifecycle-child.png') });
    assert.deepEqual(counts, { 'qa356-approval': 2, 'qa356-cancel': 1, 'qa356-parent': 2, 'qa356-child': 1 });
    write('lifecycle-result.json', { verdict: 'APP_LIFECYCLE_ACCEPTED', cases, counts,
      cold_ui_scope: 'completed approval and cancelled messages read verbatim; paused cold resume is tested through actual HTTP separately',
      files: fs.readdirSync(workspace).sort(), real_provider_calls: 0 });
  }
  return { responseFor, run };
}

module.exports = { createLifecycleControl };
