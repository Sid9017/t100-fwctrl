import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {JournalStore} from '../src/miniprogram/journal.js';
import {wxCall} from '../src/miniprogram/platform.js';
async function fixture(){
 const cache=new Map(),files=[],removed=[];let seq=0;
 const api={env:{USER_DATA_PATH:'/user'},getStorageSync:k=>cache.get(k),setStorageSync:(k,v)=>cache.set(k,v),chooseMedia:o=>o.success({tempFiles:[{tempFilePath:'/temp/bowl.jpg'}]}),getFileSystemManager:()=>({saveFile:o=>{files.push(o.filePath);o.success({savedFilePath:o.filePath});},unlink:o=>{removed.push(o.filePath);}})};
 const journal=new JournalStore(api);let definition;const source=await readFile('miniprogram/components/container-control/index.js','utf8');
 const base={data:{containerLibrary:[],showContainers:false,working:false,form:{container:''}},onUnload(){this.unloaded=true;},patchData(p){this.setData(p);}};
 runInNewContext(source,{Component:d=>definition=d,getApp:()=>({journalFor:()=>journal}),wx:api,require:path=>path.includes('lib/t100')?{wxCall,randomUuid:async()=> '00000000-0000-4000-8000-'+String(++seq).padStart(12,'0')}:()=>base,Date,setTimeout,clearTimeout});
 const c={...definition.methods,data:structuredClone(definition.data),setData(p){for(const [key,value] of Object.entries(p)){const parts=key.split('.');let obj=this.data;for(const part of parts.slice(0,-1))obj=obj[part];obj[parts.at(-1)]=value;}}};
 return {c,definition,journal,api,files,removed};
}
test('containers save locally while disconnected or busy, without sending a device command',async()=>{
 const {c,journal}=await fixture();let sent=0;c.service={setContainer:async()=>{sent++;}};
 Object.assign(c.data,{canControl:false,busy:true,profile:3,containerName:'Bowl',containerPhoto:'/temp/bowl.jpg',form:{container:'150'},showContainers:true});
 await c.saveContainer();assert.equal(journal.data.containers[0].grams,150);assert.equal(sent,0);assert.equal(c.data.showContainers,false);assert.equal(c.data.working,false);
 c.openContainers();Object.assign(c.data,{canControl:true,busy:false,containerName:'Plate',containerPhoto:'/temp/plate.jpg',form:{container:'220'}});
 await c.saveContainer();assert.equal(sent,1);assert.equal(journal.data.containers[1].name,'Plate');
});

test('live scale readings fill weight until manual editing, and acknowledgements never overwrite it',async()=>{
 const {c}=await fixture();Object.assign(c.data,{connected:true,reading:{version:2,mainValid:true,value:150000,unit:0}});
 c.openContainers();assert.equal(c.data.form.container,'150.0');
 c.data.reading.value=175500;c.updateContainerWeight();assert.equal(c.data.form.container,'175.5');
 c.containerWeightInput({detail:{value:'123.4'}});c.data.reading.value=999000;c.updateContainerWeight();
 c.patchData({'form.container':'999',containerState:{mg:999000}});assert.equal(c.data.form.container,'123.4');
 c.closeContainers();c.openContainers();assert.equal(c.data.form.container,'999.0');
 c.data.reading={version:2,mainValid:true,value:100,unit:1};c.updateContainerWeight();assert.equal(c.data.form.container,'28.3');
 c.data.reading.overload=true;c.updateContainerWeight();assert.equal(c.data.form.container,'');
 c.data.connected=false;c.updateContainerWeight();assert.equal(c.data.form.container,'');
});
test('photo, name and weight persist together under a UUID and restore after restarting',async()=>{
 const {c,journal,api,files}=await fixture();c.openContainers();await c.chooseContainerPhoto();assert.equal(c.data.containerPhoto,'/temp/bowl.jpg');
 c.data.containerName='Rice bowl';c.containerWeightInput({detail:{value:'180.5'}});await c.saveContainer();
 const saved=journal.data.containers[0];assert.match(saved.id,/^00000000-0000-4000-8000-/);assert.equal(saved.photo,files[0]);assert.equal(saved.grams,180.5);assert.equal(saved.name,'Rice bowl');
 assert.deepEqual(new JournalStore(api).data.containers[0],saved);
});
test('failed storage removes the copied photo and keeps the draft for retry',async()=>{
 const {c,journal,files,removed}=await fixture();c.openContainers();Object.assign(c.data,{containerPhoto:'/temp/bowl.jpg',containerName:'Bowl'});c.containerWeightInput({detail:{value:'120'}});
 journal.saveContainer=()=>{throw new Error('Storage full');};await c.saveContainer();
 assert.equal(c.data.error,'Storage full');assert.equal(c.data.showContainers,true);assert.equal(c.data.containerPhoto,'/temp/bowl.jpg');assert.deepEqual(removed,files);assert.equal(c.data.working,false);
});
test('photo cancellation and a late capture after dismissal cannot change another draft',async()=>{
 const {c,api}=await fixture();c.openContainers();c.data.containerPhoto='/temp/original.jpg';api.chooseMedia=o=>o.fail({errMsg:'chooseMedia:fail cancel'});await c.chooseContainerPhoto();assert.equal(c.data.containerPhoto,'/temp/original.jpg');assert.equal(c.data.error,'');
 let finish;api.chooseMedia=o=>{finish=o.success;};const pending=c.chooseContainerPhoto();c.closeContainers();c.openContainers();finish({tempFiles:[{tempFilePath:'/temp/late.jpg'}]});await pending;assert.equal(c.data.containerPhoto,'');assert.equal(c.data.photoBusy,false);
 c.containerWeightInput({detail:{value:'120'}});await c.saveContainer();assert.match(c.data.error,/photo/);
});

test('blank names use the first unused Container number and preserve explicit names',async()=>{
 const {c,journal}=await fixture();journal.saveContainer({id:'existing',name:'Container 1',grams:100,photo:'/photo.jpg'});
 c.openContainers();assert.equal(c.data.defaultContainerName,'Container 2');
 Object.assign(c.data,{containerPhoto:'/temp/bowl.jpg',containerName:'   '});c.containerWeightInput({detail:{value:'150'}});await c.saveContainer();assert.equal(journal.data.containers.at(-1).name,'Container 2');
 c.openContainers();assert.equal(c.data.defaultContainerName,'Container 3');
 Object.assign(c.data,{containerPhoto:'/temp/plate.jpg',containerName:'  Lunch plate  '});c.containerWeightInput({detail:{value:'200'}});await c.saveContainer();assert.equal(journal.data.containers.at(-1).name,'Lunch plate');
});

test('saved containers open offline, retain their weight and UUID, and reuse unchanged photos',async()=>{
 const {c,journal,files}=await fixture();const item={id:'saved',name:'Bowl',grams:120,photo:'/user/kcalack-container-original.jpg'};journal.saveContainer(item);
 Object.assign(c.data,{connected:true,reading:{value:999000,unit:0}});
 c.editContainer({currentTarget:{dataset:{id:'saved'}}});c.updateContainerWeight();
 assert.equal(c.data.containerName,'Bowl');assert.equal(c.data.containerPhoto,item.photo);assert.equal(c.data.form.container,'120');
 c.data.containerName='Soup bowl';c.containerWeightInput({detail:{value:'140'}});await c.saveContainer();
 assert.equal(journal.data.containers.length,1);assert.equal(journal.data.containers[0].id,'saved');assert.equal(journal.data.containers[0].grams,140);assert.equal(journal.data.containers[0].name,'Soup bowl');assert.equal(files.length,0);
 c.openContainers();assert.equal(c.data.editingContainerId,'');assert.equal(c.data.weightManual,false);
});

test('editing photos is atomic on storage failure and cleans the previous file only after save',async()=>{
 const {c,journal,files,removed}=await fixture();const photo='/user/kcalack-container-original.jpg';journal.saveContainer({id:'saved',name:'Bowl',grams:120,photo});
 c.editContainer({currentTarget:{dataset:{id:'saved'}}});c.data.containerPhoto='/temp/replacement.jpg';
 const save=journal.saveContainer.bind(journal);journal.saveContainer=()=>{throw new Error('Storage full');};await c.saveContainer();
 assert.equal(journal.data.containers[0].photo,photo);assert.deepEqual(removed,[files[0]]);assert.notEqual(files[0],photo);
 journal.saveContainer=save;await c.saveContainer();assert.equal(journal.data.containers[0].id,'saved');assert.equal(journal.data.containers[0].photo,files[1]);assert.ok(removed.includes(photo));
});

test('delete immediately removes the offline record and stored photo without confirmation',async()=>{
 const {c,journal,api,removed}=await fixture();const photo='/user/kcalack-container-original.jpg';journal.saveContainer({id:'saved',name:'Bowl',grams:120,photo});
 c.editContainer({currentTarget:{dataset:{id:'saved'}}});api.showModal=()=>{throw new Error('Unexpected confirmation');};await c.deleteContainer();
 assert.equal(journal.data.containers.length,0);assert.equal(c.data.showContainers,false);assert.deepEqual(removed,[photo]);assert.equal(new JournalStore(api).data.containers.length,0);
});

test('failed deletion preserves the record/photo and deleting an active connected container clears tare',async()=>{
 const {c,journal,api,removed}=await fixture();const photo='/user/kcalack-container-original.jpg';journal.saveContainer({id:'saved',name:'Bowl',grams:120,photo});
 c.editContainer({currentTarget:{dataset:{id:'saved'}}});api.showModal=o=>o.success({confirm:true});
 const remove=journal.removeContainer.bind(journal);journal.removeContainer=()=>{throw new Error('Storage full');};await c.deleteContainer();
 assert.equal(journal.data.containers.length,1);assert.equal(removed.length,0);assert.equal(c.data.showContainers,true);assert.equal(c.data.error,'Storage full');
 journal.removeContainer=remove;Object.assign(c.data,{canControl:true,profile:3,containerState:{uuid:'saved'}});const commands=[];c.service={setContainer:async value=>commands.push(value)};
 await c.deleteContainer();assert.deepEqual(commands,[null]);assert.equal(journal.data.containers.length,0);
});

test('dock expands one container on first tap and edits it only on a second tap',async()=>{
 const {c,journal}=await fixture();
 journal.saveContainer({id:'bowl',name:'Bowl',grams:120,photo:'/bowl.jpg'});journal.saveContainer({id:'plate',name:'Plate',grams:200,photo:'/plate.jpg'});
 const tap=id=>c.tapContainer({currentTarget:{dataset:{id}}});
 assert.equal(c.data.expandedContainerId,'');tap('bowl');assert.equal(c.data.expandedContainerId,'bowl');assert.equal(c.data.showContainers,false);
 tap('plate');assert.equal(c.data.expandedContainerId,'plate');assert.equal(c.data.showContainers,false);
 tap('plate');assert.equal(c.data.editingContainerId,'plate');assert.equal(c.data.showContainers,true);assert.equal(c.data.form.container,'200');
 c.closeContainers();c.openContainers();assert.equal(c.data.expandedContainerId,'');assert.equal(c.data.editingContainerId,'');
 c.closeContainers();c.data.working=true;tap('bowl');assert.equal(c.data.expandedContainerId,'');
});

test('sheet retains content through exit, ignores entry events, and cancels stale close on reopen',async()=>{
 const {c,definition}=await fixture();c.openContainers();c.data.containerPhoto='/temp/bowl.jpg';c.data.containerName='Bowl';
 c.closeContainers();assert.equal(c.data.showContainers,false);assert.equal(c.data.containerSheetMounted,true);assert.equal(c.data.containerSheetClosing,true);assert.equal(c.data.containerPhoto,'/temp/bowl.jpg');
 c.containerSheetAnimationEnd({detail:{animationName:'container-sheet-in'}});assert.equal(c.data.containerSheetMounted,true);
 c.containerSheetAnimationEnd({detail:{animationName:'container-sheet-out'}});assert.equal(c.data.containerSheetMounted,false);assert.equal(c.data.containerPhoto,'');
 c.openContainers();c.closeContainers();c.openContainers();await new Promise(resolve=>setTimeout(resolve,300));assert.equal(c.data.containerSheetMounted,true);assert.equal(c.data.showContainers,true);
 c.closeContainers();definition.lifetimes.detached.call(c);await new Promise(resolve=>setTimeout(resolve,300));assert.equal(c.data.containerSheetMounted,true);
});


test('photo is required on save; initials remain available for legacy thumbnails',async()=>{
 const {c,definition,journal}=await fixture();c.openContainers();c.data.containerName='饭盒';definition.observers['containerName, defaultContainerName'].call(c);assert.equal(c.data.containerInitial,'饭');
 c.containerWeightInput({detail:{value:'125'}});await c.saveContainer();assert.equal(journal.data.containers.length,0);assert.match(c.data.error,/photo/);
 await c.chooseContainerPhoto();c.containerWeightInput({detail:{value:'1999.1'}});await c.saveContainer();assert.equal(journal.data.containers.length,0);
 c.containerWeightInput({detail:{value:'1999'}});await c.saveContainer();assert.equal(journal.data.containers[0].grams,1999);
});


test('new containers enter the visible dock after the sheet closes; edits do not replay entry',async()=>{
 const {c,journal}=await fixture();c.openContainers();await c.chooseContainerPhoto();c.containerWeightInput({detail:{value:'150'}});await c.saveContainer();
 const id=journal.data.containers[0].id;assert.equal(c.data.pendingContainerId,id);assert.equal(c.data.enteringContainerId,'');
 c.finishContainerClose();assert.equal(c.data.enteringContainerId,id);assert.equal(c.data.pendingContainerId,'');assert.equal(c.data.dockScrollTarget,'container-'+id);
 c.containerEntryAnimationEnd({detail:{animationName:'container-dock-in'},currentTarget:{dataset:{id:'another'}}});assert.equal(c.data.enteringContainerId,id);
 c.containerEntryAnimationEnd({detail:{animationName:'container-dock-in'},currentTarget:{dataset:{id}}});assert.equal(c.data.enteringContainerId,'');
 c.editContainer({currentTarget:{dataset:{id}}});await c.saveContainer();c.finishContainerClose();assert.equal(c.data.pendingContainerId,'');assert.equal(c.data.enteringContainerId,'');
});
