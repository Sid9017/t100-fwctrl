import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {profileRequest,serverProfile} from '../src/miniprogram/profile-contract.js';
import {JournalStore,JOURNAL_KEY,dayKey,ACTIVITY} from '../src/miniprogram/journal.js';
import {MealCheckpoint,PowerSyncReader} from '../src/miniprogram/powersync.js';
const require=createRequire(import.meta.url),{SkcaleClient}=require('../miniprogram/utils/skcale.js');
const form={birthday:'1993-03-15',sex:'private',height:170,weight:70,bodyFat:'',activity:1,goal:'maintain',goalWeight:'',paceKgPerWeek:0.5,target:2000,carbs:50,protein:25,fat:25,fiber:30};
const response=(id='u1')=>({id,birthday:form.birthday,gender:'UNDISCLOSED',nutrition:{heightCm:170,weightKg:70,bodyFatPct:null,activityLevel:'LIGHT',weightGoal:'MAINTAIN',targetWeightKg:null,paceKgPerWeek:null,carbPct:null,proteinPct:null,fatPct:null},plan:{targetKcal:2000,tdeeKcal:2400,carbsG:250,proteinG:125,fatG:56,fiberG:28}});
const snake=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()),v]));
test('profile contract sends birthday and weekly pace, never age, months or a manual TDEE',()=>{
 assert.deepEqual(profileRequest(form),{birthday:'1993-03-15',gender:'UNDISCLOSED',heightCm:170,weightKg:70,activityLevel:'LIGHT',weightGoal:'MAINTAIN',language:'en'});
 assert.equal(profileRequest({...form,goal:'gain',goalWeight:75}).paceKgPerWeek,.5);
 for(const patch of [{birthday:'2025-02-29'},{birthday:'2999-01-01'},{birthday:''},{height:170.5},{bodyFat:37},{goal:'gain',goalWeight:75,paceKgPerWeek:.6},{goal:'lose',goalWeight:50}])assert.throws(()=>profileRequest({...form,...patch}));
 for(const patch of [{target:99},{carbs:50.5,protein:24.5},{fiber:24}])assert.throws(()=>profileRequest({...form,...patch},{overrides:true}));
});
test('server TDEE and gram targets survive storage without local recalculation',()=>{
 const profile=serverProfile(response());const cache=new Map(),api={getStorageSync:k=>cache.get(k),setStorageSync:(k,v)=>cache.set(k,v)};
 const journal=new JournalStore(api);journal.saveProfile(profile);const restored=new JournalStore(api);
 assert.equal(restored.data.profile.tdee,2400);assert.equal(restored.summary().nutrients[2].goal,56);assert.equal(restored.summary().nutrients[3].goal,28);
 assert.equal(restored.data.profile.age,undefined);assert.equal(restored.error,'');
});
function checkpointRows(id='u1',includePlan=true){const r=response(id);return [{type:'users',id,row:{birthday:r.birthday,gender:r.gender}},{type:'user_profiles',id,row:snake(r.nutrition)},...(includePlan?[{type:'user_plans',id,row:snake(r.plan)}]:[])];}
function feed(checkpoint,rows){checkpoint.line({checkpoint:{last_op_id:String(rows.length),buckets:[{bucket:'profile',checksum:rows.length}]}});checkpoint.line({data:{bucket:'profile',data:rows.map((v,i)=>({op_id:String(i+1),op:'PUT',checksum:1,object_type:v.type,object_id:v.id,data:JSON.stringify(v.row)}))}});return checkpoint.line({checkpoint_complete:{last_op_id:String(rows.length)}});}
test('profile snapshot publishes only a verified complete checkpoint and filters user IDs',()=>{
 const cp=new MealCheckpoint('u1','profile');assert.equal(cp.line({checkpoint:{last_op_id:'3',buckets:[{bucket:'profile',checksum:3}]}}),null);
 const snap=feed(cp,[...checkpointRows(),...checkpointRows('other')]);assert.equal(snap.complete,true);assert.equal(snap.profile.id,'u1');assert.equal(serverProfile(snap.profile).target,2000);
 assert.deepEqual(feed(new MealCheckpoint('u1','profile'),checkpointRows('u1',false)),{complete:true,profile:null});
 assert.throws(()=>feed(new MealCheckpoint('u1','profile'),checkpointRows('other')),/incomplete/);
});
function setup(reader){const cache=new Map(),requests=[];const api={getStorageSync:k=>cache.get(k),setStorageSync:(k,v)=>cache.set(k,structuredClone(v)),removeStorageSync:k=>cache.delete(k),request:o=>{requests.push(o);o.success({statusCode:200,data:response()});}};const journal=new JournalStore(api,{storageKey:null}),client=new SkcaleClient(api,{journal,reader});client.saveSession({accessToken:'a',refreshToken:'r',expiresIn:900},{id:'u1'});return {cache,api,requests,journal,client};}
test('profile restore is single flight, account scoped and does not write default values to the API',async()=>{
 let reads=0;const f=setup({readRecord:async(id,options)=>{reads++;assert.equal(id,'u1');assert.equal(options.scope,'profile');return {complete:true,profile:response()};}});
 await Promise.all([f.client.restoreProfile(),f.client.restoreProfile()]);assert.equal(reads,1);assert.equal(f.requests.length,0);assert.equal(f.journal.data.profile.target,2000);
 assert.ok(f.cache.has(JOURNAL_KEY+':u1'));const journal=new JournalStore(f.api,{storageKey:null});journal.switchOwner('u1');assert.equal(journal.data.profile.tdee,2400);
 f.client.saveSession({accessToken:'b',refreshToken:'s',expiresIn:900},{id:'u2'});assert.equal(f.journal.data.profile,null);assert.equal(f.journal.data.records.length,0);
 f.client.saveSession({accessToken:'c',refreshToken:'t',expiresIn:900},{id:'u1'});assert.equal(f.journal.data.profile.target,2000);
});
test('failed profile sync is distinct from missing and does not erase cached goals',async()=>{
 const f=setup({readRecord:async()=>{throw Error('offline');}});f.journal.saveProfile(serverProfile(response()));
 await assert.rejects(f.client.restoreProfile(),/offline/);assert.equal(f.client.state.profileStatus,'error');assert.equal(f.journal.data.profile.target,2000);
 f.client.reader.readRecord=async()=>({complete:true,profile:null});await f.client.restoreProfile();assert.equal(f.client.state.profileStatus,'missing');assert.equal(f.journal.data.profile,null);
});
test('late profile snapshots cannot replace a newer successful local cache write',async()=>{
 let resolve;const f=setup({readRecord:()=>new Promise(r=>resolve=r)});const pending=f.client.restoreProfile();await new Promise(r=>setImmediate(r));
 const newer=response();newer.plan.targetKcal=2200;f.journal.saveProfile(serverProfile(newer));resolve({complete:true,profile:response()});await pending;assert.equal(f.journal.data.profile.target,2200);
});
test('profile save uses PATCH and rejects a form belonging to another account',async()=>{
 const f=setup({readRecord:async()=>({complete:true,profile:response()})});await f.client.restoreProfile();
 await f.client.saveProfile(profileRequest(form,{overrides:true}),'u1');assert.equal(f.requests[0].method,'PATCH');assert.ok(f.requests[0].url.endsWith('/users/profile'));assert.equal(f.requests[0].data.targetKcal,2000);
 await assert.rejects(f.client.saveProfile({targetKcal:1800},'different'),/account changed/);assert.equal(f.requests.length,1);
});
test('late profile response from a previous account never enters the new account cache',async()=>{
 let resolve;const f=setup({readRecord:()=>new Promise(r=>resolve=r)});const pending=f.client.restoreProfile();await new Promise(r=>setImmediate(r));f.client.saveSession({accessToken:'b',refreshToken:'r',expiresIn:900},{id:'u2'});resolve({complete:true,profile:response()});await assert.rejects(pending,/account changed/);assert.equal(f.journal.data.profile,null);assert.equal(f.cache.has(JOURNAL_KEY+':u2'),false);
});
test('profile form hides creation until restoration completes, then restores birthday and targets',async()=>{
 let definition,resolve;const journal={ownerId:'u1',data:{profile:null}},app={journal,journalFor:()=>journal,cloud:{restoreProfile:()=>new Promise(r=>resolve=r)}};
 runInNewContext(await readFile('miniprogram/pages/plan/index.js','utf8'),{Page:p=>definition=p,require:p=>p.includes('/lib/')?{ACTIVITY,profileRequest,serverProfile,dayKey}:{isPreview:()=>false,store:()=>journal,errorText:e=>e.message},getApp:()=>app,wx:{getStorageSync:()=>null}});
 const page={...definition,data:structuredClone(definition.data),setData(p){Object.assign(this.data,p);}};page.onLoad();assert.equal(page.data.restoring,true);await page.next();assert.equal(page.data.step,0);
 resolve(serverProfile(response()));await new Promise(r=>setImmediate(r));assert.equal(page.data.form.birthday,'1993-03-15');assert.equal(page.data.form.target,2000);assert.equal(page.data.restoring,false);
});

async function birthdayPage(birthday='',today='2026-10-15'){
 let definition;const journal={data:{profile:birthday?{birthday}:null}},app={isDevtools:true,journalFor:()=>journal};
 runInNewContext(await readFile('miniprogram/pages/plan/index.js','utf8'),{Page:p=>definition=p,require:p=>p.includes('/lib/')?{ACTIVITY,profileRequest,serverProfile,dayKey:()=>today}:{isPreview:()=>true,store:()=>journal,errorText:e=>e.message},getApp:()=>app});
 const page={...definition,data:structuredClone(definition.data),setData(patch){for(const [key,value] of Object.entries(patch)){if(key==='form.birthday')this.data.form.birthday=value;else this.data[key]=value;}}};page.onLoad({preview:'1'});
 return {page,choose(y,m,d){page.onBirthday({detail:{value:[page.data.birthdayYears.indexOf(y),page.data.birthdayMonths.indexOf(m),page.data.birthdayDays.indexOf(d)]}});}};
}
test('inline birthday wheel restores dates and clamps leap days and short months',async()=>{
 const f=await birthdayPage('2000-02-29');assert.equal(f.page.data.birthdayYears[f.page.data.birthdayIndices[0]],2000);assert.equal(f.page.data.birthdayDays.at(-1),29);
 f.choose(2001,2,29);assert.equal(f.page.data.form.birthday,'2001-02-28');assert.equal(f.page.data.birthdayDays.at(-1),28);
 f.choose(2000,2,28);assert.equal(f.page.data.birthdayDays.at(-1),29);
 f.choose(2000,3,29);f.choose(2000,3,31);f.choose(2000,4,31);assert.equal(f.page.data.form.birthday,'2000-04-30');
 f.choose(1900,2,30);assert.equal(f.page.data.form.birthday,'1900-02-28');
});
test('birthday wheel defaults to 30 years ago, has no blank options and prevents future birthdays',async()=>{
 const f=await birthdayPage();assert.equal(f.page.data.form.birthday,'1996-10-15');assert.equal(f.page.data.birthdayMonths[0],1);assert.equal(f.page.data.birthdayDays[0],1);assert.ok(f.page.data.birthdayYears.every(y=>y>0));f.choose(1990,12,15);f.choose(1990,12,31);assert.equal(f.page.data.form.birthday,'1990-12-31');
 f.choose(2026,12,31);assert.equal(f.page.data.form.birthday,'2026-10-15');assert.equal(f.page.data.birthdayMonths.at(-1),10);assert.equal(f.page.data.birthdayDays.at(-1),15);
 const before=f.page.data.form.birthday;f.page.onBirthday({detail:{value:[-1,0,0]}});assert.equal(f.page.data.form.birthday,before);
 const wxml=await readFile('miniprogram/pages/plan/index.wxml','utf8');assert.doesNotMatch(wxml,/picker mode="date"/);assert.match(wxml,/picker-view-column/);assert.doesNotMatch(wxml,/>Year<|>Month<|>Day</);assert.match(wxml,/birthdayMonthLabels\[item-1\]/);
});

test('30-year birthday default clamps leap day and still requires a birthday at submission',async()=>{
 const f=await birthdayPage('', '2024-02-29');assert.equal(f.page.data.form.birthday,'1994-02-28');
 const saved=await birthdayPage('1992-02-29','2024-02-29');assert.equal(saved.page.data.form.birthday,'1992-02-29');
 f.page.data.form.sex='female';await f.page.next();assert.equal(f.page.data.step,1);
 f.page.data.step=0;f.page.data.form.birthday='';await f.page.next();assert.equal(f.page.data.step,0);assert.match(f.page.data.error,/birthday/);
});
