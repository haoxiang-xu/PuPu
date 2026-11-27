import { assertBridgeMethod, withTimeout, FrontendApiError } from './api.shared';
import { invokeSkeletonBridge } from './skeleton_resource_errors';

const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const closed=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.prototype.hasOwnProperty.call(value,key));
const fail=()=>{throw new FrontendApiError('builder_test_protocol_error','Invalid Test Run response');};
const id=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
export const checkBuilderTestReply=(value,request)=>{
  if(!closed(value,['schema','session','runs'])||value.schema!=='pupu.builder-test.v1'||
    !closed(value.session,['id','resource_id','kind'])||!id(value.session.id)||value.session.resource_id!==request.resource_id||
    (request.session_id && value.session.id!==request.session_id) || (request.kind && value.session.kind!==request.kind) ||
    !['agent','workflow'].includes(value.session.kind)||!Array.isArray(value.runs)||value.runs.length>100) fail();
  const seen=new Set();
  for(const run of value.runs){
    if(!closed(run,['id','request_id','edit_token','definition_digest','inputs','status','output','error','pending','graphs','events','trace_complete'])||
      !id(run.id)||seen.has(run.id)||!id(run.request_id)||typeof run.edit_token!=='string'||
      typeof run.definition_digest!=='string'||!/^[a-f0-9]{64}$/.test(run.definition_digest)||!object(run.inputs)||
      !['ready','starting','running','waiting','completed','failed','cancelled','outcome_unknown'].includes(run.status)||
      (!Array.isArray(run.events)||typeof run.trace_complete!=='boolean'||!Array.isArray(run.graphs))||(run.output!==null&&(!object(run.output)||run.status!=='completed'))||
      (run.error!==null&&(!closed(run.error,['code','path','message'])||typeof run.error.code!=='string'||!Array.isArray(run.error.path)||typeof run.error.message!=='string'||run.error.path.some(part=>typeof part!=='string'&&!(Number.isSafeInteger(part)&&part>=0))))) fail();
    seen.add(run.id);
    for(const event of run.events) if(!object(event)||event.schema_version!=='v4'||event.session_id!==value.session.id||typeof event.event_id!=='string'||typeof event.type!=='string') fail();
    if(run.pending!==null&&(!closed(run.pending,['interaction_id','kind','status','payload','subject','presentation'])||
      !id(run.pending.interaction_id)||!['tool_approval','human_input','max_budget'].includes(run.pending.kind)||
      !['awaiting_response','receipt_recorded'].includes(run.pending.status)||!object(run.pending.payload)||!object(run.pending.subject)||run.status!=='waiting'||!closed(run.pending.presentation,['trace_frame','tool_call'])||!object(run.pending.presentation.tool_call)||run.pending.presentation.tool_call.confirmation_id!==run.pending.interaction_id)) fail();
    for(const graph of run.graphs){
      if(!closed(graph,['id','attempt_id','name','status','nodes'])||typeof graph.id!=='string'||typeof graph.attempt_id!=='string'||typeof graph.name!=='string'||typeof graph.status!=='string'||!Array.isArray(graph.nodes)) fail();
      for(const node of graph.nodes) if(!closed(node,['id','status'])||typeof node.id!=='string'||typeof node.status!=='string') fail();
    }
  }
  return value;
};

export const builderTestCommand=async request=>{
  const bridge=assertBridgeMethod('unchainAPI','builderTestCommand');
  const result=await withTimeout(()=>invokeSkeletonBridge(()=>bridge(request)),20000,
    'builder_test_unconfirmed','Test Run response was not confirmed. Read the recorded state before trying again.');
  return checkBuilderTestReply(result,request);
};
