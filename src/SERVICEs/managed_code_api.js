import { FrontendApiError } from './api.shared';
import { invokeSkeletonBridge } from './skeleton_resource_errors';

const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
const fail = () => { throw new FrontendApiError('managed_source_protocol_error', 'Invalid managed Code response'); };

// Main validates UTF-8 hashes, ownership addresses and the actual host/runtime
// handshake. This final boundary rejects wrong envelopes without defaulting to
// an empty source, empty library, or a v1 graph-only save.
export const checkManagedCodeResponse = (kind, value) => {
  if (kind === 'capabilities') {
    if (!closed(value, ['schema', 'edit_schema', 'resource_schema', 'publication_schema', 'version_schema', 'preflight_schema',
      'source_bytes', 'total_bytes', 'bindings', 'request_bytes', 'runtime_manifest']) || value.schema !== 'pupu.skeleton-code-capabilities.v1' ||
      value.edit_schema !== 'pupu.skeleton-edit.v2' || value.resource_schema !== 'pupu.skeleton-resource.v2') fail();
  } else if (kind === 'preflight') {
    if (!closed(value, ['schema', 'preflight']) || value.schema !== 'pupu.skeleton-preflight.v2' || value.preflight?.ok !== true) fail();
  } else {
    const version = kind === 'version';
    if (!closed(value, ['schema', version ? 'version' : 'resource', 'sources_manifest', 'contents', 'content_digest']) ||
      value.schema !== (version ? 'pupu.skeleton-workflow-version.v2' : 'pupu.skeleton-resource.v2') ||
      !closed(value.sources_manifest, ['schema', 'entries']) || value.sources_manifest.schema !== 'pupu.skeleton-code-sources.v1' ||
      !Array.isArray(value.sources_manifest.entries) || !Array.isArray(value.contents) ||
      typeof value.content_digest !== 'string' || !/^[a-f0-9]{64}$/.test(value.content_digest)) fail();
    if (!value[version ? 'version' : 'resource']?.document) fail();
    for (const row of value.contents) {
      if (!closed(row, ['sha256', 'text']) || typeof row.text !== 'string' || typeof row.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.sha256)) fail();
    }
  }
  return value;
};

export const createManagedCodeApi = (assertBridgeMethod, withTimeout) => {
  const invoke = async (method, args, kind) => {
    const bridge = assertBridgeMethod('unchainAPI', method);
    const result = await withTimeout(() => invokeSkeletonBridge(() => bridge(...args)), 20000,
      'managed_source_timeout', 'Managed Code request timed out');
    return checkManagedCodeResponse(kind, result);
  };
  return {
    getManagedCodeCapabilities: () => invoke('getManagedCodeCapabilities', [], 'capabilities'),
    getManagedSkeletonResource: id => invoke('getManagedSkeletonResource', [id], 'resource'),
    saveManagedSkeletonResource: payload => invoke('saveManagedSkeletonResource', [payload], 'resource'),
    preflightManagedSkeletonResource: id => invoke('preflightManagedSkeletonResource', [id], 'preflight'),
    publishManagedSkeletonWorkflow: (id, token) => invoke('publishManagedSkeletonWorkflow', [id, token], 'version'),
    getManagedSkeletonWorkflowVersion: (id, revision) => invoke('getManagedSkeletonWorkflowVersion', [id, revision], 'version'),
  };
};
