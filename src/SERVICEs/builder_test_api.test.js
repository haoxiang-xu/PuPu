import {checkBuilderTestReply} from './builder_test_api';
import {projectTestTrace} from '../COMPONENTs/agents/pages/recipes_page/test_run/test_trace';
const {packets}=require('./__fixtures__/builder-test/producer.json');

test.each(Object.entries(packets).filter(([,packet])=>Array.isArray(packet.runs)))('real producer %s crosses the final renderer boundary',(name,packet)=>{
  expect(checkBuilderTestReply(packet,{resource_id:packet.session.resource_id,session_id:packet.session.id})).toBe(packet);
  for(const run of packet.runs){
    const original=JSON.stringify(run.events);
    const trace=projectTestTrace(run);
    expect(trace.frames.every((frame,index)=>frame.seq===index+1)).toBe(true);
    expect(JSON.stringify(run.events)).toBe(original);
    expect(trace.frames.some(frame=>frame.payload?.requires_confirmation===true)).toBe(false);
  }
});
test('wrong resource/session, unknown state and mismatched interaction identities fail closed',()=>{
  const source=packets['workflow-waiting-approve'];
  const request={resource_id:source.session.resource_id,session_id:source.session.id};
  for(const change of [value=>{value.session.id='another';},value=>{value.runs.at(-1).status='maybe-done';},
    value=>{value.runs.at(-1).pending.presentation.tool_call.confirmation_id='another';},
    value=>{value.runs.at(-1).events[0].session_id='other-chat';}]){
    const copy=JSON.parse(JSON.stringify(source));change(copy);expect(()=>checkBuilderTestReply(copy,request)).toThrow();
  }
});

test('a durable request is displayed only by its authoritative controller, never as a second pending tool card',()=>{
  const run=packets['workflow-waiting-approve'].runs.at(-1);
  expect(run.events.some(event=>event.type==='interaction.requested')).toBe(true);
  const before=JSON.stringify(run.events);
  expect(projectTestTrace(run).frames.filter(frame=>frame.type==='tool_call')).toEqual([]);
  expect(JSON.stringify(run.events)).toBe(before);
});
