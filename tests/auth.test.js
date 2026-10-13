import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { AuthStore,parseAuthImport } from '../src/web/auth-store.js';
import { verifyAdmissionToken } from '../src/web/auth.js';
class Storage {
  values=new Map();
  getItem(key){return this.values.get(key)||null;}
  setItem(key,value){this.values.set(key,value);}
}
const pub='036b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296';
const device={id:'browser-device',name:`YD-${pub.slice(0,12)}`};
const record={pub_key:pub,auth_key:'abcd1234',deviceId:device.id,name:device.name};
test('credentials persist across store instances and match identity after browser id changes',()=>{
  const storage=new Storage();new AuthStore(storage).save(record);
  const fresh=new AuthStore(storage);
  assert.deepEqual(fresh.resolve(device),record);
  assert.equal(fresh.resolve({...device,id:'different-browser-id'}).auth_key,record.auth_key);
  assert.equal(fresh.resolve({...device,name:'YD-000000000000'}),null);
  fresh.remove(device);assert.deepEqual(fresh.records(),[]);
});
test('storage quota failures are surfaced, corrupt JSON is never silently overwritten',()=>{
  const store=new AuthStore({getItem:()=>null,setItem(){throw Error('quota');}});
  assert.throws(()=>store.save(record),/Cannot persist/);
  const storage=new Storage();storage.setItem('t100.mfg.auth.v1','broken');
  assert.throws(()=>new AuthStore(storage).save(record));
  assert.equal(storage.getItem('t100.mfg.auth.v1'),'broken');
});
test('desktop credential imports are validated atomically and duplicate keys replace existing records',()=>{
  const store=new AuthStore(new Storage());store.save(record);
  assert.throws(()=>store.import(JSON.stringify([record,{auth_key:'bad'}])));
  assert.equal(store.records().length,1);
  store.import(JSON.stringify({pub_key:pub,auth_key:'new12345'}));
  assert.equal(store.resolve({...device,id:'other'}).auth_key,'new12345');
  store.save({...record,pub_key:`02${'ac'.repeat(32)}`});
  assert.equal(store.resolve(device).pub_key,`02${'ac'.repeat(32)}`);
});
function tokenFixture({iat=1000,exp=1300,signatureCorrupt=false}={}) {
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const jwk=publicKey.export({format:'jwk'});
  const pub=Buffer.concat([Buffer.from([2+(Buffer.from(jwk.y,'base64url').at(-1)&1)]),Buffer.from(jwk.x,'base64url')]);
  const payload=Buffer.alloc(16);payload.write('abcd1234');payload.writeUInt32LE(iat,8);payload.writeUInt32LE(exp,12);
  const message=`${pub.toString('base64url')}.${payload.toString('base64url')}`;
  const signature=sign('sha256',Buffer.from(message),{key:privateKey,dsaEncoding:'ieee-p1363'});
  if(signatureCorrupt)signature[0]^=1;
  return {token:`${message}.${signature.toString('base64url')}`,name:`YD-${pub.toString('hex').slice(0,12)}`,pub};
}
test('admission verification checks P-256 signature, lifetime and clock skew',async()=>{
  const valid=tokenFixture();assert.equal((await verifyAdmissionToken(valid.token,1100)).pub_key,valid.pub.toString('hex'));
  await assert.rejects(verifyAdmissionToken(valid.token,1500),/expired/);
  const forged=tokenFixture({signatureCorrupt:true});await assert.rejects(verifyAdmissionToken(forged.token,1100),/signature/);
  const long=tokenFixture({exp:2000});await assert.rejects(verifyAdmissionToken(long.token,1100),/expired/);
});

test('credentials use selected names even when token identity differs, and removal preserves other devices',()=>{
  const store=new AuthStore(new Storage());
  const cached={...device,name:'YD-03b93ed7594b'};
  store.save({...record,name:cached.name});
  store.save({...record,pub_key:`03${'cd'.repeat(32)}`,name:'YD-03cdcdcdcdcd',deviceId:'another'});
  assert.equal(store.resolve({...cached,id:'new-browser-id'}).auth_key,record.auth_key);
  store.save({...record,name:cached.name,pub_key:`02${'ef'.repeat(32)}`,deviceId:'new-browser-id',auth_key:'new12345'});
  assert.equal(store.records().length,2);
  assert.equal(store.resolve(cached).auth_key,'new12345');
  store.remove({...cached,id:'changed-again'});
  assert.equal(store.resolve(cached),null);
  assert.equal(store.records().length,1);
});
test('auth import checks JSON, required fields, types and the P-256 curve before mutating storage',()=>{
  const store=new AuthStore(new Storage());store.save(record);
  const before=JSON.stringify(store.records());
  for(const [value,pattern] of [
    ['{bad}',/Invalid JSON/],['[]',/at least one/],['null',/Record 1: Expected/],['true',/Expected/],
    [JSON.stringify({...record,pub_key:undefined}),/pub_key/],
    [JSON.stringify({...record,pub_key:'04'+'a'.repeat(64)}),/pub_key/],
    [JSON.stringify({...record,pub_key:'02'+'ab'.repeat(32)}),/P-256 curve point/],
    [JSON.stringify({...record,auth_key:12345678}),/auth_key/],
    [JSON.stringify({...record,auth_key:'short'}),/auth_key/],
    [JSON.stringify({...record,auth_key:'1234567\n'}),/auth_key/],
    [JSON.stringify({...record,auth_key:'1234567中'}),/auth_key/],
    [JSON.stringify({...record,name:42}),/name must be a string/],
    [JSON.stringify({...record,deviceId:{}}),/deviceId must be a string/],
    [JSON.stringify([record,{...record,auth_key:'bad'}]),/Record 2: auth_key/],
  ]){assert.throws(()=>store.import(value),pattern);assert.equal(JSON.stringify(store.records()),before);}
  assert.throws(()=>parseAuthImport(' '.repeat(1024*1024+1)),/1 MB/);
});
test('auth import accepts uppercase and BOM, preserves named backup identities and legacy field aliases',()=>{
  const store=new AuthStore(new Storage());
  const named={...record,name:'YD-03b93ed7594b'};
  store.import('\ufeff'+JSON.stringify([{...named,pub_key:pub.toUpperCase()}]));
  assert.deepEqual(store.records(),[named]);
  store.import(JSON.stringify({device_p256_pub_hex:pub,session_auth:'new12345'}));
  assert.equal(store.resolve({name:named.name}).auth_key,'new12345');
  assert.equal(store.records().length,1);
});
