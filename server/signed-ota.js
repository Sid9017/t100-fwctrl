import { createHash, timingSafeEqual } from 'node:crypto';
import { OAD_MAX_BYTES } from '../src/web/ota-format.js';
import { validateSignedOad, OTA_KEY_ID, OTA_PUBLIC_KEY_HEX } from '../src/web/signed-ota-format.js';
const hash=data=>createHash('sha256').update(data).digest('hex');
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(data,status=200)=>Response.json(data,{status,headers});
class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
const check=(ok,message,status=400)=>{if(!ok)throw new HttpError(status,message);};
const fields=['schemaVersion','protocolVersion','signingKeyId','releaseCounter','manifestSha256','manifestSize','product','kind','version','commitSha','ref','workflow','runId','runNumber','runAttempt','builtAt','size','sha256'];
export function validateSignedMetadata(value) {
  check(value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length===fields.length && fields.every(k=>Object.hasOwn(value,k)),'Invalid signed metadata fields');
  const m=Object.fromEntries(fields.map(k=>[k,value[k]]));
  check(m.schemaVersion===2 && m.protocolVersion===1 && m.signingKeyId===OTA_KEY_ID && m.manifestSize===128 && m.product==='t100' && m.kind==='oad' && m.ref==='refs/heads/main' && m.workflow==='.github/workflows/t100-firmware.yml','Untrusted signed release target');
  check(typeof m.releaseCounter==='string' && /^[1-9][0-9]{0,19}$/.test(m.releaseCounter) && BigInt(m.releaseCounter)<(1n<<64n),'Invalid releaseCounter');
  check(typeof m.runId==='string' && /^[1-9][0-9]{0,29}$/.test(m.runId) && Number.isSafeInteger(m.runNumber) && m.runNumber>0 && m.runNumber<=0xffffffff && Number.isSafeInteger(m.runAttempt) && m.runAttempt>0 && m.runAttempt<=0xffff,'Invalid release sequence');
  const release=BigInt(m.releaseCounter);
  check((release>>48n)>0n && (release & ((1n<<48n)-1n))===((BigInt(m.runNumber)<<16n)|BigInt(m.runAttempt)),'Release counter does not match CI sequence');
  check(typeof m.commitSha==='string' && /^[0-9a-f]{40}$/.test(m.commitSha) && typeof m.version==='string' && /^0x[0-9a-f]{4}$/.test(m.version),'Invalid release identity');
  check([m.sha256,m.manifestSha256].every(s=>typeof s==='string' && /^[0-9a-f]{64}$/.test(s)),'Invalid digest');
  check(Number.isInteger(m.size) && m.size>16 && m.size<=OAD_MAX_BYTES && m.size%16===0,'Invalid firmware size');
  check(typeof m.builtAt==='string' && m.builtAt.length<=40 && /^\d{4}-\d\d-\d\dT.*Z$/.test(m.builtAt) && Number.isFinite(Date.parse(m.builtAt)),'Invalid build timestamp');
  return m;
}
export const signedUrls=m=>({downloadUrl:`/api/ota/signed/download/${m.sha256}/${m.manifestSha256}`,manifestUrl:`/api/ota/signed/manifest/${m.sha256}/${m.manifestSha256}`});
export const signedIdempotencyKey=m=>hash(`${m.workflow}:${m.runId}:${m.runAttempt}:${m.sha256}:${m.manifestSha256}`);
export function createSignedOtaHandler({getStore,token,publicKeyHex=OTA_PUBLIC_KEY_HEX}) {
  return async request=>{
    try {
      const path=new URL(request.url).pathname;
      if(path!=='/api/ota/signed/latest' && !/^\/api\/ota\/signed\/(download|manifest)\/[0-9a-f]{64}\/[0-9a-f]{64}$/.test(path))return json({error:'Not found'},404);
      if(request.method==='POST' && path==='/api/ota/signed/latest') {
        const secret=typeof token==='function'?token():token;
        check(typeof secret==='string' && secret.length>=32,'Signed OTA publishing is not configured',503);
        const expected=Buffer.from(`Bearer ${secret}`),supplied=Buffer.from(request.headers.get('authorization')||'');
        check(expected.length===supplied.length && timingSafeEqual(expected,supplied),'Unauthorized',401);
        check((request.headers.get('content-type')||'').startsWith('multipart/form-data;'),'Expected multipart/form-data',415);
        const max=OAD_MAX_BYTES+16384;
        check(!request.headers.has('content-length') || Number(request.headers.get('content-length'))<=max,'Upload too large',413);
        const reader=request.body?.getReader();check(reader,'Missing upload');
        const chunks=[];let size=0;
        while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new HttpError(413,'Upload too large');}chunks.push(value);}
        let form,raw;
        try{form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':request.headers.get('content-type')}}).formData();raw=JSON.parse(form.get('metadata'));}catch{throw new HttpError(400,'Malformed signed upload');}
        check([...form.keys()].length===3 && ['metadata','firmware','manifest'].every(k=>form.getAll(k).length===1),'Expected firmware, manifest and metadata');
        const m=validateSignedMetadata(raw),file=form.get('firmware'),manifestFile=form.get('manifest');
        check(file instanceof Blob && manifestFile instanceof Blob && manifestFile.size===128,'Missing firmware or 128-byte manifest');
        const bytes=Buffer.from(await file.arrayBuffer()),manifest=Buffer.from(await manifestFile.arrayBuffer());
        try{await validateSignedOad(bytes,manifest,m,{publicKeyHex});}catch(error){throw new HttpError(400,error.message);}
        const key=signedIdempotencyKey(m);check(request.headers.get('idempotency-key')===key,'Invalid Idempotency-Key');
        const store=getStore(),fingerprint=hash(JSON.stringify(m)),receiptKey=`receipts/${key}`;
        const receipt=await store.setJSON(receiptKey,{fingerprint},{onlyIfNew:true});
        if(!receipt.modified)check((await store.get(receiptKey,{type:'json'}))?.fingerprint===fingerprint,'Idempotency conflict',409);
        const reply=status=>json({ok:true,status,schemaVersion:2,releaseCounter:m.releaseCounter,manifestSha256:m.manifestSha256,sha256:m.sha256});
        for(let i=0;i<8;i++) {
          const current=await store.getWithMetadata('latest',{type:'json'});
          if(current) {
            const old=current.data.metadata,order=BigInt(m.releaseCounter)-BigInt(old.releaseCounter);
            check(order>=0n,'Release rollback rejected',409);
            if(order===0n){check(old.sha256===m.sha256 && old.manifestSha256===m.manifestSha256 && old.commitSha===m.commitSha && old.runId===m.runId,'Release counter conflict',409);return reply('unchanged');}
            check(current.etag,'Storage revision unavailable',503);
          }
          const saved=await store.setJSON('latest',{metadata:m,firmware:bytes.toString('base64'),manifest:manifest.toString('base64')},current?{onlyIfMatch:current.etag}:{onlyIfNew:true});
          if(saved.modified)return reply('published');
        }
        return json({error:'Concurrent publish; retry'},503);
      }
      if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405);
      const current=await getStore().getWithMetadata('latest',{type:'json'});if(!current)return json({error:'No published signed OAD firmware'},404);
      const {metadata:m,firmware,manifest}=current.data,urls=signedUrls(m);
      if(path==='/api/ota/signed/latest'){const response=json({...m,...urls});return request.method==='HEAD'?new Response(null,{headers:response.headers}):response;}
      check(path===urls.downloadUrl || path===urls.manifestUrl,'Signed release replaced; fetch latest again',404);
      const isManifest=path===urls.manifestUrl,bytes=Buffer.from(isManifest?manifest:firmware,'base64'),digest=isManifest?m.manifestSha256:m.sha256;
      return new Response(request.method==='HEAD'?null:bytes,{headers:{...headers,'Content-Type':'application/octet-stream','Content-Length':String(bytes.length),ETag:`"${digest}"`,'Content-Disposition':`attachment; filename="BK3633_T100_oad.${isManifest?'manifest':'bin'}"`}});
    }catch(error){return json({error:error instanceof HttpError?error.message:'Signed OTA service unavailable'},error instanceof HttpError?error.status:503);}
  };
}
