import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {viewModel} from '../src/miniprogram/view-model.js';
import {foodItems} from '../src/miniprogram/assets.js';
async function pageFixture(){
  let definition;const calls=[],timers=new Set(),api={update:()=>{},stopScan:async()=>{},state:{connected:false}};
  const module={exports:{}};runInNewContext(await readFile('miniprogram/pages/shared/device-controller.js','utf8'),{require:path=>path.includes('utils/page')?{ensurePlan:()=>true}:({viewModel,foodItems,PREVIEW_SCENES:[]}),module,getApp:()=>({service:api}),wx:{redirectTo:()=>{}},setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn)});definition=module.exports(0);
  const page={...definition,data:structuredClone(definition.data),setData(patch){for(const [key,value] of Object.entries(patch)){const path=key.split('.');let target=this.data;for(const part of path.slice(0,-1))target=target[part];target[path.at(-1)]=value;}calls.push(patch);}};page.service=api;return {page,api,calls,timers};
}
test('native form events pass actual countdown/TDEE and keep mode selection on the physical device',async()=>{
  const {page,api}=await pageFixture(),sent=[];api.invoke=async(...args)=>sent.push(args);
  await page.run(async()=>{throw new Error('Expected validation failure');});assert.equal(page.data.error,'Expected validation failure');
  page.data.form.current='-251';page.data.form.target='1234';page.data.form.tdee='1601';page.updateCountdown();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1))),['scaleUpdateKcal',{currentKcal:-251,targetKcal:1234,tdeeKcal:1601}]);
  page.data.profile=1;page.onField({currentTarget:{dataset:{field:'base'}},detail:{value:'50'}});page.onField({currentTarget:{dataset:{field:'ratio'}},detail:{value:'3'}});
  assert.equal(typeof page.onMode,'undefined');page.applyRecipe();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1))),['scaleSetCoffeeRecipe',{mode:1,primaryTargetMg:50000,waterTargetMg:150000,persist:true}]);
});
test('foreground device-list presence refresh stops in the background and rating dragging stays within 1–5',async()=>{
  const {page,api,timers}=await pageFixture();let scans=0;api.scan=async()=>{scans++;};page.data.hasKnownDevices=true;page.onShow();await new Promise(resolve=>setImmediate(resolve));assert.equal(scans,1);assert.equal(timers.size,1);
  page.data.current=1;for(const fn of timers)fn();assert.equal(scans,1);page.data.current=0;for(const fn of timers)fn();await new Promise(resolve=>setImmediate(resolve));assert.equal(scans,2);
  page.onHide();assert.equal(timers.size,0);page.ratingRect={left:100,width:220};page.onRatingMove({touches:[{clientX:1000}]});assert.equal(page.data.rating,5);page.onRatingMove({touches:[{clientX:0}]});assert.equal(page.data.rating,1);
});
test('native bridge sends only changed values without losing dotted form fields',async()=>{
  const {page,calls}=await pageFixture();page.patchData({profile:3,'form.container':'100'});assert.equal(calls.length,0);page.patchData({'form.container':'123.4'});assert.equal(page.data.form.container,'123.4');assert.equal(calls.length,1);
});
