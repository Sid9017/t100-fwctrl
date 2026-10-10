import test from 'node:test';
import assert from 'node:assert/strict';
import {oadVersion} from '../src/web/ota-format.js';
import {BrowserConsole} from '../src/web/console.js';
import {signedFixture} from './fixtures/signed-ota.js';

test('DIS build suffix and signed firmware version normalize to the same OAD identifier',()=>{
  assert.equal(oadVersion('1.0.0-E789'),'0xe789');
  assert.equal(oadVersion('0xe789'),'0xe789');
  assert.equal(oadVersion(' 1.0.0-1\0 '),'0x0001');
  for(const value of [null,'Unknown','1.2.3','1.0.0-12345','fw-e789'])assert.equal(oadVersion(value),null);
});
function service(firmware){
  const console=new BrowserConsole({auth:{resolve:()=>({auth_key:'TEST1234'})}});
  console.connection={active:true};console.entry={device:{id:'device'},ui:{firmware:'1.0.0-0002'}};
  console.session.readFirmwareVersion=async()=>firmware;
  console.discoverSignedOad=async()=>{throw new Error('Signed discovery reached');};
  const f=signedFixture();
  return ()=>console.downloadOad(new File([f.bytes],'test.bin'),new File([f.manifest],'test.manifest'));
}
test('same version is blocked using a fresh DIS read even if cached version differs',async()=>{
  await assert.rejects(service('1.0.0-0001')(),/already runs firmware 0x0001/);
});
test('unreadable version cannot start an unverified repeat update',async()=>{
  await assert.rejects(service('Unknown')(),/Cannot determine.*firmware version/);
});
test('different versions proceed without inferring release order from a wrapping 16-bit version',async()=>{
  await assert.rejects(service('1.0.0-0002')(),/Signed discovery reached/);
});
