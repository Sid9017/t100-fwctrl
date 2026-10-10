import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSignedOtaHandler,signedIdempotencyKey} from '../server/signed-ota.js';
import {MemoryStore} from '../server/memory-store.js';
import {validateSignedOad,OTA_PUBLIC_KEY_HEX,parseManifest} from '../src/web/signed-ota-format.js';
import {fetchLatestSignedOad} from '../src/web/latest-signed-oad.js';
import {signedFixture,trust,hash} from './fixtures/signed-ota.js';
const token='test-secret-'.repeat(4);
function service(store=new MemoryStore(),key=trust.publicKeyHex){return {store,handler:createSignedOtaHandler({getStore:()=>store,token,publicKeyHex:key})};}
function upload(f,headers={}){const form=new FormData();form.set('metadata',JSON.stringify(f.metadata));form.set('firmware',new Blob([f.bytes]),'firmware.bin');form.set('manifest',new Blob([f.manifest]),'firmware.manifest');return new Request('https://test/api/ota/signed/latest',{method:'POST',body:form,headers:{Authorization:`Bearer ${token}`,'Idempotency-Key':signedIdempotencyKey(f.metadata),...headers}});}
const get=(handler,path='/api/ota/signed/latest')=>handler(new Request(`https://test${path}`));
test('publishing key matches firmware public-only configuration',async(t)=>{
  const h=await readFile(new URL('../../bk-hw-temp/projects/t100/config/ota_trust.h',import.meta.url),'utf8').catch(()=>null);
  if(!h){t.skip('Firmware checkout unavailable');return;}
  assert.equal(h.match(/0x[0-9a-f]{2}/g).map(s=>s.slice(2)).join(''),OTA_PUBLIC_KEY_HEX);
});
test('signed publication stores and acknowledges a matching pair; replaces both atomically',async()=>{
  const f=signedFixture(),{handler,store}=service();assert.equal((await get(handler)).status,404);
  const published=await handler(upload(f));assert.equal(published.status,200);assert.deepEqual(await published.json(),{ok:true,status:'published',schemaVersion:2,releaseCounter:f.metadata.releaseCounter,manifestSha256:f.metadata.manifestSha256,sha256:f.metadata.sha256});
  const m=await (await get(handler)).json();
  assert.deepEqual(Buffer.from(await (await get(handler,m.downloadUrl)).arrayBuffer()),f.bytes);
  assert.deepEqual(Buffer.from(await (await get(handler,m.manifestUrl)).arrayBuffer()),f.manifest);
  assert.equal((await (await handler(upload(f))).json()).status,'unchanged');
  await handler(upload(signedFixture(2)));assert.equal((await get(handler,m.downloadUrl)).status,404);assert.equal((await get(handler,m.manifestUrl)).status,404);
  assert.equal([...store.entries.values()].filter(e=>e.data.firmware).length,1);
});
test('signature, content, target, malformed metadata and upload auth fail closed',async()=>{
  const {handler,store}=service();
  for(const mutation of [f=>f.manifest[100]^=1,f=>{f.bytes[20]^=1;f.metadata.sha256=hash(f.bytes);},f=>f.manifest[60]=1,f=>f.manifest=f.manifest.subarray(0,127),f=>f.metadata.releaseCounter=1,f=>f.metadata.releaseCounter='18446744073709551616',f=>f.metadata.releaseCounter='9007199254740993',f=>f.metadata.schemaVersion=1,f=>f.metadata.signingKeyId=2,f=>f.metadata.extra=true]){
    const f=signedFixture();mutation(f);const response=await handler(upload(f));assert.equal(response.status,400,await response.text());
  }
  assert.equal((await handler(upload(signedFixture(),{Authorization:'Bearer wrong'}))).status,401);
  assert.equal((await service(new MemoryStore(),OTA_PUBLIC_KEY_HEX).handler(upload(signedFixture()))).status,400);
  assert.equal(store.entries.size,0);
});
test('uint64 ordering, rollback, conflict and concurrent publishers never overwrite a newer release',async()=>{
  const {handler}=service(),f=signedFixture(1,{epoch:65535});
  assert.equal((await handler(upload(f))).status,200);
  assert.equal((await handler(upload(signedFixture(2)))).status,409);
  assert.equal((await handler(upload(signedFixture(1,{epoch:65535})))).status,409); // different signature, same release
  await Promise.all([3,5,2,4].map(n=>handler(upload(signedFixture(n,{epoch:65535})))));
  assert.equal((await (await get(handler)).json()).releaseCounter,((65535n<<48n)|(5n<<16n)|1n).toString());
});
test('storage failure is not success; idempotent retry works; altered same key conflicts',async()=>{
  const store=new MemoryStore(),set=store.setJSON.bind(store);let fail=true;
  store.setJSON=async(...args)=>{if(args[0]==='latest' && fail)throw Error('fail');return set(...args);};
  const {handler}=service(store),f=signedFixture();assert.equal((await handler(upload(f))).status,503);fail=false;assert.equal((await handler(upload(f))).status,200);
  f.metadata.builtAt='2026-10-11T00:00:00Z';assert.equal((await handler(upload(f))).status,409);
});
test('signed client validates both files and retries replacement between their downloads',async()=>{
  const {handler}=service(),first=signedFixture(),second=signedFixture(2);await handler(upload(first));let replace=true;
  const fetcher=async(path,opts)=>{if(path.includes('/manifest/')&&replace){replace=false;await handler(upload(second));}return handler(new Request(`https://test${path}`,opts));};
  const bundle=await fetchLatestSignedOad({fetcher,trust});assert.equal(bundle.metadata.version,'0x0002');assert.deepEqual(Buffer.from(await bundle.manifest.arrayBuffer()),second.manifest);
  await assert.rejects(fetchLatestSignedOad({trust,fetcher:async(path,opts)=>path.includes('/manifest/')?new Response(first.manifest):fetcher(path,opts)}),/match/);
});
test('manifest uses exact unsigned 64-bit release values and rejects every signed-header mutation',async()=>{
  const f=signedFixture(1,{epoch:65535});assert.equal(parseManifest(f.manifest).releaseCounter,f.metadata.releaseCounter);
  await validateSignedOad(f.bytes,f.manifest,f.metadata,trust);
  for(let i=0;i<128;i++){const m=Buffer.from(f.manifest);m[i]^=1;await assert.rejects(validateSignedOad(f.bytes,m,undefined,trust));}
});
test('old unsigned API paths return 404',async()=>{
  const {handler}=service();for(const path of ['/api/ota/latest','/api/ota/download/'+ 'a'.repeat(64)])assert.equal((await get(handler,path)).status,404);
});
