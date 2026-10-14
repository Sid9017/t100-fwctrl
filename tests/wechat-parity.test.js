import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {miniSubtle,miniStorage,randomUuid} from '../src/miniprogram/platform.js';
import {verifyAdmissionToken} from '../src/web/auth.js';
import {validateSignedOad} from '../src/web/signed-ota-format.js';
import {signedFixture,trust} from './fixtures/signed-ota.js';
import {latestMiniFirmware} from '../src/miniprogram/firmware.js';
import {AuthStore} from '../src/web/auth-store.js';
import {loadMiniPreset} from '../src/miniprogram/assets.js';
import {readFile} from 'node:fs/promises';
import {MiniRuntime} from '../src/miniprogram/runtime.js';
import {viewModel} from '../src/miniprogram/view-model.js';
test('native P-256 verification matches WebCrypto and rejects altered tokens, digests and manifests',async()=>{
  const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=pair.publicKey.export({format:'jwk'}),pub=Buffer.concat([Buffer.from([2+(Buffer.from(jwk.y,'base64url').at(-1)&1)]),Buffer.from(jwk.x,'base64url')]);
  const payload=Buffer.alloc(16);payload.write('abcd1234');payload.writeUInt32LE(1000,8);payload.writeUInt32LE(1300,12);
  const message=pub.toString('base64url')+'.'+payload.toString('base64url'),sig=sign('sha256',Buffer.from(message),{key:pair.privateKey,dsaEncoding:'ieee-p1363'}),token=message+'.'+sig.toString('base64url');
  assert.deepEqual(await verifyAdmissionToken(token,1100,miniSubtle),await verifyAdmissionToken(token,1100));
  sig[0]^=1;await assert.rejects(verifyAdmissionToken(message+'.'+sig.toString('base64url'),1100,miniSubtle),/signature/);
  await assert.rejects(verifyAdmissionToken(token,1600,miniSubtle),/expired/);
  const f=signedFixture();await validateSignedOad(f.bytes,f.manifest,f.metadata,{...trust,subtle:miniSubtle});
  for(let i=0;i<128;i++){const m=Buffer.from(f.manifest);m[i]^=1;await assert.rejects(validateSignedOad(f.bytes,m,undefined,{...trust,subtle:miniSubtle}));}
  const bytes=Buffer.from(f.bytes);bytes[20]^=1;await assert.rejects(validateSignedOad(bytes,f.manifest,undefined,{...trust,subtle:miniSubtle}),/SHA256/);
});
test('native auth uses isolated wx storage, validates atomically and resolves by device name',()=>{
  const storage=new Map(),api={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v)},store=new AuthStore(miniStorage(api));
  const record={pub_key:'036b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296',auth_key:'abcd1234',name:'YD-03148c52fb00'};
  store.import(JSON.stringify(record));assert.equal(new AuthStore(miniStorage(api)).resolve({name:record.name,id:'different-phone-id'}).auth_key,record.auth_key);
  const before=storage.get('t100.mfg.auth.v1');assert.throws(()=>store.import(JSON.stringify([record,{...record,auth_key:'bad'}])));assert.equal(storage.get('t100.mfg.auth.v1'),before);
  store.remove({name:record.name});assert.equal(store.records().length,0);
});
test('native UUID requires secure random bytes and packaged emotion is identical to the original',async()=>{
  const id=await randomUuid({getRandomValues:o=>o.success({randomValues:Uint8Array.from({length:16},(_,i)=>i).buffer})});assert.equal(id,'00010203-0405-4607-8809-0a0b0c0d0e0f');
  await assert.rejects(randomUuid({}),/unavailable/);const preset=await loadMiniPreset();assert.deepEqual(preset.loaded.payload,await readFile('assets/preset1.bin'));
});
test('native latest release downloads only verified same-origin immutable paths and retries publication replacement',async()=>{
  const a=signedFixture(),b=signedFixture(2);const meta=f=>({...f.metadata,downloadUrl:`/api/ota/signed/download/${f.metadata.sha256}/${f.metadata.manifestSha256}`,manifestUrl:`/api/ota/signed/manifest/${f.metadata.sha256}/${f.metadata.manifestSha256}`});
  let attempts=0;const urls=[];const api={request:o=>{urls.push(o.url);const path=new URL(o.url).pathname;let data;
    if(path.endsWith('/latest'))data=Buffer.from(JSON.stringify(meta(attempts?a:b))); // first b, replacement a
    else if(path.includes('/download/'))data=attempts?a.bytes:b.bytes;
    else if(!attempts++){o.success({statusCode:404,data:new ArrayBuffer(0)});return;}else data=a.manifest;
    o.success({statusCode:200,data:Uint8Array.from(data).buffer});
  }};
  const bundle=await latestMiniFirmware(api,{...trust,subtle:miniSubtle});assert.equal(bundle.metadata.version,a.metadata.version);assert.ok(urls.every(url=>url.startsWith('https://t100-ctrl.netlify.app/api/ota/signed/')));
  await assert.rejects(latestMiniFirmware({request:o=>o.success({statusCode:200,data:Uint8Array.from(Buffer.from(JSON.stringify({...meta(a),downloadUrl:'https://untrusted/firmware.bin'}))).buffer})}),/metadata/);
});
test('native countdown/notify commits feed the same WASM functions and preserve fade rendering',async()=>{
  const wasm=await readFile('assets/runtime/preview.wasm'),a=(await WebAssembly.instantiate(wasm,{})).instance.exports,b=(await WebAssembly.instantiate(wasm,{})).instance.exports;
  const mini=new MiniRuntime(a),web=new MiniRuntime(b);const status={screen:3,phase:2,mode:2,flags:1};mini.sync(status,null);web.sync(status,null);
  mini.commit({id:1,name:'countdown',currentKcal:-250,targetKcal:1350,tdeeKcal:1600});b.preview_remote_countdown(-250,1350,1600);assert.deepEqual(mini.frame().rgba,web.frame().rgba);
  const notice={id:2,name:'notify',gray:Array.from({length:240},()=>255),colorRgb565:0x07e0};mini.commit(notice);mini.sync({...status,screen:6},null);web.sync({...status,screen:6},null);
  if(b.notify_ui_prepare_update()>=0){const buffer=new Uint8Array(b.memory.buffer,b.preview_notify_gray(),5088);buffer.fill(0);buffer.set(notice.gray);b.preview_remote_notify(notice.colorRgb565);}
  assert.deepEqual(mini.frame().rgba,web.frame().rgba);
});
test('native OAD controls disable unknown/same versions and auth-less devices',()=>{
  const base={connected:true,status:{flags:1},hasAuth:true,firmware:'1.0.0-1234',firmwareInfo:{version:'0x5678',size:32},battery:null,mtu:185};
  assert.equal(viewModel(base).canOad,true);
  assert.equal(viewModel({...base,firmwareSource:'published'}).hasPublishedUpdate,true);
  for(const patch of [{firmwareSource:'local'},{firmware:'Unknown'},{connected:false},{firmwareInfo:{version:'0x1234'}}])assert.equal(viewModel({...base,firmwareSource:'published',...patch}).hasPublishedUpdate,false);
  assert.equal(viewModel({...base,firmwareInfo:{version:'0x1234'}}).sameFirmware,true);assert.equal(viewModel({...base,firmwareInfo:{version:'0x1234'}}).canOad,false);
  for(const patch of [{firmware:'Unknown'},{hasAuth:false},{busy:true},{firmwareLoading:true}])assert.equal(viewModel({...base,...patch}).canOad,false);
});
