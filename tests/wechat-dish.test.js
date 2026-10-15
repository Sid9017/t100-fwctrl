import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
import {JournalStore} from '../src/miniprogram/journal.js';
const helpers=createRequire(import.meta.url)('../miniprogram/utils/dish.js');
const foodAnalysis=createRequire(import.meta.url)('../miniprogram/utils/food-analysis.js');
const id='00000000-0000-4000-8000-000000000001';
async function setup({sheet=false,live=true,photo=0,record={},analyzeFood=()=>new Promise(()=>{})}={}){
 const cache=new Map();let back=0,definition,callback;const sent=[];
 const api={getStorageSync:k=>cache.get(k),setStorageSync:(k,v)=>cache.set(k,v),navigateBack:()=>back++};
 const journal=new JournalStore(api);journal.saveMeal({id,name:'Dinner',meal:'Dinner',date:'2026-10-15',time:'19:00',weight:null,kcal:null,autoSaved:true,rating:4,photos:['/food.jpg','/soup.jpg'],...record});
 const service={state:{connected:true,hasAuth:true,status:{flags:1},reading:{version:3,profile:3,unit:0,mainValid:true,value:362000,lower:{kind:2,valid:true,value:482000},upper:{kind:1,valid:true,value:120000}}},onChange(fn){callback=fn;fn(this.state);return ()=>callback=null;},setContainer:async(g,u)=>sent.push([g,u])};
 runInNewContext(await readFile('miniprogram/pages/dish/controller.js','utf8'),{module:{set exports(value){definition=value;}},getApp:()=>({service}),wx:api,setTimeout,clearTimeout,require:p=>p.endsWith('/food-analysis')?{...foodAnalysis,analyzeFood}:p.endsWith('/dish')?helpers:{isPreview:()=>false,ensurePlan:()=>true,store:()=>journal,currentTheme:s=>s?.reading?.profile??3,errorText:e=>e.message}});
 if(!live)service.state.connected=false;
 let sheetDefinition;
 if(sheet)runInNewContext(await readFile('miniprogram/components/dish-editor/index.js','utf8'),{Component:c=>sheetDefinition=c,require:()=>definition,setTimeout,clearTimeout});
 const p={...(sheet?sheetDefinition.methods:definition),properties:{recordId:id,photoIndex:photo,demo:false},data:structuredClone(sheet?sheetDefinition.data:definition.data),setData(patch){Object.assign(this.data,patch);},triggerEvent(name){if(name==='close')back++;}};
 if(sheet){sheetDefinition.lifetimes.attached.call(p);sheetDefinition.lifetimes.ready.call(p);p.onUnload=()=>sheetDefinition.lifetimes.detached.call(p);p.onHide=()=>sheetDefinition.pageLifetimes.hide.call(p);p.onShow=()=>sheetDefinition.pageLifetimes.show.call(p);}
 else {p.onLoad({id,photo:String(photo),live:live?'1':'0'});p.onReady();}
 return {p,journal,api,service,sent,get back(){return back;},update(patch){service.state={...service.state,...patch};callback?.(service.state);}};
}
test('gross uses canonical mg, avoids double subtraction, and rejects overload and coffee readings',()=>{
 const reading={version:3,profile:3,mainValid:true,unit:1,value:1277,lower:{kind:2,valid:true,value:482000},upper:{kind:1,valid:true,value:120000}};
 assert.equal(helpers.grossGrams({connected:true,reading}),482);
 assert.equal(helpers.grossGrams({connected:false,reading}),null);
 assert.equal(helpers.grossGrams({connected:true,reading:{...reading,overload:true}}),null);
 assert.equal(helpers.grossGrams({connected:true,reading:{...reading,profile:1}}),null);
 assert.ok(Math.abs(helpers.grossGrams({connected:true,reading:{unit:1,value:100}})-28.349523125)<1e-9);
});
test('live weight follows scale and chosen container; manual weight remains stable until resumed',async()=>{
 const f=await setup({analyzeFood:async()=>sample});await settle();assert.equal(f.p.data.weight,'482.0');
 await f.p.containerSelected({detail:{container:{id:'plate',name:'Plate',grams:120}}});assert.equal(f.p.data.weight,'362.0');assert.deepEqual(f.sent,[[120,'plate']]);
 f.p.field({currentTarget:{dataset:{field:'weight'}},detail:{value:'350'}});f.update({reading:{...f.service.state.reading,lower:{kind:2,valid:true,value:600000}}});assert.equal(f.p.data.weight,'350');
 f.p.resumeLive();assert.equal(f.p.data.weight,'480.0');f.p.done();assert.equal(f.back,1);
 f.update({reading:{...f.service.state.reading,lower:{kind:2,valid:true,value:900000}}});assert.equal(f.p.data.weight,'480.0');f.p.onUnload();
});
test('legacy values cannot be manually edited; only server analysis can replace them',async()=>{
 const f=await setup({live:false,record:{dishes:[{photo:'/food.jpg',name:'Chicken',weight:350,kcal:420},{photo:'/soup.jpg',name:'Soup',weight:200,kcal:80}]}});
 const before=JSON.stringify(f.journal.data);f.p.field({currentTarget:{dataset:{field:'kcal'}},detail:{value:'999'}});f.p.field({currentTarget:{dataset:{field:'name'}},detail:{value:'Manual'}});
 assert.equal(JSON.stringify(f.journal.data),before);assert.equal(f.p.data.name,'Chicken');f.p.onUnload();
});
test('container modal pauses readings, offline selection stays local, and reconnect syncs selection',async()=>{
 const f=await setup();f.p.containerEditor({detail:{open:true}});f.update({reading:{...f.service.state.reading,lower:{kind:2,valid:true,value:120000}}});assert.equal(f.p.data.weight,'482.0');
 f.update({connected:false});await f.p.containerSelected({detail:{container:{id:'bowl',name:'Bowl',grams:100}}});assert.equal(f.sent.length,0);
 f.p.containerEditor({detail:{open:false}});assert.equal(f.p.data.weight,'482.0');
 f.update({connected:true});await new Promise(r=>setTimeout(r,0));assert.deepEqual(f.sent,[[100,'bowl']]);assert.equal(f.p.data.weight,'20.0');f.p.onUnload();
});
test('failed storage blocks Done and preserves draft, hidden pages stop taking live updates',async()=>{
 const f=await setup({analyzeFood:async()=>sample});await settle();f.api.setStorageSync=()=>{throw Error('Storage full');};f.p.done();assert.equal(f.back,0);assert.match(f.p.data.error,/Storage full/);
 f.p.onHide();const weight=f.p.data.weight;f.update({reading:{...f.service.state.reading,value:0,lower:{kind:2,valid:true,value:0}}});assert.equal(f.p.data.weight,weight);f.p.onUnload();
});
test('legacy totals migrate once and photo deletion excludes only the removed dish',()=>{
 const dishes=helpers.dishesFor({photos:['a','b'],weight:200,kcal:300});assert.equal(dishes[0].kcal,300);assert.equal(dishes[1].kcal,'');
 const later=helpers.dishesFor({photos:['b'],dishes:[{photo:'a',weight:200,kcal:300},{photo:'b',weight:100,kcal:80}]});assert.deepEqual(helpers.totals(later),{weight:100,kcal:80,carbs:null,protein:null,fat:null,fiber:null});
});
const sample={name:'Sample dish',source:'mock',per100g:{kcal:160,carbs:18,protein:9,fat:5,fiber:2.4}};
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
test('reopening discards obsolete numeric overrides and does not scale server results locally',async()=>{
 const analysis={name:'Rice',source:'service',nutrition:{kcal:200,carbs:45,protein:9,fat:5,fiber:2.4},weightG:100};
 const f=await setup({live:false,record:{photos:['/food.jpg'],dishes:[{photo:'/food.jpg',name:'Manual',weight:100,kcal:999,carbs:99,analysis,manual:{kcal:true,name:true}}]}});
 assert.equal(f.p.data.name,'Rice');f.p.field({currentTarget:{dataset:{field:'weight'}},detail:{value:'200'}});
 assert.equal(f.p.data.kcal,200);assert.equal(f.p.data.fat,5);f.p.onUnload();
});
test('native scale display keeps live gross and signed net separate from editable meal grams',async()=>{
 const f=await setup();await f.p.containerSelected({detail:{container:{id:'plate',name:'Plate',grams:500}}});
 assert.equal(f.p.data.gross,482);assert.equal(f.p.data.scaleWeight,-18);assert.equal(f.p.data.weight,'0.0');assert.deepEqual(f.sent,[[500,'plate']]);
 f.p.pauseLive();f.p.scaleInput({detail:{value:70.8738078125}});f.update({reading:{...f.service.state.reading,lower:{kind:2,valid:true,value:900000}}});
 assert.equal(f.p.data.gross,900);assert.equal(f.p.data.scaleWeight,70.873808);assert.equal(f.p.data.weight,'70.873808');
 assert.deepEqual(f.sent,[[500,'plate']]);f.p.onUnload();
});


test('capture and close save weight and container without starting analysis or fabricating nutrition',async()=>{
 let calls=0;const f=await setup({record:{photos:['/food.jpg']},analyzeFood:async()=>{calls++;return sample;}});
 await f.p.containerSelected({detail:{container:{id:'plate',name:'Plate',grams:120}}});
 assert.equal(calls,0);assert.equal(f.p.data.closeReady,true);f.p.done();assert.equal(f.back,1);
 const saved=f.journal.data.records[0];assert.equal(saved.weight,362);assert.equal(saved.kcal,null);assert.equal(saved.dishes[0].container.id,'plate');assert.equal(saved.dishes[0].completed,true);
 f.p.onUnload();assert.equal(calls,0);
});
test('invalid weights block close and a valid weight permits close without nutrition',async()=>{
 const f=await setup();f.p.field({currentTarget:{dataset:{field:'weight'}},detail:{value:'2000'}});f.p.done();assert.equal(f.back,0);assert.match(f.p.data.error,/1999/);
 f.p.field({currentTarget:{dataset:{field:'weight'}},detail:{value:''}});f.p.done();assert.equal(f.back,0);
 f.p.field({currentTarget:{dataset:{field:'weight'}},detail:{value:'0'}});f.p.done();assert.equal(f.back,1);f.p.onUnload();
});
test('changing analyzed net weight invalidates nutrition and meal advice without an automatic request',async()=>{
 let calls=0;const analysis={name:'Rice',source:'service',nutrition:{kcal:200,carbs:30,protein:5,fat:2,fiber:1},weightG:100};
 const f=await setup({live:false,record:{photos:['/food.jpg'],mealAnalysis:{text:'Old advice'},dishes:[{photo:'/food.jpg',name:'Rice',weight:100,kcal:200,analysis}]},analyzeFood:async()=>{calls++;return sample;}});
 f.p.scaleInput({detail:{value:150}});f.p.done();assert.equal(f.back,1);assert.equal(calls,0);
 const record=f.journal.data.records[0];assert.equal(record.kcal,null);assert.equal(record.dishes[0].analysis,null);assert.equal(record.mealAnalysis,null);f.p.onUnload();
});
test('weighing editor contains no nutrition, recalculation or pending-analysis close confirmation',async()=>{
 const markup=await readFile('miniprogram/pages/dish/index.wxml','utf8');assert.doesNotMatch(markup,/nutrition-editor|Recalculate|dish-confirm|is-spinning/);
});

test('reopening a saved zero-weight dish starts live weighing without a special route flag',async()=>{
 const f=await setup({live:false,record:{photos:['/food.jpg'],dishes:[{photo:'/food.jpg',name:'Dish',weight:0,kcal:null,completed:true}]}});
 // The old entry omitted live=1; reconnecting now immediately uses the subscribed scale state.
 assert.equal(f.p.data.live,true);assert.equal(f.p.data.weight,0);
 f.update({connected:true});assert.equal(f.p.data.weight,'482.0');
 f.update({reading:{...f.service.state.reading,lower:{kind:2,valid:true,value:650000}}});assert.equal(f.p.data.weight,'650.0');
 f.p.onHide();f.update({reading:{...f.service.state.reading,lower:{kind:2,valid:true,value:720000}}});assert.equal(f.p.data.weight,'650.0');
 f.p.onShow();assert.equal(f.p.data.weight,'720.0');f.p.onUnload();
});
test('manual entry pauses live overwrites, and reentering the editor resumes scale readings',async()=>{
 const f=await setup();f.p.scaleInput({detail:{value:150}});f.update({reading:{...f.service.state.reading,lower:{kind:2,valid:true,value:900000}}});assert.equal(f.p.data.weight,'150');assert.equal(f.p.data.live,false);
 f.p.done();f.p.onUnload();
 const next=await setup({record:structuredClone(f.journal.data.records[0])});assert.equal(next.p.data.live,true);assert.equal(next.p.data.weight,'482.0');next.p.onUnload();
});

test('bottom sheet saves before sliding down and emits close once without navigating',async()=>{
 const f=await setup({sheet:true});assert.equal(f.p.data.sheetPhase,'entering');f.p.finishEntrance();assert.equal(f.p.data.sheetPhase,'open');
 f.p.field({currentTarget:{dataset:{field:'weight'}},detail:{value:'125'}});
 f.api.navigateBack=()=>assert.fail('an embedded editor must not pop the meal page');
 f.p.done();assert.equal(f.p.data.sheetPhase,'closing');assert.equal(f.back,0);assert.equal(f.journal.data.records[0].dishes[0].weight,125);
 f.update({reading:{...f.service.state.reading,lower:{kind:2,valid:true,value:900000}}});assert.equal(f.p.data.weight,'125');
 f.p.sheetAnimationEnd({target:{id:'dish-sheet'}});assert.equal(f.back,1);f.p.notifyClosed();assert.equal(f.back,1);f.p.onUnload();
});
test('sheet stays open on validation or storage errors and ignores backdrop close during container editing',async()=>{
 const f=await setup({sheet:true});f.p.finishEntrance();
 f.p.containerEditor({detail:{open:true}});f.p.done();assert.equal(f.p.data.sheetPhase,'open');
 f.p.containerEditor({detail:{open:false}});f.p.field({currentTarget:{dataset:{field:'weight'}},detail:{value:'3000'}});f.p.done();assert.equal(f.p.data.sheetPhase,'open');assert.equal(f.back,0);
 f.p.field({currentTarget:{dataset:{field:'weight'}},detail:{value:'100'}});f.api.setStorageSync=()=>{throw Error('Storage full');};f.p.done();assert.equal(f.p.data.sheetPhase,'open');assert.match(f.p.data.error,/Storage full/);f.p.onUnload();
});
