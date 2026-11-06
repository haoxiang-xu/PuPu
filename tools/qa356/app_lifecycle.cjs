/* QA-only B4: real GUI approval/resume, Stop, cold read and child trace. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const copy = value => JSON.parse(JSON.stringify(value));
const { STOP_ICON } = require('./composer_send.cjs');
const { checkApprovalResume } = require('./resume_check.cjs');

function createLifecycleControl({ out, write, mark, expect, until, agent, port, sendOnce, sleep }) {
  const workspace = path.join(out, 'lifecycle-workspace');
  fs.mkdirSync(workspace, { recursive: true });
  const counts = {};
  const cases = [];
  const reply = 'QA356 approval done';
  const childReply = 'QA356 child evidence';
  const childEnd = 'QA356 committed child End';
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
        // A parked child's result returns as a derived handoff input, not a tool message.
        write('approval-resume-check.json', checkApprovalResume(body, { callId: 'approve-workflow-call', toolName: 'workflow_mutate',
          arguments: { inputs: { path: path.join(workspace, 'approve.txt') } }, sourceA: 'lifecycle-source-A', sourceB: 'lifecycle-source-B' }));
        assert.ok(!JSON.stringify(body.messages).includes('lifecycle-source-B'));
      }
    } else if (body.model === 'qa356-parent') {
      assert.ok(at < 2);
      message = at === 0 ? { role: 'assistant', content: '', tool_calls: [{ id: 'parent-delegate', type: 'function',
        function: { name: 'delegate_to_subagent', arguments: { target: 'Reviewer', task: 'review once' } } }] }
        : { role: 'assistant', content: parentReply };
      if (at === 1) {
        assert.ok(JSON.stringify(body.messages).includes(childEnd), 'parent did not receive committed child End');
        assert.notEqual(childReply, childEnd);
      }
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
        child.nodes.find(node => node.id === 'end').config.execution.inputs = [{ name: 'message',
          value: { kind: 'literal', value: childEnd }, missing: 'error' }];
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
        return { chatId, owner_session_id: session, owner_message: assistant[0], messages,
          pending: await window.unchainAPI.getPendingInteraction({ session_id: session }) };
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
            for (const key of [fiber.key, fiber.memoizedProps?.item?.key]) if (typeof key === 'string') keys.push(key);
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
    function pendingIdentity(snapshot) {
      const pending = snapshot.pending;
      return { chatId: snapshot.chatId, owner_session_id: snapshot.owner_session_id,
        owner_message: snapshot.owner_message, status: pending.status, kind: pending.kind,
        interaction_id: pending.interaction_id,
        source_run_id: pending.source_run_id ?? null,
        interaction_source_run_id: pending.interaction_source_run_id,
        active_attempt_id: pending.active_attempt_id,
        tool_call: pending.presentation?.tool_call ?? null };
    }
    await begin('QA356 Approval Agent', 'QA356 lifecycle approve');
    await visibleApproval();
    const waiting = await snapshot('approve-waiting');
    assert.equal(waiting.pending.status, 'awaiting_response');
    assert.equal(waiting.pending.kind, 'tool_approval');
    assert.ok(!fs.existsSync(path.join(workspace, 'approve.txt')));
    const draftB = await page.evaluate(async ({ saved, text }) => window.unchainAPI.saveManagedSkeletonResource({ schema: 'pupu.skeleton-edit.v2',
      document: saved.resource.document, expected_edit_token: saved.resource.edit_token,
      managed_sources: [{ node_path: ['nodes', 2], text }] }), { saved: seeded.saved, text: source('B') });
    write('lifecycle-draft-B.json', draftB);
    mark('seed', 'later draft B saved while A waits; fixed published pin unchanged');
    assert.ok(!fs.existsSync(path.join(workspace, 'approve.txt')));
    const approvalCountBeforeCold = counts['qa356-approval'];
    await stop(); page = await launch(); mark('supervisor', 'cold restart while exact approval remains pending');
    const coldWaiting = await snapshot('approve-cold-waiting');
    assert.equal(coldWaiting.pending.status, 'awaiting_response');
    assert.equal(coldWaiting.pending.kind, 'tool_approval');
    assert.deepEqual(pendingIdentity(coldWaiting), pendingIdentity(waiting), 'pending owner or payload changed across App restart');
    assert.equal(counts['qa356-approval'], approvalCountBeforeCold, 'cold waiting App auto-dispatched or resumed');
    assert.ok(!fs.existsSync(path.join(workspace, 'approve.txt')), 'approval side effect occurred before explicit click');
    const coldResource = await page.evaluate(() => window.unchainAPI.getManagedSkeletonResource('qa356-approve-agent'));
    const pinnedBefore = seeded.resources[0].resource.document.nodes.find(node => node.id === 'tools')
      .config.workflow_tools[0].workflow.revision_id;
    assert.equal(coldResource.resource.document.nodes.find(node => node.id === 'tools')
      .config.workflow_tools[0].workflow.revision_id, pinnedBefore);
    await visibleApproval();
    const card = await provenApproveCard(page, coldWaiting.pending);
    const coldApprovalTool = coldResource.resource.document.nodes.find(node => node.id === 'tools')
      .config.workflow_tools[0];
    assert.equal(coldApprovalTool.workflow.revision_id, pinnedBefore);
    write('lifecycle-approval-cold-check.json', { before: pendingIdentity(waiting), after: pendingIdentity(coldWaiting),
      approval_provider_count_before_restart: approvalCountBeforeCold, approval_provider_count_after_restart: counts['qa356-approval'],
      pinned_revision: pinnedBefore, pinned_after: coldApprovalTool.workflow.revision_id,
      draft_B: draftB, side_effect_absent_before_click: true });
    await card.click(); mark('ui', 'Approve once after cold restart');
    await expect(page.getByText(reply, { exact: true })).toBeVisible({ timeout: 120000 });
    await expect(page.locator('button[aria-label="Stop"],button[aria-label="Stop generating"]')).toHaveCount(0);
    assert.equal(fs.readFileSync(path.join(workspace, 'approve.txt'), 'utf8'), 'approved-exactly-once');
    assert.equal(counts['qa356-approval'], 2, 'approval must have one request and one resume only');
    write('lifecycle-approval-action.json', { interaction_id: coldWaiting.pending.interaction_id,
      proven_card: JSON.parse(fs.readFileSync(path.join(out, 'lifecycle-approve-identity.json'), 'utf8')),
      pointer_clicks: 1, provider_count_after_resume: counts['qa356-approval'] });
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
    // Resolve the worker-owned arrow from its own reviewer.1 + completed title,
    // and distinguish it from the outer Reviewer delegate summary arrow.
    let ownedWorker = null;
    const childInventory = async () => page.evaluate(ownedWorker => {
      const buttons = [...document.querySelectorAll('button[aria-label="Collapse"],button[aria-label="Expand"]')];
      const describe = (button, index) => {
        const fiberKey = Object.keys(button).find(key => key.startsWith('__reactFiber$'));
        const fiber = fiberKey ? button[fiberKey] : null;
        const component = [];
        for (let node = fiber, depth = 0; node && depth < 8; node = node.return, depth++) {
          const name = node.type?.displayName || node.type?.name || node.elementType?.name;
          if (name) component.push(name);
        }
        const ancestors = [];
        for (let node = button.parentElement, depth = 0; node && depth < 5; node = node.parentElement, depth++)
          ancestors.push({ tag: node.tagName.toLowerCase(), text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180),
            buttons: node.querySelectorAll('button[aria-label="Collapse"],button[aria-label="Expand"]').length });
        return { index, label: button.getAttribute('aria-label'), component,
          react_open: fiber?.return?.memoizedProps?.open ?? fiber?.memoizedProps?.open ?? null, ancestors };
      };
      const arrows = buttons.map(describe);
      const workerSpans = [...document.querySelectorAll('span')].filter(span => {
        const text = (span.textContent || '').replace(/\s+/g, '');
        return /reviewer\.1/i.test(text) && /completed/i.test(text) &&
          span.querySelectorAll('button[aria-label="Collapse"],button[aria-label="Expand"]').length === 1;
      }).sort((a, b) => a.textContent.length - b.textContent.length);
      const summarySpans = [...document.querySelectorAll('span')].filter(span => {
        const text = (span.textContent || '').replace(/\s+/g, '');
        return /Reviewer/.test(text) && !/reviewer\.1/i.test(text) &&
          span.querySelectorAll('button[aria-label="Collapse"],button[aria-label="Expand"]').length === 1;
      }).sort((a, b) => a.textContent.length - b.textContent.length);
      const choose = candidates => {
        if (!candidates.length) return { node: null, count: 0 };
        const shortestLength = candidates[0].textContent.replace(/\s+/g, '').length;
        const shortest = candidates.filter(span => span.textContent.replace(/\s+/g, '').length === shortestLength);
        const targets = new Map();
        for (const span of shortest) {
          const button = span.querySelector('button[aria-label="Collapse"],button[aria-label="Expand"]');
          if (button && !targets.has(button)) targets.set(button, span);
        }
        return { node: targets.size === 1 ? targets.values().next().value : null, count: targets.size };
      };
      const selectedWorker = choose(workerSpans), selectedSummary = choose(summarySpans);
      const target = span => span?.querySelector('button[aria-label="Collapse"],button[aria-label="Expand"]') || null;
      const worker = target(selectedWorker.node), summary = target(selectedSummary.node);
      const ownedTitle = (span, button) => {
        const text = node => node === button ? '' : node.nodeType === 3 ? node.nodeValue || ''
          : [...node.childNodes].map(text).join('');
        return span ? text(span).replace(/\s+/g, ' ').trim() : null;
      };
      const clippingAncestors = [];
      let geometryComplete = !!worker && !!summary;
      let node = worker?.parentElement;
      for (let depth = 0; node && depth < 32; node = node.parentElement, depth++) {
        const style = getComputedStyle(node), height = node.getBoundingClientRect().height;
        if (!Number.isFinite(height)) geometryComplete = false;
        if (/^(hidden|clip|scroll|auto)$/.test(style.overflowY) && !node.contains(summary))
          clippingAncestors.push({ depth, tag: node.tagName.toLowerCase(), height, overflow_y: style.overflowY,
            contains_worker: node.contains(worker), contains_summary: node.contains(summary) });
      }
      const workerHeight = worker?.getBoundingClientRect().height;
      geometryComplete = geometryComplete && !node && Number.isFinite(workerHeight);
      return { arrows, worker_matches: selectedWorker.count, summary_matches: selectedSummary.count,
        worker_index: buttons.indexOf(worker), summary_index: buttons.indexOf(summary),
        worker_title: selectedWorker.node?.textContent || null, summary_title: selectedSummary.node?.textContent || null,
        worker_owned_title: ownedTitle(selectedWorker.node, worker), worker_is_same: !!ownedWorker && worker === ownedWorker,
        worker_geometry: { complete: geometryComplete, height: workerHeight ?? null, clipping_ancestors: clippingAncestors,
          collapsed_clipped: clippingAncestors.some(row => row.height === 0 && row.contains_worker && !row.contains_summary) } };
    }, ownedWorker);
    const captureChildState = async label => {
      const saved = await snapshot('child-arrow-' + label);
      const dom = await childInventory();
      write('lifecycle-child-arrow-' + label + '.json', { dom, owner_message: saved.owner_message,
        child_frame_counts: Object.fromEntries(Object.entries(saved.owner_message.subagentFrames || {})
          .map(([run, frames]) => [run, Array.isArray(frames) ? frames.length : 0])),
        persisted_subagent_meta: saved.owner_message.subagentMetaByRunId || {} });
      return dom;
    };
    const clickArrow = async (kind) => page.evaluateHandle((selection) => {
      const buttons = [...document.querySelectorAll('button[aria-label="Collapse"],button[aria-label="Expand"]')];
      const spans = [...document.querySelectorAll('span')];
      const candidates = spans.filter(span => {
        const text = (span.textContent || '').replace(/\s+/g, '');
        const count = span.querySelectorAll('button[aria-label="Collapse"],button[aria-label="Expand"]').length;
        return selection === 'worker'
          ? /reviewer\.1/i.test(text) && /completed/i.test(text) && count === 1
          : /Reviewer/.test(text) && !/reviewer\.1/i.test(text) && count === 1;
      }).sort((a, b) => a.textContent.length - b.textContent.length);
      const shortestLength = candidates[0]?.textContent.replace(/\s+/g, '').length;
      const shortest = candidates.filter(span => span.textContent.replace(/\s+/g, '').length === shortestLength);
      const targets = new Set(shortest.map(span => span.querySelector('button[aria-label="Collapse"],button[aria-label="Expand"]')).filter(Boolean));
      if (targets.size !== 1) throw new Error('TRACE_ARROW_TITLE_NOT_UNIQUE:' + selection);
      const button = targets.values().next().value;
      if (!button || buttons.indexOf(button) < 0) throw new Error('TRACE_ARROW_OWNER_UNRESOLVED:' + selection);
      return button;
    }, kind);
    ownedWorker = await clickArrow('worker');
    const initialArrows = await captureChildState('before-outer-collapse');
    assert.equal(initialArrows.worker_matches, 1, 'worker title/arrow is not uniquely identifiable');
    assert.equal(initialArrows.summary_matches, 1, 'outer delegate title/arrow is not uniquely identifiable');
    assert.notEqual(initialArrows.worker_index, initialArrows.summary_index, 'worker and outer arrows must differ');
    assert.equal(initialArrows.worker_is_same, true);
    assert.equal(initialArrows.worker_geometry.complete, true);
    assert.ok(initialArrows.worker_geometry.height > 0);
    assert.equal(initialArrows.worker_geometry.collapsed_clipped, false);
    const outerInitialLabel = initialArrows.arrows[initialArrows.summary_index].label;
    const outerCollapse = await clickArrow('summary');
    await outerCollapse.asElement().click(); mark('ui', 'collapse outer delegate summary by pointer');
    await until(async () => {
      const dom = await childInventory();
      return dom.worker_matches === 1 && dom.summary_matches === 1 && dom.worker_is_same &&
        dom.worker_owned_title === initialArrows.worker_owned_title && dom.worker_geometry.complete &&
        dom.worker_geometry.collapsed_clipped && dom.arrows[dom.summary_index]?.label === 'Expand';
    }, 10000);
    const outerClosed = await captureChildState('after-outer-collapse');
    assert.ok(outerClosed.summary_index >= 0);
    assert.equal(outerClosed.arrows[outerClosed.summary_index].label, 'Expand');
    assert.equal(outerClosed.worker_matches, 1);
    assert.equal(outerClosed.worker_is_same, true);
    assert.equal(outerClosed.worker_owned_title, initialArrows.worker_owned_title);
    assert.equal(outerClosed.worker_geometry.complete, true);
    assert.equal(outerClosed.worker_geometry.collapsed_clipped, true, 'retained worker must be clipped by its collapsed branch');
    await captureChildState('before-outer-expand');
    const outerExpand = await clickArrow('summary'); await outerExpand.asElement().click();
    mark('ui', 'expand outer delegate summary by pointer');
    await until(async () => {
      const dom = await childInventory();
      return dom.worker_matches === 1 && dom.summary_matches === 1 && dom.worker_is_same &&
        dom.worker_owned_title === initialArrows.worker_owned_title && dom.worker_geometry.complete &&
        dom.worker_geometry.height > 0 && !dom.worker_geometry.collapsed_clipped &&
        dom.arrows[dom.summary_index]?.label === outerInitialLabel;
    }, 10000);
    const outerOpen = await captureChildState('after-outer-expand');
    assert.ok(outerOpen.worker_index >= 0);
    assert.equal(outerOpen.worker_is_same, true);
    assert.equal(outerOpen.worker_owned_title, initialArrows.worker_owned_title);
    assert.equal(outerOpen.worker_geometry.complete, true);
    assert.equal(outerOpen.worker_geometry.collapsed_clipped, false);
    assert.notEqual(outerOpen.worker_index, outerOpen.summary_index);
    assert.equal(outerOpen.arrows[outerOpen.summary_index].label, outerInitialLabel);
    let workerState = outerOpen;
    if (workerState.arrows[workerState.worker_index].label === 'Expand') {
      await captureChildState('before-worker-expand-initial');
      const initialExpand = await clickArrow('worker'); await initialExpand.asElement().click();
      mark('ui', 'expand initially collapsed reviewer.1 worker by pointer');
      workerState = await captureChildState('after-worker-expand-initial');
      assert.equal(workerState.arrows[workerState.worker_index].label, 'Collapse');
    }
    assert.equal(workerState.worker_owned_title, initialArrows.worker_owned_title);
    await captureChildState('before-worker-collapse');
    const workerCollapse = await clickArrow('worker'); await workerCollapse.asElement().click();
    mark('ui', 'collapse reviewer.1 worker arrow by pointer');
    const workerClosed = await captureChildState('after-worker-collapse');
    assert.ok(workerClosed.worker_index >= 0 && workerClosed.summary_index >= 0);
    assert.notEqual(workerClosed.worker_index, workerClosed.summary_index);
    assert.equal(workerClosed.worker_owned_title, workerState.worker_owned_title);
    assert.equal(workerClosed.worker_is_same, true);
    assert.equal(workerClosed.arrows[workerClosed.worker_index].label, 'Expand');
    assert.equal(workerClosed.arrows[workerClosed.summary_index].label, outerInitialLabel);
    await captureChildState('before-worker-expand');
    const workerExpand = await clickArrow('worker'); await workerExpand.asElement().click();
    mark('ui', 'expand reviewer.1 worker arrow by pointer');
    const workerOpen = await captureChildState('after-worker-expand');
    assert.equal(workerOpen.worker_owned_title, workerClosed.worker_owned_title);
    assert.equal(workerOpen.worker_is_same, true);
    assert.equal(workerOpen.arrows[workerOpen.worker_index].label, 'Collapse');
    assert.equal(workerOpen.arrows[workerOpen.summary_index].label, outerInitialLabel);
    await expect(page.getByText(childEnd, { exact: true })).toBeVisible();
    await expect(page.getByText(childReply, { exact: true })).toBeVisible();
    const child = await snapshot('child-completed'); cases.push({ name: 'child', ...child, expected: parentReply });
    fs.writeFileSync(path.join(out, 'lifecycle-child-aria.txt'), await page.locator('body').ariaSnapshot());
    await page.screenshot({ path: path.join(out, 'lifecycle-child.png') });
    assert.deepEqual(counts, { 'qa356-approval': 2, 'qa356-cancel': 1, 'qa356-parent': 2, 'qa356-child': 1 });
    write('lifecycle-result.json', { verdict: 'APP_LIFECYCLE_ACCEPTED', cases, counts, childReply, childEnd,
      cold_ui_scope: 'approval was pending across an actual full App restart before explicit identity-bound Approve; cancelled and completed reads also persisted',
      files: fs.readdirSync(workspace).sort(), real_provider_calls: 0 });
  }
  return { responseFor, run };
}

module.exports = { createLifecycleControl };
