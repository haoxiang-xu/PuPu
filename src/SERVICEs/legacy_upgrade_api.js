import { FrontendApiError } from './api.shared';
import { invokeSkeletonBridge } from './skeleton_resource_errors';

const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const fail = () => { throw Object.assign(new FrontendApiError('legacy_upgrade_protocol_error', 'Invalid legacy Agent upgrade protocol'), { path: [], status: null }); };
const requireValid = v => { if (!v) fail(); };
const closed = (v, keys, optional = []) => requireValid(object(v) && keys.every(k => own(v, k)) && Reflect.ownKeys(v).every(k => typeof k === 'string' && [...keys, ...optional].includes(k) && own(Object.getOwnPropertyDescriptor(v, k), 'value')));
const text = v => typeof v === 'string' && v.length > 0 && v.trim() === v;
const storedText = v => typeof v === 'string' && v.length > 0;
const id = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}(?![\s\S])/.test(v);
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}(?![\s\S])/.test(v);
const manifestDigest = v => typeof v === 'string' && /^sha256:[a-f0-9]{64}(?![\s\S])/.test(v);
const utf8 = value => {
  requireValid(typeof value === 'string' && typeof TextEncoder !== 'undefined');
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) { const next = value.charCodeAt(++i); requireValid(next >= 0xdc00 && next <= 0xdfff); }
    else requireValid(c < 0xdc00 || c > 0xdfff);
  }
  return new TextEncoder().encode(value);
};
const hash = async value => {
  const subtle = typeof window !== 'undefined' ? window.crypto?.subtle : null;
  requireValid(subtle && typeof subtle.digest === 'function');
  try { const bytes = await subtle.digest('SHA-256', utf8(value)); return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join(''); }
  catch { return fail(); }
};
const parseUniqueJson = raw => {
  let value; try { value = JSON.parse(raw); } catch { return fail(); }
  const tokens = /"(?:\\.|[^"\\])*"|[{}[\]:,]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g;
  const stack = [];
  for (const match of raw.matchAll(tokens)) {
    const token = match[0], top = stack[stack.length - 1];
    if (token === '{') stack.push({ object: true, key: true, keys: new Set() });
    else if (token === '[') stack.push({ object: false });
    else if (token === '}' || token === ']') stack.pop();
    else if (token === ',') { if (top?.object) top.key = true; }
    else if (token[0] === '"' && top?.object && top.key) { const key = JSON.parse(token); requireValid(!top.keys.has(key)); top.keys.add(key); top.key = false; }
  }
  return value;
};
const copy = v => Array.isArray(v) ? v.map(copy) : object(v) ? Object.fromEntries(Object.entries(v).map(([k, value]) => [k, copy(value)])) : v;
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
const address = v => Array.isArray(v) && v.length > 0 && v.length <= 64 && v.every(p => (typeof p === 'string' && p.length > 0) || (Number.isSafeInteger(p) && p >= 0));
const names = v => Array.isArray(v) && v.every(text) && new Set(v).size === v.length;
const storedNames = v => Array.isArray(v) && v.every(storedText) && new Set(v).size === v.length;
const checkChoices = v => {
  closed(v, ['schema', 'kernels', 'toolkits', 'references', 'acknowledged']); requireValid(v.schema === 'pupu.skeleton-legacy-upgrade.choices.v1');
  const fields = { kernels: ['path', 'kernel', 'model_policy', 'prompt_policy', 'accept_projection'], toolkits: ['path', 'toolkit_id', 'enabled_tools', 'discard_unsupported'], references: ['path', 'source_scope', 'agent_id'], acknowledged: ['path', 'code'] };
  for (const category of Object.keys(fields)) {
    requireValid(Array.isArray(v[category])); const seen = new Set();
    for (const row of v[category]) {
      closed(row, fields[category]); requireValid(address(row.path));
      const key = JSON.stringify([row.path, category === 'acknowledged' ? row.code : null]); requireValid(!seen.has(key)); seen.add(key);
      if (category === 'kernels') requireValid(object(row.kernel) && row.kernel.schema_version === 1 && ['preserve', 'replace'].includes(row.model_policy) && ['preserve', 'replace'].includes(row.prompt_policy) && row.accept_projection === true);
      if (category === 'toolkits') requireValid(text(row.toolkit_id) && (row.enabled_tools === null || names(row.enabled_tools)) && typeof row.discard_unsupported === 'boolean');
      if (category === 'references') requireValid(text(row.source_scope) && id(row.agent_id));
      if (category === 'acknowledged') requireValid(['legacy_setting_ignored', 'legacy_prompt_review_required'].includes(row.code));
    }
  }
};
const request = (value, operation) => {
  json(value); const keys = ['resource_id', 'schema', 'expected_edit_token', 'expected_runtime_manifest_digest'];
  if (operation !== 'inventory') keys.push('choices'); if (operation === 'apply') keys.push('expected_projection_digest');
  closed(value, keys); requireValid(id(value.resource_id) && value.schema === 'pupu.skeleton-legacy-upgrade.request.v1' && text(value.expected_edit_token) && manifestDigest(value.expected_runtime_manifest_digest));
  if (operation !== 'inventory') checkChoices(value.choices);
  if (operation === 'apply') requireValid(digest(value.expected_projection_digest));
  requireValid(utf8(JSON.stringify(value)).length <= 4194304); return copy(value);
};
const sorted = values => Array.isArray(values) && values.every((v, i) => typeof v === 'string' && /^[a-z][a-z0-9_.-]*(?![\s\S])/.test(v) && (!i || values[i - 1] < v));
const checkManifest = async value => {
  closed(value, ['schema', 'runtime', 'manifest_digest', 'protocols']);
  requireValid(value.schema === 'unchain.runtime_protocol_manifest.v1' && value.runtime === 'unchain' && manifestDigest(value.manifest_digest) && Array.isArray(value.protocols));
  for (const p of value.protocols) { closed(p, ['id', 'major', 'minor', 'features']); requireValid(Number.isSafeInteger(p.major) && p.major >= 0 && Number.isSafeInteger(p.minor) && p.minor >= 0 && sorted(p.features)); }
  requireValid(sorted(value.protocols.map(p => p.id)));
  const canonical = JSON.stringify({ protocols: value.protocols.map(p => ({ features: p.features, id: p.id, major: p.major, minor: p.minor })), runtime: value.runtime, schema: value.schema });
  requireValid(value.manifest_digest === 'sha256:' + await hash('unchain.runtime_protocol_manifest.v1\\u0000' + canonical));
  requireValid(value.protocols.some(p => p.id === 'skeleton_execution' && p.major === 1 && p.features.includes('legacy_conversion_v1') && p.features.includes('kernel_profiles_v1')));
};
const capabilities = async value => {
  json(value); value = copy(value); closed(value, ['schema', 'contract', 'request_schema', 'response_schema', 'choices_schema', 'request_bytes', 'response_bytes', 'scope', 'apply_policy', 'runtime_manifest']);
  const expected = { schema: 'pupu.skeleton-legacy-upgrade.capabilities.v1', contract: 'legacy_upgrade_v1', request_schema: 'pupu.skeleton-legacy-upgrade.request.v1', response_schema: 'pupu.skeleton-legacy-upgrade.response.v1', choices_schema: 'pupu.skeleton-legacy-upgrade.choices.v1', request_bytes: 4194304, response_bytes: 16777216, scope: 'one-existing-agent', apply_policy: 'explicit-cas-preview' };
  requireValid(Object.entries(expected).every(([k, v]) => value[k] === v)); await checkManifest(value.runtime_manifest); return copy(value);
};
const document = (v, identity) => {
  closed(v, ['schema_version', 'kind', 'id', 'name', 'nodes', 'edges'], ['description']);
  requireValid(v.schema_version === 1 && v.kind === 'agent' && v.id === identity && storedText(v.name) && Array.isArray(v.nodes) && Array.isArray(v.edges));
  if (own(v, 'description')) requireValid(typeof v.description === 'string');
  const ids = new Set(), edges = new Set();
  for (const n of v.nodes) { closed(n, ['id', 'type', 'config'], ['label']); requireValid(storedText(n.id) && !ids.has(n.id) && ['start', 'agent', 'end', 'toolkit_pool', 'subagent_pool'].includes(n.type) && object(n.config) && !Object.keys(n.config).some(k => k.startsWith('legacy_')) && (!own(n, 'label') || (typeof n.label === 'string' && n.label.trim().length > 0))); ids.add(n.id); }
  for (const e of v.edges) { closed(e, ['id', 'kind', 'source_node_id', 'source_port_id', 'target_node_id', 'target_port_id']); requireValid(storedText(e.id) && !edges.has(e.id) && ['flow', 'attach'].includes(e.kind) && ids.has(e.source_node_id) && ids.has(e.target_node_id) && storedText(e.source_port_id) && storedText(e.target_port_id)); edges.add(e.id); }
};
const policy = v => {
  closed(v, ['allowed_modes', 'output_mode', 'memory_policy', 'parallel_safe', 'allowed_tools']);
  requireValid(names(v.allowed_modes) && v.allowed_modes.length > 0 && v.allowed_modes.every(m => ['delegate', 'handoff', 'worker'].includes(m)) && ['summary', 'last_message', 'full_trace'].includes(v.output_mode) && ['ephemeral', 'scoped_persistent'].includes(v.memory_policy) && typeof v.parallel_safe === 'boolean' && (!v.allowed_modes.includes('worker') || v.parallel_safe) && (v.allowed_tools === null || storedNames(v.allowed_tools)));
};
const subagents = (rows, depth = 0) => {
  requireValid(depth <= 6 && Array.isArray(rows));
  for (const v of rows) {
    closed(v, ['agent_id', 'allowed_modes', 'allowed_tools', 'definition_digest', 'description', 'disabled_tools', 'document', 'edit_token', 'entry_id', 'kernel_node_id', 'memory_policy', 'name', 'output_mode', 'parallel_safe', 'pool_node_id', 'source_kind', 'subagents']);
    requireValid(storedText(v.entry_id) && storedText(v.kernel_node_id) && storedText(v.pool_node_id) && storedText(v.name) && typeof v.description === 'string' && digest(v.definition_digest) && storedNames(v.disabled_tools));
    policy(Object.fromEntries(['allowed_modes', 'output_mode', 'memory_policy', 'parallel_safe', 'allowed_tools'].map(k => [k, v[k]])));
    requireValid((v.source_kind === 'agent_ref' && id(v.agent_id) && text(v.edit_token)) || (v.source_kind === 'embedded' && v.agent_id === null && v.edit_token === null));
    document(v.document, v.agent_id || v.document.id); subagents(v.subagents, depth + 1);
  }
};
export const readLegacyUpgradeResponse = async (value, operation, scope) => {
  json(value); json(scope); value = copy(value); scope = copy(scope); closed(value, ['schema', 'operation', 'resource_id', 'expected_edit_token', 'projection_digest', 'runtime_manifest_digest', 'payload_json', 'payload_sha256']);
  requireValid(value.schema === 'pupu.skeleton-legacy-upgrade.response.v1' && value.operation === operation && value.resource_id === scope.resource_id && value.expected_edit_token === scope.expected_edit_token && manifestDigest(value.runtime_manifest_digest) && value.runtime_manifest_digest === scope.expected_runtime_manifest_digest && digest(value.payload_sha256) && utf8(value.payload_json).length <= 16777216);
  requireValid(await hash(value.payload_json) === value.payload_sha256);
  const v = parseUniqueJson(value.payload_json); json(v);
  if (operation === 'inventory') {
    closed(v, ['schema', 'resource_id', 'edit_token', 'source_identity', 'state', 'requirements']);
    requireValid(v.schema === 'pupu.skeleton-legacy-upgrade.inventory.v1' && v.resource_id === scope.resource_id && v.edit_token === scope.expected_edit_token && text(v.source_identity) && ['needs_upgrade', 'native_draft'].includes(v.state) && Array.isArray(v.requirements) && value.projection_digest === null);
    for (const row of v.requirements) { closed(row, ['code', 'path', 'message']); requireValid(text(row.code) && address(row.path) && text(row.message)); }
  } else if (operation === 'preview') {
    closed(v, ['schema', 'resource_id', 'edit_token', 'source_identity', 'source_sha256', 'runtime_manifest', 'document', 'definition_digest', 'subagents', 'dependencies', 'source_policy', 'projection_digest']);
    requireValid(v.schema === 'pupu.skeleton-legacy-upgrade.preview.v1' && v.resource_id === scope.resource_id && v.edit_token === scope.expected_edit_token && text(v.source_identity) && digest(v.source_sha256) && digest(v.definition_digest) && digest(value.projection_digest) && v.projection_digest === value.projection_digest);
    await checkManifest(v.runtime_manifest); requireValid(v.runtime_manifest.manifest_digest === value.runtime_manifest_digest);
    document(v.document, scope.resource_id); policy(v.source_policy); subagents(v.subagents);
    requireValid(Array.isArray(v.dependencies)); for (const d of v.dependencies) { closed(d, ['workflow_id', 'revision_id', 'definition_digest']); requireValid(id(d.workflow_id) && id(d.revision_id) && digest(d.definition_digest)); }
  } else if (operation === 'apply') {
    closed(v, ['id', 'kind', 'name', 'description', 'archived', 'edit_token', 'draft_digest', 'source_identity', 'document', 'diagnostics']);
    requireValid(v.id === scope.resource_id && v.kind === 'agent' && storedText(v.name) && typeof v.description === 'string' && v.archived === false && text(v.edit_token) && v.edit_token !== scope.expected_edit_token && digest(v.draft_digest) && text(v.source_identity) && Array.isArray(v.diagnostics) && value.projection_digest === scope.expected_projection_digest);
    document(v.document, scope.resource_id);
  } else fail();
  return { response: copy(value), payload: v };
};
const applyFailure = (error, scope) => {
  // Local outcome metadata only. Old v1 Hosts can fail a reply after commit:
  // status alone (especially 413/500) never establishes rollback.
  const prewrite = { unauthorized: 401, edit_conflict: 409, upgrade_preview_stale: 409,
    upgrade_manifest_stale: 409, legacy_upgrade_already_applied: 409, legacy_dependency_upgrade_required: 409 };
  const failure = error instanceof Error && Object.isExtensible(error) ? error : new Error(error?.message || 'Legacy Agent upgrade failed');
  if (failure !== error) {
    failure.code = error?.code || 'legacy_upgrade_failed';
    failure.path = Array.isArray(error?.path) ? copy(error.path) : [];
    failure.status = error?.status ?? null;
    failure.cause = error;
  }
  const knownRefusal = own(prewrite, failure.code) && prewrite[failure.code] === failure.status;
  Object.defineProperty(failure, 'legacyUpgrade', { configurable: true, value: Object.freeze({
    operation: 'apply', resource_id: scope.resource_id, expected_edit_token: scope.expected_edit_token,
    expected_runtime_manifest_digest: scope.expected_runtime_manifest_digest,
    expected_projection_digest: scope.expected_projection_digest,
    outcome: knownRefusal ? 'prewrite_refused' : 'unconfirmed',
  }) });
  return failure;
};
export const createLegacyUpgradeApi = (assertBridgeMethod, withTimeout) => {
  const call = async (methodName, operation, input) => {
    const scope = operation === 'capabilities' ? null : request(input, operation);
    const method = assertBridgeMethod('unchainAPI', methodName);
    let dispatched = false;
    try {
      const result = await withTimeout(() => {
        dispatched = true;
        return invokeSkeletonBridge(() => operation === 'capabilities' ? method() : method(scope));
      }, 20000, 'legacy_upgrade_timeout', operation === 'apply'
        ? 'Legacy Agent upgrade result is unconfirmed; read the resource before another apply'
        : 'Legacy Agent upgrade request timed out');
      return await (operation === 'capabilities' ? capabilities(result) : readLegacyUpgradeResponse(result, operation, scope));
    } catch (error) {
      throw operation === 'apply' && dispatched ? applyFailure(error, scope) : error;
    }
  };
  return {
    getSkeletonLegacyUpgradeCapabilities: () => call('getSkeletonLegacyUpgradeCapabilities', 'capabilities'),
    inspectSkeletonLegacyUpgrade: payload => call('inspectSkeletonLegacyUpgrade', 'inventory', payload),
    previewSkeletonLegacyUpgrade: payload => call('previewSkeletonLegacyUpgrade', 'preview', payload),
    applySkeletonLegacyUpgrade: payload => call('applySkeletonLegacyUpgrade', 'apply', payload),
  };
};
