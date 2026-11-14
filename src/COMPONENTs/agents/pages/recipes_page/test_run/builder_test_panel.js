import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../../../../../BUILTIN_COMPONENTs/mini_react/use_translation';
import Button from '../../../../../BUILTIN_COMPONENTs/input/button';
import TextField from '../../../../../BUILTIN_COMPONENTs/input/textfield';
import Select from '../detail_panel/panel_select';
import TraceChain from '../../../../chat-bubble/trace_chain';
import InteractWrapper from '../../../../chat-bubble/interact/interact_wrapper';
import { projectTestTrace } from './test_trace';
import { StreamingMessageStoreContext } from '../../../../chat-bubble/components/streaming_message_store_context';
import { api } from '../../../../../SERVICEs/api';
import { readWorkspaces } from '../../../../settings/runtime';
import WorkflowTestInputs from './workflow_test_inputs';
import useBuilderTest from './use_builder_test';
import { can_preflight, preflight_message } from '../skeleton_resource_session';

const buttonStyle={fontSize:12,paddingVertical:5,paddingHorizontal:9,borderRadius:7};
const textStyle={minWidth:0,width:'100%',fontSize:12,paddingVertical:7,paddingHorizontal:9};
const live=new Set(['starting','running','waiting']);

function TestTrace({run}){
  const projection=useMemo(()=>projectTestTrace(run),[run]);
  if(!projection.frames.length)return null;
  // Interactions have one authoritative controller immediately below the trace.
  // Historical approval frames must not present a second submission surface.
  return <div className="scrollable" style={{minWidth:0,maxWidth:'100%',overflowX:'auto'}}><TraceChain {...projection} messageId={run.id} compact showContainerHeader={false}
    bubbleOwnsFinalMessage bubbleOwnsLiveText={false} status={live.has(run.status)?'streaming':run.status==='failed'?'error':run.status==='cancelled'?'cancelled':'done'} /></div>;
}

export default function BuilderTestPanel({active,session,onSave,onCheck,onObserve,onDetails,onViewChatRun,isDark}){
  const {t}=useTranslation();
  const themedButton={...buttonStyle,color:isDark?'#d5d5d5':'#252525'};
  const controller=useBuilderTest({active,session,onSave});
  const {view,busy,error,uncertain,confirmed}=controller;
  const [message,setMessage]=useState('');
  const [values,setValues]=useState({});
  const [problems,setProblems]=useState([]);
  const [workspace,setWorkspace]=useState('');
  const [toolkits,setToolkits]=useState([]);
  const [catalog,setCatalog]=useState([]);
  const [optionsOpen,setOptionsOpen]=useState(false);
  const resource=session.resource_id||session.document?.id;
  const kind=session.document?.kind;
  const checked=useRef(null);
  useEffect(()=>{
    const version=`${resource}:${session.edit_token}`;
    if(!active||!onCheck||!can_preflight(session)||session.preflight||checked.current===version)return;
    checked.current=version;onCheck();
  },[active,onCheck,resource,session]);
  useEffect(()=>{setMessage('');setValues({});setProblems([]);setWorkspace('');setToolkits([]);},[resource]);
  useEffect(()=>{
    if(!active||!optionsOpen)return;
    let wanted=true;
    api.unchain.getToolkitCatalog?.().then(result=>{if(wanted)setCatalog(Array.isArray(result.toolkits)?result.toolkits:[]);}).catch(()=>{});
    return()=>{wanted=false;};
  },[active,optionsOpen]);
  const workspaces=active?readWorkspaces():[];
  const current=view?.session.resource_id===resource?view:null;
  const traceContext=useMemo(()=>({chatId:current?.session.id||'',store:null,notifyStreamingContentCommitted:null}),[current?.session.id]);
  const last=current?.runs.at(-1);
  const running=last&&live.has(last.status);
  const disabled=busy||running||uncertain||Boolean(error&&!confirmed)||session.saving||Boolean(session.conflict)||(kind==='workflow'&&problems.length>0);
  const start=async()=>{
    const result=await controller.start({values:kind==='agent'?{message}:values,toolkits,workspace_id:workspace});
    if(result&&kind==='agent')setMessage('');
  };
  if(!active)return null;
  return <StreamingMessageStoreContext.Provider value={traceContext}><div data-testid="skeleton-run-menu" style={{height:'100%',minHeight:0}}><div data-testid="builder-test-panel" style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0,color:isDark?'#e5e5e5':'#252525',fontSize:12}}>
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'12px 16px 9px',flexShrink:0}}>
      <strong style={{fontSize:14,flex:1}}>{t('agents.test_run.title')}</strong>
      {onDetails&&<Button ariaLabel={t('agents.run_view.back_to_editor')} prefix_icon="edit_pen" onClick={onDetails} style={themedButton}/>}
      <Button ariaLabel={t('agents.test_run.refresh')} prefix_icon="refresh" onClick={controller.refresh} disabled={busy||!session.edit_token} style={themedButton}/>
      <Button ariaLabel={t('agents.test_run.new')} prefix_icon="add" onClick={controller.newConversation} disabled={busy||running||!session.edit_token} style={themedButton}/>
    </div>
    <div style={{padding:'0 16px 10px',color:'var(--pupu-text-muted)',fontSize:11.5,overflowWrap:'anywhere'}}>{session.document?.name} · {kind==='agent'
      ? session.document.nodes.filter(node=>node.type==='agent').map(node=>node.config?.kernel?.profile?.model).filter(Boolean).join(', ')
      : t('agents.test_run.workflow')}</div>
    <div className="scrollable" style={{flex:1,minHeight:0,overflowY:'auto',overflowX:'hidden'}}>
      <div style={{padding:'0 16px 16px',display:'flex',flexDirection:'column',gap:14,minWidth:0}}>
        {error&&<div role="alert" style={{overflowWrap:'anywhere',color:isDark?'#fca5a5':'#b42318'}}>{error.code}: {error.message}</div>}
        {uncertain&&<p role="status">{t('agents.test_run.unconfirmed')}</p>}
        {!current?.runs.length&&<div style={{color:'var(--pupu-text-muted)',fontSize:12}}>{t('agents.test_run.idle')}</div>}
        {current?.runs.map(run=><section key={run.id} data-testid={`test-turn-${run.id}`} style={{display:'flex',flexDirection:'column',gap:8,minWidth:0}}>
          {kind==='agent'&&<div style={{padding:'8px 10px',borderRadius:12,background:isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.04)',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{run.inputs.message}</div>}
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <span role="status">{t(`agents.test_run.status.${run.status}`)}</span>
            {!!run.graphs.length&&onObserve&&<Button label={t('agents.test_run.view_run')} prefix_icon="eye_open" style={themedButton} onClick={()=>onObserve({
              owner_chat_id:current.session.id,execution_id:current.session.id,root_run_id:run.id,resource_id:resource})}/>}
          </div>
          <TestTrace run={run}/>
          {!run.trace_complete&&<div>{t('agents.test_run.trace_limit')}</div>}
          {run.pending&&<div data-testid="test-pending" style={{display:'flex',flexDirection:'column',gap:8,padding:10,borderRadius:10,border:'1px solid var(--pupu-border-subtle)'}}>
            <strong>{t(run.pending.kind==='human_input'?'agents.test_run.answer':'agents.test_run.approval')}</strong>
            {run.pending.kind!=='human_input'&&<details><summary>{run.pending.presentation.tool_call.tool_display_name||run.pending.payload.tool_name||t('agents.test_run.tools')}</summary>
              <pre style={{fontSize:11,whiteSpace:'pre-wrap',overflowWrap:'anywhere',margin:0}}>{JSON.stringify(run.pending.presentation.tool_call.arguments||{},null,2)}</pre></details>}
            {run.pending.status==='receipt_recorded'?<Button label={t('agents.test_run.resume')} onClick={()=>controller.resume(run)} disabled={busy||!confirmed} style={themedButton}/>:
              run.pending.kind==='human_input'?<InteractWrapper key={run.pending.interaction_id}
                type={run.pending.presentation.tool_call.interact_type} config={run.pending.presentation.tool_call.interact_config}
                onSubmit={answer=>controller.respond(run,true,answer)} isDark={isDark} disabled={busy||!confirmed} allowSessionApproval={false}/>:<div style={{display:'flex',gap:8}}>
                <Button label={t('agents.test_run.approve')} onClick={()=>controller.respond(run,true)} disabled={busy||!confirmed} style={themedButton}/>
                <Button label={t('agents.test_run.deny')} onClick={()=>controller.respond(run,false)} disabled={busy||!confirmed} style={themedButton}/>
              </div>}
          </div>}
          {run.error&&<div role="alert" style={{overflowWrap:'anywhere'}}>{run.error.code} · {run.error.path.join('.')}</div>}
          {run.output!==null&&(kind==='agent'?<div data-testid="test-agent-reply" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{typeof run.output.message==='string'?run.output.message:JSON.stringify(run.output,null,2)}</div>:
            <div><strong>{t('agents.test_run.output')}</strong><pre data-testid="test-workflow-output" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12}}>{JSON.stringify(run.output,null,2)}</pre></div>)}
        </section>)}
        {kind==='workflow'&&<WorkflowTestInputs document={session.document} value={values} onChange={setValues} onValidityChange={setProblems}
          isDark={isDark} disabled={busy} errors={error?[error]:[]}/>}
        <Button label={t('agents.test_run.context')} prefix_icon={optionsOpen?'arrow_up':'arrow_down'} onClick={()=>setOptionsOpen(value=>!value)} style={themedButton}/>
        {optionsOpen&&<div style={{display:'flex',flexDirection:'column',gap:8}}>
          <Select value={workspace} set_value={setWorkspace} options={[{value:'',label:t('agents.test_run.no_workspace')},...workspaces.map(row=>({value:row.id,label:row.name||row.path||row.id,description:row.path}))]}
            placeholder={t('agents.test_run.workspace')} disabled={busy||running} style={{width:'100%',fontSize:12}}/>
          <Select value={toolkits} set_value={setToolkits} multi options={catalog.map(row=>({value:row.name,label:row.name}))}
            placeholder={t('agents.test_run.tools')} disabled={busy||running} style={{width:'100%',fontSize:12}}/>
          <small style={{color:'var(--pupu-text-muted)'}}>{t('agents.test_run.real_tools')}</small>
        </div>}
        {onCheck&&<Button label={t('agents.save.check_can_run')} onClick={onCheck} disabled={busy||session.dirty||!session.edit_token} style={themedButton}/>}
        {preflight_message(session,t)&&<div data-testid="skeleton-preflight-state">{preflight_message(session,t)}</div>}
        {onViewChatRun&&<Button label={t('agents.run_menu.view_chat_run')} onClick={onViewChatRun} style={themedButton}/>}
      </div>
    </div>
    <div style={{padding:'10px 16px 14px',display:'flex',gap:8,alignItems:'flex-end',borderTop:'1px solid var(--pupu-border-subtle)',flexShrink:0}}>
      {kind==='agent'&&<TextField value={message} set_value={setMessage} max_display_rows={5} aria_label={t('agents.test_run.message')} disabled={busy}
        on_key_down={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent?.isComposing){event.preventDefault();if(!disabled&&message.trim())start();}}} style={textStyle}/>}
      {running?<Button label={t('agents.test_run.stop')} prefix_icon="stop" onClick={()=>controller.stop(last)} disabled={busy} style={themedButton}/>:
        <Button label={t(session.dirty||!session.edit_token?'agents.test_run.save_and_test':kind==='agent'?'agents.test_run.send':'agents.test_run.run')}
          prefix_icon="play" onClick={start} disabled={Boolean(disabled||(kind==='agent'&&!message.trim()))} style={themedButton}/>}
    </div>
  </div></div></StreamingMessageStoreContext.Provider>;
}
