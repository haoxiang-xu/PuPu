import { createRuntimeEventStore } from '../../../../../SERVICEs/runtime_events/event_store';
import { reduceActivityTree } from '../../../../../SERVICEs/runtime_events/activity_tree';
import { adaptActivityTreeToTraceChain } from '../../../../../SERVICEs/runtime_events/trace_chain_adapter';

// V4 seq belongs to one transport, including after cold recovery. Reduce each
// real session.started segment separately, then join presentation frames in
// recorded arrival order. Never rewrite or re-sort the original V4 events.
export function projectTestTrace(run){
  const segments=[];
  for(const event of run.events||[]){
    // Durable requests belong to the panel controller. Adapting one as a
    // historical tool call would leave a second, permanently Pending card.
    // Keep the original V4 record unchanged for audit and recovery.
    if(event.type==='interaction.requested')continue;
    if(event.type==='session.started')segments.push([]);
    if(!segments.length)throw new Error('Test trace has no transport start');
    segments.at(-1).push(event);
  }
  const result={frames:[],subagentFrames:{},subagentMetaByRunId:{},streamingContent:''};
  for(const events of segments){
    const store=createRuntimeEventStore();store.appendMany(events);
    const next=adaptActivityTreeToTraceChain(reduceActivityTree(undefined,store.getSnapshot()));
    result.frames.push(...next.frames);
    result.streamingContent=next.streamingContent;
    for(const [id,frames] of Object.entries(next.subagentFrames)){
      result.subagentFrames[id]=[...(result.subagentFrames[id]||[]),...frames];
    }
    for(const [id,meta] of Object.entries(next.subagentMetaByRunId)){
      const old=result.subagentMetaByRunId[id]||{};
      const merged={...old};
      for(const [key,value] of Object.entries(meta)){
        if(value!==null&&value!==''&&!(key==='subagentId'&&value===id&&old.subagentId))merged[key]=value;
      }
      result.subagentMetaByRunId[id]=merged;
    }
  }
  const present=frames=>frames.filter(frame=>!['tool_confirmation','clarify'].includes(frame.type)).map((frame,index)=>({
    ...frame,seq:index+1,payload:frame.payload?{...frame.payload,requires_confirmation:false}:frame.payload,
  }));
  result.frames=present(result.frames);
  for(const id of Object.keys(result.subagentFrames))result.subagentFrames[id]=present(result.subagentFrames[id]);
  for(const graph of run.graphs||[]){
    if(result.subagentMetaByRunId[graph.attempt_id])result.subagentMetaByRunId[graph.attempt_id]={
      ...result.subagentMetaByRunId[graph.attempt_id],status:graph.status};
  }
  return result;
}
