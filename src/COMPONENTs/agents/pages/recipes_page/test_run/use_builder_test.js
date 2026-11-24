import { useCallback, useEffect, useRef, useState } from 'react';
import { builderTestCommand } from '../../../../../SERVICEs/builder_test_api';
import { readMemoryAgentSettings } from '../../../../../SERVICEs/memory_agent_settings';
import { approval_refused_for_good } from './test_status';

const terminal=new Set(['completed','failed','cancelled','outcome_unknown','ready']);
export default function useBuilderTest({active,session,onSave}){
  const resource=session.resource_id||session.document?.id;
  const kind=session.document?.kind;
  const saved=Boolean(session.edit_token);
  const [view,setView]=useState(null);
  const [error,setError]=useState(null);
  const [busy,setBusy]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [uncertain,setUncertain]=useState(false);
  const [readFailures,setReadFailures]=useState(0);
  const generation=useRef(0);
  const current=useRef({view,session,active});current.current={view,session,active};
  const pending=useRef(false);
  const readRevision=useRef(0);
  const wasSaved=useRef(saved);
  const previousResource=useRef(resource);
  const refusedApproval=useRef(null);
  const adopt=useCallback((value,ticket)=>{
    if(ticket!==generation.current)return null;
    const refused=refusedApproval.current;
    const stillPending=refused&&value.session.id===refused.session_id&&value.runs.some(run=>
      run.id===refused.run_id&&run.pending?.interaction_id===refused.interaction_id);
    if(!stillPending)refusedApproval.current=null;
    setView(value);setConfirmed(true);setUncertain(false);setError(stillPending?refused.problem:null);setReadFailures(0);
    current.current.view=value;
    return value;
  },[]);
  const read=useCallback(async()=>{
    if(pending.current)return current.current.view;
    const ticket=generation.current;
    const revision=++readRevision.current;
    const held=current.current.view;
    const request=held?.session.resource_id===resource
      ? {op:'read',resource_id:resource,session_id:held.session.id}:{op:'open',resource_id:resource,kind};
    try{const value=await builderTestCommand(request);return revision===readRevision.current?adopt(value,ticket):null;}
    catch(problem){if(ticket===generation.current&&revision===readRevision.current){setError(refusedApproval.current?.problem||problem);setConfirmed(false);setReadFailures(count=>count+1);}return null;}
  },[adopt,resource,kind]);
  useEffect(()=>{
    const ticket=++generation.current;
    setBusy(false);pending.current=false;
    if(previousResource.current!==resource){
      refusedApproval.current=null;
      previousResource.current=resource;setView(null);current.current.view=null;setError(null);setUncertain(false);setBusy(false);pending.current=false;
    }
    if(!active||!saved||!resource)return;
    read();
    // This ref is a live generation counter, not a captured DOM node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return()=>{if(ticket===generation.current)++generation.current;};
  // Saving a new draft does not create a new view generation. The explicit
  // Save and test operation still owns its continuation after that save.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[active,resource,read]);
  useEffect(()=>{
    const firstSave=!wasSaved.current&&saved;
    wasSaved.current=saved;
    if(firstSave&&active&&!pending.current)read();
  },[saved,active,read]);

  const command=useCallback(async(action)=>{
    if(pending.current)return null;
    const ticket=generation.current;
    ++readRevision.current;
    pending.current=true;setBusy(true);setError(null);
    try{return await action(ticket);}
    catch(problem){
      if(ticket===generation.current){setError(problem);if(problem.code==='builder_test_unconfirmed'||(problem.status==null&&
        !['test_save_required','provider_missing_api_key','invalid_workspace_root','builder_test_command_refused'].includes(problem.code))||problem.status>=500){setUncertain(true);setConfirmed(false);}}
      return null;
    }finally{if(ticket===generation.current){pending.current=false;setBusy(false);}}
  },[]);
  const start=useCallback(inputs=>command(async ticket=>{
    let target=current.current.session;
    if(target.dirty||!target.edit_token){target=await onSave();}
    if(ticket!==generation.current||!current.current.active)return null;
    if(!target||target.dirty||target.conflict||target.saving||!target.edit_token||target.document?.id!==resource){
      throw Object.assign(new Error('Save the graph and resolve its conflict before testing.'),{code:'test_save_required'});
    }
    let held=current.current.view;
    if(!held||held.session.resource_id!==resource){
      held=await builderTestCommand({op:'open',resource_id:resource,kind});
      if(!adopt(held,ticket))return null;
    }
    const request={op:'start',session_id:held.session.id,resource_id:resource,expected_edit_token:target.edit_token,
      request_id:`builder-request-${window.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
      inputs:inputs.values,toolkits:inputs.toolkits,workspace_id:inputs.workspace_id};
    // The model picked in the composer, for Agent nodes the author left with
    // no model. Only its identity is sent; the runtime builds its profile.
    if(kind==='agent'&&typeof inputs.fallback_model==='string'&&inputs.fallback_model)request.fallback_model=inputs.fallback_model;
    if(kind==='agent'){
      // Blank in the chat composer means use Settings; the Workflow's
      // explicit No workspace choice remains disabled unless it opts in.
      if(!request.workspace_id)request.use_default_workspace=true;
      const settings=readMemoryAgentSettings();
      request.memory_agent_config={displayName:settings.displayName,additionalInstructions:settings.additionalInstructions,
        provider:settings.provider,modelId:settings.modelId};
    }
    const value=adopt(await builderTestCommand(request),ticket);
    return value;
  }),[command,onSave,resource,kind,adopt]);
  const control=useCallback((op,run,extra={})=>command(async ticket=>{
    const held=current.current.view;
    if(!held||held.session.resource_id!==resource||!held.runs.some(row=>row.id===run.id))return null;
    try{
      return adopt(await builderTestCommand({op,resource_id:resource,session_id:held.session.id,run_id:run.id,...extra}),ticket);
    }catch(problem){
      if(ticket===generation.current&&['respond','resume'].includes(op)&&approval_refused_for_good(problem)){
        refusedApproval.current={session_id:held.session.id,run_id:run.id,interaction_id:run.pending?.interaction_id,problem};
      }
      throw problem;
    }
  }),[command,resource,adopt]);
  const newConversation=useCallback(()=>command(async ticket=>adopt(await builderTestCommand({op:'new',resource_id:resource,kind}),ticket)),[command,resource,kind,adopt]);
  // A start can become active after the opening read has already reached idle.
  // Polling follows the admitted run; it never submits or resumes it.
  const latest=view?.runs.at(-1);
  useEffect(()=>{
    if(!active||!latest||terminal.has(latest.status))return;
    const timer=setTimeout(read,Math.min(700*2**Math.min(readFailures,3),5000));
    return()=>clearTimeout(timer);
  },[active,latest,read,readFailures]);
  // The author changed what the refused request would carry (another model):
  // its refusal no longer describes anything on screen.
  const dismiss=useCallback(()=>{if(!pending.current)setError(null);},[]);
  return {view,error,busy,confirmed,uncertain,start,refresh:read,newConversation,dismiss,
    stop:run=>control('cancel',run),
    respond:(run,approved,answer=null)=>control('respond',run,{interaction_id:run.pending.interaction_id,approved,answer}),
    resume:run=>control('resume',run,{interaction_id:run.pending.interaction_id})};
}
