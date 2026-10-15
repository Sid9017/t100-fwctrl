// Direct Mini Program → skcale API. No application secret is shipped to the client.
const ORIGIN='https://skcale-api.haivivi.cn';
const SESSION_KEY='kcalack.skcale.session.v1';
const LINK_KEY='kcalack.skcale.records.v1';
const call=(api,method,options={})=>new Promise((resolve,reject)=>api[method]({...options,success:resolve,fail:e=>{
 const message=e?.errMsg||'Network request failed.';
 // Show only the origin: signed upload URLs contain private keys and credentials in their path/query.
 const origin=typeof options.url==='string'?options.url.match(/^https?:\/\/[^/?#@]+(?=[/?#]|$)/i)?.[0]:null;
 reject(new Error(/url not in domain list/i.test(message)&&origin?`Request domain not allowed: ${origin}. Add it to request legal domains.`:message));
}}));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function failure(response){
 const status=response.statusCode,body=response.data||{};
 const messages={AUTH_WECHAT_NOT_CONFIGURED:'WeChat sign-in is not configured on the server yet.',AUTH_WECHAT_UPSTREAM:'WeChat sign-in is temporarily unavailable. Please retry.',AUTH_WECHAT_CODE_INVALID:'WeChat sign-in expired. Please retry.',AUTH_USER_DISABLED:'This account is unavailable.'};
 const message=messages[body.code]||body.message||(status===404?'The server endpoint is not available yet.':status===401?'Your session expired. Please retry.':`Server request failed (${status}).`);
 return Object.assign(new Error(message),{status,code:body.code});
}
function imageType(data){
 const b=new Uint8Array(data),ascii=(start,end)=>String.fromCharCode(...b.slice(start,end));
 if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 if(b[0]===137&&ascii(1,4)==='PNG')return 'image/png';
 if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return 'image/webp';
 if(['GIF87a','GIF89a'].includes(ascii(0,6)))return 'image/gif';
 if(ascii(0,2)==='BM')return 'image/bmp';
 if(ascii(4,8)==='ftyp'){
  const brand=ascii(8,12);if(['heic','heix','hevc','hevx'].includes(brand))return 'image/heic';
  if(['mif1','msf1'].includes(brand))return 'image/heif';if(['avif','avis'].includes(brand))return 'image/avif';
 }
 throw new Error('Choose a supported dish photo.');
}
function signature(record){return JSON.stringify((record.photos||[]).map(photo=>{const dish=record.dishes?.find(d=>d.photo===photo);return [photo,Number(dish?.weight)>0?Number(dish.weight):null];}));}
class SkcaleClient {
 constructor(api,{journal,wait=pause,reader}={}){
  this.api=api;this.journal=journal;this.wait=wait;this.reader=reader||new (require('../lib/t100').PowerSyncReader)(api,{origin:ORIGIN,credentials:force=>this.ensureSession(force),wait});this.listeners=new Set();this.jobs=new Map();this.uploads=new Map();
  const saved=api.getStorageSync(SESSION_KEY),links=api.getStorageSync(LINK_KEY);
  this.session=saved?.accessToken&&saved?.user?.id?saved:null;this.links=links&&typeof links==='object'&&!Array.isArray(links)?links:{};
  this.state={status:this.session?'connected':'idle',error:'',profileStatus:'idle',profileError:''};
 }
 onChange(fn){this.listeners.add(fn);fn({...this.state});return ()=>this.listeners.delete(fn);}
 publish(status,error=''){this.state={...this.state,status,error};for(const fn of this.listeners)fn({...this.state});}
 async raw(path,{method='GET',data,header={}}={}){
  const response=await call(this.api,'request',{url:ORIGIN+'/api/v1'+path,method,data,timeout:30000,header:{'Content-Type':'application/json','Accept-Language':'en',...header}});
  if(response.statusCode<200||response.statusCode>=300)throw failure(response);
  return response.data;
 }
 saveSession(bundle,user=this.session?.user){
  if(typeof bundle?.accessToken!=='string'||!bundle.accessToken||typeof bundle.refreshToken!=='string'||!bundle.refreshToken||typeof user?.id!=='string'||!user.id||!Number.isFinite(bundle.expiresIn)||bundle.expiresIn<=0)throw new Error('Invalid login response.');
  this.session={...bundle,user,expiresAt:Date.now()+Number(bundle.expiresIn||900)*1000};
  if(this.session?.user?.id!==this.journal?.ownerId&&this.journal?.switchOwner)this.state={...this.state,profileStatus:'idle',profileError:''};
  this.journal?.switchOwner?.(user.id);
  this.api.setStorageSync(SESSION_KEY,this.session);this.publish('connected');this.onSessionReady?.(user.id);return this.session;
 }
 async login(){
  if(this.authJob)return this.authJob;
  this.authJob=(async()=>{
   this.publish('connecting');
   try{
    const bundle=await this.exchangeLogin();
    return this.saveSession(bundle,bundle.user);
   }catch(e){
    if(e.status===404)e.message='WeChat sign-in is not enabled on the server yet.';
    if(e.code==='AUTH_WECHAT_NOT_CONFIGURED')e.message='WeChat sign-in is not configured on the server yet.';
    this.publish('error',e.message);throw e;
   }
  })();
  try{return await this.authJob;}finally{this.authJob=null;}
 }
 async exchangeLogin(){
  for(let attempt=0;attempt<2;attempt++){
   const {code}=await call(this.api,'login',{timeout:15000});if(typeof code!=='string'||!code.trim())throw new Error('WeChat could not verify your identity.');
   try{return await this.raw('/auth/@loginWechat',{method:'POST',data:{code}});}
   catch(e){if(attempt||e.code!=='AUTH_WECHAT_CODE_INVALID')throw e;}
  }
 }
 async ensureSession(force=false){
  if(!force&&this.session?.accessToken&&this.session.expiresAt>Date.now()+60000)return this.session;
  if(this.authJob)return this.authJob;
  if(!this.session?.refreshToken)return this.login();
  this.authJob=(async()=>{
   try{return this.saveSession(await this.raw('/auth/@refresh',{method:'POST',data:{refreshToken:this.session.refreshToken}}));}
   catch(e){
    if(e.status===401){
     this.session=null;this.api.removeStorageSync(SESSION_KEY);
     if(e.code!=='AUTH_USER_DISABLED'){
      this.publish('connecting');
      try{const bundle=await this.exchangeLogin();return this.saveSession(bundle,bundle.user);}catch(loginError){this.publish('error',loginError.message);throw loginError;}
     }
    }
    this.publish('error',e.message);throw e;
   }
  })();
  try{return await this.authJob;}finally{this.authJob=null;}
 }
 async request(path,options={}){
  const {ownerId,...requestOptions}=options;
  const session=await this.ensureSession();
  const checkOwner=s=>{if(ownerId&&s.user.id!==ownerId)throw new Error('Your account changed. Please retry.');};checkOwner(session);
  try{return await this.raw(path,{...requestOptions,header:{...requestOptions.header,Authorization:'Bearer '+session.accessToken}});}
  catch(e){
   if(e.status!==401||e.code==='AUTH_USER_DISABLED')throw e;
   // A concurrent request may already have rotated the token.
   const fresh=this.session?.accessToken!==session.accessToken?await this.ensureSession():await this.ensureSession(true);
   checkOwner(fresh);return this.raw(path,{...requestOptions,header:{...requestOptions.header,Authorization:'Bearer '+fresh.accessToken}});
  }
 }
 async restoreProfile(){
  if(this.profileJob)return this.profileJob;
  this.state={...this.state,profileStatus:'syncing',profileError:''};this.publish(this.state.status,this.state.error);
  const job=(async()=>{
   try{
    const session=await this.ensureSession(),ownerId=session.user.id;
    this.journal.switchOwner(ownerId);const revision=this.journal.profileRevision;
    const snapshot=await this.reader.readRecord(ownerId,{scope:'profile',ownerId,cancelled:()=>this.session?.user.id!==ownerId});
    if(this.session?.user.id!==ownerId)throw new Error('Your account changed. Please retry.');
    if(!snapshot?.complete)throw new Error('Profile sync is incomplete.');
    if(this.journal.profileRevision===revision){
     if(snapshot.profile)this.journal.saveProfile(require('../lib/t100').serverProfile(snapshot.profile));
     else this.journal.clearProfile();
    }
    this.state={...this.state,profileStatus:this.journal.data.profile?'ready':'missing',profileError:''};
    return this.journal.data.profile;
   }catch(error){this.state={...this.state,profileStatus:'error',profileError:error.message};throw error;}
   finally{this.publish(this.state.status,this.state.error);}
  })();
  this.profileJob=job;try{return await job;}finally{if(this.profileJob===job)this.profileJob=null;}
 }
 async saveProfile(body,expectedOwner){
  // Complete the initial read before any form write; never overwrite an unknown remote profile.
  if(!['ready','missing'].includes(this.state.profileStatus))await this.restoreProfile();
  const session=await this.ensureSession(),ownerId=session.user.id;
  if(this.journal.ownerId!==ownerId||(expectedOwner&&expectedOwner!==ownerId))throw new Error('Your account changed. Reload your profile.');
  const response=await this.request('/users/profile',{method:'PATCH',data:body,ownerId});
  if(this.session?.user.id!==ownerId)throw new Error('Your account changed. Please retry.');
  const profile=require('../lib/t100').serverProfile(response);this.journal.saveProfile(profile);
  this.state={...this.state,profileStatus:'ready',profileError:''};this.publish(this.state.status,this.state.error);return profile;
 }
 saveLinks(){this.api.setStorageSync(LINK_KEY,this.links);}
 async upload(photo,userId){
  const cacheKey=userId+':'+photo;if(this.uploads.has(cacheKey))return this.uploads.get(cacheKey);
  const pending=(async()=>{
   const file=await call(this.api.getFileSystemManager(),'readFile',{filePath:photo});
   const sizeBytes=file.data.byteLength;if(!sizeBytes)throw new Error('The dish photo is empty.');
   // Saved camera images can keep PNG/WebP bytes despite a .jpg filename.
   const contentType=imageType(file.data);
   const info={domain:'food-photo',visibility:'private',contentType,sizeBytes};
   const signed=await this.request('/files/@signUpload',{method:'POST',data:info,ownerId:userId});
   if(!signed?.uploadUrl?.startsWith('https://')||!signed.key||!signed.fileId||!signed.bucket)throw new Error('Invalid photo upload response.');
   if(this.session?.user.id!==userId)throw new Error('Your account changed. Please retry.');
   const response=await call(this.api,'request',{url:signed.uploadUrl,method:'PUT',data:file.data,timeout:60000,header:{'Content-Type':contentType}});
   if(response.statusCode<200||response.statusCode>=300)throw new Error('Photo upload failed. Please retry.');
   await this.request('/files/@commit',{method:'POST',data:{...info,fileId:signed.fileId,bucket:signed.bucket,key:signed.key},ownerId:userId});
   return signed.key;
  })();
  this.uploads.set(cacheKey,pending);try{return await pending;}catch(e){this.uploads.delete(cacheKey);throw e;}
 }
 analyze(record,{cancelled=()=>false,onPhase=()=>{},correction}={}){
  // The backend analyzes a meal; serialize explicit batch submissions and corrections.
  const previous=this.jobs.get(record.id)||Promise.resolve();
  const job=previous.catch(()=>{}).then(()=>this.analyzeMeal(record,{cancelled,onPhase,correction}));
  this.jobs.set(record.id,job);job.finally(()=>{if(this.jobs.get(record.id)===job)this.jobs.delete(record.id);}).catch(()=>{});return job;
 }
 async analyzeMeal(record,{cancelled,onPhase,correction}){
  if(correction&&(!record.photos.includes(correction.photo)||typeof correction.text!=='string'||!correction.text.trim()||correction.text.trim().length>200))throw new Error('Enter a correction of up to 200 characters.');
  const check=()=>{if(cancelled()||!this.journal?.data.records.some(r=>r.id===record.id))throw Object.assign(new Error('Analysis cancelled.'),{code:'CANCELLED'});};
  if(!Array.isArray(record.photos)||record.photos.length<1||record.photos.length>5||new Set(record.photos).size!==record.photos.length)throw new Error('Choose 1–5 different dish photos.');
  if(!['Breakfast','Lunch','Dinner','Snack'].includes(record.meal)||!Number.isFinite(record.timestampUtc)||!Number.isFinite(new Date(record.timestampUtc*1000).getTime()))throw new Error('This meal has an invalid type or time.');
  for(const photo of record.photos){const raw=record.dishes?.find(d=>d.photo===photo)?.weight;if(raw!=null&&raw!==''&&(!Number.isFinite(Number(raw))||Number(raw)<0||Number(raw)>1999))throw new Error('Online analysis supports up to 1999 g per dish.');}
  check();onPhase('Signing in…');const session=await this.ensureSession();check();
  const userId=session.user.id,linkId=userId+':'+record.id;
  const assertOwner=()=>{check();if(this.session?.user.id!==userId)throw new Error('Your account changed. Please retry.');};
  const sig=signature(record);let link=this.links[linkId]||{photos:{}};
  const photos=[];
  onPhase('Uploading…');
  for(const photo of record.photos){
   assertOwner();let key=link.photos[photo];if(!key){key=await this.upload(photo,userId);link.photos[photo]=key;this.links[linkId]=link;this.saveLinks();}
   const weight=Number(record.dishes?.find(d=>d.photo===photo)?.weight);
   if(weight>1999)throw new Error('Online analysis supports up to 1999 g per dish.');
   // The phone has already subtracted the container. Do not send its local UUID as a cloud ID.
   photos.push({before:{key,...(weight>0?{weightG:weight,weightType:'NET'}:{})}});
  }
  assertOwner();
  const path=id=>'/intake-records/'+encodeURIComponent(id);
  let current;
  if(!link.id){
   // Persist the exact request before sending: a lost response must replay the same body/key.
   if(!link.create){link.create={mealType:record.meal.toUpperCase(),recordedAt:new Date(record.timestampUtc*1000).toISOString(),photos};this.links[linkId]=link;this.saveLinks();}
   current=await this.request('/intake-records/',{method:'POST',header:{'Idempotency-Key':record.id},data:link.create,ownerId:userId});
   if(!current?.id)throw new Error('Invalid meal response.');
   link.id=current.id;link.signature=JSON.stringify(link.create.photos.map(p=>[p.before.key,p.before.weightG||null]));this.saveLinks();
  }else current=await this.reader.readRecord(link.id,{cancelled,ownerId:userId,jobId:link.pending?link.jobId:undefined,...(link.pending&&!link.jobId?{excludeJobId:link.previousJobId||null}:{})});
  const desired=JSON.stringify(photos.map(p=>[p.before.key,p.before.weightG||null]));
  // Resume an accepted job after page navigation or a lost acknowledgement instead of duplicating it.
  if(current.analysisStatus==='ANALYZING')current=await this.waitResult(link.id,{assertOwner,onPhase,jobId:current.analysisId||link.jobId,cancelled,ownerId:userId});
  const priorAnalysisId=current.analysisId||link.lastJobId||null;
  const changed=link.signature!==desired;
  const resumedEdit=!changed&&link.pending&&link.kind==='edit'&&current.analysisStatus==='DONE'&&link.correction===JSON.stringify(correction);
  if(changed){assertOwner();current=await this.request(path(link.id),{method:'PATCH',data:{photos},ownerId:userId});link.signature=desired;link.pending=false;this.saveLinks();}
  assertOwner();
  if(!(link.pending&&current.analysisStatus==='DONE')&&(!correction||changed||!['DONE','FAILED'].includes(current.analysisStatus))){
   onPhase('Calculating…');
   link.pending=true;link.kind='analysis';link.previousJobId=priorAnalysisId;link.jobId=null;this.saveLinks();
   try{const queued=await this.request(path(link.id)+'/@analysis',{method:'POST',ownerId:userId});if(!queued?.jobId)throw new Error('The analysis acknowledgement is incomplete. Please retry.');link.jobId=queued.jobId;}
   catch(e){if(e.status!==409){if(e.status>=400&&e.status<500){link.pending=false;this.saveLinks();}throw e;}const running=await this.reader.readRecord(link.id,{cancelled,ownerId:userId});if(running.analysisStatus!=='ANALYZING'){link.pending=false;this.saveLinks();throw e;}link.jobId=running.analysisId;}
   link.pending=true;this.saveLinks();current=await this.waitResult(link.id,{assertOwner,onPhase,jobId:link.jobId,cancelled,ownerId:userId});
  }
  if(correction&&!resumedEdit){
   assertOwner();
   const target=current.photos.find(p=>p.before.key===link.photos[correction.photo]);
   if(!target)throw new Error('This dish is no longer available on the server.');
   // @edit receives every retained group. Omit before to keep its original weight/container.
   const groups=current.photos.map(p=>({photoId:p.photoId,...(p.after?{after:p.after}:{}),...(p.photoId===target.photoId?{text:correction.text.trim()}:{})}));
   link.pending=true;link.kind='edit';link.correction=JSON.stringify(correction);link.previousJobId=current.analysisId||null;link.jobId=null;this.saveLinks();
   onPhase('Calculating…');
   try{
    const queued=await this.request(path(link.id)+'/@edit',{method:'POST',data:{photos:groups},ownerId:userId});
    if(!queued?.jobId)throw new Error('The analysis acknowledgement is incomplete. Please retry.');
    link.jobId=queued.jobId;this.saveLinks();
    if(queued.skippedEdits?.length){link.correction=null;this.saveLinks();throw new Error('The photo changed. Wait for analysis, then retry your correction.');}
   }catch(e){if(e.status>=400&&e.status<500){link.pending=false;this.saveLinks();}throw e;}
   current=await this.waitResult(link.id,{assertOwner,onPhase,jobId:link.jobId,cancelled,ownerId:userId});
  }
  assertOwner();link.pending=false;link.lastJobId=current.analysisId||link.jobId||link.lastJobId;this.saveLinks();
  return {record:current,signature:sig,photoKeys:{...link.photos}};
 }
 async waitResult(id,{assertOwner,onPhase,jobId,cancelled,ownerId}){
  onPhase('Calculating…');assertOwner();
  const result=await this.reader.readRecord(id,{untilDone:true,jobId,cancelled,ownerId});assertOwner();return result;
 }
}
module.exports={SkcaleClient,ORIGIN,SESSION_KEY,LINK_KEY,signature,imageType};
