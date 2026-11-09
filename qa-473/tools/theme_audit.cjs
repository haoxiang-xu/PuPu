const assert=require('node:assert/strict');
const rgb=(s)=>{const m=s.match(/[\d.]+/g);assert(m&&m.length>=3,'readable computed color');return [Number(m[0]),Number(m[1]),Number(m[2]),m.length>3?Number(m[3]):1];};
const lum=(c)=>c.slice(0,3).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[0.2126,0.7152,0.0722][i],0);
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
async function measure({page,button,mode,role,rows,mark,write}){
 await page.mouse.move(5,5);
 const row=await button.evaluate(el=>{
  const layers=[];for(let p=el;p;p=p.parentElement){const s=getComputedStyle(p).backgroundColor;const parts=s.match(/[\d.]+/g)||[];const alpha=parts.length>3?Number(parts[3]):1;layers.push({color:s,alpha});if(alpha>=1)break;}
  return {foreground:getComputedStyle(el).color,layers,disabled:el.disabled,text:el.textContent};
 });
 assert.equal(row.disabled,false,'sample an enabled action');assert(row.layers.some(l=>l.alpha>=1),'opaque real ancestor required');
 let bg=[0,0,0];for(const layer of row.layers.reverse()){const c=rgb(layer.color);bg=bg.map((v,i)=>c[i]*c[3]+v*(1-c[3]));}
 const foreground=rgb(row.foreground);assert.deepEqual(foreground.slice(0,3),mode==='dark'?[96,165,250]:[74,91,216],`${mode}/${role} must render its selected theme branch`);
 const ratio=contrast(foreground,bg);assert(ratio>=4.5,`${mode}/${role} contrast ${ratio}`);
 rows.push({mode,role,...row,effective_background:bg,contrast:ratio});write('theme-observations.json',rows);mark('ui','measured actual enabled theme foreground',{mode,role,ratio});
}
async function runThemeAudit({page,expect,openSidebarIfNeeded,openBuilder,closeBuilder,catalog,readResource,chooseKernel,acknowledge,preview,mark,write,shot}){
 const rows=[];
 async function setMode(mode){
  await openSidebarIfNeeded(page);await page.getByRole('button',{name:'Settings',exact:true}).click();
  const close=page.getByRole('button',{name:'Close settings',exact:true});await expect(close).toBeVisible();
  await close.locator('..').getByRole('combobox').first().click();
  await page.getByRole('listbox').getByText(mode==='dark'?'Dark':'Light',{exact:true}).click();
  await close.click();await expect(close).not.toBeVisible();mark('ui','changed theme through actual Settings controls',{mode});
 }
 for(const mode of ['light','dark']){
  await setMode(mode);await openBuilder(page,'Default');const data=await catalog(page);const id=(data.resources||data).find(r=>r.name==='Default').id;
  const before=await readResource(page,id);await measure({page,button:page.getByTestId('skeleton-legacy-upgrade-open'),mode,role:'entry',rows,mark,write});
  await page.getByTestId('skeleton-legacy-upgrade-open').click();const wizard=page.getByTestId('legacy-upgrade-wizard');await expect(wizard).toHaveAttribute('data-phase','ready');
  const slots=wizard.getByTestId('legacy-upgrade-slot-kernel');for(let i=0;i<await slots.count();i++){
   const s=slots.nth(i);await chooseKernel(s,page);await s.getByRole('combobox').filter({hasText:'Preserve the legacy model'}).click();await page.getByRole('listbox').getByText("Replace with this Kernel's model",{exact:true}).click();
  }
  const toolkit=wizard.getByTestId('legacy-upgrade-slot-toolkit').first();await expect(toolkit).toBeVisible();
  const all=toolkit.getByRole('button',{name:'All tools',exact:true}),choose=toolkit.getByRole('button',{name:'Choose tools',exact:true});
  await all.click();await measure({page,button:all,mode,role:'all-tools',rows,mark,write});
  await choose.click();await measure({page,button:choose,mode,role:'choose-tools',rows,mark,write});await all.click();
  await acknowledge(wizard);await preview(wizard,page,'Default');await measure({page,button:wizard.getByTestId('legacy-upgrade-apply'),mode,role:'apply',rows,mark,write});await shot(page,`theme-${mode}-actual-controls`);
  await wizard.getByRole('button',{name:'Cancel',exact:true}).click();await expect(wizard).toHaveCount(0);assert.deepEqual(await readResource(page,id),before,'theme probe cancel changes no Agent');await closeBuilder(page);
 }
 assert.equal(rows.length,8);await setMode('light');return rows;
}
module.exports={runThemeAudit};
