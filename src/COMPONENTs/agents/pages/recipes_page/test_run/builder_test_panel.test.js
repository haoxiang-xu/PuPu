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

test('opening only reads; explicit send uses a dedicated session and exact saved token',async()=>{
  render(<BuilderTestPanel active session={session} isDark={false} onSave={jest.fn()} />);
  await waitFor(()=>expect(builderTestCommand).toHaveBeenCalledWith({op:'open',resource_id:'agent-demo',kind:'agent'}));
  expect(builderTestCommand.mock.calls.filter(([request])=>request.op==='start')).toHaveLength(0);
  fireEvent.change(screen.getByRole('textbox',{name:'Test message'}),{target:{value:'hello'}});
  builderTestCommand.mockResolvedValue(completed);
  fireEvent.click(screen.getByRole('button',{name:'Send test message'}));
  await screen.findByText('reply');
  expect(builderTestCommand).toHaveBeenLastCalledWith(expect.objectContaining({op:'start',session_id:'builder-test-demo',resource_id:'agent-demo',
    expected_edit_token:'edit-A',inputs:{message:'hello'}}));
});

test('save conflict preserves arguments and never starts the old draft',async()=>{
  const onSave=jest.fn().mockResolvedValue({...session,dirty:true,conflict:{code:'edit_conflict'}});
  render(<BuilderTestPanel active session={{...session,dirty:true}} isDark={false} onSave={onSave} />);
  await screen.findByRole('textbox',{name:'Test message'});
  fireEvent.change(screen.getByRole('textbox',{name:'Test message'}),{target:{value:'keep this'}});
  fireEvent.click(screen.getByRole('button',{name:'Save and test'}));
  await waitFor(()=>expect(onSave).toHaveBeenCalledTimes(1));
  expect(builderTestCommand.mock.calls.some(([request])=>request.op==='start')).toBe(false);
  expect(screen.getByRole('textbox',{name:'Test message'})).toHaveValue('keep this');
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
  fireEvent.change(screen.getByRole('textbox',{name:'Test message'}),{target:{value:'new draft'}});
  fireEvent.click(screen.getByRole('button',{name:'Save and test'}));
  await screen.findByText('reply');
  expect(builderTestCommand.mock.calls.filter(([request])=>request.op==='start')).toHaveLength(1);
});

test('an unconfirmed start is looked up, never automatically sent again',async()=>{
  render(<BuilderTestPanel active session={session} isDark={false}/>);
  await waitFor(()=>expect(builderTestCommand).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByRole('textbox',{name:'Test message'}),{target:{value:'send once'}});
  builderTestCommand.mockRejectedValueOnce(Object.assign(new Error('unconfirmed'),{code:'builder_test_unconfirmed'}));
  fireEvent.click(screen.getByRole('button',{name:'Send test message'}));
  await screen.findByRole('alert');
  expect(screen.getByRole('button',{name:'Send test message'})).toBeDisabled();
  builderTestCommand.mockResolvedValue(completed);
  fireEvent.click(screen.getByRole('button',{name:'Refresh'}));
  await screen.findByText('reply');
  expect(builderTestCommand.mock.calls.filter(([request])=>request.op==='start')).toHaveLength(1);
  expect(builderTestCommand).toHaveBeenLastCalledWith({op:'read',session_id:'builder-test-demo',resource_id:'agent-demo'});
});


test('the real v1 toolkit catalog name is submitted as the toolkit identity',async()=>{
  const catalog=jest.spyOn(api.unchain,'getToolkitCatalog').mockResolvedValue({toolkits:[{name:'core',tools:[]}],artifactKinds:[],count:1,source:'unchain'});
  try{
    render(<BuilderTestPanel active session={session} isDark={false}/>);
    await waitFor(()=>expect(builderTestCommand).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button',{name:'Tools and workspace'}));
    await act(async()=>{await Promise.resolve();});
    await waitFor(()=>expect(catalog).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(screen.getAllByRole('combobox')[1],{key:'ArrowDown'});
    await act(async()=>{await Promise.resolve();});
    fireEvent.keyDown(screen.getAllByRole('combobox')[1],{key:'ArrowDown'});
    fireEvent.keyDown(screen.getAllByRole('combobox')[1],{key:'Enter'});
    fireEvent.keyDown(screen.getAllByRole('combobox')[1],{key:'Escape'});
    fireEvent.change(screen.getByRole('textbox',{name:'Test message'}),{target:{value:'tool scope'}});
    builderTestCommand.mockResolvedValue(completed);
    fireEvent.click(screen.getByRole('button',{name:'Send test message'}));
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
    fireEvent.change(screen.getByRole('textbox',{name:'Test message'}),{target:{value:'poll me'}});
    fireEvent.click(screen.getByRole('button',{name:'Send test message'}));
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
  await waitFor(()=>expect(screen.getByRole('button',{name:'Run Workflow',exact:true})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'Run Workflow',exact:true}));
  await waitFor(()=>expect(builderTestCommand).toHaveBeenLastCalledWith(expect.objectContaining({op:'start',expected_edit_token:'edit-B',inputs:{fresh:7}})));
});

test('an invalid draft for a removed Workflow parameter cannot disable its replacement form',async()=>{
  builderTestCommand.mockResolvedValue(workflowOpened);
  const {rerender}=render(<BuilderTestPanel active session={workflowSession('old','integer')} isDark={false}/>);
  await waitFor(()=>expect(builderTestCommand).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByRole('textbox',{name:'old',exact:true}),{target:{value:'invalid'}});
  expect(screen.getByRole('button',{name:'Run Workflow',exact:true})).toBeDisabled();
  rerender(<BuilderTestPanel active session={{...workflowSession('fresh','integer'),edit_token:'edit-B'}} isDark={false}/>);
  fireEvent.change(screen.getByRole('textbox',{name:'fresh',exact:true}),{target:{value:'7'}});
  await waitFor(()=>expect(screen.getByRole('button',{name:'Run Workflow',exact:true})).toBeEnabled());
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
