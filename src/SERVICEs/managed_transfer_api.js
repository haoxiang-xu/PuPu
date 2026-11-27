import { FrontendApiError } from './api.shared';
import { invokeSkeletonBridge } from './skeleton_resource_errors';
import { checkManagedCodeResponse } from './managed_code_api';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = () => { throw new FrontendApiError('managed_source_protocol_error', 'Invalid managed source transfer response'); };
const closed = (value, keys) => record(value) && Reflect.ownKeys(value).length === keys.length && keys.every(key => own(value, key) && own(Object.getOwnPropertyDescriptor(value, key), 'value'));
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fileDocument = text => {
  if (typeof text !== 'string') return fail();
  let value;
  try { value = JSON.parse(text); } catch { return fail(); }
  if (!record(value)) return fail();
  if (own(value, 'schema')) {
    if (!closed(value, ['schema', 'document', 'sources_manifest', 'contents', 'content_digest']) || value.schema !== 'pupu.skeleton-code-snapshot.v1' || !closed(value.sources_manifest, ['schema', 'entries']) || value.sources_manifest.schema !== 'pupu.skeleton-code-sources.v1' || !Array.isArray(value.sources_manifest.entries) || !Array.isArray(value.contents) || !digest(value.content_digest)) return fail();
    return value.document;
  }
  if (!own(value, 'schema_version')) return fail();
  return value;
};
const nodeAt = (document, path) => {
  if (!Array.isArray(path) || path.length < 2 || path.length > 254) return fail();
  let value = document;
  for (const key of path) {
    if (!(typeof key === 'string' || (Number.isSafeInteger(key) && key >= 0)) || value === null || typeof value !== 'object' || !own(value, key)) return fail();
    value = value[key];
  }
  if (value?.type !== 'code') return fail();
  return value;
};
const capabilities = value => {
  if (!closed(value, ['schema', 'import_schema', 'export_schema', 'source_schema', 'native_graph_version', 'binding_policy', 'identity_policy', 'scope', 'file_bytes', 'request_bytes', 'runtime_manifest_digest'])) return fail();
  const expected = { schema: 'pupu.skeleton-transfer-capabilities.v1', import_schema: 'pupu.skeleton-import.v2', export_schema: 'pupu.skeleton-export.v2', source_schema: 'pupu.skeleton-code-snapshot.v1', native_graph_version: 1, binding_policy: 'explicit-all-owned-code-nodes', identity_policy: 'create-or-identical', scope: 'one-resource', file_bytes: 41943040, request_bytes: 100663296 };
  if (Object.entries(expected).some(([key, val]) => value[key] !== val) || typeof value.runtime_manifest_digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value.runtime_manifest_digest)) return fail();
  return value;
};

export const createManagedTransferApi = (assertBridgeMethod, withTimeout) => {
  const invoke = (name, args) => {
    const method = assertBridgeMethod('unchainAPI', name);
    return withTimeout(() => invokeSkeletonBridge(() => method(...args)), 20000, 'managed_source_transfer_timeout', 'Managed source transfer timed out');
  };
  return {
    getManagedSkeletonTransferCapabilities: async () => capabilities(await invoke('getManagedSkeletonTransferCapabilities', [])),
    exportManagedSkeletonResource: async identity => {
      if (!id(identity)) return fail();
      const value = await invoke('exportManagedSkeletonResource', [identity]);
      if (!closed(value, ['schema', 'source_json', 'sha256']) || value.schema !== 'pupu.skeleton-export.v2' || !digest(value.sha256) || fileDocument(value.source_json)?.id !== identity) return fail();
      return value;
    },
    importManagedSkeletonResource: async payload => {
      if (!closed(payload, ['schema', 'source_json', 'runtime_bindings']) || payload.schema !== 'pupu.skeleton-import.v2' || !Array.isArray(payload.runtime_bindings) || payload.runtime_bindings.length > 256) return fail();
      const source = fileDocument(payload.source_json);
      const seen = new Set();
      for (const row of payload.runtime_bindings) {
        if (!closed(row, ['node_path', 'environment_profile_id']) || !id(row.environment_profile_id)) return fail();
        nodeAt(source, row.node_path); const key = JSON.stringify(row.node_path); if (seen.has(key)) return fail(); seen.add(key);
      }
      // source_json must remain the original file text. Main and Host validate
      // bytes/ownership and never round-trip Python numbers through JS JSON.
      const value = checkManagedCodeResponse('resource', await invoke('importManagedSkeletonResource', [payload]));
      const resource = value.resource;
      if (resource.id !== source.id || resource.kind !== source.kind || resource.document?.id !== source.id || resource.document?.kind !== source.kind) return fail();
      for (const row of payload.runtime_bindings) if (nodeAt(resource.document, row.node_path)?.config?.code?.environment_profile_id !== row.environment_profile_id) return fail();
      return value;
    },
  };
};
