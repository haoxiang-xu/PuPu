// Independent consumer of the host's versioned source API. Aggregate digests
// remain opaque: JS cannot reproduce Python's integer/float JSON distinction.
const { createHash } = require('crypto');
const own = (v, key) => Object.prototype.hasOwnProperty.call(v, key);
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const fail = () => { throw Object.assign(new Error('Invalid managed Code protocol'), { code: 'managed_source_protocol_error', path: [], status: null }); };
const closed = (v, keys) => {
  if (!record(v) || Reflect.ownKeys(v).length !== keys.length || keys.some(k => !own(v, k) || !own(Object.getOwnPropertyDescriptor(v, k), 'value'))) fail();
};
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const id = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(v);
const textBytes = text => {
  if (typeof text !== 'string') fail();
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.toString('utf8') !== text || bytes.length > 4 * 1024 * 1024) fail();
  return bytes;
};
const atCode = (document, path) => {
  if (!Array.isArray(path) || path.length < 2 || (path.length - 2) % 7 || path.length > 254) fail();
  let value = document;
  for (let i = 0; i < path.length - 2; i += 7) {
    if (path[i] !== 'nodes' || !Number.isSafeInteger(path[i + 1]) || path[i + 1] < 0 ||
        path[i + 2] !== 'config' || !Number.isSafeInteger(path[i + 4]) || path[i + 4] < 0 ||
        path[i + 6] !== 'document' || !Array.isArray(value?.nodes)) fail();
    const node = value.nodes[path[i + 1]];
    const subagent = node?.type === 'subagent_pool' && path[i + 3] === 'subagents' && path[i + 5] === 'source';
    const hook = node?.type === 'hooks_pool' && path[i + 3] === 'hooks' && path[i + 5] === 'workflow';
    if (!subagent && !hook) fail();
    const entries = subagent ? node.config?.subagents : node.config?.hooks;
    if (!Array.isArray(entries)) fail();
    const entry = entries[path[i + 4]], source = subagent ? entry?.source : entry?.workflow;
    if (source?.kind !== 'embedded') fail();
    value = source.document;
  }
  const last = path.length - 2;
  if (path[last] !== 'nodes' || !Number.isSafeInteger(path[last + 1]) || path[last + 1] < 0) fail();
  if (!Array.isArray(value?.nodes)) fail();
  const node = value.nodes[path[last + 1]];
  if (node?.type !== 'code') fail();
  return node;
};

const validateAggregate = value => {
  const version = value.schema === 'pupu.skeleton-workflow-version.v2';
  closed(value, ['schema', version ? 'version' : 'resource', 'sources_manifest', 'contents', 'content_digest']);
  if (!version && value.schema !== 'pupu.skeleton-resource.v2') fail();
  const resource = version ? value.version : value.resource;
  if (version) {
    closed(resource, ['workflow_id', 'revision_id', 'definition_digest', 'document', 'dependencies', 'ordinal']);
    if (!id(resource.workflow_id) || !id(resource.revision_id) || !digest(resource.definition_digest)) fail();
  } else {
    closed(resource, ['id', 'kind', 'name', 'description', 'archived', 'edit_token', 'draft_digest', 'source_identity', 'document', 'diagnostics']);
    if (!id(resource.id) || !['agent', 'workflow'].includes(resource.kind) || typeof resource.archived !== 'boolean' ||
        typeof resource.edit_token !== 'string' || !resource.edit_token || !digest(resource.draft_digest) ||
        typeof resource.name !== 'string' || typeof resource.description !== 'string' || !Array.isArray(resource.diagnostics)) fail();
  }
  if (!record(resource.document) || resource.document.id !== (version ? resource.workflow_id : resource.id) || !digest(value.content_digest)) fail();
  closed(value.sources_manifest, ['schema', 'entries']);
  if (value.sources_manifest.schema !== 'pupu.skeleton-code-sources.v1' || !Array.isArray(value.sources_manifest.entries) ||
      value.sources_manifest.entries.length > 256 || !Array.isArray(value.contents) || value.contents.length > 256) fail();
  const required = new Set(), targets = new Set();
  for (const entry of value.sources_manifest.entries) {
    closed(entry, ['node_path', 'sha256']);
    if (!digest(entry.sha256)) fail();
    const node = atCode(resource.document, entry.node_path), key = JSON.stringify(entry.node_path);
    if (targets.has(key)) fail(); targets.add(key);
    const source = node.config?.code?.source;
    closed(source, ['kind', 'path']);
    if (source.kind !== 'file' || source.path !== `__pupu_code__/sha256/${entry.sha256}.py`) fail();
    required.add(entry.sha256);
  }
  let total = 0, last = '';
  for (const entry of value.contents) {
    closed(entry, ['sha256', 'text']);
    const bytes = textBytes(entry.text);
    total += bytes.length;
    if (!digest(entry.sha256) || entry.sha256 <= last || !required.delete(entry.sha256) ||
        createHash('sha256').update(bytes).digest('hex') !== entry.sha256 || total > 16 * 1024 * 1024) fail();
    last = entry.sha256;
  }
  if (required.size) fail();
  return value;
};

const validateManagedCodeReply = (action, value) => {
  if (action === 'code_capabilities') {
    closed(value, ['schema', 'edit_schema', 'resource_schema', 'publication_schema', 'version_schema', 'preflight_schema',
      'source_bytes', 'total_bytes', 'bindings', 'request_bytes', 'runtime_manifest']);
    const expected = { schema: 'pupu.skeleton-code-capabilities.v1', edit_schema: 'pupu.skeleton-edit.v2',
      resource_schema: 'pupu.skeleton-resource.v2', publication_schema: 'pupu.skeleton-publish.v2',
      version_schema: 'pupu.skeleton-workflow-version.v2', preflight_schema: 'pupu.skeleton-preflight.v2',
      source_bytes: 4194304, total_bytes: 16777216, bindings: 256, request_bytes: 41943040 };
    if (Object.entries(expected).some(([k, v]) => value[k] !== v)) fail();
    const manifest = value.runtime_manifest;
    closed(manifest, ['schema', 'runtime', 'manifest_digest', 'protocols']);
    if (manifest.schema !== 'unchain.runtime_protocol_manifest.v1' || manifest.runtime !== 'unchain' ||
        typeof manifest.manifest_digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(manifest.manifest_digest) || !Array.isArray(manifest.protocols)) fail();
    for (const protocol of manifest.protocols) {
      closed(protocol, ['id', 'major', 'minor', 'features']);
      if (typeof protocol.id !== 'string' || !Number.isInteger(protocol.major) || !Number.isInteger(protocol.minor) ||
          !Array.isArray(protocol.features) || protocol.features.some(f => typeof f !== 'string')) fail();
    }
    const sortedTexts = values => values.every(v => typeof v === 'string' && v && v === v.trim() && v === v.normalize('NFC')) &&
      values.every((v, i) => !i || Buffer.compare(Buffer.from(values[i - 1]), Buffer.from(v)) < 0);
    if (!sortedTexts(manifest.protocols.map(p => p.id)) || manifest.protocols.some(p =>
      !Number.isSafeInteger(p.major) || p.major < 0 || !Number.isSafeInteger(p.minor) || p.minor < 0 || !sortedTexts(p.features))) fail();
    const canonical = JSON.stringify({ protocols: manifest.protocols.map(p => ({ features: p.features, id: p.id, major: p.major, minor: p.minor })),
      runtime: manifest.runtime, schema: manifest.schema });
    const expectedDigest = 'sha256:' + createHash('sha256').update('unchain.runtime_protocol_manifest.v1\\u0000').update(canonical).digest('hex');
    if (manifest.manifest_digest !== expectedDigest || manifest.protocols.filter(p => p.id === 'skeleton_execution' && p.major === 1 && p.features.includes('code_python_v1')).length !== 1) fail();
    return value;
  }
  if (action === 'code_preflight') {
    closed(value, ['schema', 'preflight']);
    closed(value.preflight, ['ok', 'id', 'kind', 'definition_digest', 'edit_token', 'document', 'diagnostics', 'dependencies', 'subagents']);
    if (value.schema !== 'pupu.skeleton-preflight.v2' || value.preflight.ok !== true || !id(value.preflight.id) || !digest(value.preflight.definition_digest)) fail();
    return value;
  }
  return validateAggregate(value);
};

const ACTIONS = new Set(['code_capabilities', 'code_get', 'code_save', 'code_preflight', 'code_publish', 'code_get_version']);
const buildManagedCodeRequest = (action, payload) => {
  if (!ACTIONS.has(action)) return null;
  if (action === 'code_capabilities') { closed(payload, []); return { method: 'GET', path: '/skeleton_resources/v2/capabilities' }; }
  if (action === 'code_save') {
    closed(payload, ['schema', 'document', 'expected_edit_token', 'managed_sources']);
    // Host owns full graph/type validation; Main never rewrites a source edit.
    if (payload.schema !== 'pupu.skeleton-edit.v2' || !Array.isArray(payload.managed_sources) || payload.managed_sources.length > 256) fail();
    for (const row of payload.managed_sources) { closed(row, ['node_path', 'text']); textBytes(row.text); atCode(payload.document, row.node_path); }
    if (Buffer.byteLength(JSON.stringify(payload)) > 41943040) fail();
    return { method: 'POST', path: '/skeleton_resources/v2', body: payload };
  }
  closed(payload, action === 'code_get_version' ? ['resource_id', 'revision_id'] : action === 'code_publish' ? ['resource_id', 'schema', 'expected_edit_token'] : ['resource_id']);
  if (!id(payload.resource_id) || (action === 'code_get_version' && !id(payload.revision_id))) fail();
  const path = `/skeleton_resources/v2/${encodeURIComponent(payload.resource_id)}`;
  if (action === 'code_get') return { method: 'GET', path };
  if (action === 'code_get_version') return { method: 'GET', path: `${path}/versions/${encodeURIComponent(payload.revision_id)}` };
  if (action === 'code_preflight') return { method: 'POST', path: `${path}/preflight`, body: {} };
  if (payload.schema !== 'pupu.skeleton-publish.v2' || typeof payload.expected_edit_token !== 'string' || !payload.expected_edit_token) fail();
  return { method: 'POST', path: `${path}/publish`, body: { schema: payload.schema, expected_edit_token: payload.expected_edit_token } };
};

module.exports = { buildManagedCodeRequest, validateManagedCodeReply, isManagedCodeAction: action => ACTIONS.has(action) };
