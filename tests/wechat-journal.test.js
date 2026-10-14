import test from 'node:test';
import assert from 'node:assert/strict';
import {JournalStore,JOURNAL_KEY,estimatePlan,dayKey,weekSummary} from '../src/miniprogram/journal.js';
import {PreviewService} from '../src/miniprogram/preview-service.js';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {viewModel} from '../src/miniprogram/view-model.js';
const profile={age:30,height:170,weight:65,sex:'female',activity:0,goal:'maintain',target:1800,tdee:2100,carbs:50,protein:25,fat:25,fiber:30};
const uuid='12345678-1234-4123-8123-123456789012';
const meal=(patch={})=>({id:uuid,name:'Lunch bowl',meal:'Lunch',date:dayKey(),time:'12:30',kcal:620,weight:250,rating:4,photos:[],carbs:50,protein:20,fat:15,fiber:4,...patch});
function fixture(){const cache=new Map(),api={getStorageSync:k=>cache.get(k),setStorageSync:(k,v)=>cache.set(k,v)};return {cache,api,store:new JournalStore(api)};}
test('personal plan uses actual inputs, explicit targets and consistent macro percentages',()=>{
 const a=estimatePlan({...profile,target:'',tdee:''});assert.equal(a.tdee,Math.round((650+1062.5-150-161)*1.2));assert.equal(a.target,a.tdee);
 const b=estimatePlan({...profile,height:180,target:1500,tdee:2200});assert.equal(b.target,1500);assert.equal(b.tdee,2200);
 assert.throws(()=>estimatePlan({...profile,protein:40}),/100%/);assert.throws(()=>estimatePlan({...profile,age:0}),/Age/);assert.throws(()=>estimatePlan({...profile,sex:'private',tdee:''}),/TDEE/);
 assert.throws(()=>estimatePlan({...profile,goal:'lose',goalWeight:70,months:5}),/Goal weight/);
});
test('journal saves and updates one UUID without duplicate meals and survives restart',()=>{
 const f=fixture();f.store.saveProfile(profile);f.store.saveMeal(meal());f.store.saveMeal(meal({kcal:700}));assert.equal(f.store.summary().consumed,700);assert.equal(f.store.data.records.length,1);const restarted=new JournalStore(f.api);assert.equal(restarted.summary().consumed,700);assert.equal(restarted.summary().target,1800);assert.ok(f.cache.has(JOURNAL_KEY));
});
test('invalid records and rejected storage writes do not change the saved journal',()=>{
 const f=fixture();f.store.saveMeal(meal());const original=f.cache.get(JOURNAL_KEY);for(const patch of [{kcal:'NaN'},{rating:6},{date:'2026-02-30'},{time:'99:00'},{name:''},{photos:['a','b','c','d','e','f']}])assert.throws(()=>f.store.saveMeal(meal(patch)));assert.equal(f.cache.get(JOURNAL_KEY),original);
 f.api.setStorageSync=()=>{throw new Error('Storage full');};assert.throws(()=>f.store.saveMeal(meal({kcal:1})),/Storage full/);assert.equal(f.store.summary().consumed,620);
});
test('nutrition remains partial when unknown, threshold follows target/TDEE and missing days are excluded',()=>{
 const f=fixture();f.store.saveProfile({...profile,target:1350,tdee:1600});f.store.saveMeal(meal({kcal:1600,protein:null}));assert.equal(f.store.summary().tone,'warning');assert.equal(f.store.summary().nutrients[1].partial,true);f.store.saveMeal(meal({kcal:1601}));assert.equal(f.store.summary().tone,'danger');assert.equal(f.store.summary().remaining,-251);const week=weekSummary(f.store);assert.equal(week.average,1601);assert.equal(week.recordedDays,1);assert.equal(week.days.filter(d=>d.recordCount===0).length,6);
});
test('device deletions are retained offline per device and clear only after its sync',()=>{
 const f=fixture();f.store.saveMeal(meal());f.store.markSync(uuid,'device-A','sent');f.store.markSync(uuid,'device-B','sent');f.store.removeMeal(uuid);assert.equal(f.store.data.records.length,0);assert.equal(f.store.data.deletions.length,2);f.store.clearDeletion(uuid,'device-A');assert.deepEqual(f.store.data.deletions,[{id:uuid,deviceId:'device-B'}]);
});
test('corrupt journals stay blocked without overwriting their stored contents',()=>{
 const f=fixture();f.cache.set(JOURNAL_KEY,'broken');const store=new JournalStore(f.api);assert.match(store.error,/not been overwritten/);assert.throws(()=>store.saveProfile(profile));assert.equal(f.cache.get(JOURNAL_KEY),'broken');
});
test('Devtools preview has no BLE, storage, auth or network access and covers local controls',async()=>{
 const s=new PreviewService();await s.setContainer(100,uuid);assert.equal(s.state.containerState.uuid,uuid);await s.invoke('scaleSetWeighingProfile',{profile:2});assert.equal(s.state.reading.profile,2);await s.invoke('scaleUpdateKcal',{currentKcal:-300,targetKcal:1400,tdeeKcal:1900});assert.equal(s.state.previewCommits[0].tdeeKcal,1900);await s.loadLatestFirmware();await s.startOad();assert.equal(s.state.oadProgress,100);assert.throws(()=>s.importAuth('[]'),/disabled/);assert.equal('adapter' in s,false);assert.equal('api' in s,false);assert.equal('auth' in s,false);
});
async function controller(screen,app,wx){const module={exports:{}};runInNewContext(await readFile('miniprogram/pages/shared/device-controller.js','utf8'),{require:path=>path.includes('utils/page')?{ensurePlan:()=>true}:({viewModel,foodItems:[],PREVIEW_SCENES:[]}),module,getApp:()=>app,wx,setInterval:()=>1,clearInterval:()=>{}});const d=module.exports(screen);return {...d,data:structuredClone(d.data),setData(p){for(const [key,val] of Object.entries(p)){const path=key.split('.');let target=this.data;for(const k of path.slice(0,-1))target=target[k];target[path[path.length-1]]=val;}}};}
test('phone rejects preview query and page unload retains the shared BLE connection',async()=>{
 let previewCalled=0,disconnected=0;const service={state:{connected:true,device:{id:'A'},battery:null,mtu:23},onChange(fn){fn(this.state);return ()=>{};},stopScan:async()=>{},disconnect(){disconnected++;}};const app={isDevtools:false,service,getPreviewService(){previewCalled++;}},p=await controller(1,app,{redirectTo:()=>{}});p.onLoad({preview:'1'});assert.equal(previewCalled,0);assert.equal(p.preview,false);p.onUnload();assert.equal(disconnected,0);
});
test('real connection automatically opens the native control route only from the visible device list',async()=>{
 let listener;const urls=[],service={state:{connected:false,battery:null,mtu:null},onChange(fn){listener=fn;fn(this.state);return ()=>{};},stopScan:async()=>{}};const p=await controller(0,{service,isDevtools:false},{navigateTo:o=>{urls.push(o.url);o.complete?.();}});p.onLoad();p.onShow();listener({connected:true,device:{id:'A'},battery:null,mtu:23});assert.deepEqual(urls,['/pages/index/index']);p.onHide();listener({connected:false,battery:null,mtu:null});listener({connected:true,device:{id:'A'},battery:null,mtu:23});assert.equal(urls.length,1);
});
test('barcode auto-connect waits for a fresh exact broadcast and attempts only once',async()=>{
 const names={target:'YD-03148c52fb00',other:'YD-02ffffffff00'},calls=[],service={state:{connected:false,scanning:true,battery:null,mtu:null,devices:[{id:'cached',name:names.target,cached:true},{id:'other',name:names.other,cached:false}]},onChange(fn){fn(this.state);return ()=>{};},stopScan:async()=>{},connect:async id=>calls.push(id)};
 const p=await controller(0,{service,isDevtools:false},{navigateTo:()=>{}});p.onLoad();p.visible=true;p.setData({showScanner:true,scanTarget:names.target});p.tryBarcodeConnect();assert.equal(calls.length,0);service.state.devices.push({id:'exact',name:names.target,cached:false});p.tryBarcodeConnect();await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['exact']);p.tryBarcodeConnect();assert.equal(calls.length,1);
});

test('photo-only autosaved meals survive restart without counting as zero-calorie days',()=>{
 const f=fixture();f.store.saveMeal(meal({autoSaved:true,kcal:null,photos:['/user/food.jpg']}));
 const restored=new JournalStore(f.api);assert.equal(restored.error,'');assert.equal(restored.data.records[0].kcal,null);
 assert.equal(weekSummary(restored).average,null);assert.equal(weekSummary(restored).recordedDays,0);
 restored.saveMeal({...restored.data.records[0],kcal:0});assert.equal(weekSummary(restored).average,0);assert.equal(weekSummary(restored).recordedDays,1);
});
