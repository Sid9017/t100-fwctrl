import test from 'node:test';
import assert from 'node:assert/strict';
import {WeightUnitPreference} from '../src/miniprogram/unit-preference.js';
import {PlanSync} from '../src/miniprogram/plan-sync.js';
import {JournalStore,dayKey} from '../src/miniprogram/journal.js';
const settle=()=>new Promise(r=>setImmediate(r));
function fixture(withUnits=false){
 const journal=new JournalStore(null,{memory:true});journal.saveProfile({age:30,height:170,weight:65,sex:'female',activity:1,goal:'maintain',target:1800,tdee:2100,carbs:50,protein:25,fat:25,fiber:30});
 const listeners=new Set(),calls=[];let write=async()=>{};
 const service={state:{connected:false},onChange(fn){listeners.add(fn);fn(this.state);return()=>listeners.delete(fn);},update(p){Object.assign(this.state,p);for(const fn of listeners)fn(this.state);},async invoke(name,args){calls.push([name,args]);this.update({busy:true,actionName:name});try{await write(name,args);}finally{this.update({busy:false,actionName:''});}}};
 const units=withUnits?new WeightUnitPreference(null,service):null;
 const sync=new PlanSync(service,journal),connect=(patch={})=>service.update({connected:true,device:{id:'A'},status:{flags:1},hasAuth:true,...patch});
 return {journal,service,sync,units,calls,connect,setWrite:fn=>write=fn};
}
test('daily plan sync runs on authenticated connection and data changes, not each notification',async()=>{
 const f=fixture();try{
 f.sync.show();f.connect({adding:true});await settle();assert.equal(f.calls.length,0);f.service.update({adding:false});await settle();
 assert.deepEqual(f.calls[0],['scaleUpdateKcal',{currentKcal:1800,targetKcal:1800,tdeeKcal:2100,navigate:false}]);
 for(let i=0;i<10;i++)f.service.update({reading:{value:i}});await settle();assert.equal(f.calls.length,1);
 f.journal.saveMeal({id:'00000000-0000-4000-8000-000000000001',name:'Meal',date:dayKey(),time:'12:00',meal:'Lunch',kcal:400,rating:4});await settle();assert.equal(f.calls.at(-1)[1].currentKcal,1400);
 f.service.update({connected:false});f.connect();await settle();assert.equal(f.calls.length,3);
 }finally{f.sync.dispose();}
});
test('sync status follows the write and failure does not cause a retry loop',async()=>{
 const f=fixture();try{let reject;f.setWrite(()=>new Promise((_,r)=>reject=r));f.sync.show();f.connect();await settle();assert.equal(f.service.state.planSyncing,true);
 reject(new Error('No reply'));await settle();assert.equal(f.service.state.planSyncing,false);assert.match(f.service.state.planSyncError,/No reply/);
 f.service.update({battery:80});await settle();assert.equal(f.calls.length,1);
 f.sync.hide();f.journal.saveProfile({...f.journal.data.profile,target:1700});await settle();assert.equal(f.calls.length,1);
 f.setWrite(async()=>{});f.sync.show();await settle();assert.equal(f.calls.length,2);assert.equal(f.service.state.planSyncError,'');
 }finally{f.sync.dispose();}
});
test('local countdown sync precedes record deletions and failed deletions remain pending',async()=>{
 const f=fixture();try{f.journal.commit({...f.journal.data,deletions:[{id:'meal-1',deviceId:'A'},{id:'meal-2',deviceId:'B'}]});f.setWrite(async()=>{throw new Error('Offline');});f.sync.show();f.connect();await settle();
 assert.equal(f.journal.data.deletions.length,2);assert.equal(f.calls.length,1);
 f.setWrite(async()=>{});f.sync.show();await settle();assert.deepEqual(f.calls.slice(1).map(c=>c[0]),['scaleUpdateKcal','deleteKcalHist']);assert.deepEqual(f.journal.data.deletions,[{id:'meal-2',deviceId:'B'}]);
 }finally{f.sync.dispose();}
});
test('a plan edited during a write is synchronized afterward without overlapping writes',async()=>{
 const f=fixture();try{let release;f.setWrite(()=>new Promise(r=>release=r));f.sync.show();f.connect();await settle();f.journal.saveProfile({...f.journal.data.profile,target:1600});await settle();assert.equal(f.calls.length,1);f.setWrite(async()=>{});release();await settle();await settle();assert.equal(f.calls.length,2);assert.equal(f.calls.at(-1)[1].targetKcal,1600);
 }finally{f.sync.dispose();}
});

test('offline unit and target edits sync the latest local configuration immediately on authenticated reconnect',async()=>{
 const f=fixture(true);try{
 f.sync.show();f.units.setUnit(1);f.journal.saveProfile({...f.journal.data.profile,target:1650,tdee:2050});
 await settle();assert.equal(f.calls.length,0);assert.equal(f.units.state.error,'');assert.ok(!f.service.state.planSyncError);
 f.connect({adding:true,hasAuth:false});await settle();assert.equal(f.calls.length,0);
 f.service.update({adding:false,hasAuth:true});await settle();await settle();
 assert.deepEqual(f.calls,[['scaleSetUnit',1],['scaleUpdateKcal',{currentKcal:1650,targetKcal:1650,tdeeKcal:2050,navigate:false}]]);
 f.service.update({connected:false});f.units.setUnit(0);f.journal.saveProfile({...f.journal.data.profile,target:1750});
 await settle();assert.equal(f.calls.length,2);f.connect();await settle();await settle();
 assert.deepEqual(f.calls.slice(2),[['scaleSetUnit',0],['scaleUpdateKcal',{currentKcal:1750,targetKcal:1750,tdeeKcal:2050,navigate:false}]]);
 }finally{f.units.dispose();f.sync.dispose();}
});

test('a connection lost during plan sync is deferred silently and retries after reconnect',async()=>{
 const f=fixture();try{
 f.setWrite(async()=>{throw new Error('Device disconnected');});f.sync.show();f.connect();await settle();
 assert.equal(f.service.state.planSyncError,'');assert.equal(f.service.state.planSyncing,false);
 f.service.update({connected:false});f.journal.saveProfile({...f.journal.data.profile,target:1600});await settle();
 assert.equal(f.calls.length,1);f.setWrite(async()=>{});f.connect();await settle();
 assert.equal(f.calls.at(-1)[1].targetKcal,1600);assert.equal(f.service.state.planSyncError,'');
 f.service.update({planSyncError:'Old error',connected:false});assert.equal(f.service.state.planSyncError,'');
 }finally{f.sync.dispose();}
});

const meal={id:'00000000-0000-4000-8000-000000000009',name:'Lunch',meal:'Lunch',date:dayKey(),time:'12:29',rating:4,kcal:300,photos:['a','b','c','d','e']};
test('offline edits persist and reconnect sends the latest version with the original UUID and first three photos',async()=>{
 const f=fixture();try{
 f.sync.show();f.journal.saveMeal({...meal,sync:{A:'sent'}});f.journal.saveMeal({...f.journal.data.records[0],kcal:450,rating:5});await settle();assert.equal(f.calls.length,0);assert.equal(f.journal.data.records[0].sync.A,'pending');
 f.connect();await settle();const history=f.calls.filter(c=>c[0]==='appendKcalHist');assert.equal(history.length,1);assert.equal(history[0][1].uuid,meal.id);assert.equal(history[0][1].kcal,450);assert.deepEqual(history[0][1].foodFiles,['a','b','c']);assert.equal(f.journal.data.records[0].sync.A,'sent');
 f.service.update({reading:{value:1}});await settle();assert.equal(f.calls.filter(c=>c[0]==='appendKcalHist').length,1);
 }finally{f.sync.dispose();}
});
test('edits during upload remain pending until the newer payload is sent',async()=>{
 const f=fixture();try{
 let release;f.journal.saveMeal(meal);f.setWrite(name=>name==='appendKcalHist'?new Promise(r=>release=r):Promise.resolve());f.sync.show();f.connect();await settle();
 f.journal.saveMeal({...f.journal.data.records[0],kcal:600});f.setWrite(async()=>{});release();await settle();await settle();
 assert.deepEqual(f.calls.filter(c=>c[0]==='appendKcalHist').map(c=>c[1].kcal),[300,600]);assert.equal(f.journal.data.records[0].sync.A,'sent');
 }finally{f.sync.dispose();}
});
test('deleting a meal while uploading retains and sends its tombstone after the upload',async()=>{
 const f=fixture();try{
 let release;f.journal.saveMeal(meal);f.setWrite(name=>name==='appendKcalHist'?new Promise(r=>release=r):Promise.resolve());f.sync.show();f.connect();await settle();f.journal.removeMeal(meal.id);assert.equal(f.journal.data.deletions[0].id,meal.id);
 f.setWrite(async()=>{});release();await settle();await settle();assert.equal(f.journal.data.records.length,0);assert.equal(f.journal.data.deletions.length,0);assert.equal(f.calls.at(-1)[0],'deleteKcalHist');
 }finally{f.sync.dispose();}
});
test('failed history stays queued without a busy loop and retries after reconnection',async()=>{
 const f=fixture();try{
 f.journal.saveMeal(meal);f.setWrite(async name=>{if(name==='appendKcalHist')throw Error('Device disconnected');});f.sync.show();f.connect();await settle();assert.equal(f.journal.data.records[0].sync.A,'pending');assert.equal(f.service.state.planSyncError,'');
 f.service.update({reading:{value:2}});await settle();assert.equal(f.calls.filter(c=>c[0]==='appendKcalHist').length,1);
 f.service.update({connected:false});f.setWrite(async()=>{});f.connect();await settle();assert.equal(f.journal.data.records[0].sync.A,'sent');
 }finally{f.sync.dispose();}
});
test('photo-only drafts never upload as valid zero-calorie meals',async()=>{
 const f=fixture();try{f.journal.saveMeal({...meal,kcal:null,autoSaved:true});f.sync.show();f.connect();await settle();assert.equal(f.calls.filter(c=>c[0]==='appendKcalHist').length,0);}finally{f.sync.dispose();}
});
