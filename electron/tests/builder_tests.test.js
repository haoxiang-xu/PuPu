const PRODUCER = require('../../src/SERVICEs/__fixtures__/builder-test/producer.json');
const { CHANNELS } = require('../shared/channels');
const { createSkeletonResourceReply } = require('../shared/skeleton_resource_transport');
const { createMisoBridge } = require('../preload/bridges/unchain_bridge');
const { resolveSkeletonCredentials } = require('../main/services/unchain/skeleton_credentials');
const { checkBuilderTestCommand, checkBuilderTestReply, runBuilderTestCommand } = require('../main/services/unchain/builder_tests');

const copy = (value) => JSON.parse(JSON.stringify(value));
const packet = (name) => copy(PRODUCER.packets[name]);
const publicReplies = Object.entries(PRODUCER.packets).filter(([, value]) => Array.isArray(value.runs));
const resourceRequest = (reply) => ({
  op: 'read', resource_id: reply.session.resource_id, session_id: reply.session.id, kind: reply.session.kind,
});
const startRequest = (resource_id, session_id, workspace_id = '') => ({
  op: 'start', resource_id, session_id, expected_edit_token: 'edit-1', request_id: 'request-one',
  inputs: { city: 'Toronto' }, toolkits: [], workspace_id,
});
const streamClient = () => ({
  startStream: jest.fn(), cancelStream: jest.fn(), cancelExecution: jest.fn(),
  startStreamV2: jest.fn(), startStreamV4: jest.fn(), attachStreamV4: jest.fn(),
});

// Every real Main/Store/runtime resource reply is admitted by the production validator.
test.each(publicReplies)('production reply %s passes checkBuilderTestReply', (_name, reply) => {
  expect(checkBuilderTestReply(reply, resourceRequest(reply))).toBe(reply);
});

test('pure Workflow start uses the captured public producer packets and performs zero secret reads', async () => {
  const prepared = packet('workflow-prepare');
  const opened = packet('workflow-completed');
  const post = jest.fn()
    .mockResolvedValueOnce(packet('capabilities'))
    .mockResolvedValueOnce(prepared)
    .mockResolvedValueOnce(opened);
  const secretReader = jest.fn(() => 'must-not-be-read');
  const resolveCredentials = jest.fn((requirements, query) => resolveSkeletonCredentials(requirements, query, { readSecret: secretReader }));
  const request = startRequest(prepared.resource_id, prepared.session_id);

  const result = await runBuilderTestCommand(request, {
    post, resolveCredentials, resolveWorkspace: jest.fn(() => ({ valid: true })),
  });

  expect(result).toEqual(opened);
  expect(resolveCredentials).not.toHaveBeenCalled();
  expect(secretReader).not.toHaveBeenCalled();
  expect(post.mock.calls[1][0]).toMatchObject({ op: 'prepare', inputs: { city: 'Toronto' }, request_id: request.request_id });
  expect(post.mock.calls[1][0].context).toEqual({ toolkits: [], skills: { include_user_dirs: true }, workspace_root: null, workspace_roots: [], disable_workspace_root: true });
  expect(post.mock.calls[2][0]).toMatchObject({ op: 'execute', options: { skeleton_credentials: {} } });
  expect(post.mock.calls[2][0].options).not.toHaveProperty('toolkits');
  expect(post.mock.calls[2][0].options).not.toHaveProperty('workspace_root');
});

test.each([
  ['first Agent start', 'agent-prepare-0', 'agent-turn-0'],
  ['next Agent start', 'agent-prepare-1', 'agent-turn-1'],
])('%s resolves its captured credential query with Main resolver and returns no secret', async (_name, prepareName, replyName) => {
  const prepared = packet(prepareName);
  const opened = packet(replyName);
  const sentinel = 'sentinel-secret-never-returned';
  const secretReader = jest.fn((kind, id) => {
    expect([kind, id]).toEqual(['provider', 'openai']);
    return sentinel;
  });
  const post = jest.fn()
    .mockResolvedValueOnce(packet('capabilities'))
    .mockResolvedValueOnce(prepared)
    .mockResolvedValueOnce(opened);
  const request = startRequest(prepared.resource_id, prepared.session_id);

  const result = await runBuilderTestCommand(request, {
    post,
    resolveWorkspace: jest.fn(() => ({ valid: true })),
    resolveCredentials: (requirements, query) => resolveSkeletonCredentials(requirements, query, { readSecret: secretReader }),
  });

  expect(result).toEqual(opened);
  expect(secretReader).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[2][0].options.skeleton_credentials.openai.api_key).toBe(sentinel);
  expect(post.mock.calls[2][0].options.openaiApiKey).toBe(sentinel);
  expect(post.mock.calls[1][0].context).toEqual({ toolkits: [], skills: { include_user_dirs: true }, workspace_root: null, workspace_roots: [], disable_workspace_root: true });
  expect(JSON.stringify(result)).not.toContain(sentinel);
});

test('workspace ids resolve only through the trusted identity validator, never from a caller path', async () => {
  const prepared = packet('workflow-prepare');
  const opened = packet('workflow-completed');
  const post = jest.fn()
    .mockResolvedValueOnce(packet('capabilities'))
    .mockResolvedValueOnce(prepared)
    .mockResolvedValueOnce(opened);
  const resolveWorkspace = jest.fn((id) => ({ valid: true, resolvedPath: '/trusted/workspaces/project' }));
  const request = startRequest(prepared.resource_id, prepared.session_id, 'workspace-project');

  await runBuilderTestCommand(request, { post, resolveWorkspace });
  expect(resolveWorkspace).toHaveBeenCalledWith('workspace-project');
  expect(post.mock.calls[1][0].context).toMatchObject({
    workspace_root: '/trusted/workspaces/project', workspace_roots: ['/trusted/workspaces/project'], disable_workspace_root: false,
  });
  expect(post.mock.calls[2][0].options).not.toHaveProperty('workspace_root');
  expect(post.mock.calls[2][0].options).not.toHaveProperty('toolkits');
  expect(() => checkBuilderTestCommand({ ...request, workspace_id: '/tmp/caller-path' })).toThrow();
  expect(() => checkBuilderTestCommand({ ...request, workspace_root: '/tmp/caller-path' })).toThrow();
});

test('fixed requests detach nested input before awaits and refuse non-JSON numbers and unknown fields', async () => {
  const prepared = packet('workflow-prepare');
  const opened = packet('workflow-completed');
  const source = startRequest(prepared.resource_id, prepared.session_id);
  const ready = checkBuilderTestCommand(source);
  source.inputs.city = 'mutated after admission';
  expect(ready.inputs.city).toBe('Toronto');

  expect(() => checkBuilderTestCommand({ ...source, extra: true })).toThrow();
  expect(() => checkBuilderTestCommand({ ...source, inputs: { temperature: NaN } })).toThrow();
  expect(() => checkBuilderTestCommand({ ...source, inputs: { temperature: Infinity } })).toThrow();

  let releaseCapabilities;
  const capabilitiesGate = new Promise((resolve) => { releaseCapabilities = resolve; });
  const calls = [];
  const post = jest.fn(async (body) => {
    calls.push(body);
    if (calls.length === 1) {
      await capabilitiesGate;
      return packet('capabilities');
    }
    return calls.length === 2 ? prepared : opened;
  });
  const asyncSource = startRequest(prepared.resource_id, prepared.session_id);
  asyncSource.memory_agent_config = {
    displayName: 'Memory helper', additionalInstructions: '', provider: 'openai', modelId: 'memory-model',
  };
  const running = runBuilderTestCommand(asyncSource, {
    post, resolveWorkspace: jest.fn(() => ({ valid: true })),
  });
  asyncSource.inputs.city = 'mutated before capability reply';
  asyncSource.toolkits.push('mutated-toolkit');
  asyncSource.memory_agent_config.displayName = 'mutated after admission';
  releaseCapabilities();
  await running;
  expect(calls[1].inputs.city).toBe('Toronto');
  expect(calls[1].context.toolkits).toEqual([]);
  expect(calls[1].context).toEqual({ toolkits: [], skills: { include_user_dirs: true }, workspace_root: null, workspace_roots: [], disable_workspace_root: true });
  expect(calls[1].memory_agent_config.displayName).toBe('Memory helper');
  expect(() => checkBuilderTestCommand({ ...startRequest(prepared.resource_id, prepared.session_id),
    memory_agent_config: { displayName: 'Memory', additionalInstructions: '', provider: 'openai', modelId: 'm', extra: true },
  })).toThrow();
});

test('untrusted credential payloads and workspace ids outside the resolver never dispatch', async () => {
  const post = jest.fn();
  const request = startRequest('demo', 'builder-test-one');
  await expect(runBuilderTestCommand({ ...request, options: { skeleton_credentials: { key: 'bad' } } }, { post })).rejects.toThrow();
  const resolveWorkspace = jest.fn(() => ({ valid: false }));
  await expect(runBuilderTestCommand({ ...request, workspace_id: 'unknown-workspace' }, { post, resolveWorkspace })).rejects.toThrow();
  expect(resolveWorkspace).toHaveBeenCalledWith('unknown-workspace');
  expect(post).not.toHaveBeenCalled();
});

test('wrong-session private prepare response is refused before execute', async () => {
  const prepared = packet('workflow-prepare');
  prepared.session_id = 'another-session';
  const post = jest.fn().mockResolvedValueOnce(packet('capabilities')).mockResolvedValueOnce(prepared);
  await expect(runBuilderTestCommand(startRequest(prepared.resource_id, 'builder-test-expected'), {
    post, resolveWorkspace: jest.fn(() => ({ valid: true })),
  })).rejects.toMatchObject({ code: 'builder_test_protocol_error' });
  expect(post).toHaveBeenCalledTimes(2);
});

test('malformed producer mutations are refused without relaxing the reply contract', () => {
  const mutations = [
    ['wrong session', (reply) => { reply.session.id = 'foreign-session'; }],
    ['wrong resource', (reply) => { reply.session.resource_id = 'foreign-resource'; }],
    ['unknown run state', (reply) => { reply.runs[0].status = 'succeeded'; }],
    ['foreign event session', (reply) => { reply.runs[0].events[0].session_id = 'foreign-session'; }],
    ['contradictory pending confirmation id', (reply) => {
      const run = reply.runs.find((item) => item.pending !== null);
      run.pending.presentation.tool_call.confirmation_id = 'other-interaction';
    }],
    ['output before completion', (reply) => { reply.runs[0].status = 'running'; }],
    ['malformed error path', (reply) => { reply.runs[0].error.path = [null]; }],
    ['duplicate run', (reply) => { reply.runs.push(copy(reply.runs[0])); }],
  ];
  const samples = [
    packet('workflow-completed'), packet('workflow-completed'), packet('workflow-completed'),
    packet('workflow-completed'), packet('workflow-waiting-approve'), packet('workflow-completed'),
    packet('workflow-deny'), packet('agent-turn-0'),
  ];
  mutations.forEach(([_name, mutate], index) => {
    const reply = samples[index];
    const request = resourceRequest(copy(reply));
    mutate(reply);
    expect(() => checkBuilderTestReply(reply, request)).toThrow();
  });
});

test('Main preload bridge sends the fixed channel/action envelope and unwraps success', async () => {
  const reply = packet('workflow-open');
  const ipcRenderer = { invoke: jest.fn(async (channel, command) => {
    expect(channel).toBe(CHANNELS.UNCHAIN.SKELETON_RESOURCE_COMMAND);
    expect(command).toEqual({ action: 'builder_test', payload: { op: 'read', resource_id: reply.session.resource_id, session_id: reply.session.id } });
    return createSkeletonResourceReply(() => reply);
  }) };
  const bridge = createMisoBridge(ipcRenderer, streamClient());

  await expect(bridge.builderTestCommand({ op: 'read', resource_id: reply.session.resource_id, session_id: reply.session.id })).resolves.toEqual(reply);
  expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
});

test('preload preserves producer refusal code, path, message and HTTP status', async () => {
  const ipcRenderer = { invoke: jest.fn(async () => createSkeletonResourceReply(() => {
    throw Object.assign(new Error('Parameter was refused'), {
      code: 'missing_value', path: ['inputs', 'city'], status: 422,
    });
  })) };
  const bridge = createMisoBridge(ipcRenderer, streamClient());

  await expect(bridge.builderTestCommand({ op: 'read', resource_id: 'workflow', session_id: 'builder-test-session' }))
    .rejects.toMatchObject({ code: 'missing_value', path: ['inputs', 'city'], message: 'Parameter was refused', status: 422 });
});

test('an Agent start may name one model for unconfigured Agent nodes; Main resolves its profile from the Kernel catalog', async () => {
  const kimi = { id: 'custom.kimi:kimi-k2.6', provider: 'custom.kimi', model: 'kimi-k2.6', credential_ref: 'custom.kimi',
    protocol: 'anthropic', endpoint: 'https://api.example.test/anthropic', auth_mode: undefined,
    context_window: 262144, output_limit: 32768, capabilities: { json_schema: false, images: false, files: false } };
  const catalog = { profiles: [kimi], unavailable: [{ id: 'custom.kimi:no-cap', provider: 'custom.kimi', model: 'no-cap', reason: 'output_limit_unknown' }] };
  const prepared = packet('workflow-prepare');
  const post = jest.fn()
    .mockResolvedValueOnce(packet('capabilities'))
    .mockResolvedValueOnce(prepared)
    .mockResolvedValueOnce(packet('workflow-completed'));
  const base = startRequest(prepared.resource_id, prepared.session_id);
  const resolveKernelCatalog = jest.fn(async () => catalog);
  await runBuilderTestCommand({ ...base, fallback_model: kimi.id }, { post, resolveCredentials: jest.fn(), resolveWorkspace: jest.fn(), resolveKernelCatalog });
  const sent = post.mock.calls[1][0];
  expect(sent).not.toHaveProperty('fallback_model');
  expect(sent.fallback_profile).toEqual(JSON.parse(JSON.stringify(kimi)));
  expect(post.mock.calls[2][0]).not.toHaveProperty('fallback_profile');
  // A model the catalog lists as unusable, or does not list, is refused with its reason before anything is sent.
  const quiet = jest.fn();
  await expect(runBuilderTestCommand({ ...base, fallback_model: 'custom.kimi:no-cap' }, { post: quiet, resolveKernelCatalog }))
    .rejects.toMatchObject({ code: 'test_model_unavailable', status: 409, path: ['fallback_model', 'output_limit_unknown'] });
  await expect(runBuilderTestCommand({ ...base, fallback_model: 'openai:gone' }, { post: quiet, resolveKernelCatalog }))
    .rejects.toMatchObject({ code: 'test_model_unavailable', path: ['fallback_model', 'not_offered'] });
  expect(quiet).not.toHaveBeenCalled();
  for (const bad of ['', 'gpt-4.1', 'openai:', 'openai:has space', { provider: 'openai' }]) {
    expect(() => checkBuilderTestCommand({ ...base, fallback_model: bad })).toThrow(expect.objectContaining({ code: 'builder_test_command_refused' }));
  }
  expect(() => checkBuilderTestCommand({ op: 'read', resource_id: 'r', session_id: 's', fallback_model: 'openai:gpt-4.1' }))
    .toThrow(expect.objectContaining({ code: 'builder_test_command_refused' }));
});
