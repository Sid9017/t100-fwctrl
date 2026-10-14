import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {JournalStore,MEALS,dayKey} from '../src/miniprogram/journal.js';
import {wxCall} from '../src/miniprogram/platform.js';
const source=await readFile('miniprogram/pages/record/index.js','utf8');
async function setup({hour=12,old,preview=false}={}){
 let definition,seq=0,now=new Date(2026,9,14,hour,12);const cache=new Map(),saved=[],removed=[],sent=[],captures=[];
 const api={env:{USER_DATA_PATH:'/user'},getStorageSync:k=>cache.get(k),setStorageSync:(k,v)=>cache.set(k,v),chooseMedia:o=>{captures.push(o);o.success({tempFiles:[{tempFilePath:'/temp/'+seq+'.jpg'}]});},getFileSystemManager:()=>({saveFile:o=>{saved.push(o.filePath);o.success({savedFilePath:o.filePath});},unlink:o=>{removed.push(o.filePath);o.success?.({});}})};
 const journal=new JournalStore(api);if(old)journal.saveMeal(old);
 const service={state:{connected:true,status:{flags:1},hasAuth:true,device:{id:'A'}},onChange:()=>()=>{},appendHistory:async o=>sent.push(o)};
 const app={service,getPreviewService:()=>service};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now.getTime()]));}static now(){return now.getTime();}}
 runInNewContext(source,{Page:p=>definition=p,Date:Clock,setTimeout,clearTimeout,wx:api,getApp:()=>app,getCurrentPages:()=>[],require:path=>path.includes('lib')?{MEALS,dayKey,wxCall,randomUuid:async()=>`00000000-0000-4000-8000-${String(++seq).padStart(12,'0')}`}:{isPreview:()=>preview,ensurePlan:()=>true,store:()=>journal,currentTheme:()=>3,errorText:e=>e.message||String(e)}});
 const page={...definition,createSelectorQuery(){return {select(){return this;},boundingClientRect(fn){fn({left:0,top:0,width:300,height:300});return this;},exec(){}};},data:structuredClone(definition.data),setData(p){for(const [key,value] of Object.entries(p)){const parts=key.split('.');let target=this.data;for(const k of parts.slice(0,-1))target=target[k];target[parts.at(-1)]=value;}}};await page.onLoad(old?{id:old.id}:{});
 return {page,api,journal,cache,saved,removed,sent,captures,setNow:v=>now=v};
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
 Object.assign(f.page.data.form,{name:'Lunch bowl',kcal:'480',weight:'230'});await f.page.save();
 assert.equal(new JournalStore(f.api).data.records[0].photos.length,5);f.page.onUnload();assert.equal(f.removed.length,0);
});
test('new record takes system time on save; edits keep that timestamp and send only first three photos',async()=>{
 const f=await setup();for(let i=0;i<5;i++)await f.page.choosePhoto();Object.assign(f.page.data.form,{name:'Lunch bowl',kcal:'480'});
 f.setNow(new Date(2026,9,15,0,3));await f.page.save();assert.equal(f.page.data.form.date,'2026-10-15');assert.equal(f.page.data.form.time,'00:03');const timestamp=f.page.data.form.timestampUtc;
 f.setNow(new Date(2026,9,16,12,0));f.page.edit();f.page.data.form.kcal='500';await f.page.save();assert.equal(f.page.data.form.timestampUtc,timestamp);
 await f.page.sync();assert.deepEqual(Array.from(f.sent[0].foodFiles),Array.from(f.page.data.form.photos.slice(0,3)));assert.equal(f.journal.data.records[0].photos.length,5);
});
test('cancel and storage failure leave photos intact; discarded or removed photos are cleaned up',async()=>{
 const f=await setup();await f.page.choosePhoto();const first=f.saved[0];
 f.api.chooseMedia=o=>o.fail({errMsg:'chooseMedia:fail cancel'});await f.page.choosePhoto();assert.equal(f.page.data.error,'');assert.equal(f.page.data.loading,false);assert.equal(f.page.data.form.photos.length,1);
 Object.assign(f.page.data.form,{name:'Food',kcal:100});await f.page.save();f.page.removePhoto({currentTarget:{dataset:{index:0}}});await new Promise(resolve=>setTimeout(resolve,240));
 const setter=f.api.setStorageSync;f.api.setStorageSync=()=>{throw new Error('Storage full');};await f.page.save();assert.equal(f.removed.length,0);assert.equal(f.journal.data.records[0].photos[0],first);
 f.api.setStorageSync=setter;await f.page.save();assert.ok(f.removed.includes(first));
});
test('preview photos never write or delete real photo files',async()=>{
 const f=await setup({preview:true});await f.page.choosePhoto();f.page.onUnload();assert.equal(f.saved.length,0);assert.equal(f.removed.length,0);
});
test('wheel rotation snaps only on release; short, radial, cancelled and multitouch gestures keep the meal',async()=>{
 const {page}=await setup({hour:12});
 const point=degrees=>({clientX:150+100*Math.cos(degrees*Math.PI/180),clientY:150+100*Math.sin(degrees*Math.PI/180)});
 const start=degrees=>page.skyTouchStart({touches:[point(degrees)]});
 const end=degrees=>page.skyTouchEnd({changedTouches:[point(degrees)]});
 start(-90);page.skyTouchMove({touches:[point(-30)]});assert.equal(page.data.form.meal,'Lunch');end(0);assert.equal(page.data.form.meal,'Dinner');
 start(-90);end(-80);assert.equal(page.data.form.meal,'Dinner');
 start(0);page.skyTouchEnd({changedTouches:[{clientX:280,clientY:150}]});assert.equal(page.data.form.meal,'Dinner');
 start(0);page.skyTouchCancel();end(90);assert.equal(page.data.form.meal,'Dinner');
 start(0);end(90);assert.equal(page.data.form.meal,'Snack');
 start(170);end(-160);assert.equal(page.data.form.meal,'Breakfast');
 start(-160);end(170);assert.equal(page.data.form.meal,'Snack');
 start(0);page.skyTouchMove({touches:[{},{}]});end(90);assert.equal(page.data.form.meal,'Snack');
 start(0);page.skyTouchMove({touches:[{clientX:150,clientY:150}]});end(90);assert.equal(page.data.form.meal,'Snack');page.onUnload();
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

test('photo selection pauses rotation and animated deletion keeps the selected photo aligned',async()=>{
 const f=await setup();for(let i=0;i<3;i++)await f.page.choosePhoto();
 const photos=Array.from(f.page.data.form.photos);
 assert.equal(f.page.data.selectedPhotoIndex,2);assert.equal(f.page.data.photoEditing,true);
 f.page.selectPhoto({currentTarget:{dataset:{index:1}}});assert.equal(f.page.data.selectedPhotoIndex,1);assert.equal(f.page.data.photoEditing,true);
 f.page.removePhoto({currentTarget:{dataset:{index:0}}});
 assert.equal(f.page.data.deletingPhotoIndex,0);assert.equal(f.page.data.form.photos.length,3);
 await f.page.save();assert.equal(f.page.data.summary,false);
 await new Promise(resolve=>setTimeout(resolve,240));
 assert.equal(f.page.data.deletingPhotoIndex,-1);assert.equal(f.page.data.selectedPhotoIndex,0);assert.equal(f.page.data.form.photos[0],photos[1]);
 f.page.skyTouchStart({touches:[{clientX:150,clientY:50}]});f.page.skyTouchEnd({changedTouches:[{clientX:150,clientY:50}]});assert.equal(f.page.data.photoEditing,false);
 f.page.onUnload();
});
