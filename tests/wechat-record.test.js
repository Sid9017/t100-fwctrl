import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {JournalStore,MEALS,dayKey} from '../src/miniprogram/journal.js';
import {createRequire} from 'node:module';
const requireLocal=createRequire(import.meta.url);
const dishHelpers=requireLocal('../miniprogram/utils/dish.js');
const wheelHelpers=requireLocal('../miniprogram/utils/meal-wheel.js');
const analysisHelpers=requireLocal('../miniprogram/utils/food-analysis.js');
import {wxCall} from '../src/miniprogram/platform.js';
const source=await readFile('miniprogram/pages/record/index.js','utf8');
async function setup({hour=12,old,preview=false,autoReturn=true,analyzeMeal=analysisHelpers.analyzeMeal,timers={setTimeout,clearTimeout}}={}){
 let definition,seq=0,now=new Date(2026,9,14,hour,12);const cache=new Map(),saved=[],removed=[],sent=[],captures=[],routes=[],editors=[];
 const api={env:{USER_DATA_PATH:'/user'},getStorageSync:k=>cache.get(k),setStorageSync:(k,v)=>cache.set(k,v),chooseMedia:o=>{captures.push(o);o.success({tempFiles:[{tempFilePath:'/temp/'+seq+'.jpg'}]});},getFileSystemManager:()=>({saveFile:o=>{saved.push(o.filePath);o.success({savedFilePath:o.filePath});},unlink:o=>{removed.push(o.filePath);o.success?.({});}})};
 const journal=new JournalStore(api);if(old)journal.saveMeal(old);
 const service={state:{connected:true,status:{flags:1},hasAuth:true,device:{id:'A'}},onChange:()=>()=>{},appendHistory:async o=>sent.push(o)};
 const app={service,getPreviewService:()=>service};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now.getTime()]));}static now(){return now.getTime();}}
 runInNewContext(source,{Page:p=>definition=p,Date:Clock,...timers,wx:api,getApp:()=>app,getCurrentPages:()=>[],require:path=>path.endsWith('/utils/meal-wheel')?wheelHelpers:path.endsWith('/utils/food-analysis')?{...analysisHelpers,analyzeMeal}:path.endsWith('/utils/dish')?dishHelpers:path.includes('lib')?{MEALS,dayKey:(date=new Clock())=>dayKey(date),wxCall,randomUuid:async()=>`00000000-0000-4000-8000-${String(++seq).padStart(12,'0')}`}:{isPreview:()=>preview,ensurePlan:()=>true,store:()=>journal,currentTheme:()=>3,route:(...args)=>{routes.push(args);},errorText:e=>e.message||String(e)}});
 const page={...definition,createSelectorQuery(){return {select(){return this;},boundingClientRect(fn){fn({left:0,top:0,width:300,height:300});return this;},exec(){}};},data:structuredClone(definition.data),setData(p,done){for(const [key,value] of Object.entries(p)){const parts=key.split('.');let target=this.data;for(const k of parts.slice(0,-1))target=target[k];target[parts.at(-1)]=value;}done?.();}};await page.onLoad(old?{id:old.id}:{});
 const open=page.openDish;page.openDish=function(index){open.call(this,index);editors.push({...this.data.dishEditor});if(autoReturn)this.dishEditorClosed();};
 return {page,api,journal,cache,saved,removed,sent,captures,routes,editors,setNow:v=>now=v};
}
test('meal defaults follow the clock and explicit meal selection updates the saved value',async()=>{
 for(const [hour,meal] of [[8,'Breakfast'],[12,'Lunch'],[18,'Dinner'],[22,'Snack']]){
  const {page}=await setup({hour});assert.equal(page.data.form.meal,meal);page.selectMeal({currentTarget:{dataset:{meal:'Breakfast'}}});assert.equal(page.data.form.meal,'Breakfast');
 }
});
test('camera persists up to five photos and reveals details, without allowing a sixth',async()=>{
 const f=await setup();for(let i=0;i<6;i++)await f.page.choosePhoto();
 assert.equal(f.captures.length,5);assert.equal(f.saved.length,5);assert.equal(f.page.data.form.photos.length,5);assert.equal(f.page.data.photoSlots.filter(s=>s.path).length,5);assert.equal(f.page.data.detailsOpen,true);
 assert.deepEqual(Array.from(f.captures[0].sourceType),['camera','album']);
 Object.assign(f.page.data.form,{name:'Lunch bowl',kcal:'480',weight:'230'});f.page.data.saved=false;await f.page.persistMeal();
 assert.equal(new JournalStore(f.api).data.records[0].photos.length,5);f.page.onUnload();assert.equal(f.removed.length,0);
});
test('first addition uses system time and autosaved edits keep it and all five photos',async()=>{
 const f=await setup();for(let i=0;i<5;i++)await f.page.choosePhoto();Object.assign(f.page.data.form,{name:'Lunch bowl',kcal:'480'});
 f.setNow(new Date(2026,9,15,0,3));f.page.data.saved=false;await f.page.persistMeal();assert.equal(f.page.data.form.date,'2026-10-14');assert.equal(f.page.data.form.time,'12:12');const timestamp=f.page.data.form.timestampUtc;
 f.setNow(new Date(2026,9,16,12,0));f.page.data.form.kcal='500';f.page.data.saved=false;await f.page.persistMeal();assert.equal(f.page.data.form.timestampUtc,timestamp);
 assert.equal(f.journal.data.records[0].photos.length,5);
});
test('cancel and failed autosave retain the saved photo until deletion can be persisted',async()=>{
 const f=await setup();await f.page.choosePhoto();const first=f.saved[0];
 f.api.chooseMedia=o=>o.fail({errMsg:'chooseMedia:fail cancel'});await f.page.choosePhoto();assert.equal(f.page.data.error,'');assert.equal(f.page.data.form.photos.length,1);
 const setter=f.api.setStorageSync;f.api.setStorageSync=()=>{throw new Error('Storage full');};
 f.page.removePhoto({currentTarget:{dataset:{index:0}}});await new Promise(resolve=>setTimeout(resolve,240));
 assert.equal(f.removed.length,0);assert.equal(f.journal.data.records[0].photos[0],first);assert.match(f.page.data.error,/Storage full/);
 f.api.setStorageSync=setter;f.page.persistMeal();assert.ok(f.removed.includes(first));
});
test('preview photos never write or delete real photo files',async()=>{
 const f=await setup({preview:true});await f.page.choosePhoto();f.page.onUnload();assert.equal(f.saved.length,0);assert.equal(f.removed.length,0);
});
test('title clicks cycle through every meal and restore only its own photos',async()=>{
 const {page}=await setup({hour:8});await page.choosePhoto();const breakfastPhoto=page.data.form.photos[0];
 for(const meal of ['Lunch','Dinner','Snack']){page.nextMeal();assert.equal(page.data.form.meal,meal);assert.equal(page.data.form.photos.length,0);}
 page.nextMeal();assert.equal(page.data.form.meal,'Breakfast');assert.equal(page.data.form.photos[0],breakfastPhoto);
 page.onUnload();
});

test('repeated camera taps open only one picker; errors unlock the next attempt',async()=>{
 const f=await setup();let options,calls=0;
 f.api.chooseMedia=o=>{options=o;calls++;};
 const pending=f.page.choosePhoto();await f.page.choosePhoto();assert.equal(calls,1);
 options.fail({errMsg:'chooseMedia:fail camera permission denied'});await pending;
 assert.match(f.page.data.error,/permission denied/);assert.equal(f.page.data.loading,false);
 f.api.chooseMedia=o=>{calls++;o.success({tempFiles:[{tempFilePath:'/temp/retry.jpg'}]});};
 await f.page.choosePhoto();assert.equal(calls,2);assert.equal(f.page.data.form.photos.length,1);assert.equal(f.page.data.error,'');
});

test('photo selection and animated deletion keep the selected photo aligned',async()=>{
 const f=await setup();for(let i=0;i<3;i++)await f.page.choosePhoto();
 const photos=Array.from(f.page.data.form.photos);
 assert.equal(f.page.data.selectedPhotoIndex,2);
 f.page.selectPhoto({currentTarget:{dataset:{index:1}}});assert.equal(f.page.data.selectedPhotoIndex,1);
 f.page.removePhoto({currentTarget:{dataset:{index:0}}});
 assert.equal(f.page.data.deletingPhotoIndex,0);assert.equal(f.page.data.form.photos.length,3);
 await f.page.persistMeal();assert.equal(f.page.data.summary,false);
 await new Promise(resolve=>setTimeout(resolve,240));
 assert.equal(f.page.data.deletingPhotoIndex,-1);assert.equal(f.page.data.selectedPhotoIndex,0);assert.equal(f.page.data.form.photos[0],photos[1]);
 f.page.nextMeal();
 f.page.onUnload();
});

test('photos and fields autosave separately for each meal and restore after reopening',async()=>{
 const f=await setup({hour:8}),p=f.page;
 assert.equal(f.journal.data.records.length,0);
 await p.choosePhoto();const breakfastId=p.data.form.id,photo=p.data.form.photos[0];
 assert.equal(f.journal.data.records[0].kcal,null);assert.equal(p.data.summary,false);
 p.field({currentTarget:{dataset:{field:'name'}},detail:{value:'Eggs'}});
 p.selectMeal({currentTarget:{dataset:{meal:'Snack'}}});assert.equal(p.data.form.photos.length,0);assert.equal(p.data.form.name,'');
 await p.choosePhoto();p.field({currentTarget:{dataset:{field:'kcal'}},detail:{value:'120'}});
 assert.equal(f.journal.data.records.length,2);assert.notEqual(p.data.form.id,breakfastId);
 p.selectMeal({currentTarget:{dataset:{meal:'Breakfast'}}});assert.equal(p.data.form.photos[0],photo);assert.equal(p.data.form.name,'Eggs');assert.equal(p.data.form.kcal,'');
 p.onUnload();assert.equal(f.removed.length,0);
 p.unloaded=false;await p.onLoad({});assert.equal(p.data.form.id,breakfastId);assert.equal(p.data.form.photos[0],photo);
 assert.equal(new JournalStore(f.api).data.records.length,2);
});
test('meal switching is locked during capture and deletion, and leaving completes deletion',async()=>{
 const f=await setup({hour:8});let capture;
 f.api.chooseMedia=o=>capture=o;const pending=f.page.choosePhoto();
 f.page.nextMeal();assert.equal(f.page.data.form.meal,'Breakfast');
 capture.success({tempFiles:[{tempFilePath:'/temp/food.jpg'}]});await pending;
 f.page.removePhoto({currentTarget:{dataset:{index:0}}});f.page.nextMeal();assert.equal(f.page.data.form.meal,'Breakfast');
 f.page.onUnload();assert.equal(f.journal.data.records.length,0);assert.equal(new Set(f.removed).size,1);
});
test('incomplete calories stay unknown and cannot be sent to the device',async()=>{
 const f=await setup();await f.page.choosePhoto();assert.equal(f.journal.data.records[0].kcal,null);assert.equal(f.sent.length,0);
});

const photoEvent=(page,index)=>({currentTarget:{dataset:{index,path:page.data.photoSlots[index].path}}});
test('photo entrance waits for image load and keeps loaded photos ready through addition and deletion',async()=>{
 const {page}=await setup();await page.choosePhoto();
 assert.equal(page.data.photoSlots[0].status,'loading');
 page.photoLoaded(photoEvent(page,0));assert.equal(page.data.photoSlots[0].status,'ready');
 await page.choosePhoto();assert.equal(page.data.photoSlots[0].status,'ready');assert.equal(page.data.photoSlots[1].status,'loading');
 page.photoLoaded(photoEvent(page,1));const second=page.data.photoSlots[1].path;
 page.removePhoto({currentTarget:{dataset:{index:0}}});page.finishPhotoRemoval();
 assert.equal(page.data.photoSlots[0].path,second);assert.equal(page.data.photoSlots[0].status,'ready');
 page.onUnload();
});
test('late image events cannot reveal another meal photo; failed images remain removable',async()=>{
 const {page}=await setup();await page.choosePhoto();const stale=photoEvent(page,0);
 page.nextMeal();await page.choosePhoto();page.photoLoaded(stale);page.photoFailed(stale);
 assert.equal(page.data.photoSlots[0].status,'loading');assert.equal(page.data.error,'');
 page.photoFailed(photoEvent(page,0));assert.equal(page.data.photoSlots[0].status,'failed');assert.match(page.data.error,/Could not load/);
 page.removePhoto({currentTarget:{dataset:{index:0}}});page.finishPhotoRemoval();assert.equal(page.data.form.photos.length,0);
 page.onUnload();page.photoLoaded(stale);assert.equal(page.data.photoSlots[0].status,'loading');
});

test('unsupported meal rating controls are absent while stored firmware metadata is retained',async()=>{
 const f=await setup({old:structuredClone(detailMeal)});assert.equal(f.page.rating,undefined);assert.equal(f.page.ratingTouchStart,undefined);assert.equal(f.journal.data.records[0].rating,4);
 const wxml=await readFile('miniprogram/pages/record/index.wxml','utf8');assert.doesNotMatch(wxml,/bindtap="rating"|catchtap="rating"|meal-rating/);f.page.onUnload();
});

test('capture and saved-photo selection use the same live weighing editor and returning refreshes totals',async()=>{
 const f=await setup();await f.page.choosePhoto();assert.equal(f.routes.length,0);assert.equal(f.editors[0].index,0);assert.equal(f.editors[0].id,f.page.data.form.id);
 const record=f.journal.data.records[0];f.journal.saveMeal({...record,dishes:[{photo:record.photos[0],name:'Eggs',weight:130,kcal:220}],weight:130,kcal:220});
 f.page.onShow();assert.equal(f.page.data.form.weight,130);assert.equal(f.page.data.form.kcal,220);
 f.page.selectPhoto({currentTarget:{dataset:{index:0}}});assert.equal(f.routes.length,0);assert.deepEqual(f.editors.at(-1),f.editors[0]);f.page.onUnload();
});

test('empty meals remain drafts even after field edits and leaving',async()=>{
 const f=await setup();
 f.page.field({currentTarget:{dataset:{field:'name'}},detail:{value:'Lunch'}});
 f.page.field({currentTarget:{dataset:{field:'kcal'}},detail:{value:'120'}});
 f.page.nextMeal();f.page.onUnload();
 assert.equal(f.journal.data.records.length,0);assert.equal(new JournalStore(f.api).data.records.length,0);
});
test('removing all five dishes deletes the meal, queues its device deletion and starts a fresh record',async()=>{
 const f=await setup();for(let i=0;i<5;i++)await f.page.choosePhoto();
 const id=f.page.data.form.id;f.journal.markSync(id,'A','sent');f.page.data.form.sync={A:'sent'};
 for(let left=4;left>=0;left--){
  f.page.removePhoto({currentTarget:{dataset:{index:0}}});f.page.finishPhotoRemoval();
  assert.equal(f.page.data.form.photos.length,left);
  assert.equal(f.journal.data.records.length,left?1:0);
 }
 assert.equal(f.page.data.saved,false);assert.equal(f.page.data.summary,false);assert.equal(f.page.data.editing,false);
 assert.equal(new JournalStore(f.api).data.records.length,0);
 assert.deepEqual(f.journal.data.deletions,[{id,deviceId:'A'}]);assert.equal(new Set(f.removed).size,5);
 await f.page.choosePhoto();assert.notEqual(f.page.data.form.id,id);assert.equal(f.journal.data.records.length,1);assert.equal(f.page.data.form.photos.length,1);f.page.onUnload();
});
test('opening a previously saved empty meal removes the entry and leaves an empty editable wheel',async()=>{
 const old={id:'10000000-0000-4000-8000-000000000001',meal:'Lunch',name:'Lunch',date:'2026-10-14',time:'12:00',rating:4,photos:[],dishes:[],autoSaved:true,kcal:null};
 const f=await setup({old});assert.equal(f.journal.data.records.length,0);assert.equal(f.page.data.summary,false);assert.equal(f.page.data.editing,false);await f.page.choosePhoto();assert.equal(f.journal.data.records.length,1);assert.notEqual(f.page.data.form.id,old.id);f.page.onUnload();
});

test('capture opens dish editor before revealing the new wheel photo, then restores it on return',async()=>{
 const f=await setup({autoReturn:false});await f.page.choosePhoto();
 assert.equal(f.routes.length,0);assert.equal(f.editors[0].index,0);assert.equal(f.editors[0].id,f.page.data.form.id);
 assert.equal(f.journal.data.records[0].photos.length,1);
 assert.equal(f.page.data.photoSlots.filter(s=>s.path).length,0);
 assert.equal(f.page.data.openingDish,true);
 f.page.onHide();f.page.onShow();assert.equal(f.page.data.openingDish,true);
 f.page.dishEditorClosed();
 assert.equal(f.page.data.openingDish,false);assert.equal(f.page.data.photoSlots[0].path,f.saved[0]);
 f.page.onUnload();assert.equal(f.removed.length,0);
});
test('the weighing sheet opens without navigation and pauses the wheel until dismissal',async()=>{
 const f=await setup({autoReturn:false}),p=f.page;p.onReady();assert.equal(p.wheelRunning,true);
 await p.choosePhoto();assert.equal(p.wheelRunning,false);assert.ok(p.data.dishEditor);assert.equal(f.routes.length,0);
 p.onShow();assert.equal(p.wheelRunning,false);p.dishEditorClosed();assert.equal(p.wheelRunning,true);assert.equal(p.data.dishEditor,null);p.onUnload();
});

test('failed photo persistence reveals the draft photo for recovery without navigating',async()=>{
 const f=await setup({autoReturn:false});f.api.setStorageSync=()=>{throw Error('Storage full');};
 await f.page.choosePhoto();assert.equal(f.routes.length,0);assert.match(f.page.data.error,/Storage full/);
 assert.equal(f.page.data.openingDish,false);assert.equal(f.page.data.photoSlots[0].path,f.saved[0]);
});

test('returning after discarding the final dish clears the wheel and never resurrects the deleted meal',async()=>{
 const f=await setup({autoReturn:false});await f.page.choosePhoto();const oldId=f.page.data.form.id;
 f.journal.removeMeal(oldId);f.page.dishEditorClosed();
 assert.equal(f.page.data.form.photos.length,0);assert.equal(f.page.data.photoSlots.filter(s=>s.path).length,0);assert.equal(f.page.data.saved,false);assert.ok(f.removed.includes(f.saved[0]));
 f.page.onHide();assert.equal(f.journal.data.records.length,0);
 await f.page.choosePhoto();assert.notEqual(f.page.data.form.id,oldId);assert.equal(f.journal.data.records.length,1);
});

const detailMeal={id:'00000000-0000-4000-8000-000000000099',name:'Lunch',meal:'Lunch',date:'2026-10-14',time:'12:29',rating:4,kcal:300,weight:200,photos:['/a.jpg','/b.jpg'],sync:{A:'sent'},dishes:[{photo:'/a.jpg',name:'A',weight:100,kcal:100,carbs:10,protein:5,fat:2,fiber:1,completed:true},{photo:'/b.jpg',name:'B',weight:100,kcal:200,carbs:20,protein:10,fat:4,fiber:2,completed:true}]};
const selectDetail=(page,index)=>page.selectPhoto({currentTarget:{dataset:{index}}});
const editNutrition=(page,key,value)=>page.nutritionField({currentTarget:{dataset:{field:key}},detail:{value}});
const analysisResult={name:'Updated',source:'mock',per100g:{kcal:160,carbs:18,protein:9,fat:5,fiber:2.4}};
test('detail displays server nutrition, retains UUID and deletes only the selected dish',async()=>{
 const f=await setup({old:structuredClone(detailMeal)}),p=f.page;selectDetail(p,0);assert.equal(p.data.selectedDish.photo,'/a.jpg');assert.equal(p.nutritionField,undefined);assert.equal(f.journal.data.records[0].id,detailMeal.id);
 p.removePhoto({currentTarget:{dataset:{index:0}}});p.finishPhotoRemoval();assert.equal(f.journal.data.records[0].kcal,200);assert.equal(p.data.selectedDish.photo,'/b.jpg');p.onUnload();
});

const batchResult=record=>({source:'service',mealSuggestion:'A balanced meal.',mealDishes:Object.fromEntries(record.photos.map((photo,index)=>[photo,{name:'Dish '+(index+1),source:'service',weightG:100,description:'Ingredients '+index,nutrition:{kcal:100+index*100,carbs:20,protein:10,fat:5,fiber:3}}]))});
test('one explicit request returns all five dishes and meal advice in one local write',async()=>{
 let calls=0,resolve,request;const f=await setup({analyzeMeal:args=>{calls++;request=args;return new Promise(r=>resolve=r);}}),p=f.page;
 for(let i=0;i<5;i++)await p.choosePhoto();assert.equal(calls,0);
 const pending=p.calculateMeal();await p.calculateMeal();assert.equal(calls,1);assert.equal(request.record.photos.length,5);assert.equal(p.data.analyzing,true);
 p.removePhoto({currentTarget:{dataset:{index:0}}});assert.equal(p.data.deletingPhotoIndex,-1);await p.choosePhoto();p.nextMeal();assert.equal(p.data.form.id,request.record.id);
 let writes=0;const off=f.journal.onChange(()=>writes++);resolve(batchResult(request.record));await pending;off();
 assert.equal(writes,1);const saved=f.journal.data.records[0];assert.equal(saved.kcal,1500);assert.equal(saved.dishes.length,5);assert.equal(saved.fiber,15);assert.equal(saved.mealAnalysis.text,'A balanced meal.');assert.equal(p.data.analyzing,false);assert.equal(p.data.analysisDirty,false);assert.ok(p.data.selectedDish.analysis);p.onUnload();
});
test('adding or deleting a photo clears old meal advice and permits a new batch',async()=>{
 let calls=0;const f=await setup({analyzeMeal:async({record})=>{calls++;return batchResult(record);}}),p=f.page;
 await p.choosePhoto();await p.calculateMeal();assert.equal(calls,1);
 await p.choosePhoto();assert.equal(calls,1);assert.equal(p.data.form.mealAnalysis,null);assert.equal(p.data.analysisDirty,true);
 await p.calculateMeal();assert.equal(calls,2);assert.equal(p.data.form.kcal,300);
 p.removePhoto({currentTarget:{dataset:{index:0}}});p.finishPhotoRemoval();assert.equal(p.data.form.mealAnalysis,null);assert.equal(p.data.analysisDirty,true);
 await p.calculateMeal();assert.equal(calls,3);assert.equal(p.data.form.kcal,100);p.onUnload();
});
test('batch failure retains previous results, stops loading, and allows retry',async()=>{
 let fail=true;const f=await setup({old:structuredClone(detailMeal),analyzeMeal:async({record})=>{if(fail)throw Error('No response');return batchResult(record);}}),p=f.page;
 await p.calculateMeal();assert.equal(p.data.analyzing,false);assert.match(p.data.analysisError,/No response/);assert.equal(f.journal.data.records[0].kcal,300);
 fail=false;await p.calculateMeal();assert.equal(p.data.analysisError,'');assert.equal(p.data.analyzing,false);assert.equal(f.journal.data.records[0].mealAnalysis.text,'A balanced meal.');p.onUnload();
});
test('a malformed member cannot partially replace meal results',async()=>{
 const f=await setup({old:structuredClone(detailMeal),analyzeMeal:async({record})=>{const result=batchResult(record);delete result.mealDishes['/b.jpg'];return result;}});
 await f.page.calculateMeal();assert.match(f.page.data.analysisError,/Invalid/);assert.equal(f.journal.data.records[0].kcal,300);assert.equal(f.journal.data.records[0].dishes[0].name,'A');f.page.onUnload();
});
test('removed or externally changed meals reject late responses without resurrection',async()=>{
 for(const action of ['delete','weight','owner','unload']){
  let resolve,request;const f=await setup({old:structuredClone(detailMeal),analyzeMeal:args=>{request=args;return new Promise(r=>resolve=r);}}),p=f.page;
  const pending=p.calculateMeal();
  if(action==='delete')f.journal.removeMeal(detailMeal.id);
  if(action==='weight'){const record=f.journal.data.records[0];f.journal.saveMeal({...record,dishes:record.dishes.map(d=>({...d,weight:150}))});}
  if(action==='owner')f.journal.switchOwner('another-user');
  if(action==='unload')p.onUnload();
  assert.equal(request.cancelled(),true);const saved=JSON.stringify(f.journal.data);resolve(batchResult(request.record));await pending;assert.equal(JSON.stringify(f.journal.data),saved);
  if(action!=='unload'){assert.equal(p.data.analyzing,false);p.onUnload();assert.equal(JSON.stringify(f.journal.data),saved);}
 }
});
test('failed storage retains the complete batch for retry without publishing partial values',async()=>{
 const f=await setup({old:structuredClone(detailMeal),analyzeMeal:async({record})=>batchResult(record)}),p=f.page;
 const setter=f.api.setStorageSync;f.api.setStorageSync=()=>{throw Error('Storage full');};await p.calculateMeal();assert.equal(f.journal.data.records[0].dishes[0].name,'A');assert.match(p.data.error,/Storage full/);assert.equal(p.data.analyzing,false);
 f.api.setStorageSync=setter;p.persistMeal();assert.equal(f.journal.data.records[0].dishes[0].name,'Dish 1');assert.equal(f.journal.data.records[0].mealAnalysis.text,'A balanced meal.');p.onUnload();
});
test('a correction submits its selected photo but applies the entire returned meal',async()=>{
 let request;const f=await setup({old:structuredClone(detailMeal),analyzeMeal:async args=>{request=args;return batchResult(args.record);}}),p=f.page;
 selectDetail(p,0);p.correctionField({detail:{value:'Rice without sauce'}});await p.recalculate();assert.equal(request.correction.photo,'/a.jpg');assert.equal(request.correction.text,'Rice without sauce');assert.equal(p.data.correction,'');assert.equal(f.journal.data.records[0].dishes[1].name,'Dish 2');p.onUnload();
});

test('leaving while a meal was deleted elsewhere cannot recreate it from the pending batch',async()=>{
 let resolve,request;const f=await setup({old:structuredClone(detailMeal),analyzeMeal:args=>{request=args;return new Promise(r=>resolve=r);}});
 const pending=f.page.calculateMeal();f.journal.removeMeal(detailMeal.id);f.page.onHide();f.page.onUnload();assert.equal(f.journal.data.records.length,0);
 resolve(batchResult(request.record));await pending;assert.equal(f.journal.data.records.length,0);
});
test('batch preview returns all five dish results and advice through the same atomic mapper',async()=>{
 const photos=Array.from({length:5},(_,i)=>'/preview-'+i+'.jpg'),record={photos,dishes:photos.map(photo=>({photo,name:'',weight:0}))};
 const result=await analysisHelpers.analyzeMeal({record,preview:true});const updated=analysisHelpers.applyMealAnalysis(record,result);
 assert.equal(updated.dishes.length,5);assert.ok(updated.dishes.every(d=>d.analysis.source==='mock'&&d.kcal>0));assert.match(updated.mealAnalysis.text,/Preview only/);assert.equal(updated.analysisSignature,analysisHelpers.mealInputSignature(updated));
});

test('photo flick triggers one batch in either direction, suppresses click-through and unlocks on completion',async()=>{
 for(const direction of [1,-1]){
  let calls=0,resolve,request;const f=await setup({analyzeMeal:args=>{calls++;request=args;return new Promise(r=>resolve=r);}}),p=f.page;await p.choosePhoto();
  const touch=(deg,time)=>({touches:[{clientX:150+100*Math.cos(deg*Math.PI/180),clientY:150+100*Math.sin(deg*Math.PI/180)}],timeStamp:time});
  p.wheelTouchStart(touch(0,1000));p.wheelTouchMove(touch(direction*30,1080));p.wheelTouchMove(touch(direction*60,1160));assert.equal(p.data.wheelArmed,true);
  p.wheelTouchEnd({timeStamp:1160});assert.equal(calls,1);assert.equal(p.wheelDirection,direction);assert.equal(p.data.analyzing,true);
  const routes=f.routes.length;p.selectPhoto({currentTarget:{dataset:{index:0}}});assert.equal(f.routes.length,routes);
  p.centerLongPress();assert.equal(calls,1);resolve(batchResult(request.record));await new Promise(r=>setTimeout(r,0));assert.equal(p.data.analyzing,false);assert.equal(p.wheelMotion.ramp.to,direction*wheelHelpers.BASE_SPEED);p.onUnload();
 }
});
test('cancelled and multi-touch gestures never submit; holding center submits without opening camera',async()=>{
 let calls=0;const f=await setup({analyzeMeal:async({record})=>{calls++;return batchResult(record);}}),p=f.page;await p.choosePhoto();
 const start={touches:[{clientX:250,clientY:150}],timeStamp:1000};p.wheelTouchStart(start);p.wheelTouchMove({touches:[{},{}],timeStamp:1100});p.wheelTouchEnd({timeStamp:1150});assert.equal(calls,0);
 p.wheelTouchStart(start);p.cancelWheelDrag();p.wheelTouchEnd({timeStamp:1150});assert.equal(calls,0);
 const captures=f.captures.length;p.centerLongPress();p.centerTap();assert.equal(calls,1);assert.equal(f.captures.length,captures);await new Promise(r=>setTimeout(r,0));p.onUnload();
});

test('a single view angle drives rotation without requiring native animation and pauses on hide',async()=>{
 const timers=animationClock(),f=await setup({timers}),p=f.page;await p.choosePhoto();p.onReady();assert.equal(timers.size,1);
 const started=new Date(2026,9,14,12,12).getTime();f.setNow(new Date(started+1000));timers.step(32);assert.equal(p.data.orbitAngle,7.5);assert.equal(timers.size,1);
 p.renderWheel();assert.equal(timers.size,1);p.onHide();assert.equal(p.wheelRunning,false);assert.equal(timers.size,0);assert.equal(p.data.wheelFrozen,true);p.onUnload();
});

function animationClock(){
 let nextId=0;const pending=new Map();
 return {setTimeout(fn,delay){const id=++nextId;pending.set(id,{fn,delay});return id;},clearTimeout(id){pending.delete(id);},step(delay){const [id,timer]=pending.entries().next().value||[];assert.ok(timer,'animation timer is scheduled');assert.equal(timer.delay,delay);pending.delete(id);timer.fn();},get size(){return pending.size;}};
}
test('center shrinks and fades before swapping icons, then expands in both directions',async()=>{
 const timers=animationClock();let finish,request;
 const {page:p}=await setup({old:structuredClone(detailMeal),timers,analyzeMeal:args=>{request=args;return new Promise(resolve=>finish=resolve);}});
 const work=p.calculateMeal();assert.equal(p.data.centerMode,'camera');assert.equal(p.data.centerPhase,'shrinking');
 timers.step(200);assert.equal(p.data.centerMode,'analysis');assert.equal(p.data.centerPhase,'expanding');
 timers.step(260);assert.equal(p.data.centerPhase,'idle');assert.equal(p.data.analyzing,true);
 finish(batchResult(request.record));await work;assert.equal(p.data.centerMode,'analysis');assert.equal(p.data.centerPhase,'shrinking');
 timers.step(200);assert.equal(p.data.centerMode,'camera');assert.equal(p.data.centerPhase,'expanding');
 timers.step(260);assert.equal(p.data.centerPhase,'idle');assert.equal(timers.size,0);p.onUnload();
});
test('fast analysis completion queues the reverse animation and hiding cancels pending callbacks',async()=>{
 const timers=animationClock();const {page:p}=await setup({old:structuredClone(detailMeal),timers,analyzeMeal:async({record})=>batchResult(record)});
 await p.calculateMeal();assert.equal(p.data.analyzing,false);assert.equal(p.data.centerPhase,'shrinking');
 timers.step(200);assert.equal(p.data.centerMode,'analysis');timers.step(260);assert.equal(p.data.centerPhase,'shrinking');
 timers.step(200);assert.equal(p.data.centerMode,'camera');timers.step(260);assert.equal(timers.size,0);
 p.transitionCenter('analysis');p.onHide();assert.equal(timers.size,0);assert.equal(p.data.centerPhase,'idle');assert.equal(p.data.centerMode,'camera');
 p.onShow();p.transitionCenter('analysis');p.onUnload();assert.equal(timers.size,0);
});

test('analysis visibly accelerates the shared angle then slows continuously in both directions',async()=>{
 for(const direction of [1,-1]){
  let finish,request;const f=await setup({old:structuredClone(detailMeal),analyzeMeal:args=>{request=args;return new Promise(resolve=>finish=resolve);}}),p=f.page;
  const started=new Date(2026,9,14,12,12).getTime();p.wheelDirection=direction;p.onReady();p.wheelMotion.target(direction*wheelHelpers.BASE_SPEED,started,0);
  const work=p.calculateMeal();
  f.setNow(new Date(started+800));p.renderWheel();assert.equal(p.wheelMotion.speed,direction*180);const fastStart=p.data.orbitAngle;
  f.setNow(new Date(started+2800));p.renderWheel();assert.ok(Math.abs(p.data.orbitAngle-fastStart-direction*360)<1e-6);
  const angle=p.data.orbitAngle;finish(batchResult(request.record));await work;assert.equal(p.data.orbitAngle,angle);assert.equal(p.wheelMotion.ramp.duration,2.4);
  let lastAngle=angle,lastSpeed=180;
  for(let elapsed=100;elapsed<=2400;elapsed+=100){
   f.setNow(new Date(started+2800+elapsed));p.renderWheel();assert.equal(Math.sign(p.data.orbitAngle-lastAngle),direction);assert.ok(Math.abs(p.wheelMotion.speed)<=lastSpeed);lastAngle=p.data.orbitAngle;lastSpeed=Math.abs(p.wheelMotion.speed);
  }
  assert.equal(lastSpeed,wheelHelpers.BASE_SPEED);p.onUnload();
 }
});

test('journal meals open the shared wheel with a locked meal and unchanged saved time',async()=>{
 const f=await setup({old:structuredClone(detailMeal)}),p=f.page;
 assert.equal(p.data.summary,false);assert.equal(p.data.mealLocked,true);assert.equal(p.data.form.time,'12:29');assert.equal(p.data.photoSlots.filter(s=>s.path).length,2);
 p.nextMeal();p.selectMeal({currentTarget:{dataset:{meal:'Dinner'}}});assert.equal(p.data.form.id,detailMeal.id);assert.equal(p.data.form.meal,'Lunch');p.onUnload();
 const fresh=await setup();assert.equal(fresh.page.data.mealLocked,false);fresh.page.nextMeal();assert.equal(fresh.page.data.form.meal,'Dinner');fresh.page.onUnload();
});
