import { createHash, timingSafeEqual } from 'node:crypto';
import { OAD_MAX_BYTES, validateOad } from '../src/web/ota-format.js';
const WORKFLOW = '.github/workflows/t100-firmware.yml';
const HEADERS = {'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'};
const hash = data => createHash('sha256').update(data).digest('hex');
const json = (data, status=200) => Response.json(data, {status, headers:HEADERS});
class HttpError extends Error { constructor(status,message) {super(message);this.status=status;} }
const check = (condition,message,status=400) => {if(!condition)throw new HttpError(status,message);};
const fields = ['schemaVersion','product','kind','version','commitSha','ref','workflow','runId','runNumber','runAttempt','builtAt','size','sha256'];
function validateMetadata(value) {
  check(value && typeof value === 'object' && !Array.isArray(value), 'Invalid metadata');
  check(Object.keys(value).length===fields.length && fields.every(key=>Object.hasOwn(value,key)), 'Invalid metadata fields');
  const m=Object.fromEntries(fields.map(key=>[key,value[key]]));
  check(m.schemaVersion===1 && m.product==='t100' && m.kind==='oad' && m.ref==='refs/heads/main' && m.workflow===WORKFLOW,'Untrusted release target');
  check(typeof m.runId==='string' && /^[1-9][0-9]{0,29}$/.test(m.runId),'Invalid runId');
  check([m.runNumber,m.runAttempt].every(n=>Number.isSafeInteger(n)&&n>0),'Invalid release sequence');
  check(typeof m.version==='string' && /^0x[0-9a-f]{4}$/.test(m.version),'Invalid version');
  check(typeof m.commitSha==='string' && /^[0-9a-f]{40}$/.test(m.commitSha),'Invalid commit SHA');
  check(typeof m.sha256==='string' && /^[0-9a-f]{64}$/.test(m.sha256),'Invalid SHA256');
  check(typeof m.builtAt==='string' && m.builtAt.length<=40 && /^\d{4}-\d\d-\d\dT.*Z$/.test(m.builtAt) && Number.isFinite(Date.parse(m.builtAt)),'Invalid build timestamp');
  check(Number.isInteger(m.size)&&m.size>16&&m.size<=OAD_MAX_BYTES,'Invalid size');
  return m;
}
async function limitedBody(request) {
  const max=OAD_MAX_BYTES+16384;
  check(!request.headers.has('content-length') || Number(request.headers.get('content-length'))<=max,'Upload too large',413);
  const reader=request.body?.getReader();check(reader,'Missing upload');
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new HttpError(413,'Upload too large');}chunks.push(value);}
  return Buffer.concat(chunks);
}
export function createOtaHandler({getStore, token}) {
  return async request => {
    try {
      const path=new URL(request.url).pathname;
      if(path!=='/api/ota/latest' && !/^\/api\/ota\/download\/[0-9a-f]{64}$/.test(path))return json({error:'Not found'},404);
      if(request.method==='POST' && path==='/api/ota/latest') {
        const secret=typeof token==='function'?token():token;
        check(typeof secret==='string'&&secret.length>=32,'OTA publishing is not configured',503);
        const expected=Buffer.from(`Bearer ${secret}`), supplied=Buffer.from(request.headers.get('authorization')||'');
        check(expected.length===supplied.length&&timingSafeEqual(expected,supplied),'Unauthorized',401);
        check((request.headers.get('content-type')||'').startsWith('multipart/form-data;'),'Expected multipart/form-data',415);
        const body=await limitedBody(request);
        let form, raw;
        try {form=await new Response(body,{headers:{'Content-Type':request.headers.get('content-type')}}).formData();raw=JSON.parse(form.get('metadata'));}
        catch {throw new HttpError(400,'Malformed upload');}
        check(form.getAll('metadata').length===1 && form.getAll('firmware').length===1 && [...form.keys()].length===2,'Expected firmware and metadata');
        const m=validateMetadata(raw), file=form.get('firmware');
        check(file instanceof Blob,'Missing firmware file');
        const bytes=Buffer.from(await file.arrayBuffer());
        try {validateOad(bytes,m);}catch(error){throw new HttpError(400,error.message);}
        check(hash(bytes)===m.sha256,'SHA256 mismatch');
        const key=hash(`${m.workflow}:${m.runId}:${m.runAttempt}:${m.sha256}`);
        check(request.headers.get('idempotency-key')===key,'Invalid Idempotency-Key');
        const store=getStore();
        // Receipts contain hashes only, never another firmware copy. Persist them
        // before CAS so a failed write can retry but a changed request cannot reuse a key.
        const fingerprint=hash(JSON.stringify(m));
        const receiptKey=`receipts/${key}`;
        const receipt=await store.setJSON(receiptKey,{fingerprint},{onlyIfNew:true});
        if(!receipt.modified){const saved=await store.get(receiptKey,{type:'json'});check(saved?.fingerprint===fingerprint,'Idempotency conflict',409);}
        for(let attempt=0;attempt<8;attempt++) {
          const current=await store.getWithMetadata('latest',{type:'json'});
          if(current){
            const old=current.data.metadata;
            const order=m.runNumber-old.runNumber || m.runAttempt-old.runAttempt;
            if(order<0)return json({ok:true,status:'stale'});
            if(order===0){check(old.sha256===m.sha256&&old.commitSha===m.commitSha&&old.runId===m.runId,'Release sequence conflict',409);return json({ok:true,status:'unchanged'});}
            check(current.etag,'Storage revision unavailable',503);
          }
          const saved=await store.setJSON('latest',{metadata:m,firmware:bytes.toString('base64')},current?{onlyIfMatch:current.etag}:{onlyIfNew:true});
          if(saved.modified)return json({ok:true,status:'published',sha256:m.sha256});
        }
        return json({error:'Concurrent publish; retry'},503);
      }
      if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405);
      const current=await getStore().getWithMetadata('latest',{type:'json'});
      if(!current)return json({error:'No published OAD firmware'},404);
      const {metadata:m,firmware}=current.data;
      if(path==='/api/ota/latest') {
        const response=json({...m,downloadUrl:`/api/ota/download/${m.sha256}`});
        return request.method==='HEAD'?new Response(null,{headers:response.headers}):response;
      }
      if(path!==`/api/ota/download/${m.sha256}`)return json({error:'Firmware replaced; fetch latest again'},404);
      const bytes=Buffer.from(firmware,'base64');
      return new Response(request.method==='HEAD'?null:bytes,{headers:{...HEADERS,'Content-Type':'application/octet-stream',
        'Content-Length':String(bytes.length),'Content-Disposition':'attachment; filename="BK3633_T100_oad.bin"',ETag:`"${m.sha256}"`}});
    }catch(error){return json({error:error instanceof HttpError?error.message:'OTA service unavailable'},error instanceof HttpError?error.status:503);}
  };
}
