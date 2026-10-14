import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {dayKey} from '../src/miniprogram/journal.js';
import {viewModel} from '../src/miniprogram/view-model.js';

async function fixture(app){
  const navigation=[],wx={reLaunch:o=>navigation.push(['reset',o.url]),navigateTo:o=>navigation.push(['push',o.url])},module={exports:{}};
  runInNewContext(await readFile('miniprogram/utils/page.js','utf8'),{module,require:()=>({dayKey}),getApp:()=>app,wx});
  return {utils:module.exports,wx,navigation};
}
test('missing plan blocks every normal navigation and cannot be bypassed by returning home',async()=>{
  let listener;const app={journal:{data:{profile:null}},journalFor(){return this.journal;},service:{onChange(fn){listener=fn;return ()=>{};}}};
  const f=await fixture(app);let definition;
  runInNewContext(await readFile('miniprogram/pages/index/index.js','utf8'),{Page:d=>definition=d,require:path=>path.includes('utils')?f.utils:{dayKey},getApp:()=>app,wx:f.wx});
  const p={...definition,data:structuredClone(definition.data),setData:patch=>Object.assign(p.data,patch)};p.onLoad();
  p.onShow();p.onShow();f.utils.route('record');f.utils.route('devices');f.utils.route('reports');
  assert.equal(listener,undefined);assert.equal(p.data.profile,null);assert.equal(f.navigation.length,5);assert.ok(f.navigation.every(([kind,url])=>kind==='reset'&&url==='/pages/plan/index?required=1'));
  app.journal.data.profile={target:1800};assert.equal(f.utils.ensurePlan(),true);f.utils.route('devices');assert.deepEqual(f.navigation.at(-1),['push','/pages/devices/index']);
});
test('only isolated Devtools preview can enter a screen without a saved personal plan',async()=>{
  for(const isDevtools of [false,true]){const f=await fixture({isDevtools,journal:{data:{profile:null}}});f.utils.route('device',true);assert.equal(f.navigation[0][0],isDevtools?'push':'reset');}
});
test('deep linking directly to a BLE screen without a plan does not subscribe or scan',async()=>{
  let calls=0;const app={isDevtools:false,journal:{data:{profile:null}},service:{onChange(){calls++;},scan(){calls++;}}},f=await fixture(app),module={exports:{}};
  runInNewContext(await readFile('miniprogram/pages/shared/device-controller.js','utf8'),{module,require:path=>path.includes('utils')?f.utils:{viewModel,foodItems:[]},getApp:()=>app,wx:f.wx});
  const d=module.exports(1),p={...d,data:structuredClone(d.data),setData:patch=>Object.assign(p.data,patch)};p.onLoad({preview:'1'});p.onShow();assert.equal(calls,0);assert.equal(p.blocked,true);assert.deepEqual(f.navigation,[['reset','/pages/plan/index?required=1']]);
});
test('new device connection opens the pairing scene; reconnect opens controls directly',async()=>{
  for(const added of [false,true]){
    const app={journal:{data:{profile:{}}}},f=await fixture(app),module={exports:{}};
    runInNewContext(await readFile('miniprogram/pages/shared/device-controller.js','utf8'),{module,require:path=>path.includes('utils')?f.utils:{viewModel,foodItems:[]},getApp:()=>app,wx:f.wx});
    const d=module.exports(0),p={...d,data:structuredClone(d.data),setData:patch=>Object.assign(p.data,patch),service:{state:{knownDevices:added?[{id:'A'}]:[]},connect:async()=>{}}};
    await p.connectDevice('A');p.openDevice();assert.equal(f.navigation[0][1],added?'/pages/device/index':'/pairing/index');
  }
});
