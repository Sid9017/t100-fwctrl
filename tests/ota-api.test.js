import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createOtaHandler} from '../server/ota.js';
import {MemoryStore} from '../server/memory-store.js';
import {fetchLatestOad} from '../src/web/latest-oad.js';
import {checkedBlobFetch} from '../server/blob-fetch.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
const token='test-secret-'.repeat(4);
function fixture(n=1){
  const data=Buffer.alloc(32);data.writeUInt16LE(n,4);data.writeUInt16LE(8,6);data.writeUInt32LE(0x42424242,8);
  const metadata={schemaVersion:1,product:'t100',kind:'oad',version:`0x${n.toString(16).padStart(4,'0')}`,commitSha:'a'.repeat(40),ref:'refs/heads/main',workflow:'.github/workflows/t100-firmware.yml',runId:String(n),runNumber:n,runAttempt:1,builtAt:'2026-10-10T00:00:00Z',size:data.length,sha256:hash(data)};
  return {data,metadata};
}
function upload({data,metadata},headers={}) {
  const form=new FormData();form.set('metadata',JSON.stringify(metadata));form.set('firmware',new Blob([data]),'BK3633_T100_oad.bin');
  return new Request('https://example.test/api/ota/latest',{method:'POST',body:form,headers:{Authorization:`Bearer ${token}`,'Idempotency-Key':hash(`${metadata.workflow}:${metadata.runId}:${metadata.runAttempt}:${metadata.sha256}`),...headers}});
}
function service(store=new MemoryStore(),secret=token){return {store,handler:createOtaHandler({getStore:()=>store,token:secret})};}
const get=(handler,path='/api/ota/latest')=>handler(new Request(`https://example.test${path}`));
test('upload, metadata, exact download, replacement, and stale no-op keep one binary',async()=>{
  const {store,handler}=service();assert.equal((await get(handler)).status,404);
  assert.equal((await handler(upload(fixture()))).status,200);
  const metadata=await (await get(handler)).json();assert.equal(metadata.version,'0x0001');
  const download=await get(handler,metadata.downloadUrl);assert.equal(download.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await download.arrayBuffer()),fixture().data);
  assert.equal((await (await handler(upload(fixture()))).json()).status,'unchanged');
  await handler(upload(fixture(2)));assert.equal((await get(handler,metadata.downloadUrl)).status,404);
  assert.equal((await (await handler(upload(fixture()))).json()).status,'stale');
  assert.equal((await get(handler).then(r=>r.json())).version,'0x0002');
  assert.equal([...store.entries.values()].filter(x=>x.data.firmware).length,1);
});
test('authentication fails closed before storage and parsing',async()=>{
  const {handler}=service();assert.equal((await handler(upload(fixture(),{Authorization:'Bearer wrong'}))).status,401);
  assert.equal((await service(new MemoryStore(),'').handler(upload(fixture()))).status,503);
  assert.equal((await handler(upload(fixture(),{'Idempotency-Key':'wrong'}))).status,400);
});
test('reject bad hashes, merge images, incorrect size/version/sequence and untrusted metadata',async()=>{
  const {handler}=service();
  for(const patch of [{sha256:'0'.repeat(64)},{kind:'merge_crc'},{version:'0x9999'},{size:48},{runNumber:0},{runAttempt:1.5},{ref:'refs/heads/topic'},{workflow:'other.yml'},{runId:1},{extra:true}]){
    const f=fixture();Object.assign(f.metadata,patch);assert.equal((await handler(upload(f))).status,400,JSON.stringify(patch));
  }
  const f=fixture();f.data.writeUInt32LE(0,8);f.metadata.sha256=hash(f.data);assert.equal((await handler(upload(f))).status,400);
  const response=await handler(upload(fixture(),{'content-length':'9999999'}));assert.equal(response.status,413);
  assert.equal((await handler(new Request('https://example.test/api/ota/latest',{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'multipart/form-data; boundary=bad'},body:'invalid'}))).status,400);
});
test('changed request with same key and conflicting release sequence return 409',async()=>{
  const {handler}=service();await handler(upload(fixture()));
  const sameKey=fixture();sameKey.metadata.builtAt='2026-10-11T00:00:00Z';assert.equal((await handler(upload(sameKey))).status,409);
  const conflict=fixture();conflict.data[20]=1;conflict.metadata.sha256=hash(conflict.data);assert.equal((await handler(upload(conflict))).status,409);
});
test('concurrent initial and replacement publishers cannot roll back latest',async()=>{
  const {handler}=service();await Promise.all([3,1,4,2,5].map(n=>handler(upload(fixture(n)))));
  assert.equal((await get(handler).then(r=>r.json())).runNumber,5);
  await Promise.all([8,6,7,9].map(n=>handler(upload(fixture(n)))));
  assert.equal((await get(handler).then(r=>r.json())).runNumber,9);
});
test('storage failure does not acknowledge success and idempotent retry can finish',async()=>{
  const store=new MemoryStore();const set=store.setJSON.bind(store);let fail=true;
  store.setJSON=async(...args)=>{if(args[0]==='latest'&&fail)throw Error('storage');return set(...args);};
  const {handler}=service(store);assert.equal((await handler(upload(fixture()))).status,503);
  fail=false;assert.equal((await handler(upload(fixture()))).status,200);
});
test('client consumes API, detects corrupt bytes and retries a replaced hash once',async()=>{
  const {handler}=service();await handler(upload(fixture()));let replace=true;
  const fetcher=async(path,opts)=>{if(path.includes('/download/')&&replace){replace=false;await handler(upload(fixture(2)));}return handler(new Request(`https://example.test${path}`,opts));};
  const result=await fetchLatestOad({fetcher});assert.equal(result.metadata.version,'0x0002');assert.deepEqual(Buffer.from(await result.file.arrayBuffer()),fixture(2).data);
  await assert.rejects(fetchLatestOad({fetcher:async(path,opts)=>path.includes('/download/')?new Response(fixture().data):fetcher(path,opts)}),/metadata/);
  const corrupt=fixture(2).data;corrupt[20]=1;
  await assert.rejects(fetchLatestOad({fetcher:async(path,opts)=>path.includes('/download/')?new Response(corrupt):fetcher(path,opts)}),/SHA256/);
});
test('SDK fetch guard rejects lost conditional writes but preserves CAS 412',async(t)=>{
  t.mock.method(globalThis,'fetch',async()=>new Response('',{status:500}));
  await assert.rejects(checkedBlobFetch('https://store.test',{method:'put'}),/write failed/);
  globalThis.fetch=async()=>new Response('',{status:412});assert.equal((await checkedBlobFetch('https://store.test',{method:'PUT'})).status,412);
});
