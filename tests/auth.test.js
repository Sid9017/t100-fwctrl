import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { AuthStore } from '../src/web/auth-store.js';
import { verifyAdmissionToken } from '../src/web/auth.js';
class Storage {
  values=new Map();
  getItem(key){return this.values.get(key)||null;}
  setItem(key,value){this.values.set(key,value);}
}
const pub=`02${'ab'.repeat(32)}`;
const device={id:'browser-device',name:`YD-${pub.slice(0,12)}`};
const record={pub_key:pub,auth_key:'abcd1234',deviceId:device.id,name:device.name};
test('credentials persist across store instances and match identity after browser id changes',()=>{
  const storage=new Storage();new AuthStore(storage).save(record);
  const fresh=new AuthStore(storage);
  assert.deepEqual(fresh.resolve(device),record);
  assert.equal(fresh.resolve({...device,id:'different-browser-id'}).auth_key,record.auth_key);
  assert.equal(fresh.resolve({...device,name:'YD-000000000000',id:'unknown'}),null);
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
  assert.equal(store.resolve({...device,name:'YD-02acacacacac'}).pub_key,`02${'ac'.repeat(32)}`);
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
test('admission verification checks P-256 signature, name identity, lifetime and clock skew',async()=>{
  const valid=tokenFixture();assert.equal((await verifyAdmissionToken(valid.token,valid.name,1100)).pub_key,valid.pub.toString('hex'));
  await assert.rejects(verifyAdmissionToken(valid.token,'YD-000000000000',1100),/identity/);
  await assert.rejects(verifyAdmissionToken(valid.token,valid.name,1500),/expired/);
  const forged=tokenFixture({signatureCorrupt:true});await assert.rejects(verifyAdmissionToken(forged.token,forged.name,1100),/signature/);
  const long=tokenFixture({exp:2000});await assert.rejects(verifyAdmissionToken(long.token,long.name,1100),/expired/);
});
