// QA-only strict Responses fixture. Never forwards or resolves another service.
const assert=require('node:assert/strict');
const KEY='qa473-only-sentinel';
function frameFor(body){
 const allowed=new Set(['model','input','instructions','tools','tool_choice','parallel_tool_calls','store','text','max_output_tokens','metadata','previous_response_id','include','stream','temperature','top_p','reasoning','truncation','service_tier','user','stream_options','background']);
 assert(body && typeof body==='object' && !Array.isArray(body),'body_shape');
 assert(Object.keys(body).every(k=>allowed.has(k)),'unknown_request_field');
 assert.equal(body.model,'gpt-6-sol','model_identity');assert.equal(body.stream,true,'stream_required');
 assert(body.input && (typeof body.input==='string'||Array.isArray(body.input)),'input_required');
 if(body.max_output_tokens!==undefined)assert(Number.isInteger(body.max_output_tokens)&&body.max_output_tokens>0&&body.max_output_tokens<=32768,'output_budget');
 const input=JSON.stringify(body.input),names=(body.tools||[]).map(t=>t.name);let output,reply;
 if(input.includes('QA473_QUALIFY'))reply='QA473 qualification accepted';
 else if(input.includes('QA473_CHILD_TASK')&&!names.includes('delegate_to_subagent'))reply='QA473 child result';
 else {
  const tags=[...input.matchAll(/QA473_RUN_(Old|Flat|Explore|Default|Structured|Native|Parent)_T([12])/g)];
  assert(tags.length>0,'unrecognized_task');const [,kind,turn]=tags.at(-1);
  if(kind==='Parent'&&!input.includes('QA473 child result')){
   assert(names.includes('delegate_to_subagent'),'delegate_tool_missing');
   output=[{id:'fc_473_delegate',type:'function_call',call_id:'call_473_delegate',name:'delegate_to_subagent',arguments:JSON.stringify({target:'QA473 Child',task:'QA473_CHILD_TASK'}),status:'completed'}];
  } else reply=`QA473 done ${kind} ${turn}`;
 }
 if(reply)output=[{id:'msg_473',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:reply,annotations:[]}]}];
 const response={id:'resp_473',object:'response',created_at:1,status:'completed',model:body.model,output,usage:{input_tokens:20,output_tokens:7,total_tokens:27}};
 return {type:'response.completed',response};
}
function controls(){
 const base={model:'gpt-6-sol',input:'QA473_QUALIFY',stream:true,max_output_tokens:128};assert.equal(frameFor(base).response.output[0].content[0].text,'QA473 qualification accepted');
 const mutations=[['model_identity',b=>b.model='wrong'],['stream_required',b=>b.stream=false],['input_required',b=>delete b.input],['unknown_request_field',b=>b.unrecognized=true],['output_budget',b=>b.max_output_tokens=0],['unrecognized_task',b=>b.input='ordinary unknown text']];
 return mutations.map(([reason,mutate])=>{const b=structuredClone(base);mutate(b);let caught;try{frameFor(b);}catch(e){caught=e;}assert(caught && caught.message.includes(reason),reason);return {reason,refused:true};});
}
module.exports={frameFor,controls,KEY};
