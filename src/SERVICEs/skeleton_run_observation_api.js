import { FrontendApiError } from './api.shared';
import { invokeSkeletonBridge } from './skeleton_resource_errors';
const fail = (path = []) => { throw Object.assign(new FrontendApiError('skeleton_run_observation_protocol_error', 'Invalid Skeleton run observation'), { path, status: null }); };
const SCHEMA = 'pupu.skeleton-run-observation.v1';
const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const closed = (v, keys, optional = []) => object(v) && keys.every(k => own(v, k)) &&
  Reflect.ownKeys(v).every(k => typeof k === 'string' && [...keys, ...optional].includes(k));
const id = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}(?![\s\S])/.test(v);
const text = v => typeof v === 'string' && v.length > 0;
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}(?![\s\S])/.test(v);
const manifestDigest = v => typeof v === 'string' && /^sha256:[a-f0-9]{64}(?![\s\S])/.test(v);
const counter = v => Number.isSafeInteger(v) && v >= 0;
const pools = new Set(['toolkit_pool', 'subagent_pool', 'hooks_pool']);
const types = new Set(['start', 'end', 'agent', 'toolkit_pool', 'subagent_pool', 'hooks_pool', 'tool_call', 'workflow_call', 'skill_read', 'code', 'if_else', 'switch_case']);
const states = new Set(['pending', 'running', 'waiting', 'waiting_approval', 'suspended', 'succeeded', 'failed', 'cancelled', 'outcome_unknown']);
const phases = new Set(['pending', 'completed', 'running', 'result_received', 'failed', 'cancelled', 'outcome_unknown', 'paused', 'waiting_for_child', 'awaiting_approval', 'receipt_recorded', 'awaiting_input', 'receipt_recorded_upstream']);
const statuses = new Set(['ready', 'running', 'waiting', 'result_received', 'completed', 'failed', 'cancelled', 'outcome_unknown']);
const requireValid = (condition, path = []) => { if (!condition) fail(path); };

// Validate JSON before serialization: JSON.stringify alone silently drops
// undefined, functions and symbols, changes nonfinite values, and invokes toJSON.
const checkJson = value => {
  const seen = new Set();
  let separators = 0, numbers = 0;
  const walk = (v, depth) => {
    requireValid(depth < 256);
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number') { requireValid(Number.isFinite(v)); numbers += 1; return; }
    requireValid(typeof v === 'object' && !seen.has(v));
    seen.add(v);
    if (Array.isArray(v)) {
      separators += Math.max(0, v.length - 1);
      requireValid(Object.getPrototypeOf(v) === Array.prototype && Reflect.ownKeys(v).length === v.length + 1);
      for (let i = 0; i < v.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(v, i);
        requireValid(descriptor && own(descriptor, 'value')); walk(descriptor.value, depth + 1);
      }
    } else {
      requireValid(object(v));
      const keyCount = Reflect.ownKeys(v).length;
      separators += keyCount + Math.max(0, keyCount - 1);
      for (const key of Reflect.ownKeys(v)) {
        const d = Object.getOwnPropertyDescriptor(v, key);
        requireValid(typeof key === 'string' && d.enumerable && own(d, 'value'));
        walk(d.value, depth + 1);
      }
    }
    seen.delete(v);
  };
  walk(value, 0);
  const ascii = JSON.stringify(value).replace(/[\u007f-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  // Conservative display budget, not Python canonical JSON byte parity.
  // Reserve default separator spaces and up to 310 extra bytes per number:
  // finite JS parsing can compress a 309-digit producer integer to an exponent.
  // Consequently a legitimate near-limit producer view may fail closed here.
  requireValid(ascii.length + separators + numbers * 310 <= 8 * 1024 * 1024);
};

const checkSkeletonRunObservationRequest = request => {
  checkJson(request);
  requireValid(closed(request, ['owner_chat_id', 'execution_id', 'resource_id'], ['root_run_id']));
  for (const key of Object.keys(request)) requireValid(id(request[key]), [key]);
  return request;
};

const checkDocument = doc => {
  requireValid(closed(doc, ['schema_version', 'kind', 'id', 'name', 'nodes', 'edges'], ['description']));
  requireValid(doc.schema_version === 1 && ['agent', 'workflow'].includes(doc.kind) && text(doc.id) && text(doc.name));
  requireValid(!own(doc, 'description') || typeof doc.description === 'string');
  requireValid(Array.isArray(doc.nodes) && Array.isArray(doc.edges));
  const nodes = new Map();
  for (const node of doc.nodes) {
    requireValid(closed(node, ['id', 'type', 'config'], ['label']) && text(node.id) && types.has(node.type) && object(node.config));
    requireValid(!own(node, 'label') || typeof node.label === 'string');
    requireValid(!nodes.has(node.id)); nodes.set(node.id, node);
  }
  const edges = new Map();
  for (const edge of doc.edges) {
    requireValid(closed(edge, ['id', 'kind', 'source_node_id', 'source_port_id', 'target_node_id', 'target_port_id']));
    requireValid(text(edge.id) && ['flow', 'attach'].includes(edge.kind) && text(edge.source_port_id) && text(edge.target_port_id));
    requireValid(nodes.has(edge.source_node_id) && nodes.has(edge.target_node_id) && !edges.has(edge.id));
    edges.set(edge.id, edge);
  }
  return { nodes, edges };
};

const checkSkeletonRunObservation = (value, request) => {
  checkSkeletonRunObservationRequest(request);
  checkJson(value);
  requireValid(closed(value, ['schema', 'run']) && value.schema === SCHEMA);
  if (value.run === null) return value;
  const run = value.run;
  requireValid(closed(run, ['owner_chat_id', 'execution_id', 'generation_id', 'root_run_id', 'resource_id', 'definition_digest', 'runtime_manifest_digest', 'launch_manifest_digest', 'high_watermark', 'graphs']));
  for (const k of ['owner_chat_id', 'execution_id', 'root_run_id', 'resource_id']) requireValid(id(run[k]), ['run', k]);
  requireValid(text(run.generation_id), ['run', 'generation_id']);
  for (const k of Object.keys(request)) requireValid(run[k] === request[k], ['run', k]);
  requireValid(digest(run.definition_digest) && manifestDigest(run.runtime_manifest_digest) && manifestDigest(run.launch_manifest_digest));
  requireValid(counter(run.high_watermark) && Array.isArray(run.graphs) && run.graphs.length > 0 && run.graphs.length <= 64);
  const graphs = new Map(), attempts = new Set();
  for (const graph of run.graphs) {
    requireValid(closed(graph, ['graph_id', 'attempt_id', 'parent_graph_id', 'caller_node_id', 'call_stack', 'definition_digest', 'document', 'revision', 'event_id', 'store_seq', 'status', 'paused', 'root_committed', 'owner_liveness', 'nodes', 'skipped_edges', 'error']));
    requireValid(text(graph.graph_id) && text(graph.attempt_id) && !graphs.has(graph.graph_id) && !attempts.has(graph.attempt_id));
    graphs.set(graph.graph_id, graph); attempts.add(graph.attempt_id);
    requireValid(digest(graph.definition_digest) && counter(graph.revision) && counter(graph.store_seq) && graph.store_seq <= run.high_watermark && text(graph.event_id));
    requireValid(statuses.has(graph.status) && typeof graph.paused === 'boolean' && typeof graph.root_committed === 'boolean' && graph.owner_liveness === 'unknown');
    requireValid(graph.error === null || (closed(graph.error, ['code', 'path']) && text(graph.error.code) && Array.isArray(graph.error.path) && graph.error.path.every(p => typeof p === 'string' || counter(p))));
    const { nodes, edges } = checkDocument(graph.document);
    requireValid(Array.isArray(graph.nodes));
    const projected = new Map();
    for (const node of graph.nodes) {
      requireValid(closed(node, ['node_id', 'state', 'phase', 'node_invocation_id', 'node_attempt_id', 'interaction_id', 'reason']));
      requireValid(nodes.has(node.node_id) && !pools.has(nodes.get(node.node_id).type) && !projected.has(node.node_id) && states.has(node.state) && phases.has(node.phase));
      for (const key of ['node_invocation_id', 'node_attempt_id', 'interaction_id']) requireValid(node[key] === null || text(node[key]));
      requireValid(node.reason === null || text(node.reason)); projected.set(node.node_id, node);
    }
    requireValid(projected.size === [...nodes.values()].filter(n => !pools.has(n.type)).length);
    requireValid(Array.isArray(graph.skipped_edges) && new Set(graph.skipped_edges).size === graph.skipped_edges.length && graph.skipped_edges.every(e => edges.has(e) && edges.get(e).kind === 'flow'));
    requireValid(Array.isArray(graph.call_stack) && graph.call_stack.length > 0 && graph.call_stack.length <= 64);
    graph.call_stack.forEach((frame, i) => {
      const last = i === graph.call_stack.length - 1;
      requireValid(closed(frame, ['execution_id', 'graph_invocation_id', 'attempt_id', 'definition_id', 'definition_digest', ...(!last ? ['caller_node_invocation_id'] : [])]));
      requireValid(frame.execution_id === run.execution_id && text(frame.graph_invocation_id) && text(frame.attempt_id) && text(frame.definition_id) && digest(frame.definition_digest));
      if (!last) requireValid(text(frame.caller_node_invocation_id));
    });
    const frame = graph.call_stack[graph.call_stack.length - 1];
    requireValid(frame.graph_invocation_id === graph.graph_id && frame.attempt_id === graph.attempt_id && frame.definition_id === graph.document.id && frame.definition_digest === graph.definition_digest);
  }
  const root = run.graphs[0];
  requireValid(root.parent_graph_id === null && root.caller_node_id === null && root.call_stack.length === 1 && root.attempt_id === run.root_run_id && root.document.id === run.resource_id && root.definition_digest === run.definition_digest);
  for (const graph of run.graphs.slice(1)) {
    const parent = graphs.get(graph.parent_graph_id);
    requireValid(parent && text(graph.caller_node_id) && graph.call_stack.length === parent.call_stack.length + 1);
    const caller = parent.nodes.find(n => n.node_id === graph.caller_node_id);
    requireValid(caller && text(caller.node_invocation_id));
    for (let i = 0; i < parent.call_stack.length; i++) {
      const current = graph.call_stack[i], previous = parent.call_stack[i];
      for (const key of ['execution_id', 'graph_invocation_id', 'attempt_id', 'definition_id', 'definition_digest']) requireValid(current[key] === previous[key]);
      requireValid(current.caller_node_invocation_id === (i === parent.call_stack.length - 1 ? caller.node_invocation_id : previous.caller_node_invocation_id));
    }
  }
  return value;
};

export { checkSkeletonRunObservation, checkSkeletonRunObservationRequest };
export const createSkeletonRunObservationApi = (assertBridgeMethod, withTimeout) => ({
  getSkeletonRunObservation: async request => {
    try {
      checkSkeletonRunObservationRequest(request);
      const scope = Object.freeze({ ...request });
      let method;
      try { method = assertBridgeMethod('unchainAPI', 'getSkeletonRunObservation'); }
      catch { throw Object.assign(new FrontendApiError('skeleton_run_observation_unavailable', 'Run observation is unavailable'), { path: [], status: null }); }
      const value = await withTimeout(() => invokeSkeletonBridge(() => method(scope)), 15000, 'skeleton_run_observation_timeout', 'Run observation read timed out');
      return { ok: true, data: checkSkeletonRunObservation(value, scope) };
    } catch (error) {
      return { ok: false, error: { code: error.code || 'skeleton_run_observation_unavailable', path: error.path || [], message: error.message || 'Run observation is unavailable', status: error.status ?? null } };
    }
  },
});
