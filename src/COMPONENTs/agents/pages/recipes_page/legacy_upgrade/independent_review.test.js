import React from 'react';
import fs from 'fs';
import probe from '../../../../../SERVICEs/legacy_upgrade_ui_cases.json';
import {render,screen,fireEvent,waitFor,within,cleanup} from '@testing-library/react';
import {ConfigContext} from '../../../../../CONTAINERs/config/context';
import {api} from '../../../../../SERVICEs/api';
import fixture from '../../../../../SERVICEs/legacy_upgrade_producer.json';
import {install_legacy_store_bridge} from '../legacy_store_test_bridge';
import {createLegacyUpgradeController,PHASES} from './legacy_upgrade_controller';
import {kernel_is_configured} from '../kernel_config';
import {pressCanvasNode} from '../skeleton_canvas_test_helpers';
import LegacyUpgradeWizard from './legacy_upgrade_wizard';
import SkeletonResourcePage from '../../skeleton_resource_page';

jest.mock('../../../../../SERVICEs/api',()=>({api:{unchain:{}}}));
jest.mock("../../../../../SERVICEs/provider_secret_status", () => ({
  providerSecretConfigured: (provider) => provider === "openai",
}));
install_legacy_store_bridge(api.unchain);
jest.mock('../../../../../BUILTIN_COMPONENTs/modal/modal',()=>({__esModule:true,default:({open,children})=>open?<div role="dialog">{children}</div>:null}));
jest.mock('../../../../../BUILTIN_COMPONENTs/select/select',()=>({__esModule:true,default:({options=[],value,set_value,placeholder,disabled})=><select data-testid="select" data-placeholder={placeholder||''} value={value==null?'':String(value)} disabled={disabled} onChange={event=>set_value(event.target.value)}><option value="">{placeholder||''}</option>{options.flatMap(option=>option.options||[option]).map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>}));
jest.mock('../../../../../BUILTIN_COMPONENTs/input/input',()=>{const Input=({value,set_value,placeholder})=><input placeholder={placeholder} value={value} onChange={event=>set_value(event.target.value)}/>;return {__esModule:true,default:Input,Input};});
jest.mock('../../../../../BUILTIN_COMPONENTs/input/textfield',()=>({__esModule:true,default:({value,set_value,placeholder})=><textarea placeholder={placeholder} value={value} onChange={event=>set_value(event.target.value)}/>}));

const observed={};
const payload=value=>({response:{projection_digest:value.projection_digest},payload:value});
function services(row,overrides={}){return {capabilities:async()=>fixture.capabilities,inspect:async()=>payload(row.inventory),preview:jest.fn(async()=>payload(row.preview)),apply:jest.fn(async()=>payload(row.saved)),read:async()=>({ok:true,data:row.resource}),configured:kernel_is_configured,...overrides};}
function answer(controller,row){for(const slot of controller.current().slots){if(slot.kind==='kernel'){const choice=row.choices.kernels.find(c=>JSON.stringify(c.path)===JSON.stringify(slot.address));controller.answer(slot.key,choice);}else if(slot.kind==='acknowledge'){controller.answer(slot.key,{acknowledged:true});}}}
const cfg={theme:{},onThemeMode:'light_mode'};
beforeEach(()=>{
 for(const key of Object.keys(api.unchain))delete api.unchain[key];
 api.unchain.listSkeletonKernelProfiles=jest.fn(async()=>({profiles:[fixture.cases.flat.request.choices.kernels[0].kernel.profile],unavailable:[]}));
 api.unchain.listToolModalCatalog=jest.fn(async()=>({toolkits:[{toolkitId:'core',toolkitName:'Core',tools:[{name:'read'},{name:'write'}]}]}));
});
afterEach(cleanup);
afterAll(()=>{if(process.env.PUPU_UPGRADE_UI_OBSERVATIONS)fs.writeFileSync(process.env.PUPU_UPGRADE_UI_OBSERVATIONS,JSON.stringify(observed,null,2)+'\n');});

test('native_draft with no decisions can still reach explicit preview/apply',async()=>{
 const row=probe.native_ready;const svc=services(row);const c=createLegacyUpgradeController(svc);
 await c.open(row.resource);await c.preview();
 observed.native={phase:c.current().phase,previewCalls:svc.preview.mock.calls.length,hostAccepted:row.preview.document.id===row.resource.id};
 expect(svc.preview).toHaveBeenCalledTimes(1);
 expect(c.current().phase).toBe(PHASES.PREVIEWED);
 await c.apply();expect(svc.apply).toHaveBeenCalledTimes(1);
});
test('unused acknowledgement after replacing prompt can be removed and previewed without being required again',async()=>{
 const row=probe.unused_ack;
 const svc=services(row,{preview:jest.fn().mockRejectedValueOnce(Object.assign(new Error(row.refusal.message),row.refusal)).mockResolvedValue(payload(row.preview_without_ack))});
 const c=createLegacyUpgradeController(svc);await c.open(row.resource);answer(c,row);await c.preview();
 observed.unused={phase:c.current().phase,missing:c.choices().missing,answers:c.current().answers,slots:c.current().slots};
 expect(c.choices().ok).toBe(true);
 await c.preview();expect(svc.preview).toHaveBeenCalledTimes(2);
 expect(svc.preview.mock.calls[1][0].choices).toEqual(row.choices_without_ack);
});
test('untouched listed-absent tool name survives toggling one installed tool',async()=>{
 const row=probe.unknown_tool;const svc=services(row);const onClose=jest.fn();
 render(<ConfigContext.Provider value={cfg}><LegacyUpgradeWizard open resource={row.resource} services={svc} onClose={onClose} onUpgraded={jest.fn()} isDark={false}/></ConfigContext.Provider>);
 const kernelSlot=await screen.findByTestId('legacy-upgrade-slot-kernel');
 const model=await within(kernelSlot).findByTestId('kernel-model');
 fireEvent.change(within(model).getByTestId('select'),{target:{value:fixture.cases.flat.request.choices.kernels[0].kernel.profile.id}});
 fireEvent.click(within(kernelSlot).getByLabelText('Accept this Kernel projection'));
 const tools=await screen.findByTestId('legacy-upgrade-slot-toolkit');
 fireEvent.click(within(tools).getByLabelText('Discard unsupported toolkit settings'));
 await within(tools).findByLabelText('write');fireEvent.click(within(tools).getByLabelText('write'));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Preview'})).not.toBeDisabled());
 fireEvent.click(screen.getByRole('button',{name:'Preview'}));await waitFor(()=>expect(svc.preview).toHaveBeenCalledTimes(1));
 observed.toolkit=svc.preview.mock.calls[0][0];
 expect(observed.toolkit.choices.toolkits[0].enabled_tools).toEqual(['read','old_tool','write']);
});
test('legacy conversion cannot remain an enabled path that widens a migrated recipe policy',async()=>{
 const row=probe.old_conversion;expect(row.converted.document.nodes.find(n=>n.type==='subagent_pool').config.subagents[0].parallel_safe).toBe(true);
 api.unchain.getSkeletonResource=jest.fn(async id=>id===row.resource.id?row.resource:row.child);
 api.unchain.listSkeletonResources=jest.fn(async()=>({resources:[row.resource,row.child]}));
 api.unchain.listRecipes=jest.fn(async()=>({recipes:[{name:'RefChild'}]}));
 api.unchain.listSubagentRefs=jest.fn(async()=>({refs:[]}));
 render(<ConfigContext.Provider value={cfg}><SkeletonResourcePage resourceId={row.resource.id}/></ConfigContext.Provider>);
 pressCanvasNode(await screen.findByTestId('skeleton-node-pool'));
 const button=await screen.findByRole('button',{name:'Convert to Agent entries'});
 api.unchain.convertSkeletonLegacyPools=jest.fn();
 fireEvent.click(button);
 await screen.findByTestId('legacy-upgrade-wizard');
 observed.oldPath={enabled:!button.disabled,routedToWizard:true,oldMutationCalls:api.unchain.convertSkeletonLegacyPools.mock.calls.length,childPolicy:row.converted.document.nodes.find(n=>n.type==='subagent_pool').config.subagents[0]};
 expect(api.unchain.convertSkeletonLegacyPools).not.toHaveBeenCalled();
});
test('positive: ordinary read inventory never sends a write, and closing invalidates delayed preview',async()=>{
 const row=probe.unknown_tool;let resolve;const pending=new Promise(r=>resolve=r);const svc=services(row,{preview:jest.fn(()=>pending)});
 const c=createLegacyUpgradeController(svc);await c.open(row.resource);
 for(const slot of c.current().slots){const entries=slot.kind==='kernel'?row.choices.kernels:row.choices.toolkits;const entry=entries.find(e=>JSON.stringify(e.path)===JSON.stringify(slot.address));c.answer(slot.key,slot.kind==='kernel'?entry:{toolkit_id:entry.toolkit_id,enabled_tools:entry.enabled_tools,discard_unsupported:entry.discard_unsupported});}
 const wait=c.preview();c.close();resolve(payload(row.preview));await wait;
 expect(c.current().phase).toBe(PHASES.CLOSED);expect(svc.apply).not.toHaveBeenCalled();
});

test('zero-choice wizard still requires Preview and an explicit Upgrade before writing',async()=>{
 const row=probe.native_ready,svc=services(row);
 render(<ConfigContext.Provider value={cfg}><LegacyUpgradeWizard open resource={row.resource} services={svc} onClose={jest.fn()} onUpgraded={jest.fn()} isDark={false}/></ConfigContext.Provider>);
 const preview=await screen.findByRole('button',{name:'Preview'});
 expect(preview).not.toBeDisabled();expect(svc.apply).not.toHaveBeenCalled();
 fireEvent.click(preview);await waitFor(()=>expect(screen.getByTestId('legacy-upgrade-apply')).not.toBeDisabled());
 expect(svc.apply).not.toHaveBeenCalled();fireEvent.click(screen.getByTestId('legacy-upgrade-apply'));
 await waitFor(()=>expect(svc.apply).toHaveBeenCalledTimes(1));
 expect(svc.apply.mock.calls[0][0].choices).toEqual(row.choices);
});
test('inventory review is explicit and local until the Host asks for a wire acknowledgement',async()=>{
 const row=probe.unused_ack,svc=services(row),c=createLegacyUpgradeController(svc);await c.open(row.resource);
 const kernel=c.current().slots.find(s=>s.kind==='kernel'),ack=c.current().slots.find(s=>s.kind==='acknowledge');
 c.answer(kernel.key,row.choices.kernels[0]);expect(c.choices().ok).toBe(false);await c.preview();expect(svc.preview).not.toHaveBeenCalled();
 c.answer(ack.key,{acknowledged:true});expect(c.choices().ok).toBe(true);expect(c.choices().choices.acknowledged).toEqual([]);
});
test('required prompt review is sent only at the exact Host address and survives changing to replacement',async()=>{
 const row=probe.unused_ack;const required={...row.refusal,code:'legacy_prompt_review_required',path:row.choices.acknowledged[0].path};
 const svc=services(row,{preview:jest.fn(async request=>{
  const preserve=request.choices.kernels[0].prompt_policy==='preserve';
  if(preserve&&request.choices.acknowledged.length===0)throw Object.assign(new Error(required.message),required);
  if(!preserve&&request.choices.acknowledged.length!==0)throw Object.assign(new Error(row.refusal.message),row.refusal);
  return payload(row.preview_without_ack);
 })});
 const c=createLegacyUpgradeController(svc);await c.open(row.resource);answer(c,row);
 const kernel=c.current().slots.find(s=>s.kind==='kernel'),ack=c.current().slots.find(s=>s.kind==='acknowledge');
 c.answer(kernel.key,{...c.current().answers[kernel.key],prompt_policy:'preserve'});
 await c.preview();expect(c.current().problems[0].code).toBe('legacy_prompt_review_required');
 expect(svc.preview).toHaveBeenCalledTimes(1);expect(c.current().answers[ack.key]).toEqual({acknowledged:true});
 await c.preview();expect(c.current().phase).toBe(PHASES.PREVIEWED);
 expect(svc.preview.mock.calls[1][0].choices.acknowledged).toEqual([required].map(({code,path})=>({code,path})));
 c.answer(kernel.key,{...c.current().answers[kernel.key],prompt_policy:'replace'});
 await c.preview();
 expect(c.current().problems[0].code).toBe('unused_choice');expect(c.choices().ok).toBe(true);await c.preview();
 expect(c.current().phase).toBe(PHASES.PREVIEWED);expect(c.current().answers[ack.key]).toEqual({acknowledged:true});
 expect(svc.preview.mock.calls.at(-1)[0].choices.acknowledged).toEqual([]);expect(svc.apply).not.toHaveBeenCalled();
});
test('a newly requested acknowledgement is never checked on behalf of the author',async()=>{
 const row=probe.unknown_tool;const refusal={code:'legacy_setting_ignored',path:['nodes',1,'config','legacy_recipe','extra'],message:'review required',status:400};
 const svc=services(row,{preview:jest.fn().mockRejectedValueOnce(Object.assign(new Error(refusal.message),refusal)).mockResolvedValue(payload(row.preview))});
 const c=createLegacyUpgradeController(svc);await c.open(row.resource);
 for(const slot of c.current().slots){const category=slot.kind==='kernel'?'kernels':'toolkits';c.answer(slot.key,row.choices[category].find(v=>JSON.stringify(v.path)===JSON.stringify(slot.address)));}
 await c.preview();const ack=c.current().slots.find(s=>s.kind==='acknowledge');expect(c.choices().missing).toContain(ack.key);
 await c.preview();expect(svc.preview).toHaveBeenCalledTimes(1);
 c.answer(ack.key,{acknowledged:true});await c.preview();expect(svc.preview.mock.calls[1][0].choices.acknowledged).toEqual([{code:refusal.code,path:refusal.path}]);
});
test('absent tool names remain visible and are removed only by their own checkbox',async()=>{
 const row=JSON.parse(JSON.stringify(probe.unknown_tool));
 row.resource.document.nodes[1].config.legacy_recipe.toolkits[0].enabled_tools=['old_tool','read'];
 const svc=services(row);
 render(<ConfigContext.Provider value={cfg}><LegacyUpgradeWizard open resource={row.resource} services={svc} onClose={jest.fn()} isDark={false}/></ConfigContext.Provider>);
 const kernelSlot=await screen.findByTestId('legacy-upgrade-slot-kernel');const model=await within(kernelSlot).findByTestId('kernel-model');
 fireEvent.change(within(model).getByTestId('select'),{target:{value:fixture.cases.flat.request.choices.kernels[0].kernel.profile.id}});fireEvent.click(within(kernelSlot).getByLabelText('Accept this Kernel projection'));
 const tools=await screen.findByTestId('legacy-upgrade-slot-toolkit');fireEvent.click(within(tools).getByLabelText('Discard unsupported toolkit settings'));
 const absent=await within(tools).findByLabelText('old_tool');expect(absent).toBeChecked();
 fireEvent.click(await within(tools).findByLabelText('write'));fireEvent.click(screen.getByRole('button',{name:'Preview'}));
 await waitFor(()=>expect(svc.preview).toHaveBeenCalledTimes(1));expect(svc.preview.mock.calls[0][0].choices.toolkits[0].enabled_tools).toEqual(['old_tool','read','write']);
 fireEvent.click(within(tools).getByLabelText('old_tool'));fireEvent.click(screen.getByRole('button',{name:'Preview'}));
 await waitFor(()=>expect(svc.preview).toHaveBeenCalledTimes(2));expect(svc.preview.mock.calls[1][0].choices.toolkits[0].enabled_tools).toEqual(['read','write']);
 expect(svc.apply).not.toHaveBeenCalled();
});
