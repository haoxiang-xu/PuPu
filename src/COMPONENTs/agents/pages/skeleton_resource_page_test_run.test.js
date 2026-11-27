import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {ConfigContext} from '../../../CONTAINERs/config/context';
import SkeletonResourcePage from './skeleton_resource_page';
import {api} from '../../../SERVICEs/api';
import {install_legacy_store_bridge} from './recipes_page/legacy_store_test_bridge';
import {RESOURCE_RESULT_KEYS} from './recipes_page/skeleton_resource_capture';
import {builderTestCommand} from '../../../SERVICEs/builder_test_api';
jest.mock('../../../SERVICEs/api',()=>({api:{unchain:{}}}));
jest.mock('../../../SERVICEs/builder_test_api',()=>({builderTestCommand:jest.fn()}));
install_legacy_store_bridge(api.unchain);
jest.mock('../../../BUILTIN_COMPONENTs/flow_editor',()=>({FlowEditor:props=><div>{props.nodes.map(node=><button key={node.id} onClick={()=>props.on_select?.(node.id)}>{props.render_node(node)}</button>)}</div>}));
const document={schema_version:1,kind:'workflow',id:'test-wf',name:'Workflow test',input_schema:{type:'object',properties:{city:{type:'string'}},required:['city'],additionalProperties:false},
  nodes:[{id:'start',type:'start',config:{execution:{outputs:[]}}},{id:'end',type:'end',config:{execution:{inputs:[],outputs:[]}}}],
  edges:[{id:'e',kind:'flow',source_node_id:'start',source_port_id:'out',target_node_id:'end',target_port_id:'in'}]};
const resource={...Object.fromEntries(RESOURCE_RESULT_KEYS.map(key=>[key,key==='diagnostics'?[]:null])),id:'test-wf',kind:'workflow',document,name:'Workflow test',edit_token:'edit-1'};

test('Run opens Test in the existing right detail shell, without execution or saving',async()=>{
  api.unchain.getSkeletonResource=jest.fn().mockResolvedValue(resource);
  builderTestCommand.mockResolvedValue({schema:'pupu.builder-test.v1',session:{id:'builder-test-wf',resource_id:'test-wf',kind:'workflow'},runs:[]});
  render(<ConfigContext.Provider value={{theme:{},onThemeMode:'light_mode'}}><SkeletonResourcePage resourceId="test-wf"/></ConfigContext.Provider>);
  await screen.findByTestId('skeleton-node-start');
  fireEvent.click(screen.getByTestId('skeleton-control-center-run'));
  const panel=await screen.findByTestId('builder-test-panel');
  expect(screen.getByTestId('skeleton-detail-panel-shell')).toContainElement(panel);
  await waitFor(()=>expect(builderTestCommand).toHaveBeenCalledWith({op:'open',resource_id:'test-wf',kind:'workflow'}));
  expect(builderTestCommand.mock.calls.some(([request])=>request.op==='start')).toBe(false);
  expect(screen.getByRole('textbox',{name:'city'})).toBeInTheDocument();
});

test('picking a node shows that node, and Run brings the same Test panel back with what was typed',async()=>{
  api.unchain.getSkeletonResource=jest.fn().mockResolvedValue(resource);
  builderTestCommand.mockResolvedValue({schema:'pupu.builder-test.v1',session:{id:'builder-test-wf',resource_id:'test-wf',kind:'workflow'},runs:[]});
  render(<ConfigContext.Provider value={{theme:{},onThemeMode:'light_mode'}}><SkeletonResourcePage resourceId="test-wf"/></ConfigContext.Provider>);
  await screen.findByTestId('skeleton-node-start');
  fireEvent.click(screen.getByTestId('skeleton-control-center-run'));
  fireEvent.change(await screen.findByRole('textbox',{name:'city'}),{target:{value:'Paris'}});
  fireEvent.click(screen.getByTestId('skeleton-node-end'));
  expect(screen.queryByTestId('builder-test-panel')).toBeNull();
  expect(screen.getByTestId('recipe-detail-panel-header')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('skeleton-control-center-run'));
  expect(await screen.findByRole('textbox',{name:'city'})).toHaveValue('Paris');
});
