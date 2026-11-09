// QA only: deterministic native Responses producer; never forwards traffic.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const KEY='qa448-only-sentinel';
const GOAL='QA448_TASK: inspect eight evidence patterns; preserve poker action ordering.';
const PROGRESS='QA448_PROGRESS: inspection precedes any edit; next add regression coverage.';
const pattern=i=>`QA448_PATTERN_${i}_`+'x'.repeat(40*1024)+'_é🂡';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function* strings(v){if(typeof v==='string')yield v;else if(v&&typeof v==='object')for(const x of Object.values(v))yield*strings(x);}
function history(body){const rows=[...strings(body.input)].filter(s=>s.startsWith('[MEMORY_V2_EVIDENCE_HISTORY]'));assert(rows.length<=1,'history_unique');return rows.length?JSON.parse(rows[0].split('\n').slice(2).join('\n')):null;}
function pageOutput(body,id){const row=body.input.find(x=>x.type==='function_call_output'&&x.call_id===id);assert(row,'page_output_missing');let value=JSON.parse(row.output);if(value.schema_version==='unchain.tool_output.paged.v2'&&typeof value.preview==='string')value=JSON.parse(value.preview);assert.equal(value.schema_version,'unchain.context_content_page.v2','official_page_schema');assert(value.content?.encoding==='utf-8','page_encoding');assert.equal(Buffer.byteLength(value.content.text),value.page_bytes,'page_bytes');assert.equal(value.code,undefined,'reader_error');return value;}
function createFixture(workspace){
 const state={long:0,cold:0,third:0,qualification:0,history:null,hot_page:null,cold_pages:[],result_pages:[],result_page:null,arg_json:[],reads:[],requests:[]};
 const file=require('node:path').join(workspace,'evidence.txt');
 const call=(id,name,args)=>[{id:'fc_'+id,type:'function_call',call_id:id,name,arguments:JSON.stringify(args),status:'completed'}];
 const reply=text=>[{id:'msg_448',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]}];
 function frameFor(body){
  const allowed=new Set(['model','input','instructions','tools','tool_choice','parallel_tool_calls','store','text','max_output_tokens','metadata','previous_response_id','include','stream','temperature','top_p','reasoning','truncation','service_tier','user','stream_options','background']);
  assert(body&&typeof body==='object'&&!Array.isArray(body),'body_shape');assert(Object.keys(body).every(k=>allowed.has(k)),'unknown_request_field');
  assert.equal(body.model,'gpt-6-sol','model_identity');assert.equal(body.stream,true,'stream_required');assert(body.input&&(typeof body.input==='string'||Array.isArray(body.input)),'input_required');
  if(body.max_output_tokens!==undefined)assert(Number.isInteger(body.max_output_tokens)&&body.max_output_tokens>0&&body.max_output_tokens<=32768,'output_budget');
  const text=JSON.stringify(body.input),names=(body.tools||[]).map(t=>t.name);let output,stage;
  if(text.includes('QA448_QUALIFY')){state.qualification++;stage='qualification';output=reply('QA448 qualification accepted');}
  else {
   assert(Array.isArray(body.input),'native_input_required');assert(text.includes(GOAL),'original_goal_missing');assert(text.includes(PROGRESS),'original_progress_missing');
   if(text.includes('QA448_FOLLOWUP_3')){assert.equal(state.third,0,'third_duplicate');assert(text.includes('QA448_DONE_T2'),'previous_reply_missing');assert(text.includes(state.cold_pages.at(-1).ref)&&text.includes(state.result_pages.at(-1).ref),'reader_sources_not_preserved_next_input');state.third++;stage='third';output=reply('QA448_DONE_T3');}
   else if(text.includes('QA448_FOLLOWUP_2')){
    stage='cold';assert(state.history,'cold_without_projection');const n=state.cold++;
    if(n===0){assert(text.includes('QA448_DONE_T1'),'cold_history_missing');assert(text.includes(state.history.tool_exchanges[0].arguments.full_output_ref)&&text.includes(state.history.tool_exchanges[0].full_output_ref),'cold_reader_sources_not_disclosed');const args={...state.history.tool_exchanges[0].arguments.read_request.arguments};state.reads.push(args);output=call('qa448_cold_0','context_content_read',args);}
    else {
     const page=pageOutput(body,`qa448_cold_${n-1}`);const expected=state.reads[n-1];assert.equal(page.ref,expected.ref,'read_ref_changed');assert.equal(page.offset,expected.offset,'read_offset_changed');
     if(page.ref===state.history.tool_exchanges[0].arguments.full_output_ref){state.cold_pages.push(page);if(page.next_read){assert(page.next_read.tool==='context_content_read','next_read_tool');state.reads.push(page.next_read.arguments);output=call(`qa448_cold_${n}`,'context_content_read',page.next_read.arguments);}else{const bytes=Buffer.concat(state.cold_pages.map(p=>Buffer.from(p.content.text)));assert.equal(bytes.length,page.total_bytes,'cold_total');assert.equal(sha(bytes),page.sha256,'cold_digest');const event=JSON.parse(bytes);assert.equal(event.payload.arguments,state.arg_json[0],'cold_original_argument_bytes');assert.equal(JSON.parse(event.payload.arguments).pattern,pattern(0),'cold_original_arguments');assert.equal(event.payload.call_id,'qa448_grep_0','cold_original_call');const args={ref:state.history.tool_exchanges[0].full_output_ref,offset:0,limit:8192};state.reads.push(args);output=call(`qa448_cold_${n}`,'context_content_read',args);}}
     else {assert.equal(page.ref,state.history.tool_exchanges[0].full_output_ref,'cold_result_ref');state.result_pages.push(page);if(page.next_read){assert(page.next_read.tool==='context_content_read','result_next_read_tool');state.reads.push(page.next_read.arguments);output=call(`qa448_cold_${n}`,'context_content_read',page.next_read.arguments);}else{const bytes=Buffer.concat(state.result_pages.map(p=>Buffer.from(p.content.text)));assert.equal(bytes.length,page.total_bytes,'result_total');assert.equal(sha(bytes),page.sha256,'result_digest');const result=JSON.parse(bytes);assert.equal(result.pattern,pattern(0),'grep_result_original_pattern');assert.equal(result.match_count,1,'grep_real_match_count');assert.equal(result.path,file,'grep_result_path');assert.equal(result.error,undefined,'grep_result_error');state.result_page=page;output=reply('QA448_DONE_T2');}}
    }
   } else {
    stage='long';const n=state.long++;
    if(n<8){assert(names.includes('grep'),'grep_tool_missing');const args={pattern:pattern(n),path:file,output_mode:'count',head_limit:1};state.arg_json[n]=JSON.stringify(args);output=call(`qa448_grep_${n}`,'grep',args);}
    else if(n===8){
     const h=history(body);assert(h,'projected_history_missing');const xs=h.tool_exchanges;assert.deepEqual(xs.map(x=>x.call_id),Array.from({length:7},(_,i)=>`qa448_grep_${i}`),'historical_call_identity');
     assert(xs.every(x=>x.tool_name==='grep'),'historical_tool_identity');assert(xs.some(x=>x.arguments?.truncated===true),'pressure_projection_absent');
     for(const [i,x]of xs.entries()){const expected=sha(Buffer.from(JSON.stringify(state.arg_json[i])));assert.equal(x.arguments.projected_value_sha256,expected,'projected_arguments_digest');assert.equal(x.arguments.read_scope,'canonical_tool_call_event');}
     const native=body.input.filter(x=>x.type==='function_call');assert.deepEqual(native.map(x=>x.call_id),['qa448_grep_7'],'current_batch_preserved');assert.equal(JSON.parse(native[0].arguments).pattern,pattern(7),'current_arguments_preserved');assert(names.includes('context_content_read'),'official_reader_missing');state.history=h;
     const args={...xs[0].arguments.read_request.arguments};output=call('qa448_hot_read','context_content_read',args);
    }else if(n===9){state.hot_page=pageOutput(body,'qa448_hot_read');assert.equal(state.hot_page.ref,state.history.tool_exchanges[0].arguments.full_output_ref,'hot_ref');assert(state.hot_page.content.text.includes('QA448_PATTERN_0_'),'hot_original_page');output=reply('QA448_DONE_T1');}
    else assert.fail('unexpected_long_model_request');
   }
  }
  state.requests.push({stage,input_sha256:sha(Buffer.from(JSON.stringify(body.input))),at_index:state.requests.length});
  return {type:'response.completed',response:{id:`resp_448_${state.requests.length}`,object:'response',created_at:1,status:'completed',model:body.model,output,usage:{input_tokens:20,output_tokens:7,total_tokens:27}}};
 }
 return {state,frameFor};
}
function controls(){const base={model:'gpt-6-sol',input:'QA448_QUALIFY',stream:true,max_output_tokens:128};assert(createFixture('/tmp/qa448').frameFor(base));return [['model_identity',b=>b.model='wrong'],['stream_required',b=>b.stream=false],['input_required',b=>delete b.input],['unknown_request_field',b=>b.extra=1],['output_budget',b=>b.max_output_tokens=0],['original_goal_missing',b=>b.input=[{role:'user',content:'unknown'}]]].map(([reason,mutate])=>{const b=structuredClone(base);mutate(b);let error;try{createFixture('/tmp/qa448').frameFor(b);}catch(e){error=e;}assert(error&&error.message.includes(reason),reason);return {reason,refused:true};});}
module.exports={KEY,GOAL,PROGRESS,pattern,createFixture,controls};
