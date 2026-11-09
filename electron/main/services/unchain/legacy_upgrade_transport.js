// Independent strict consumer of the Python upgrade producer. Canonical
// payload JSON remains authoritative; never reserialize it to verify a digest.
const { createHash } = require('crypto');
const ACTIONS = new Set(['legacy_upgrade_capabilities', 'legacy_upgrade_inventory', 'legacy_upgrade_preview', 'legacy_upgrade_apply']);
const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const fail = () => { throw Object.assign(new Error('Invalid legacy Agent upgrade protocol'), { code: 'legacy_upgrade_protocol_error', path: [], status: null }); };
const requireValid = value => { if (!value) fail(); };
const closed = (v, keys, optional = []) => requireValid(object(v) && keys.every(k => own(v, k)) && Reflect.ownKeys(v).every(k => typeof k === 'string' && [...keys, ...optional].includes(k) && own(Object.getOwnPropertyDescriptor(v, k), 'value')));
const text = v => typeof v === 'string' && v.length > 0 && v.trim() === v;
const storedText = v => typeof v === 'string' && v.length > 0;
const id = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}(?![\s\S])/.test(v);
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}(?![\s\S])/.test(v);
const manifestDigest = v => typeof v === 'string' && /^sha256:[a-f0-9]{64}(?![\s\S])/.test(v);
const utf8 = value => { requireValid(typeof value === 'string'); const b = Buffer.from(value, 'utf8'); requireValid(b.toString('utf8') === value); return b; };
const hash = value => createHash('sha256').update(utf8(value)).digest('hex');
const parseUniqueJson = raw => {
  let value; try { value = JSON.parse(raw); } catch { return fail(); }
  // JSON.parse validates grammar but silently keeps the last duplicate key.
  // Tokenize strings atomically so braces/commas inside prompts are not keys.
  const tokens = /"(?:\\.|[^"\\])*"|[{}[\]:,]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g;
  const stack = [];
  for (const match of raw.matchAll(tokens)) {
    const token = match[0], top = stack[stack.length - 1];
    if (token === '{') stack.push({ object: true, key: true, keys: new Set() });
    else if (token === '[') stack.push({ object: false });
    else if (token === '}' || token === ']') stack.pop();
    else if (token === ',') { if (top?.object) top.key = true; }
    else if (token[0] === '"' && top?.object && top.key) {
      const key = JSON.parse(token); requireValid(!top.keys.has(key)); top.keys.add(key); top.key = false;
    }
  }
  return value;
};
const copy = value => Array.isArray(value) ? value.map(copy) : object(value) ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)])) : value;
const json = value => {
  const seen = new Set();
  const visit = (v, depth) => {
    requireValid(depth <= 128);
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'string') { utf8(v); return; }
    if (typeof v === 'number') { requireValid(Number.isFinite(v) && (!Number.isInteger(v) || Number.isSafeInteger(v))); return; }
    requireValid(typeof v === 'object' && !seen.has(v)); seen.add(v);
    if (Array.isArray(v)) {
      requireValid(Object.getPrototypeOf(v) === Array.prototype && Reflect.ownKeys(v).length === v.length + 1);
      for (let i = 0; i < v.length; i++) { const d = Object.getOwnPropertyDescriptor(v, String(i)); requireValid(d && own(d, 'value')); visit(d.value, depth + 1); }
    } else {
      requireValid(object(v));
      for (const key of Reflect.ownKeys(v)) { const d = Object.getOwnPropertyDescriptor(v, key); requireValid(typeof key === 'string' && d.enumerable && own(d, 'value')); utf8(key); visit(d.value, depth + 1); }
    }
    seen.delete(v);
  };
  visit(value, 0);
};
const address = path => Array.isArray(path) && path.length > 0 && path.length <= 64 && path.every(p => (typeof p === 'string' && p.length > 0) || (Number.isSafeInteger(p) && p >= 0));
const names = value => Array.isArray(value) && value.every(text) && new Set(value).size === value.length;
const storedNames = value => Array.isArray(value) && value.every(storedText) && new Set(value).size === value.length;
const checkChoices = value => {
  closed(value, ['schema', 'kernels', 'toolkits', 'references', 'acknowledged']);
  requireValid(value.schema === 'pupu.skeleton-legacy-upgrade.choices.v1');
  for (const category of ['kernels', 'toolkits', 'references', 'acknowledged']) {
    requireValid(Array.isArray(value[category])); const seen = new Set();
    for (const row of value[category]) {
      const fields = { kernels: ['path', 'kernel', 'model_policy', 'prompt_policy', 'accept_projection'], toolkits: ['path', 'toolkit_id', 'enabled_tools', 'discard_unsupported'], references: ['path', 'source_scope', 'agent_id'], acknowledged: ['path', 'code'] };
      closed(row, fields[category]); requireValid(address(row.path));
      const key = JSON.stringify([row.path, category === 'acknowledged' ? row.code : null]); requireValid(!seen.has(key)); seen.add(key);
      if (category === 'kernels') requireValid(object(row.kernel) && row.kernel.schema_version === 1 && ['preserve', 'replace'].includes(row.model_policy) && ['preserve', 'replace'].includes(row.prompt_policy) && row.accept_projection === true);
      if (category === 'toolkits') requireValid(text(row.toolkit_id) && (row.enabled_tools === null || names(row.enabled_tools)) && typeof row.discard_unsupported === 'boolean');
      if (category === 'references') requireValid(text(row.source_scope) && id(row.agent_id));
      if (category === 'acknowledged') requireValid(['legacy_setting_ignored', 'legacy_prompt_review_required'].includes(row.code));
    }
  }
};
const sorted = values => values.every((v, i) => typeof v === 'string' && /^[a-z][a-z0-9_.-]*(?![\s\S])/.test(v) && (!i || values[i - 1] < v));
const checkManifest = manifest => {
  closed(manifest, ['schema', 'runtime', 'manifest_digest', 'protocols']);
  requireValid(manifest.schema === 'unchain.runtime_protocol_manifest.v1' && manifest.runtime === 'unchain' && manifestDigest(manifest.manifest_digest) && Array.isArray(manifest.protocols));
  for (const p of manifest.protocols) {
    closed(p, ['id', 'major', 'minor', 'features']);
    requireValid(Number.isSafeInteger(p.major) && p.major >= 0 && Number.isSafeInteger(p.minor) && p.minor >= 0 && Array.isArray(p.features) && sorted(p.features));
  }
  requireValid(sorted(manifest.protocols.map(p => p.id)));
  const body = JSON.stringify({ protocols: manifest.protocols.map(p => ({ features: p.features, id: p.id, major: p.major, minor: p.minor })), runtime: manifest.runtime, schema: manifest.schema });
  requireValid(manifest.manifest_digest === 'sha256:' + hash('unchain.runtime_protocol_manifest.v1\\u0000' + body));
  requireValid(manifest.protocols.some(p => p.id === 'skeleton_execution' && p.major === 1 && p.features.includes('legacy_conversion_v1') && p.features.includes('kernel_profiles_v1')));
};
const validateLegacyUpgradeCapabilities = value => {
  json(value); closed(value, ['schema', 'contract', 'request_schema', 'response_schema', 'choices_schema', 'request_bytes', 'response_bytes', 'scope', 'apply_policy', 'runtime_manifest']);
  const expected = { schema: 'pupu.skeleton-legacy-upgrade.capabilities.v1', contract: 'legacy_upgrade_v1', request_schema: 'pupu.skeleton-legacy-upgrade.request.v1', response_schema: 'pupu.skeleton-legacy-upgrade.response.v1', choices_schema: 'pupu.skeleton-legacy-upgrade.choices.v1', request_bytes: 4194304, response_bytes: 16777216, scope: 'one-existing-agent', apply_policy: 'explicit-cas-preview' };
  requireValid(Object.entries(expected).every(([k, v]) => value[k] === v)); checkManifest(value.runtime_manifest); return copy(value);
};
const prepareLegacyUpgradeRequest = (action, payload) => {
  requireValid(ACTIONS.has(action)); json(payload);
  if (action === 'legacy_upgrade_capabilities') { closed(payload, []); return { operation: 'capabilities', scope: {}, method: 'GET', path: '/skeleton_resources/legacy_upgrade/capabilities?contract=legacy_upgrade_v1' }; }
  const operation = action.slice('legacy_upgrade_'.length);
  const keys = ['resource_id', 'schema', 'expected_edit_token', 'expected_runtime_manifest_digest'];
  if (operation !== 'inventory') keys.push('choices');
  if (operation === 'apply') keys.push('expected_projection_digest');
  closed(payload, keys);
  requireValid(payload.schema === 'pupu.skeleton-legacy-upgrade.request.v1' && id(payload.resource_id) && text(payload.expected_edit_token) && manifestDigest(payload.expected_runtime_manifest_digest));
  if (operation !== 'inventory') checkChoices(payload.choices);
  if (operation === 'apply') requireValid(digest(payload.expected_projection_digest));
  const scope = copy(payload), { resource_id: resourceId, ...body } = scope;
  requireValid(utf8(JSON.stringify(body)).length <= 4194304);
  return { operation, scope, method: 'POST', path: `/skeleton_resources/${encodeURIComponent(resourceId)}/legacy_upgrade/${operation}`, body };
};
const checkDocument = (doc, identity) => {
  closed(doc, ['schema_version', 'kind', 'id', 'name', 'nodes', 'edges'], ['description']);
  requireValid(doc.schema_version === 1 && doc.kind === 'agent' && doc.id === identity && storedText(doc.name) && Array.isArray(doc.nodes) && Array.isArray(doc.edges));
  if (own(doc, 'description')) requireValid(typeof doc.description === 'string');
  const ids = new Set();
  for (const node of doc.nodes) {
    closed(node, ['id', 'type', 'config'], ['label']);
    requireValid(storedText(node.id) && !ids.has(node.id) && ['start', 'agent', 'end', 'toolkit_pool', 'subagent_pool'].includes(node.type) && object(node.config) && !Object.keys(node.config).some(k => k.startsWith('legacy_')));
    if (own(node, 'label')) requireValid(typeof node.label === 'string' && node.label.trim().length > 0); ids.add(node.id);
  }
  const edges = new Set();
  for (const edge of doc.edges) {
    closed(edge, ['id', 'kind', 'source_node_id', 'source_port_id', 'target_node_id', 'target_port_id']);
    requireValid(storedText(edge.id) && !edges.has(edge.id) && ['flow', 'attach'].includes(edge.kind) && ids.has(edge.source_node_id) && ids.has(edge.target_node_id) && storedText(edge.source_port_id) && storedText(edge.target_port_id)); edges.add(edge.id);
  }
};
const checkPolicy = value => {
  closed(value, ['allowed_modes', 'output_mode', 'memory_policy', 'parallel_safe', 'allowed_tools']);
  requireValid(names(value.allowed_modes) && value.allowed_modes.length > 0 && value.allowed_modes.every(v => ['delegate', 'handoff', 'worker'].includes(v)) && ['summary', 'last_message', 'full_trace'].includes(value.output_mode) && ['ephemeral', 'scoped_persistent'].includes(value.memory_policy) && typeof value.parallel_safe === 'boolean' && (!value.allowed_modes.includes('worker') || value.parallel_safe) && (value.allowed_tools === null || storedNames(value.allowed_tools)));
};
const checkSubagents = (items, depth = 0) => {
  requireValid(depth <= 6 && Array.isArray(items));
  for (const v of items) {
    closed(v, ['agent_id', 'allowed_modes', 'allowed_tools', 'definition_digest', 'description', 'disabled_tools', 'document', 'edit_token', 'entry_id', 'kernel_node_id', 'memory_policy', 'name', 'output_mode', 'parallel_safe', 'pool_node_id', 'source_kind', 'subagents']);
    requireValid(storedText(v.entry_id) && storedText(v.kernel_node_id) && storedText(v.pool_node_id) && storedText(v.name) && typeof v.description === 'string' && digest(v.definition_digest) && storedNames(v.disabled_tools));
    checkPolicy(Object.fromEntries(['allowed_modes', 'output_mode', 'memory_policy', 'parallel_safe', 'allowed_tools'].map(k => [k, v[k]])));
    requireValid((v.source_kind === 'agent_ref' && id(v.agent_id) && text(v.edit_token)) || (v.source_kind === 'embedded' && v.agent_id === null && v.edit_token === null));
    checkDocument(v.document, v.agent_id || v.document.id); checkSubagents(v.subagents, depth + 1);
  }
};
const readLegacyUpgradeResponse = (value, operation, scope) => {
  json(value); json(scope); closed(value, ['schema', 'operation', 'resource_id', 'expected_edit_token', 'projection_digest', 'runtime_manifest_digest', 'payload_json', 'payload_sha256']);
  requireValid(value.schema === 'pupu.skeleton-legacy-upgrade.response.v1' && value.operation === operation && id(scope.resource_id) && value.resource_id === scope.resource_id && value.expected_edit_token === scope.expected_edit_token && manifestDigest(value.runtime_manifest_digest) && value.runtime_manifest_digest === scope.expected_runtime_manifest_digest);
  requireValid(digest(value.payload_sha256) && utf8(value.payload_json).length <= 16777216 && hash(value.payload_json) === value.payload_sha256);
  const payload = parseUniqueJson(value.payload_json); json(payload);
  if (operation === 'inventory') {
    closed(payload, ['schema', 'resource_id', 'edit_token', 'source_identity', 'state', 'requirements']);
    requireValid(payload.schema === 'pupu.skeleton-legacy-upgrade.inventory.v1' && payload.resource_id === scope.resource_id && payload.edit_token === scope.expected_edit_token && text(payload.source_identity) && ['needs_upgrade', 'native_draft'].includes(payload.state) && Array.isArray(payload.requirements) && value.projection_digest === null);
    for (const row of payload.requirements) { closed(row, ['code', 'path', 'message']); requireValid(text(row.code) && address(row.path) && text(row.message)); }
  } else if (operation === 'preview') {
    closed(payload, ['schema', 'resource_id', 'edit_token', 'source_identity', 'source_sha256', 'runtime_manifest', 'document', 'definition_digest', 'subagents', 'dependencies', 'source_policy', 'projection_digest']);
    requireValid(payload.schema === 'pupu.skeleton-legacy-upgrade.preview.v1' && payload.resource_id === scope.resource_id && payload.edit_token === scope.expected_edit_token && text(payload.source_identity) && digest(payload.source_sha256) && digest(payload.definition_digest) && digest(value.projection_digest) && payload.projection_digest === value.projection_digest);
    checkManifest(payload.runtime_manifest); requireValid(payload.runtime_manifest.manifest_digest === value.runtime_manifest_digest);
    checkDocument(payload.document, scope.resource_id); checkPolicy(payload.source_policy); checkSubagents(payload.subagents);
    requireValid(Array.isArray(payload.dependencies));
    for (const row of payload.dependencies) { closed(row, ['workflow_id', 'revision_id', 'definition_digest']); requireValid(id(row.workflow_id) && id(row.revision_id) && digest(row.definition_digest)); }
  } else if (operation === 'apply') {
    closed(payload, ['id', 'kind', 'name', 'description', 'archived', 'edit_token', 'draft_digest', 'source_identity', 'document', 'diagnostics']);
    requireValid(payload.id === scope.resource_id && payload.kind === 'agent' && storedText(payload.name) && typeof payload.description === 'string' && payload.archived === false && text(payload.edit_token) && payload.edit_token !== scope.expected_edit_token && digest(payload.draft_digest) && text(payload.source_identity) && Array.isArray(payload.diagnostics) && value.projection_digest === scope.expected_projection_digest);
    checkDocument(payload.document, scope.resource_id);
  } else fail();
  return { response: copy(value), payload };
};
const runLegacyUpgradeCommand = async (prepared, { baseUrl, authToken, fetchImpl, readResponse }) => {
  const headers = authToken ? { 'x-unchain-auth': authToken } : {};
  const read = async response => {
    const raw = await response.text(); requireValid(utf8(raw).length <= 64 * 1024 * 1024); parseUniqueJson(raw);
    return readResponse({ ok: response.ok, status: response.status, text: async () => raw });
  };
  const cap = validateLegacyUpgradeCapabilities(await read(await fetchImpl(`${baseUrl}/skeleton_resources/legacy_upgrade/capabilities?contract=legacy_upgrade_v1`, { method: 'GET', headers })));
  if (prepared.operation === 'capabilities') return cap;
  requireValid(prepared.scope.expected_runtime_manifest_digest === cap.runtime_manifest.manifest_digest);
  const result = await read(await fetchImpl(`${baseUrl}${prepared.path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(prepared.body) }));
  return readLegacyUpgradeResponse(result, prepared.operation, prepared.scope).response;
};
module.exports = { prepareLegacyUpgradeRequest, validateLegacyUpgradeCapabilities, readLegacyUpgradeResponse, runLegacyUpgradeCommand, isLegacyUpgradeAction: action => ACTIONS.has(action) };
