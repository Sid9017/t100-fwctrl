import test from 'node:test';
import assert from 'node:assert/strict';
import {WeightUnitPreference} from '../src/miniprogram/unit-preference.js';
const settle=()=>new Promise(r=>setImmediate(r));
function fixture(unit=0){
 const storage=new Map([['kcalack.weight-unit.v1',unit]]),calls=[];let listener,write=async()=>{};
 const service={state:{connected:false},onChange(fn){listener=fn;fn(this.state);return ()=>listener=null;},update(p){this.state={...this.state,...p};listener?.(this.state);},async invoke(name,value){calls.push([name,value]);this.update({busy:true,actionName:name});try{await write();}finally{this.update({busy:false,actionName:''});}}};
 const api={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v)},prefs=new WeightUnitPreference(api,service);
 const connect=(patch={})=>service.update({connected:true,device:{id:'A'},connecting:false,hasAuth:true,status:{flags:1},...patch});
 return {service,prefs,storage,calls,connect,api,setWrite:fn=>write=fn};
}
test('unit is saved offline, restored after restart and synchronized once after authenticated connection',async()=>{
 const f=fixture();f.prefs.setUnit(1);await settle();assert.equal(f.calls.length,0);assert.equal(f.storage.get('kcalack.weight-unit.v1'),1);
 f.connect({connecting:true,hasAuth:false});await settle();assert.equal(f.calls.length,0);
 f.service.update({connecting:false});await settle();assert.equal(f.calls.length,0);
 f.service.update({hasAuth:true});await settle();assert.deepEqual(f.calls,[['scaleSetUnit',1]]);assert.equal(f.prefs.state.pending,false);
 f.service.update({reading:{unit:1}});await settle();assert.equal(f.calls.length,1);
 f.service.update({connected:false});f.connect();await settle();assert.equal(f.calls.length,2);
 f.prefs.dispose();const restored=new WeightUnitPreference(f.api);assert.equal(restored.state.unit,1);restored.dispose();
});
test('binding and busy actions defer unit sync; rapid toggles finish with the newest preference',async()=>{
 const f=fixture();f.connect({status:{flags:0}});await settle();assert.equal(f.calls.length,0);
 f.service.update({status:{flags:1},busy:true});await settle();assert.equal(f.calls.length,0);
 let release;f.setWrite(()=>new Promise(r=>release=r));f.service.update({busy:false});await settle();
 f.prefs.setUnit(1);await settle();assert.equal(f.calls.length,1);f.setWrite(async()=>{});release();await settle();await settle();
 assert.deepEqual(f.calls,[['scaleSetUnit',0],['scaleSetUnit',1]]);assert.equal(f.prefs.state.pending,false);f.prefs.dispose();
});
test('sync failure does not retry every notification; reconnect retries without losing the preference',async()=>{
 const f=fixture(1);f.setWrite(async()=>{throw new Error('No reply');});f.connect();await settle();assert.match(f.prefs.state.error,/No reply/);
 for(let i=0;i<20;i++)f.service.update({reading:{value:i}});await settle();assert.equal(f.calls.length,1);
 f.setWrite(async()=>{});f.service.update({connected:false});f.connect();await settle();assert.equal(f.calls.length,2);assert.equal(f.prefs.state.error,'');f.prefs.dispose();
});
test('failed storage writes keep the original preference and preview never writes real storage',async()=>{
 const f=fixture();f.api.setStorageSync=()=>{throw new Error('Storage full');};assert.throws(()=>f.prefs.setUnit(1),/Storage full/);assert.equal(f.prefs.state.unit,0);f.prefs.dispose();
 const preview=new WeightUnitPreference(null);preview.setUnit(1);assert.equal(preview.state.unit,1);assert.equal(f.storage.get('kcalack.weight-unit.v1'),0);preview.dispose();
});

test('disconnect clears old sync feedback and offline writes stay pending without an error',async()=>{
 const f=fixture();try{
 f.setWrite(async()=>{throw new Error('No reply');});f.connect();await settle();assert.ok(f.prefs.state.error);
 f.service.update({connected:false});assert.equal(f.prefs.state.error,'');assert.equal(f.prefs.state.syncing,false);
 f.prefs.setUnit(1);await settle();assert.equal(f.storage.get('kcalack.weight-unit.v1'),1);assert.equal(f.prefs.state.error,'');
 f.setWrite(async()=>{throw new Error('Device disconnected');});f.connect();await settle();
 assert.equal(f.prefs.state.error,'');assert.equal(f.prefs.state.pending,true);
 f.setWrite(async()=>{});f.service.update({connected:false});f.connect();await settle();
 assert.deepEqual(f.calls.at(-1),['scaleSetUnit',1]);assert.equal(f.prefs.state.pending,false);
 }finally{f.prefs.dispose();}
});
