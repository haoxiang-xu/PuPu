// Main is the only credential injector. Public commands contain no secrets,
// owner/attempt alias or provider endpoint. An Agent start may name one model
// (`fallback_model`, "provider:model") for Agent nodes the author left with no
// model; the runtime derives that model's profile from its own catalog and
// never applies it to a node that has its own Kernel.
const SCHEMA = 'pupu.builder-test.v1';
const isRecord=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const closed=(value,fields)=>isRecord(value) && Reflect.ownKeys(value).length===fields.length && fields.every(key=>
  Object.prototype.hasOwnProperty.call(value,key) && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value,key),'value'));
const fail=()=>{ throw Object.assign(new Error('Invalid Builder test command or response'),{code:'builder_test_protocol_error'}); };
const id=value=>typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
const modelId=value=>typeof value==='string' && /^[a-z0-9][a-z0-9_.-]{0,63}:\S{1,200}$/.test(value);
const FIELDS={open:['resource_id','kind'],new:['resource_id','kind'],read:['resource_id','session_id'],
  start:['resource_id','session_id','expected_edit_token','request_id','inputs','toolkits','workspace_id'],
  respond:['resource_id','session_id','run_id','interaction_id','approved','answer'],
  resume:['resource_id','session_id','run_id','interaction_id'],cancel:['resource_id','session_id','run_id']};

const copyJson=(value,seen=new Set(),depth=0)=>{
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(depth>64||typeof value!=='object'||seen.has(value))fail();
  if(!Array.isArray(value)&&(!isRecord(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))))fail();
  seen.add(value);
  const output=Array.isArray(value)?[]:{};
  if(Array.isArray(value)&&Reflect.ownKeys(value).length!==value.length+1)fail();
  for(const key of Reflect.ownKeys(value)){
    if(Array.isArray(value)&&key==='length')continue;
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(typeof key!=='string'||!descriptor.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))fail();
    Object.defineProperty(output,key,{value:copyJson(descriptor.value,seen,depth+1),enumerable:true,writable:true,configurable:true});
  }
  seen.delete(value);return output;
};

const checkBuilderTestCommand=value=>{
  value=copyJson(value);
  const config=value?.op==='start'&&Object.prototype.hasOwnProperty.call(value,'memory_agent_config');
  const fallback=value?.op==='start'&&Object.prototype.hasOwnProperty.call(value,'fallback_model');
  if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(FIELDS,value.op) ||
    !closed(value,['op',...FIELDS[value.op],...(config?['memory_agent_config']:[]),...(fallback?['fallback_model']:[])])) fail();
  if(fallback&&!modelId(value.fallback_model))fail();
  if(config&&(!closed(value.memory_agent_config,['displayName','additionalInstructions','provider','modelId'])||
    Object.values(value.memory_agent_config).some(field=>typeof field!=='string')))fail();
  for(const key of ['resource_id','session_id','run_id','interaction_id','request_id']) if(key in value && !id(value[key])) fail();
  if(['open','new'].includes(value.op) && !['agent','workflow'].includes(value.kind)) fail();
  if(value.op==='start' && (typeof value.expected_edit_token!=='string' || !value.expected_edit_token ||
    !isRecord(value.inputs) || !Array.isArray(value.toolkits) || value.toolkits.some(tool=>typeof tool!=='string'||!tool.trim()) ||
    new Set(value.toolkits).size!==value.toolkits.length || typeof value.workspace_id!=='string' || (value.workspace_id!==''&&!id(value.workspace_id)))) fail();
  if(value.op==='respond' && (typeof value.approved!=='boolean' || (value.answer!==null && !isRecord(value.answer)))) fail();
  if(Buffer.byteLength(JSON.stringify(value),'utf8')>2097152)fail();
  return value;
};

const checkBuilderTestReply=(value,request)=>{
  if(!closed(value,['schema','session','runs']) || value.schema!==SCHEMA ||
    !closed(value.session,['id','resource_id','kind']) || !id(value.session.id) || value.session.resource_id!==request.resource_id ||
    (request.session_id && value.session.id!==request.session_id) || !['agent','workflow'].includes(value.session.kind) ||
    (request.kind && value.session.kind!==request.kind) || !Array.isArray(value.runs) || value.runs.length>100) fail();
  const seen=new Set();
  for(const run of value.runs){
    if(!closed(run,['id','request_id','edit_token','definition_digest','inputs','status','output','error','pending','graphs','events','trace_complete']) ||
      !id(run.id) || seen.has(run.id) || !id(run.request_id) || typeof run.edit_token!=='string' ||
      !/^[a-f0-9]{64}$/.test(run.definition_digest) || !isRecord(run.inputs) ||
      !['ready','starting','running','waiting','completed','failed','cancelled','outcome_unknown'].includes(run.status) ||
      (!Array.isArray(run.events)||typeof run.trace_complete!=='boolean'||!Array.isArray(run.graphs)) || (run.output!==null && (!isRecord(run.output)||run.status!=='completed')) ||
      (run.error!==null && (!closed(run.error,['code','path','message']) || typeof run.error.code!=='string'||!Array.isArray(run.error.path)||typeof run.error.message!=='string'||run.error.path.some(part=>typeof part!=='string'&&!(Number.isSafeInteger(part)&&part>=0))))) fail();
    seen.add(run.id);
    for(const event of run.events) if(!isRecord(event)||event.schema_version!=='v4'||event.session_id!==value.session.id||typeof event.event_id!=='string'||typeof event.type!=='string') fail();
    if(run.pending!==null && (!closed(run.pending,['interaction_id','kind','status','payload','subject','presentation']) || !id(run.pending.interaction_id) ||
      !['tool_approval','human_input','max_budget'].includes(run.pending.kind) || !['awaiting_response','receipt_recorded'].includes(run.pending.status)||
      !isRecord(run.pending.payload) || !isRecord(run.pending.subject) || run.status!=='waiting'||!closed(run.pending.presentation,['trace_frame','tool_call'])||!isRecord(run.pending.presentation.tool_call)||run.pending.presentation.tool_call.confirmation_id!==run.pending.interaction_id)) fail();
    for(const graph of run.graphs){
      if(!closed(graph,['id','attempt_id','name','status','nodes'])||typeof graph.id!=='string'||typeof graph.attempt_id!=='string'||typeof graph.name!=='string'||typeof graph.status!=='string'||!Array.isArray(graph.nodes)) fail();
      for(const node of graph.nodes) if(!closed(node,['id','status'])||typeof node.id!=='string'||typeof node.status!=='string') fail();
    }
  }
  return value;
};

const runBuilderTestCommand=async(payload,{post,resolveCredentials,resolveWorkspace})=>{
  const request=checkBuilderTestCommand(payload);
  const send=body=>post({schema:SCHEMA,...body});
  const capable=async()=>{
    const value=await send({op:'capabilities'});
    if(!closed(value,['schema','contract','kinds','input_bytes','trace_bytes','runtime_manifest'])||value.schema!==SCHEMA||
      value.contract!=='agent-workflow-test-v1'||!Array.isArray(value.kinds)||value.kinds.join(',')!=='agent,workflow'||
      value.input_bytes!==2097152||value.trace_bytes!==2097152||!isRecord(value.runtime_manifest)||
      !/^sha256:[a-f0-9]{64}$/.test(value.runtime_manifest.manifest_digest)) fail();
  };
  if(!['start','respond','resume'].includes(request.op)) {
    if(['open','new'].includes(request.op)) await capable();
    return checkBuilderTestReply(await send(request),request);
  }
  let options={skeleton_credentials:{}};
  let context=null;
  if(request.op==='start'){
    const workspace=request.workspace_id;
    context={toolkits:request.toolkits,skills:{include_user_dirs:true},workspace_root:null,workspace_roots:[],disable_workspace_root:true};
    if(workspace){
      const checked=resolveWorkspace(workspace);
      if(!checked?.valid || typeof checked.resolvedPath!=='string') throw Object.assign(new Error('Choose an authorized workspace'),{code:'invalid_workspace_root'});
      context.workspace_root=checked.resolvedPath;
      context.workspace_roots=[checked.resolvedPath];
      context.disable_workspace_root=false;
    }
  }
  await capable();
  const prepared=await send(request.op==='start'
    ? {op:'prepare',session_id:request.session_id,resource_id:request.resource_id,expected_edit_token:request.expected_edit_token,
      request_id:request.request_id,inputs:request.inputs,context,...(request.memory_agent_config?{memory_agent_config:request.memory_agent_config}:{}),
      ...(request.fallback_model?{fallback_model:request.fallback_model}:{})}
    : {op:'resume_requirements',session_id:request.session_id,resource_id:request.resource_id,run_id:request.run_id,interaction_id:request.interaction_id});
  if(!closed(prepared,['schema','session_id','resource_id','run_id','credential_query','requirements']) || prepared.schema!==SCHEMA ||
    prepared.session_id!==request.session_id || prepared.resource_id!==request.resource_id || !id(prepared.run_id) ||
    (request.op!=='start' && prepared.run_id!==request.run_id)) fail();
  if((prepared.requirements===null)!==(prepared.credential_query===null)) fail();
  if(prepared.requirements!==null){
    const query=prepared.credential_query;
    if(!isRecord(query)||query.session_id!==request.session_id||query.owner_chat_id!==request.session_id||
      query.mode!==(request.op==='start'?'start':'resume')||query.interaction_id!==(request.op==='start'?'':request.interaction_id)||
      (request.op==='start' && query.selection?.resource_id!==request.resource_id) ||
      (request.op!=='start' && query.source_attempt_id!==request.run_id)) fail();
    const resolved=resolveCredentials(prepared.requirements,query);
    if(!resolved) fail();
    options={...options,...resolved.providerOptions,skeleton_credentials:resolved.credentials,skeleton_credential_scope:resolved.scope};
  }
  const result=await send(request.op==='start'
    ? {op:'execute',session_id:request.session_id,resource_id:request.resource_id,run_id:prepared.run_id,options}
    : {...request,options});
  return checkBuilderTestReply(result,request);
};
module.exports={checkBuilderTestCommand,checkBuilderTestReply,runBuilderTestCommand};
