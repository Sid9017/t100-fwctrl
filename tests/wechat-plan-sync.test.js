import test from 'node:test';
import assert from 'node:assert/strict';
import {PlanSync} from '../src/miniprogram/plan-sync.js';
import {JournalStore,dayKey} from '../src/miniprogram/journal.js';
const settle=()=>new Promise(r=>setImmediate(r));
function fixture(){
 const journal=new JournalStore(null,{memory:true});journal.saveProfile({age:30,height:170,weight:65,sex:'female',activity:1,goal:'maintain',target:1800,tdee:2100,carbs:50,protein:25,fat:25,fiber:30});
 const listeners=new Set(),calls=[];let write=async()=>{};
 const service={state:{connected:false},onChange(fn){listeners.add(fn);fn(this.state);return()=>listeners.delete(fn);},update(p){Object.assign(this.state,p);for(const fn of listeners)fn(this.state);},async invoke(name,args){calls.push([name,args]);this.update({busy:true,actionName:name});try{await write(name,args);}finally{this.update({busy:false,actionName:''});}}};
 const sync=new PlanSync(service,journal),connect=(patch={})=>service.update({connected:true,device:{id:'A'},status:{flags:1},hasAuth:true,...patch});
 return {journal,service,sync,calls,connect,setWrite:fn=>write=fn};
}
test('daily plan sync runs on authenticated connection and data changes, not each notification',async()=>{
 const f=fixture();try{
 f.sync.show();f.connect({adding:true});await settle();assert.equal(f.calls.length,0);f.service.update({adding:false});await settle();
 assert.deepEqual(f.calls[0],['scaleUpdateKcal',{currentKcal:1800,targetKcal:1800,tdeeKcal:2100}]);
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
test('pending record deletions are acknowledged before countdown sync and retained on failure',async()=>{
 const f=fixture();try{f.journal.commit({...f.journal.data,deletions:[{id:'meal-1',deviceId:'A'},{id:'meal-2',deviceId:'B'}]});f.setWrite(async()=>{throw new Error('Offline');});f.sync.show();f.connect();await settle();
 assert.equal(f.journal.data.deletions.length,2);assert.equal(f.calls.length,1);
 f.setWrite(async()=>{});f.sync.show();await settle();assert.deepEqual(f.calls.slice(1).map(c=>c[0]),['deleteKcalHist','scaleUpdateKcal']);assert.deepEqual(f.journal.data.deletions,[{id:'meal-2',deviceId:'B'}]);
 }finally{f.sync.dispose();}
});
test('a plan edited during a write is synchronized afterward without overlapping writes',async()=>{
 const f=fixture();try{let release;f.setWrite(()=>new Promise(r=>release=r));f.sync.show();f.connect();await settle();f.journal.saveProfile({...f.journal.data.profile,target:1600});await settle();assert.equal(f.calls.length,1);f.setWrite(async()=>{});release();await settle();await settle();assert.equal(f.calls.length,2);assert.equal(f.calls.at(-1)[1].targetKcal,1600);
 }finally{f.sync.dispose();}
});
