import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {viewModel} from '../src/miniprogram/view-model.js';

async function setup(){
  const navigation=[],events=[],listeners=new Set();let stopped=0,disconnected=0;
  const service={state:{connected:false,knownDevices:[],devices:[],battery:null,mtu:null},onChange(fn){listeners.add(fn);fn(this.state);return ()=>listeners.delete(fn);},stopScan:async()=>{stopped++;},disconnect:async()=>{disconnected++;},connect:async id=>{service.state={...service.state,connected:true,device:{id,name:'YD-03148c52fb00'},knownDevices:[{id,name:'YD-03148c52fb00',lastConnectedAt:Date.now()}]};for(const fn of listeners)fn(service.state);}};
  service.addDevice=async id=>{await service.connect(id);};
  const app={service,isDevtools:false},wx={navigateTo:o=>{navigation.push(o.url);o.complete?.();}},module={exports:{}};
  runInNewContext(await readFile('miniprogram/pages/shared/device-controller.js','utf8'),{module,require:path=>path.includes('utils')?{ensurePlan:()=>true}:{viewModel,foodItems:[],PREVIEW_SCENES:[]},getApp:()=>app,wx,setInterval:()=>1,clearInterval:()=>{}});
  let definition;runInNewContext(await readFile('miniprogram/components/device-setup/index.js','utf8'),{require:()=>module.exports,Component:d=>definition=d});
  const c={...definition.methods,data:structuredClone(definition.data),properties:{demo:false},setData(p){for(const [key,value] of Object.entries(p)){const path=key.split('.');let target=this.data;for(const part of path.slice(0,-1))target=target[part];target[path.at(-1)]=value;}},triggerEvent:(type,detail)=>events.push({type,detail})};
  return {c,definition,service,navigation,events,listeners,counts:()=>({stopped,disconnected})};
}
test('home device setup opens in place and a first connection stays on Today',async()=>{
  const f=await setup();f.definition.lifetimes.ready.call(f.c);assert.equal(f.c.data.showAddDevice,true);assert.equal(f.navigation.length,0,'opening the sheet must not navigate');
  f.c.connect({currentTarget:{dataset:{id:'A'}}});await new Promise(r=>setImmediate(r));assert.deepEqual(f.navigation,[]);assert.equal(f.events[0].type,'connected');assert.equal(f.events.at(-1).type,'close');
  f.definition.lifetimes.detached.call(f.c);assert.equal(f.listeners.size,0);assert.equal(f.counts().disconnected,0,'opening controls must keep BLE connected');
});
test('closing the home sheet removes its discovery subscription without changing the page',async()=>{
  const f=await setup();f.definition.lifetimes.ready.call(f.c);f.c.closeAddDevice();f.definition.lifetimes.detached.call(f.c);assert.equal(f.navigation.length,0);assert.equal(f.events.length,1);assert.equal(f.listeners.size,0);assert.equal(f.counts().stopped,1);assert.equal(f.counts().disconnected,0);
});
test('a saved offline device hides the home add action and opening add stays on the home route',async()=>{
  let definition,listener;const navigation=[],app={journal:{data:{profile:{}}},journalFor(){return this.journal;},service:{onChange(fn){listener=fn;fn({connected:false,knownDevices:[]});return ()=>{};}}};
  runInNewContext(await readFile('miniprogram/pages/index/index.js','utf8'),{Page:d=>definition=d,require:path=>path.includes('utils')?{route:()=>navigation.push('route'),ensurePlan:()=>true,isPreview:()=>false,store:()=>app.journal,currentTheme:()=>3}:{dayKey:()=> '2026-10-14'},getApp:()=>app});
  const p={...definition,data:structuredClone(definition.data),setData:patch=>Object.assign(p.data,patch),refresh:()=>{}};p.onLoad();p.onShow();p.openAddDevice();assert.equal(p.data.showDeviceSetup,true);assert.equal(navigation.length,0);
  p.closeDeviceSetup({detail:{}});listener({connected:false,knownDevices:[{name:'YD-03148c52fb00'}]});assert.equal(p.data.hasDevice,true);p.openAddDevice();assert.equal(p.data.showDeviceSetup,false);assert.equal(navigation.length,0);
});

test('adding waits for binding and emotion installation before closing, and exposes retry after failure',async()=>{
 const f=await setup();f.definition.lifetimes.ready.call(f.c);f.c.setData({showAddDevice:false,showScanner:true});
 let finish;f.service.addDevice=async id=>{await f.service.connect(id);await new Promise((resolve,reject)=>finish={resolve,reject});};
 f.c.connect({currentTarget:{dataset:{id:'A'}}});await new Promise(r=>setImmediate(r));
 assert.equal(f.c.data.showScanner,true);assert.equal(f.events.length,0);assert.equal(f.c.data.working,true);
 finish.reject(new Error('Emotion transfer failed'));await new Promise(r=>setImmediate(r));
 assert.equal(f.events.length,0);assert.equal(f.c.data.setupRetry,true);assert.match(f.c.data.error,/Emotion transfer failed/);
 f.c.retrySetup();await new Promise(r=>setImmediate(r));finish.resolve();await new Promise(r=>setImmediate(r));
 assert.deepEqual(f.events.map(e=>e.type),['connected','close']);f.definition.lifetimes.detached.call(f.c);
});
