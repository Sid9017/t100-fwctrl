import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {MealCheckpoint,SyncLines,PowerSyncReader} from '../src/miniprogram/powersync.js';
const require=createRequire(import.meta.url);
const {SkcaleClient,SESSION_KEY,LINK_KEY}=require('../miniprogram/utils/skcale.js');
const {fromServer,nutritionAtWeight,mergeMealResult}=require('../miniprogram/utils/food-analysis.js');
const record={id:'local-meal',meal:'Lunch',timestampUtc:1792038600,photos:['/dish.jpg'],dishes:[{photo:'/dish.jpg',name:'',weight:250}]};
const rawRecord={analysis_id:'job-1',analysis_status:'DONE',food_name:'Lunch',suggestion:'多吃蔬菜。',calories_recommended:400,carbs_g:40,protein_g:20,fat_g:12,fiber_g:5};
const rawPhoto={record_id:'remote-meal',key:'photo-key',food_name:'鸡肉饭',weight_g:250,intake_weight_g:250,calories:400,carbs_g:40,protein_g:20,fat_g:12,fiber_g:5,items:JSON.stringify([{name:'鸡肉',grams:100}]),sort_index:0};
const put=(id,type,objectId,row,checksum)=>({op_id:String(id),op:'PUT',object_type:type,object_id:objectId,data:JSON.stringify(row),checksum});
const cp=(id,checksum)=>({checkpoint:{last_op_id:String(id),buckets:[{bucket:'meal',checksum}]}});
const data=ops=>({data:{bucket:'meal',data:ops}});
const complete=id=>({checkpoint_complete:{last_op_id:String(id)}});
function result(){const s=new MealCheckpoint('remote-meal');s.line(cp(2,24));s.line(data([put(1,'intake_records','remote-meal',rawRecord,11),put(2,'intake_photos','dish-id',rawPhoto,13)]));return s.line(complete(2));}
function setup({handler,reader}={}){
 const cache=new Map(),requests=[];let logins=0;
 const api={getStorageSync:k=>cache.get(k),setStorageSync:(k,v)=>cache.set(k,structuredClone(v)),removeStorageSync:k=>cache.delete(k),login:o=>{logins++;queueMicrotask(()=>o.success({code:'wx-code'}));},getFileSystemManager:()=>({readFile:o=>o.success({data:new Uint8Array([255,216,255,2]).buffer})}),request:o=>{requests.push(o);Promise.resolve().then(()=>handler?.(o)).then(response=>{if(response)o.success(response);},o.fail);return {abort(){}};}};
 const journal={data:{records:[structuredClone(record)]}};
 const client=new SkcaleClient(api,{journal,reader:reader||{readRecord:async()=>result()}});
 const session=()=>{client.saveSession({accessToken:'token-1',refreshToken:'refresh-1',expiresIn:900},{id:'user-1'});};
 return {api,cache,client,journal,requests,session,get logins(){return logins;}};
}
test('silent login shares one wx code request and stores the existing server token bundle',async()=>{
 const f=setup({handler:o=>({statusCode:200,data:{accessToken:'real-access',refreshToken:'real-refresh',expiresIn:900,user:{id:'user-1'}}})});
 await Promise.all([f.client.login(),f.client.login()]);assert.equal(f.logins,1);assert.equal(f.requests.length,1);assert.deepEqual(f.requests[0].data,{code:'wx-code'});assert.equal(f.cache.get(SESSION_KEY).accessToken,'real-access');assert.equal(f.client.state.status,'connected');
});
test('missing WeChat endpoint is an explicit error and never produces a mock identity',async()=>{
 const f=setup({handler:()=>({statusCode:404,data:{}})});await assert.rejects(f.client.login(),/not enabled/);assert.equal(f.client.state.status,'error');assert.equal(f.cache.has(SESSION_KEY),false);
});
test('domain rejection identifies the login origin without creating a session',async()=>{
 const f=setup({handler:()=>{throw {errMsg:'request:fail url not in domain list'};}});
 await assert.rejects(f.client.login(),/Request domain not allowed: https:\/\/skcale-api\.haivivi\.cn\./);
 assert.equal(f.client.state.status,'error');assert.equal(f.cache.has(SESSION_KEY),false);
});
test('upload domain rejection does not disclose signed paths or query credentials',async()=>{
 const f=setup({handler:o=>{
  if(o.url.endsWith('/@signUpload'))return {statusCode:200,data:{uploadUrl:'https://private.tos.example/private-photo?signature=secret',key:'private-photo',fileId:'file-1',bucket:'private'}};
  throw {errMsg:'request:fail url not in domain list'};
 }});f.session();
 await assert.rejects(f.client.upload('/dish.jpg','user-1'),e=>e.message==='Request domain not allowed: https://private.tos.example. Add it to request legal domains.');
});
test('expired session refresh is single-flight and rotated credentials are saved',async()=>{
 const f=setup({handler:o=>({statusCode:200,data:{accessToken:'token-2',refreshToken:'refresh-2',expiresIn:900}})});f.session();f.client.session.expiresAt=0;
 await Promise.all([f.client.ensureSession(),f.client.ensureSession()]);assert.equal(f.requests.length,1);assert.equal(f.client.session.refreshToken,'refresh-2');assert.deepEqual(f.requests[0].data,{refreshToken:'refresh-1'});
});
test('photo upload is PUT without Bearer; meal creation uses net grams and analysis reads PowerSync',async()=>{
 const read=[];const f=setup({reader:{readRecord:async(id,options)=>{read.push({id,options});return result();}},handler:o=>{
  if(o.url.endsWith('/@signUpload'))return {statusCode:200,data:{uploadUrl:'https://storage.example/upload',fileId:'file',key:'photo-key',bucket:'private'}};
  if(o.url.includes('storage.example'))return {statusCode:200,data:''};
  if(o.url.endsWith('/@commit'))return {statusCode:201,data:{id:'file'}};
  if(o.url.endsWith('/intake-records/'))return {statusCode:201,data:{id:'remote-meal',analysisStatus:'UNANALYZED'}};
  if(o.url.endsWith('/@analysis'))return {statusCode:202,data:{jobId:'job-1'}};
  throw Error('Unexpected request '+o.url);
 }});f.session();const response=await f.client.analyze(f.journal.data.records[0]);
 const upload=f.requests.find(o=>o.method==='PUT');assert.equal(upload.header.Authorization,undefined);assert.ok(upload.data instanceof ArrayBuffer);
 const create=f.requests.find(o=>o.url.endsWith('/intake-records/'));assert.equal(create.header['Idempotency-Key'],'local-meal');assert.deepEqual(create.data.photos,[{before:{key:'photo-key',weightG:250,weightType:'NET'}}]);
 assert.equal(read[0].options.untilDone,true);assert.equal(read[0].options.jobId,'job-1');assert.equal(response.record.suggestion,'多吃蔬菜。');assert.equal(f.requests.some(o=>o.method==='GET'),false);
});
test('lost create response replays the original body and idempotency key before applying weight changes',async()=>{
 let createCalls=0;const bodies=[];const f=setup({handler:o=>{
  if(o.url.endsWith('/intake-records/')){bodies.push(structuredClone(o.data));if(!createCalls++)throw {errMsg:'timeout'};return {statusCode:200,data:{id:'remote-meal',analysisStatus:'UNANALYZED'}};}
  if(o.method==='PATCH')return {statusCode:200,data:{id:'remote-meal',analysisStatus:'UNANALYZED'}};
  if(o.url.endsWith('/@analysis'))return {statusCode:202,data:{jobId:'job-1'}};
  throw Error('Unexpected upload');
 }});f.session();f.client.links['user-1:local-meal']={photos:{'/dish.jpg':'photo-key'}};
 await assert.rejects(f.client.analyze(f.journal.data.records[0]),/timeout/);
 f.journal.data.records[0].dishes[0].weight=300;await f.client.analyze(f.journal.data.records[0]);assert.deepEqual(bodies[0],bodies[1]);assert.equal(f.requests.find(o=>o.method==='PATCH').data.photos[0].before.weightG,300);
});
test('accepted pending analysis resumes without another chargeable request',async()=>{
 const f=setup({handler:()=>{throw Error('Must not submit another analysis');}});f.session();f.client.links['user-1:local-meal']={id:'remote-meal',photos:{'/dish.jpg':'photo-key'},signature:JSON.stringify([['photo-key',250]]),pending:true,jobId:'job-1'};
 const response=await f.client.analyze(f.journal.data.records[0]);assert.equal(response.record.analysisStatus,'DONE');assert.equal(f.requests.length,0);
});
test('cancelled or deleted drafts never start a server task',async()=>{
 const f=setup();f.session();await assert.rejects(f.client.analyze(record,{cancelled:()=>true}),/cancelled/);f.journal.data.records=[];await assert.rejects(f.client.analyze(record),/cancelled/);assert.equal(f.requests.length,0);
});
test('whole portion macros, Unicode ingredients and whole-meal advice map without assuming 100 g',()=>{
 const analysis=fromServer({record:result(),photoKeys:{'/dish.jpg':'photo-key'},signature:'snapshot'},'/dish.jpg');assert.equal(analysis.ingredients,'鸡肉 100 g');assert.equal(analysis.description,'');assert.equal(analysis.mealSuggestion,'多吃蔬菜。');assert.equal(nutritionAtWeight(analysis,250).kcal,400);assert.equal(nutritionAtWeight(analysis,125).carbs,40);assert.equal(nutritionAtWeight(analysis,250,{kcal:true}).kcal,undefined);
 const unknown={...analysis,weightG:null};assert.equal(nutritionAtWeight(unknown,250).kcal,400);
 assert.throws(()=>fromServer({record:{photos:[{before:{key:'photo-key',macro:null}}]},photoKeys:{'/dish.jpg':'photo-key'}},'/dish.jpg'),/nutrition/);
});
test('whole-meal result replaces obsolete sibling overrides or restoring deleted dishes',()=>{
 const analysis={name:'Rice',source:'service',nutrition:{kcal:400,carbs:40,protein:20,fat:12,fiber:5},weightG:250};
 const merged=mergeMealResult({photos:['a','b'],dishes:[{photo:'a'},{photo:'b',name:'My rice',weight:125,kcal:99,manual:{name:true,kcal:true}},{photo:'deleted'}]}, {mealDishes:{b:analysis},mealSuggestion:'Advice',source:'service'},'a');assert.equal(merged.dishes.length,2);assert.equal(merged.dishes[1].name,'Rice');assert.equal(merged.dishes[1].kcal,400);assert.equal(merged.dishes[1].carbs,40);assert.equal(merged.mealAnalysis.text,'Advice');
});
test('partial checkpoint cannot publish and split UTF-8 chunks preserve Chinese text',()=>{
 const state=new MealCheckpoint('remote-meal');let published=null;
 const decoder=new SyncLines(line=>{published=state.line(line)||published;});
 const bytes=Buffer.from([cp(2,24),data([put(1,'intake_records','remote-meal',rawRecord,11),put(2,'intake_photos','dish-id',rawPhoto,13)]),{partial_checkpoint_complete:{last_op_id:'2',priority:0}}].map(x=>JSON.stringify(x)+'\n').join(''));
 for(let i=0;i<bytes.length;i+=3)decoder.push(bytes.subarray(i,i+3));assert.equal(published,null);
 decoder.push(Buffer.from(JSON.stringify(complete(2))+'\n'));assert.equal(published.photos[0].before.foodName,'鸡肉饭');
});
test('checksum, future operations, removal and CLEAR are applied only at matching checkpoints',()=>{
 const state=new MealCheckpoint('remote-meal');state.line(cp(2,24));state.line(data([put(1,'intake_records','remote-meal',rawRecord,11),put(2,'intake_photos','dish-id',rawPhoto,13),put(3,'intake_records','remote-meal',{...rawRecord,suggestion:'New'},17)]));assert.equal(state.line(complete(99)),null);assert.equal(state.line(complete(2)).suggestion,'多吃蔬菜。');
 state.line({checkpoint_diff:{last_op_id:'3',updated_buckets:[{bucket:'meal',checksum:41}],removed_buckets:[]}});assert.equal(state.line(complete(3)).suggestion,'New');
 state.line(cp(4,60));state.line(data([{op_id:'4',op:'REMOVE',object_type:'intake_photos',object_id:'dish-id',checksum:19}]));assert.equal(state.line(complete(4)).photos.length,0);
 state.line(cp(5,60));state.line(data([{op_id:'5',op:'CLEAR',checksum:60}]));assert.equal(state.line(complete(5)),null);
 const broken=new MealCheckpoint('remote-meal');broken.line(cp(1,999));broken.line(data([put(1,'intake_records','remote-meal',rawRecord,11)]));assert.throws(()=>broken.line(complete(1)),/checksum/);
});
test('64-bit operation IDs stay lossless and removed buckets cannot leak stale rows',()=>{
 const state=new MealCheckpoint('remote-meal');const id='9007199254740993';state.line(cp(id,11));state.line(data([put(id,'intake_records','remote-meal',rawRecord,11)]));assert.equal(state.line(complete(id)).id,'remote-meal');
 state.line({checkpoint_diff:{last_op_id:'9007199254740994',updated_buckets:[],removed_buckets:['meal']}});assert.equal(state.line(complete('9007199254740994')),null);
});
test('PowerSync requests existing streaming endpoint, waits for matching job and aborts cleanly',async()=>{
 let request,chunk,headers,aborted=0;
 const api={request:o=>{request=o;queueMicrotask(()=>{headers({statusCode:200});for(const line of [cp(1,11),data([put(1,'intake_records','remote-meal',{...rawRecord,analysis_id:'old-job'},11)]),complete(1),cp(3,41),data([put(2,'intake_photos','dish-id',rawPhoto,13),put(3,'intake_records','remote-meal',rawRecord,17)]),complete(3)])chunk({data:Buffer.from(JSON.stringify(line)+'\n')});});return {onChunkReceived:fn=>chunk=fn,onHeadersReceived:fn=>headers=fn,abort(){aborted++;o.fail({errMsg:'abort'});}};}};
 const reader=new PowerSyncReader(api,{origin:'https://skcale.example',credentials:async()=>({accessToken:'token'}),attempts:1});const found=await reader.readRecord('remote-meal',{untilDone:true,jobId:'job-1'});assert.equal(found.analysisId,'job-1');assert.equal(aborted,1);assert.equal(request.url,'https://skcale.example/powersync/sync/stream');assert.equal(request.header.Authorization,'Token token');assert.equal(request.enableChunked,true);
});

test('expired refresh silently exchanges a fresh WeChat code once for concurrent callers',async()=>{
 const f=setup({handler:o=>o.url.endsWith('/@refresh')?{statusCode:401,data:{code:'AUTH_REFRESH_INVALID'}}:{statusCode:200,data:{accessToken:'new-token',refreshToken:'new-refresh',expiresIn:900,user:{id:'user-1'}}}});
 f.session();f.client.session.expiresAt=0;
 const sessions=await Promise.all([f.client.ensureSession(),f.client.ensureSession(),f.client.ensureSession()]);
 assert.equal(f.logins,1);assert.equal(f.requests.length,2);assert.ok(sessions.every(s=>s.accessToken==='new-token'));assert.equal(f.client.state.status,'connected');
});
test('invalid wx code retries with a new code, while configuration and disabled errors remain actionable',async()=>{
 let exchanges=0;const f=setup({handler:()=>++exchanges===1?{statusCode:401,data:{code:'AUTH_WECHAT_CODE_INVALID'}}:{statusCode:200,data:{accessToken:'new',refreshToken:'refresh',expiresIn:900,user:{id:'user-1'}}}});
 f.api.login=o=>queueMicrotask(()=>o.success({code:'code-'+exchanges}));await f.client.login();assert.deepEqual(f.requests.map(r=>r.data.code),['code-0','code-1']);
 for(const [code,status,pattern] of [['AUTH_WECHAT_NOT_CONFIGURED',500,/not configured/],['AUTH_WECHAT_UPSTREAM',500,/temporarily unavailable/],['AUTH_USER_DISABLED',401,/account is unavailable/]]){
  const g=setup({handler:()=>({statusCode:status,data:{code}})});await assert.rejects(g.client.login(),pattern);assert.equal(g.requests.length,1);assert.equal(g.cache.has(SESSION_KEY),false);
 }
});
test('reauthentication cannot replay a meal or file write under a different user',async()=>{
 const f=setup({handler:o=>o.url.endsWith('/@loginWechat')?{statusCode:200,data:{accessToken:'other-token',refreshToken:'other-refresh',expiresIn:900,user:{id:'user-2'}}}:{statusCode:401,data:{code:'AUTH_REFRESH_INVALID'}}});f.session();
 await assert.rejects(f.client.request('/files/@commit',{method:'POST',ownerId:'user-1'}),/account changed/);
 assert.equal(f.requests.filter(o=>o.url.endsWith('/@commit')).length,1);
 const reader=new PowerSyncReader({}, {credentials:async()=>({user:{id:'user-2'},accessToken:'other-token'})});await assert.rejects(reader.readRecord('meal',{ownerId:'user-1'}),/account changed/);
});
test('image MIME follows bytes rather than extension and invalid files never reach signUpload',async()=>{
 const {imageType}=require('../miniprogram/utils/skcale.js');
 assert.equal(imageType(Buffer.from([137,80,78,71,13,10,26,10])),'image/png');
 assert.equal(imageType(Buffer.from('RIFF1234WEBP')),'image/webp');assert.equal(imageType(Buffer.from('0000ftypheic')),'image/heic');
 assert.throws(()=>imageType(Buffer.from('not an image')),/supported/);
 const f=setup();f.session();f.api.getFileSystemManager=()=>({readFile:o=>o.success({data:new Uint8Array([1,2,3]).buffer})});await assert.rejects(f.client.upload('/looks-like.jpg','user-1'),/supported/);assert.equal(f.requests.length,0);
});
test('invalid weights fail before photos are uploaded',async()=>{
 const f=setup();f.session();f.journal.data.records[0].dishes[0].weight=2000;await assert.rejects(f.client.analyze(f.journal.data.records[0]),/1999/);assert.equal(f.requests.length,0);
});
test('lost analysis acknowledgement retains old job exclusion across photo replacement',async()=>{
 let reads=0;const options=[];const f=setup({reader:{readRecord:async(id,o)=>{options.push(o);return {...result(),analysisId:++reads===1?'old-job':'new-job'};}},handler:o=>{
  if(o.method==='PATCH')return {statusCode:200,data:{id:'remote-meal',analysisStatus:'DONE'}};
  if(o.url.endsWith('/@analysis'))throw {errMsg:'connection lost'};
  throw Error('Unexpected request');
 }});f.session();f.client.links['user-1:local-meal']={id:'remote-meal',photos:{'/dish.jpg':'photo-key'},signature:JSON.stringify([['photo-key',100]])};
 await assert.rejects(f.client.analyze(record),/connection lost/);
 const saved=f.cache.get(LINK_KEY)['user-1:local-meal'];assert.equal(saved.pending,true);assert.equal(saved.previousJobId,'old-job');assert.equal(saved.jobId,null);
 const recovered=await f.client.analyze(record);assert.equal(options[1].excludeJobId,'old-job');assert.equal(recovered.record.analysisId,'new-job');assert.equal(f.requests.filter(o=>o.url.endsWith('/@analysis')).length,1);
});
test('five dish results map by uploaded key despite response order, and absent nutrients stay unknown',()=>{
 const response={record:{id:'remote',suggestion:'整餐建议',weightQuality:'ESTIMATED',photos:Array.from({length:5},(_,i)=>({photoId:'id-'+i,before:{key:'key-'+i,foodName:'菜'+i,intakeWeightG:100,calories:i*10,macro:{carbG:i,proteinG:2,fatG:3,fiberG:i===2?null:0},items:[{name:'米饭',grams:50},null,{name:'汤',grams:null}]}})).reverse()},photoKeys:Object.fromEntries(Array.from({length:5},(_,i)=>['local-'+i,'key-'+i]))};
 for(let i=0;i<5;i++){const a=fromServer(response,'local-'+i);assert.equal(a.nutrition.kcal,i*10);assert.equal(a.photoId,'id-'+i);assert.equal(a.mealSuggestion,'整餐建议');assert.equal(a.ingredients,'米饭 50 g · 汤');if(i===2)assert.equal(nutritionAtWeight(a,50).fiber,null);}
});
test('manual zero weight survives sibling result merging',()=>{
 const analysis={name:'Soup',source:'service',nutrition:{kcal:100,carbs:5,protein:2,fat:1,fiber:null},weightG:250};
 const merged=mergeMealResult({photos:['a','b'],dishes:[{photo:'a'},{photo:'b',weight:0,manual:{weight:true}}]},{mealDishes:{b:analysis}},'a');assert.equal(merged.dishes[1].weight,0);assert.equal(merged.dishes[1].kcal,100);assert.equal(merged.dishes[1].fiber,null);
});
test('failed sync analysis terminates without network retries and cancellation aborts promptly',async()=>{
 let calls=0,aborts=0;
 const api={request:o=>{calls++;let chunk;queueMicrotask(()=>{for(const line of [cp(1,11),data([put(1,'intake_records','remote-meal',{...rawRecord,analysis_status:'FAILED',analysis_error:JSON.stringify({message:'Could not identify food'})},11)]),complete(1)])chunk({data:Buffer.from(JSON.stringify(line)+'\n')});});return {onChunkReceived:fn=>chunk=fn,abort:()=>aborts++};}};
 const reader=new PowerSyncReader(api,{origin:'https://api.example',credentials:async()=>({accessToken:'token'}),wait:async()=>{}});
 await assert.rejects(reader.readRecord('remote-meal',{untilDone:true,jobId:'job-1'}),/identify/);assert.equal(calls,1);assert.equal(aborts,1);
 let cancel=false;const idle=new PowerSyncReader({request:()=>({abort:()=>aborts++})},{origin:'https://api.example',credentials:async()=>({accessToken:'token'})});const pending=idle.readRecord('remote-meal',{cancelled:()=>cancel});await Promise.resolve();cancel=true;await assert.rejects(pending,/cancelled/);assert.equal(aborts,2);
});

test('ingredient correction uses @edit, retains all photo groups and waits for the matching job',async()=>{
 const read=[];const f=setup({reader:{readRecord:async(id,o)=>{read.push(o);return {...result(),analysisId:o.jobId||'job-1'};}},handler:o=>{assert.ok(o.url.endsWith('/@edit'));return {statusCode:202,data:{jobId:'edit-job'}};}});f.session();
 f.client.links['user-1:local-meal']={id:'remote-meal',photos:{'/dish.jpg':'photo-key'},signature:JSON.stringify([['photo-key',250]])};
 await f.client.analyze(record,{correction:{photo:'/dish.jpg',text:'Grilled chicken, no sauce'}});
 assert.equal(f.requests.length,1);assert.deepEqual(f.requests[0].data,{photos:[{photoId:'dish-id',text:'Grilled chicken, no sauce'}]});assert.equal(read.at(-1).jobId,'edit-job');
});
test('lost edit acknowledgement resumes its result without sending the correction twice',async()=>{
 let reads=0;const f=setup({reader:{readRecord:async(id,o)=>{reads++;return {...result(),analysisId:reads===1?'job-1':'edit-job'};}},handler:()=>{throw {errMsg:'timeout'};}});f.session();
 f.client.links['user-1:local-meal']={id:'remote-meal',photos:{'/dish.jpg':'photo-key'},signature:JSON.stringify([['photo-key',250]])};
 const options={correction:{photo:'/dish.jpg',text:'Chicken'}};await assert.rejects(f.client.analyze(record,options),/timeout/);await f.client.analyze(record,options);assert.equal(f.requests.length,1);
});

test('five photos share one meal analysis job and one result set; removing one patches that meal then runs one new job',async()=>{
 let file=0,jobs=0,groups=[];const f=setup({reader:{readRecord:async()=>({id:'remote-meal',analysisStatus:'DONE',analysisId:'batch-'+jobs,suggestion:'Meal advice',photos:groups})},handler:o=>{
  if(o.url.endsWith('/@signUpload')){file++;return {statusCode:200,data:{uploadUrl:'https://storage.example/'+file,fileId:'file-'+file,key:'key-'+file,bucket:'private'}};}
  if(o.method==='PUT')return {statusCode:200,data:''};
  if(o.url.endsWith('/@commit'))return {statusCode:201,data:{id:'file-'+file}};
  if(o.url.endsWith('/intake-records/')||o.method==='PATCH'){
   groups=o.data.photos.map((p,i)=>({photoId:'photo-'+i,before:{...p.before,foodName:'Dish '+i,weightG:p.before.weightG,calories:100,macro:{carbG:10,proteinG:5,fatG:2,fiberG:1},items:[]}}));
   return {statusCode:200,data:{id:'remote-meal',analysisStatus:'UNANALYZED'}};
  }
  if(o.url.endsWith('/@analysis'))return {statusCode:202,data:{jobId:'batch-'+(++jobs)}};
  throw Error('Unexpected request '+o.url);
 }});f.session();
 const photos=Array.from({length:5},(_,i)=>'/dish-'+i+'.jpg');f.journal.data.records[0]={...record,photos,dishes:photos.map((photo,i)=>({photo,name:'',weight:100+i}))};
 const first=await f.client.analyze(f.journal.data.records[0]);assert.equal(jobs,1);assert.equal(file,5);assert.equal(first.record.photos.length,5);assert.equal(first.record.suggestion,'Meal advice');
 assert.equal(f.requests.filter(o=>o.url.endsWith('/intake-records/')).length,1);
 f.journal.data.records[0].photos=photos.slice(1);const next=await f.client.analyze(f.journal.data.records[0]);
 assert.equal(jobs,2);assert.equal(file,5);assert.equal(next.record.photos.length,4);assert.equal(f.requests.filter(o=>o.method==='PATCH').length,1);
});

test('ingredient mapping uses items and does not invent a per-dish description from meal advice',()=>{
 const response={record:result(),photoKeys:{'/dish.jpg':'photo-key'}};
 const analysis=fromServer(response,'/dish.jpg');assert.equal(analysis.ingredients,'鸡肉 100 g');assert.equal(analysis.description,'');assert.equal(analysis.mealSuggestion,'多吃蔬菜。');
 const {analysisDetails}=require('../miniprogram/utils/food-analysis.js');
 assert.equal(analysisDetails({items:[{name:'米饭',grams:null}],description:'米饭'}).description,'');
 assert.equal(analysisDetails({items:[{name:'米饭',grams:0},null,{name:' ',grams:5}],description:'A real description'}).ingredients,'米饭 0 g');
 assert.equal(analysisDetails({items:[],description:'A real description'}).description,'A real description');
});
