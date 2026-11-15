import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import BuilderTestPanel from './builder_test_panel';
import {api} from '../../../../../SERVICEs/api';
import { builderTestCommand } from '../../../../../SERVICEs/builder_test_api';
jest.mock('../../../../../SERVICEs/builder_test_api',()=>({builderTestCommand:jest.fn()}));

const document={schema_version:1,id:'agent-demo',kind:'agent',name:'Demo',nodes:[],edges:[]};
const session={document,resource_id:'agent-demo',edit_token:'edit-A',open_id:1,dirty:false,status:'ready',saving:false};
const opened={schema:'pupu.builder-test.v1',session:{id:'builder-test-demo',resource_id:'agent-demo',kind:'agent'},runs:[]};
const completed={...opened,runs:[{id:'builder-run-one',request_id:'req-1',edit_token:'edit-A',definition_digest:'a'.repeat(64),
  inputs:{message:'hello'},status:'completed',output:{message:'reply'},error:null,pending:null,graphs:[],events:[],trace_complete:true}]};
beforeEach(()=>{builderTestCommand.mockReset();builderTestCommand.mockResolvedValue(opened);});
/* The Agent composer is the chat's own: its text box is named by its
   placeholder, and Enter sends. */
const composer=()=>screen.getByRole('textbox',{name:/^Message this Agent…/});
const send=()=>fireEvent.keyDown(composer(),{key:'Enter'});

test('opening only reads; explicit send uses a dedicated session and exact saved token',async()=>{
  render(<BuilderTestPanel active session={session} isDark={false} onSave={jest.fn()} />);
  await waitFor(()=>expect(builderTestCommand).toHaveBeenCalledWith({op:'open',resource_id:'agent-demo',kind:'agent'}));
  expect(builderTestCommand.mock.calls.filter(([request])=>request.op==='start')).toHaveLength(0);
  fireEvent.change(composer(),{target:{value:'hello'}});
  builderTestCommand.mockResolvedValue(completed);
  send();
  await screen.findByText('reply');
  expect(builderTestCommand).toHaveBeenLastCalledWith(expect.objectContaining({op:'start',session_id:'builder-test-demo',resource_id:'agent-demo',
    expected_edit_token:'edit-A',inputs:{message:'hello'}}));
});

test('save conflict preserves arguments and never starts the old draft',async()=>{
  const onSave=jest.fn().mockResolvedValue({...session,dirty:true,conflict:{code:'edit_conflict'}});
  render(<BuilderTestPanel active session={{...session,dirty:true}} isDark={false} onSave={onSave} />);
  await screen.findByRole('textbox',{name:/^Message this Agent…/});
  fireEvent.change(composer(),{target:{value:'keep this'}});
  send();
  await waitFor(()=>expect(onSave).toHaveBeenCalledTimes(1));
  expect(builderTestCommand.mock.calls.some(([request])=>request.op==='start')).toBe(false);
  expect(composer()).toHaveValue('keep this');
});

test('closing detaches without Stop and reopens the same completed session',async()=>{
  builderTestCommand.mockResolvedValue(completed);
  const {rerender}=render(<BuilderTestPanel active session={session} isDark={false} />);
  await screen.findByText('reply');
  rerender(<BuilderTestPanel active={false} session={session} isDark={false} />);
  rerender(<BuilderTestPanel active session={session} isDark={false} />);
  expect(builderTestCommand.mock.calls.some(([request])=>['start','cancel','respond'].includes(request.op))).toBe(false);
  expect(screen.getByText('reply')).toBeInTheDocument();
});

test('late open replies cannot populate another resource',async()=>{
  let resolve;
  builderTestCommand.mockImplementationOnce(()=>new Promise(done=>{resolve=done;})).mockResolvedValue({...opened,session:{...opened.session,resource_id:'other'}});
  const {rerender}=render(<BuilderTestPanel active session={session} isDark={false} />);
  rerender(<BuilderTestPanel active session={{...session,resource_id:'other',open_id:2,document:{...document,id:'other'}}} isDark={false} />);
  await act(async()=>resolve(completed));
  expect(screen.queryByText('reply')).not.toBeInTheDocument();
});

test('saving a new draft continues the same explicit test action after the save rerender',async()=>{
  builderTestCommand.mockImplementation(async request=>request.op==='start'?completed:opened);
  function NewDraft(){
    const [editor,setEditor]=React.useState({...session,resource_id:null,edit_token:null,dirty:true});
    const save=async()=>{setEditor(session);await Promise.resolve();return session;};
    return <BuilderTestPanel active session={editor} isDark={false} onSave={save}/>;
  }
  render(<NewDraft/>);
  fireEvent.change(composer(),{target:{value:'new draft'}});
  send();
  await screen.findByText('reply');
  expect(builderTestCommand.mock.calls.filter(([request])=>request.op==='start')).toHaveLength(1);
});

test('an unconfirmed start is looked up, never automatically sent again',async()=>{
  render(<BuilderTestPanel active session={session} isDark={false}/>);
  await waitFor(()=>expect(builderTestCommand).toHaveBeenCalledTimes(1));
  fireEvent.change(composer(),{target:{value:'send once'}});
  builderTestCommand.mockRejectedValueOnce(Object.assign(new Error('unconfirmed'),{code:'builder_test_unconfirmed'}));
  send();
  await screen.findByRole('alert');
  send();
  expect(builderTestCommand.mock.calls.filter(([request])=>request.op==='start')).toHaveLength(1);
  builderTestCommand.mockResolvedValue(completed);
  fireEvent.click(screen.getByRole('button',{name:'Refresh'}));
  await screen.findByText('reply');
  expect(builderTestCommand.mock.calls.filter(([request])=>request.op==='start')).toHaveLength(1);
  expect(builderTestCommand).toHaveBeenLastCalledWith({op:'read',session_id:'builder-test-demo',resource_id:'agent-demo'});
});


test('the real v1 toolkit catalog name is submitted as the toolkit identity',async()=>{
  const catalog=jest.spyOn(api.unchain,'getToolkitCatalog').mockResolvedValue({toolkits:[{name:'core',tools:[]}],artifactKinds:[],count:1,source:'unchain'});
  try{
    builderTestCommand.mockResolvedValue(workflowOpened);
    render(<BuilderTestPanel active session={workflowSession()} isDark={false}/>);
    await waitFor(()=>expect(builderTestCommand).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button',{name:'Run settings'}));
    await act(async()=>{await Promise.resolve();});
    await waitFor(()=>expect(catalog).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(screen.getAllByRole('combobox')[1],{key:'ArrowDown'});
    await act(async()=>{await Promise.resolve();});
    fireEvent.keyDown(screen.getAllByRole('combobox')[1],{key:'ArrowDown'});
    fireEvent.keyDown(screen.getAllByRole('combobox')[1],{key:'Enter'});
    fireEvent.keyDown(screen.getAllByRole('combobox')[1],{key:'Escape'});
    fireEvent.change(screen.getByRole('textbox',{name:'old',exact:true}),{target:{value:'tool scope'}});
    builderTestCommand.mockResolvedValue(workflowOpened);
    fireEvent.click(screen.getByRole('button',{name:'Run',exact:true}));
    await waitFor(()=>expect(builderTestCommand).toHaveBeenLastCalledWith(expect.objectContaining({op:'start',toolkits:['core']})));
  }finally{catalog.mockRestore();}
});


test('a transient status-read failure keeps read-only polling without resending',async()=>{
  jest.useFakeTimers();
  try{
    const waiting={...completed,runs:completed.runs.map(run=>({...run,status:'waiting',output:null}))};
    builderTestCommand.mockResolvedValueOnce(opened).mockResolvedValueOnce(waiting)
      .mockRejectedValueOnce(Object.assign(new Error('temporary read race'),{code:'skeleton_interaction_invalid',status:409}))
      .mockResolvedValue(completed);
    render(<BuilderTestPanel active session={session} isDark={false}/>);
    await act(async()=>{await Promise.resolve();});
    fireEvent.change(composer(),{target:{value:'poll me'}});
    send();
    await act(async()=>{await Promise.resolve();});
    await act(async()=>{jest.advanceTimersByTime(700);});
    expect(screen.getByRole('alert')).toHaveTextContent('temporary read race');
    await act(async()=>{jest.advanceTimersByTime(1500);});
    expect(screen.getByText('reply')).toBeInTheDocument();
    expect(builderTestCommand.mock.calls.filter(([request])=>request.op==='start')).toHaveLength(1);
  }finally{jest.useRealTimers();}
});

const workflowSession=(name='old',type='string')=>({...session,resource_id:'workflow-demo',document:{...document,id:'workflow-demo',kind:'workflow',
  input_schema:{type:'object',properties:{[name]:{type}},required:[name],additionalProperties:false}}});
const workflowOpened={...opened,session:{...opened.session,resource_id:'workflow-demo',kind:'workflow'}};

test('changed Workflow parameters discard obsolete argument values before the next explicit test',async()=>{
  builderTestCommand.mockResolvedValue(workflowOpened);
  const before=workflowSession();
  const {rerender}=render(<BuilderTestPanel active session={before} isDark={false}/>);
  await waitFor(()=>expect(builderTestCommand).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByRole('textbox',{name:'old',exact:true}),{target:{value:'obsolete'}});
  rerender(<BuilderTestPanel active session={{...workflowSession('fresh','integer'),edit_token:'edit-B'}} isDark={false}/>);
  fireEvent.change(screen.getByRole('textbox',{name:'fresh',exact:true}),{target:{value:'7'}});
  await waitFor(()=>expect(screen.getByRole('button',{name:'Run',exact:true})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'Run',exact:true}));
  await waitFor(()=>expect(builderTestCommand).toHaveBeenLastCalledWith(expect.objectContaining({op:'start',expected_edit_token:'edit-B',inputs:{fresh:7}})));
});

test('an invalid draft for a removed Workflow parameter cannot disable its replacement form',async()=>{
  builderTestCommand.mockResolvedValue(workflowOpened);
  const {rerender}=render(<BuilderTestPanel active session={workflowSession('old','integer')} isDark={false}/>);
  await waitFor(()=>expect(builderTestCommand).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByRole('textbox',{name:'old',exact:true}),{target:{value:'invalid'}});
  expect(screen.getByRole('button',{name:'Run',exact:true})).toBeDisabled();
  rerender(<BuilderTestPanel active session={{...workflowSession('fresh','integer'),edit_token:'edit-B'}} isDark={false}/>);
  fireEvent.change(screen.getByRole('textbox',{name:'fresh',exact:true}),{target:{value:'7'}});
  await waitFor(()=>expect(screen.getByRole('button',{name:'Run',exact:true})).toBeEnabled());
  expect(builderTestCommand.mock.calls.some(([request])=>request.op==='start')).toBe(false);
});

test('non-parameter graph edits preserve typed test arguments and do not dispatch',async()=>{
  builderTestCommand.mockResolvedValue(workflowOpened);
  const before=workflowSession();
  const {rerender}=render(<BuilderTestPanel active session={before} isDark={false}/>);
  await waitFor(()=>expect(builderTestCommand).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByRole('textbox',{name:'old',exact:true}),{target:{value:'keep this'}});
  rerender(<BuilderTestPanel active session={{...before,edit_token:'edit-B',document:{...before.document,name:'Changed Code'}}} isDark={false}/>);
  expect(screen.getByRole('textbox',{name:'old',exact:true})).toHaveValue('keep this');
  expect(builderTestCommand.mock.calls.some(([request])=>['start','respond','resume','cancel'].includes(request.op))).toBe(false);
});

test('reordered signature keys preserve test arguments across a save response',async()=>{
  builderTestCommand.mockResolvedValue(workflowOpened);
  const before=workflowSession();
  const {rerender}=render(<BuilderTestPanel active session={before} isDark={false}/>);
  await waitFor(()=>expect(builderTestCommand).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByRole('textbox',{name:'old',exact:true}),{target:{value:'keep this'}});
  rerender(<BuilderTestPanel active session={{...before,edit_token:'edit-B',document:{...before.document,input_schema:{additionalProperties:false,required:['old'],properties:{old:{type:'string'}},type:'object'}}}} isDark={false}/>);
  expect(screen.getByRole('textbox',{name:'old',exact:true})).toHaveValue('keep this');
});

test('a changed parameter interface leaves the admitted waiting run attached and sends no actor command',async()=>{
  const waiting={...workflowOpened,runs:[{...completed.runs[0],id:'builder-run-A',status:'waiting',inputs:{old:'frozen A'},output:null}]};
  builderTestCommand.mockResolvedValue(waiting);
  const {rerender}=render(<BuilderTestPanel active session={workflowSession()} isDark={false}/>);
  await screen.findByText('Waiting',{exact:true});
  rerender(<BuilderTestPanel active session={{...workflowSession('fresh','integer'),edit_token:'edit-B'}} isDark={false}/>);
  fireEvent.change(screen.getByRole('textbox',{name:'fresh',exact:true}),{target:{value:'7'}});
  expect(screen.getByTestId('test-turn-builder-run-A')).toHaveTextContent('Waiting');
  expect(waiting.runs[0].inputs).toEqual({old:'frozen A'});
  expect(builderTestCommand.mock.calls.some(([request])=>['start','respond','resume','cancel','new'].includes(request.op))).toBe(false);
});

test('a Workflow result is its End outputs as a Name / Value table, and a failure names the node it happened at',async()=>{
  const doc={...workflowSession().document,nodes:[{id:'start',type:'start',config:{execution:{outputs:[]}}},{id:'code',type:'code',label:'Summarize',config:{execution:{inputs:[],outputs:[]}}}]};
  const runs=[{...completed.runs[0],id:'builder-run-ok',inputs:{old:'x'},output:{summary:'short text',count:3}},
    {...completed.runs[0],id:'builder-run-bad',inputs:{old:'y'},status:'failed',output:null,error:{code:'code_failed',path:['document','nodes',1],message:'division by zero'}}];
  builderTestCommand.mockResolvedValue({...workflowOpened,runs});
  const onFix=jest.fn();
  render(<BuilderTestPanel active session={{...workflowSession(),document:doc}} isDark={false} onFix={onFix}/>);
  const failure=await screen.findByTestId('test-run-error');
  expect(failure).toHaveTextContent('Failed at “Summarize”');
  expect(failure).toHaveTextContent('division by zero');
  fireEvent.click(screen.getByRole('button',{name:'Go to node'}));
  expect(onFix).toHaveBeenCalledWith('code');
  /* The earlier, successful run is folded under the latest one. */
  fireEvent.click(screen.getByRole('button',{name:'Earlier runs'}));
  expect(screen.getByTestId('test-workflow-output-summary')).toHaveTextContent('short text');
  expect(screen.getByTestId('test-workflow-output-count')).toHaveTextContent('3');
});

const noModel={...document,nodes:[{id:'start',type:'start',config:{execution:{outputs:[]}}},
  {id:'agent',type:'agent',config:{execution:{inputs:[],outputs:[]},kernel_draft:{model:null,prompt:'p',max_iterations:null}}}]};
const noModelRefusal={ok:false,error:{code:'invalid_shape',path:['document','nodes',1,'config'],message:'Agent node requires execution and kernel configuration'}};

test('an Agent with no model waits for one to be picked in the composer, and sends nothing until then',async()=>{
  const models=jest.spyOn(api.unchain,'getModelCatalog').mockResolvedValue({activeModel:null,providers:{},modelCapabilities:{}});
  try{
    render(<BuilderTestPanel active isDark={false} session={{...session,document:noModel,preflight:noModelRefusal}}/>);
    expect(await screen.findByTestId('skeleton-preflight-state')).toHaveTextContent('“Agent” has no model of its own. Pick one below to test it.');
    fireEvent.change(composer(),{target:{value:'hello'}});
    send();
    expect(builderTestCommand.mock.calls.some(([request])=>request.op==='start')).toBe(false);
  }finally{models.mockRestore();}
});

test('an Agent with no model runs with the composer model, which is sent as its identity only',async()=>{
  const models=jest.spyOn(api.unchain,'getModelCatalog').mockResolvedValue({activeModel:'openai:gpt-test',providers:{openai:['gpt-test']},modelCapabilities:{}});
  try{
    render(<BuilderTestPanel active isDark={false} session={{...session,document:noModel,preflight:noModelRefusal}}/>);
    await waitFor(()=>expect(screen.getByTestId('skeleton-preflight-state')).toHaveTextContent('“Agent” has no model of its own, so this test uses the model picked below.'));
    fireEvent.change(composer(),{target:{value:'hello'}});
    builderTestCommand.mockResolvedValue(completed);
    send();
    await waitFor(()=>expect(builderTestCommand).toHaveBeenLastCalledWith(expect.objectContaining({op:'start',fallback_model:'openai:gpt-test',inputs:{message:'hello'}})));
  }finally{models.mockRestore();}
});

test('an Agent with its own model never sends the composer model',async()=>{
  const models=jest.spyOn(api.unchain,'getModelCatalog').mockResolvedValue({activeModel:'openai:gpt-test',providers:{openai:['gpt-test']},modelCapabilities:{}});
  const configured={...noModel,nodes:[noModel.nodes[0],{...noModel.nodes[1],config:{execution:{inputs:[],outputs:[]},
    kernel:{profile:{id:'anthropic:claude-test',provider:'anthropic',model:'claude-test'}}}}]};
  try{
    render(<BuilderTestPanel active isDark={false} session={{...session,document:configured,preflight:{ok:true}}}/>);
    await act(async()=>{await Promise.resolve();});
    fireEvent.change(composer(),{target:{value:'hello'}});
    builderTestCommand.mockResolvedValue(completed);
    send();
    await waitFor(()=>expect(builderTestCommand.mock.calls.some(([request])=>request.op==='start')).toBe(true));
    expect(builderTestCommand.mock.calls.find(([request])=>request.op==='start')[0]).not.toHaveProperty('fallback_model');
  }finally{models.mockRestore();}
});

test('any other refused check says which node to fix, blocks Run, and Go to node opens that node',async()=>{
  const onFix=jest.fn();
  const doc={...workflowSession().document,nodes:[{id:'start',type:'start',config:{execution:{outputs:[]}}},
    {id:'switch',type:'switch_case',label:'Route',config:{execution:{cases:[],inputs:[]}}}]};
  builderTestCommand.mockResolvedValue(workflowOpened);
  render(<BuilderTestPanel active isDark={false} onFix={onFix} session={{...workflowSession(),document:doc,preflight:{ok:false,
    error:{code:'invalid_shape',path:['document','nodes',1,'config','execution'],message:'execution config fields are invalid'}}}}/>);
  expect(await screen.findByTestId('skeleton-preflight-state')).toHaveTextContent('Can’t run yet: “Route” has no value to switch on.');
  fireEvent.change(screen.getByRole('textbox',{name:'old',exact:true}),{target:{value:'x'}});
  expect(screen.getByRole('button',{name:'Run',exact:true})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Go to node'}));
  expect(onFix).toHaveBeenCalledWith('switch');
});
