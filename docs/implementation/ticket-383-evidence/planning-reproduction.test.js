import React from '/workspace/shared/pupu-383-planning-20261002/node_modules/react';
import { render, screen, cleanup } from '/workspace/shared/pupu-383-planning-20261002/node_modules/@testing-library/react';
import { ConfigContext } from '/workspace/shared/pupu-383-planning-20261002/src/CONTAINERs/config/context';
import { StreamingMessageStoreContext } from '/workspace/shared/pupu-383-planning-20261002/src/COMPONENTs/chat-bubble/components/streaming_message_store_context';
import TraceChain from '/workspace/shared/pupu-383-planning-20261002/src/COMPONENTs/chat-bubble/trace_chain';
import { createRuntimeEventStreamReplayProjector } from '/workspace/shared/pupu-383-planning-20261002/src/SERVICEs/runtime_events/stream_replay_projector';

jest.mock('/workspace/shared/pupu-383-planning-20261002/src/BUILTIN_COMPONENTs/icon/icon', () => () => null);
const event = (id, type, seq, payload = {}, links = {}) => ({
  schema_version: 'v4', event_id: id, type, run_id: 'run-383-repro', seq,
  timestamp: new Date(1700000000000 + seq * 100).toISOString(), payload, links,
  surface: { slot: 'trace_inline', scope: 'turn', group: '' },
});
const eventsFor = ({ withOutput = false } = {}) => {
  let seq = 0;
  const next = (id, type, payload, links) => event(id, type, ++seq, payload, links);
  const events = [next('start', 'run.started', {})];
  for (const id of ['call-A', 'call-B']) {
    const links = { tool_call_id: id, step_id: `tool:${id}` };
    events.push(next(`${id}-start`, 'step.started', {
      step_type: 'tool', tool_name: 'read_file', tool_display_name: 'read_file',
      call_id: id, arguments: { path: `${id}.txt` },
    }, links));
    if (withOutput) events.push(next(`${id}-delta`, 'step.delta', {
      step_type: 'tool', call_id: id, delta: `output from ${id}`,
    }, links));
    events.push(next(`${id}-end`, 'step.completed', {
      step_type: 'tool', tool_name: 'read_file', call_id: id,
      status: 'completed', result: { content: `result from ${id}` },
    }, links));
  }
  events.push(next('complete', 'run.completed', { status: 'completed' }));
  return events;
};
const project = (events) => {
  const projector = createRuntimeEventStreamReplayProjector();
  let projected;
  events.forEach((item, index) => { projected = projector.append(item, index + 1); });
  return projected;
};
const draw = (projected) => render(
  <ConfigContext.Provider value={{ theme: { color: '#222', font: { fontFamily: 'sans-serif' } }, onThemeMode: 'light_mode' }}>
    <StreamingMessageStoreContext.Provider value={{ chatId: 'chat-383', store: null, notifyStreamingContentCommitted: jest.fn() }}>
      <TraceChain frames={projected.traceFrames} status={projected.status} messageId='assistant-383' />
    </StreamingMessageStoreContext.Provider>
  </ConfigContext.Provider>,
);
afterEach(cleanup);
test('baseline: same tool with different arguments groups when output has no deltas', () => {
  const projected = project(eventsFor());
  expect(projected.traceFrames.filter(f => f.type === 'tool_call')).toHaveLength(2);
  draw(projected);
  expect(screen.getByText('×2')).toBeInTheDocument();
});
test('reported behavior: the same tool should still group when its own output emits a delta', () => {
  const projected = project(eventsFor({ withOutput: true }));
  expect(projected.traceFrames.filter(f => f.type === 'tool_call')).toHaveLength(2);
  expect(projected.traceFrames.filter(f => f.type === 'observation')).toHaveLength(2);
  draw(projected);
  expect(screen.getByText('×2')).toBeInTheDocument();
});
test('replaying identical runtime events does not add tool executions', () => {
  const events = eventsFor();
  const projected = project(events.flatMap(e => [e, e]));
  expect(projected.traceFrames.filter(f => f.type === 'tool_call')).toHaveLength(2);
  draw(projected);
  expect(screen.getByText('×2')).toBeInTheDocument();
});
