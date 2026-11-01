// Independent transfer consumer. Preserve opaque file JSON text across JS/Python.
const { createHash } = require('crypto');
const { isDeepStrictEqual } = require('util');
const { validateManagedCodeReply } = require('./managed_code_transport');
const ACTIONS = new Set(['code_transfer_capabilities', 'code_export', 'code_import']);
const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const fail = () => { throw Object.assign(new Error('Invalid managed source transfer protocol'), { code: 'managed_source_protocol_error', path: [], status: null }); };
const closed = (v, keys) => {
  if (!record(v) || Reflect.ownKeys(v).length !== keys.length || keys.some(k => !own(v, k) || !own(Object.getOwnPropertyDescriptor(v, k), 'value'))) fail();
};
const id = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(v);
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
// Already-parsed JSON only; keep negative zero without a stringify round trip.
const copyJson = value => Array.isArray(value) ? value.map(copyJson) : record(value)
  ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, copyJson(entry)])) : value;
const bytes = (text, limit) => {
  if (typeof text !== 'string') fail();
  const value = Buffer.from(text, 'utf8');
  if (value.length > limit || value.toString('utf8') !== text) fail();
  return value;
};
const data = value => {
  const pending = [value], seen = new Set();
  while (pending.length) {
    const item = pending.pop();
    if (item === null || ['string', 'boolean'].includes(typeof item)) continue;
    if (typeof item === 'number') { if (!Number.isFinite(item)) fail(); continue; }
    if (typeof item !== 'object' || seen.has(item)) fail();
    seen.add(item);
    if (![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(item))) fail();
    for (const key of Reflect.ownKeys(item)) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (typeof key !== 'string' || !own(descriptor, 'value')) fail();
      pending.push(descriptor.value);
    }
  }
};
const atCode = (document, path) => {
  if (!Array.isArray(path) || path.length < 2 || path.length > 254 || (path.length - 2) % 7) fail();
  let body = document;
  for (let i = 0; i < path.length; i += 7) {
    if (path[i] !== 'nodes' || !Number.isSafeInteger(path[i + 1]) || path[i + 1] < 0) fail();
    const node = body?.nodes?.[path[i + 1]];
    if (i + 2 === path.length) { if (node?.type !== 'code' || !record(node.config?.code)) fail(); return node; }
    if (path[i + 2] !== 'config' || !Number.isSafeInteger(path[i + 4]) || path[i + 4] < 0 || path[i + 6] !== 'document') fail();
    if (path[i + 3] === 'subagents' && path[i + 5] === 'source' && node?.type === 'subagent_pool') {
      const source = node.config?.subagents?.[path[i + 4]]?.source; if (source?.kind !== 'embedded') fail(); body = source.document;
    } else if (path[i + 3] === 'hooks' && path[i + 5] === 'workflow' && node?.type === 'hooks_pool') {
      const source = node.config?.hooks?.[path[i + 4]]?.workflow; if (source?.kind !== 'embedded') fail(); body = source.document;
    } else fail();
  }
  return fail();
};
const codePaths = document => {
  const result = [], stack = [[document, []]];
  while (stack.length) {
    const [body, prefix] = stack.pop(); if (!Array.isArray(body?.nodes)) continue;
    body.nodes.forEach((node, index) => {
      const path = [...prefix, 'nodes', index];
      if (node?.type === 'code') result.push(path);
      const entries = node?.type === 'subagent_pool' ? node.config?.subagents : node?.type === 'hooks_pool' ? node.config?.hooks : null;
      if (Array.isArray(entries)) entries.forEach((entry, offset) => {
        const agent = node.type === 'subagent_pool', source = agent ? entry?.source : entry?.workflow;
        if (source?.kind === 'embedded') stack.push([source.document, [...path, 'config', agent ? 'subagents' : 'hooks', offset, agent ? 'source' : 'workflow', 'document']]);
      });
    });
  }
  return result;
};
const snapshot = value => {
  closed(value, ['schema', 'document', 'sources_manifest', 'contents', 'content_digest']);
  if (value.schema !== 'pupu.skeleton-code-snapshot.v1' || !record(value.document) || !id(value.document.id) || !['agent', 'workflow'].includes(value.document.kind) || !digest(value.content_digest)) fail();
  closed(value.sources_manifest, ['schema', 'entries']);
  const entries = value.sources_manifest.entries;
  if (value.sources_manifest.schema !== 'pupu.skeleton-code-sources.v1' || !Array.isArray(entries) || entries.length > 256 || !Array.isArray(value.contents) || value.contents.length > 256) fail();
  const targets = new Set(), required = new Set();
  entries.forEach(row => {
    closed(row, ['node_path', 'sha256']); if (!digest(row.sha256)) fail();
    const node = atCode(value.document, row.node_path), key = JSON.stringify(row.node_path);
    if (targets.has(key)) fail(); targets.add(key); required.add(row.sha256);
    closed(node.config.code.source, ['kind', 'path']);
    if (node.config.code.source.kind !== 'file' || node.config.code.source.path !== `__pupu_code__/sha256/${row.sha256}.py`) fail();
  });
  if (!isDeepStrictEqual(targets, new Set(codePaths(value.document).map(p => JSON.stringify(p))))) fail();
  let last = '', total = 0;
  value.contents.forEach(row => {
    closed(row, ['sha256', 'text']); const body = bytes(row.text, 4194304); total += body.length;
    if (!digest(row.sha256) || row.sha256 <= last || !required.delete(row.sha256) || createHash('sha256').update(body).digest('hex') !== row.sha256 || total > 16777216) fail();
    last = row.sha256;
  });
  if (required.size) fail();
  return value.document;
};
const parsedSource = text => {
  bytes(text, 41943040);
  let value; try { value = JSON.parse(text); } catch { return fail(); }
  if (!record(value)) fail();
  if (own(value, 'schema')) return snapshot(value);
  // The host owns strict native document validation and detailed refusals.
  if (!own(value, 'schema_version')) fail();
  return value;
};
const validateCapability = value => {
  closed(value, ['schema', 'import_schema', 'export_schema', 'source_schema', 'native_graph_version', 'binding_policy', 'identity_policy', 'scope', 'file_bytes', 'request_bytes', 'runtime_manifest_digest']);
  const expected = { schema: 'pupu.skeleton-transfer-capabilities.v1', import_schema: 'pupu.skeleton-import.v2', export_schema: 'pupu.skeleton-export.v2', source_schema: 'pupu.skeleton-code-snapshot.v1', native_graph_version: 1, binding_policy: 'explicit-all-owned-code-nodes', identity_policy: 'create-or-identical', scope: 'one-resource', file_bytes: 41943040, request_bytes: 100663296 };
  if (Object.entries(expected).some(([key, val]) => value[key] !== val) || typeof value.runtime_manifest_digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value.runtime_manifest_digest)) fail();
  return value;
};
const validateImport = payload => {
  closed(payload, ['schema', 'source_json', 'runtime_bindings']); data(payload);
  if (payload.schema !== 'pupu.skeleton-import.v2' || !Array.isArray(payload.runtime_bindings) || payload.runtime_bindings.length > 256) fail();
  const document = parsedSource(payload.source_json), expected = new Set(codePaths(document).map(p => JSON.stringify(p))), seen = new Set();
  payload.runtime_bindings.forEach(row => {
    closed(row, ['node_path', 'environment_profile_id']); atCode(document, row.node_path);
    const key = JSON.stringify(row.node_path); if (seen.has(key) || !expected.delete(key) || !id(row.environment_profile_id)) fail(); seen.add(key);
  });
  if (expected.size || Buffer.byteLength(JSON.stringify(payload)) > 100663296) fail();
  return document;
};
const buildManagedTransferRequest = (action, payload) => {
  if (!ACTIONS.has(action)) return null;
  if (action === 'code_transfer_capabilities') { closed(payload, []); return { method: 'GET', path: '/skeleton_resources/v2/transfer/capabilities' }; }
  if (action === 'code_export') { closed(payload, ['resource_id']); if (!id(payload.resource_id)) fail(); return { method: 'GET', path: `/skeleton_resources/v2/${encodeURIComponent(payload.resource_id)}/export` }; }
  validateImport(payload);
  return { method: 'POST', path: '/skeleton_resources/v2/import', body: payload };
};
const validateManagedTransferReply = (action, value, payload = {}) => {
  if (action === 'code_transfer_capabilities') return validateCapability(value);
  if (action === 'code_export') {
    closed(value, ['schema', 'source_json', 'sha256']);
    if (value.schema !== 'pupu.skeleton-export.v2' || !digest(value.sha256) || createHash('sha256').update(bytes(value.source_json, 41943040)).digest('hex') !== value.sha256) fail();
    let file; try { file = JSON.parse(value.source_json); } catch { return fail(); }
    const doc = snapshot(file); if (doc.id !== payload.resource_id) fail(); return value;
  }
  closed(value, ['schema', 'resource', 'sources_manifest', 'contents', 'content_digest']);
  if (value.schema !== 'pupu.skeleton-resource.v2') fail();
  const resource = value.resource;
  closed(resource, ['id', 'kind', 'name', 'description', 'archived', 'edit_token', 'draft_digest', 'source_identity', 'document', 'diagnostics']);
  if (!id(resource.id) || !['agent', 'workflow'].includes(resource.kind) || typeof resource.name !== 'string' || typeof resource.description !== 'string' || typeof resource.archived !== 'boolean' || typeof resource.edit_token !== 'string' || !resource.edit_token || !digest(resource.draft_digest) || !Array.isArray(resource.diagnostics) || !(resource.source_identity === null || typeof resource.source_identity === 'string')) fail();
  snapshot({ schema: 'pupu.skeleton-code-snapshot.v1', document: resource.document, sources_manifest: value.sources_manifest, contents: value.contents, content_digest: value.content_digest });
  const original = validateImport(payload), expected = copyJson(original);
  payload.runtime_bindings.forEach(row => { atCode(expected, row.node_path).config.code.environment_profile_id = row.environment_profile_id; });
  if (resource.id !== original.id || resource.kind !== original.kind || !isDeepStrictEqual(resource.document, expected)) fail();
  return value;
};
const runManagedTransferCommand = async (action, payload, { baseUrl, authToken, fetchImpl, readResponse }) => {
  const request = buildManagedTransferRequest(action, payload);
  if (!request) fail();
  const headers = authToken ? { 'x-unchain-auth': authToken } : {};
  const code = validateManagedCodeReply('code_capabilities', await readResponse(await fetchImpl(`${baseUrl}/skeleton_resources/v2/capabilities`, { method: 'GET', headers })));
  const capability = validateCapability(await readResponse(await fetchImpl(`${baseUrl}/skeleton_resources/v2/transfer/capabilities`, { method: 'GET', headers })));
  if (capability.runtime_manifest_digest !== code.runtime_manifest.manifest_digest) fail();
  if (action === 'code_transfer_capabilities') return capability;
  const result = await readResponse(await fetchImpl(`${baseUrl}${request.path}`, { method: request.method,
    headers: { ...headers, ...(request.body ? { 'Content-Type': 'application/json' } : {}) }, ...(request.body ? { body: JSON.stringify(request.body) } : {}) }));
  return validateManagedTransferReply(action, result, payload);
};
module.exports = { buildManagedTransferRequest, validateManagedTransferReply, runManagedTransferCommand, isManagedTransferAction: action => ACTIONS.has(action) };
