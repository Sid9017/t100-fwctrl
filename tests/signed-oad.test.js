import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runSignedOad,parseOtaStatus} from '../src/web/signed-oad.js';
import {SIGNED_OTA_UUIDS as U} from '../src/web/signed-ota-format.js';
import {signedFixture,trust} from './fixtures/signed-ota.js';
function peripheral(options={}){
  const f=options.fixture??signedFixture(),connection={active:true},calls=[],chunks=[],receivedManifest=Buffer.alloc(128);
  const status={state:options.previousError?7:0,error:options.previousError?4:0,flags:options.flags??3,offset:0,size:0};let notify;let lost=false;let unsubscribed=false;
  const encode=()=>{const b=Buffer.alloc(12);b.set([1,status.state,status.error,status.flags]);b.writeUInt32LE(status.offset,4);b.writeUInt32LE(status.size,8);return b;};
  const emit=()=>notify?.(encode());
  const adapter={
    async subscribe(c,char,fn){notify=fn;return async()=>{unsubscribed=true;};},
    async readCharacteristic(){
      if(options.commitDuringRead && status.state===5){
        const stale=encode();status.state=6;emit();
        if(options.resetDuringRead){connection.active=false;throw Error('reset during read');}
        return stale;
      }
      return encode();
    },
    async writeCharacteristic(c,char,b,type){
      assert.equal(type,'withResponse');assert.ok(b.length<=20);calls.push([char.uuid,Buffer.from(b)]);
      if(char.uuid===U.control){
        if(b[0]===1){assert.equal(b.subarray(1).toString(),'TEST1234');status.state=1;status.error=0;}
        if(b[0]===2)b.subarray(2).copy(receivedManifest,b[1]);
        if(b[0]===3){assert.deepEqual(receivedManifest,f.manifest);status.size=f.bytes.length;status.state=options.startError?7:options.timeout?3:4;status.error=options.startError?4:0;emit();}
        if(b[0]===4){status.state=options.digestError?7:options.noCommit||options.commitDuringRead?5:6;status.error=options.digestError?6:0;emit();if(options.disconnectAtCommit){connection.active=false;throw Error('reset lost ATT response');}}
        if(b[0]===5)status.state=0;
      }else{
        assert.equal(char.uuid,U.data);assert.equal(b.readUInt32LE(0),status.offset);assert.deepEqual(b.subarray(4),f.bytes.subarray(status.offset,status.offset+16));
        if(options.disconnectAtData){connection.active=false;throw Error('link gone');}
        if(options.lostBeforeWrite&&!lost){lost=true;throw Error('lost');}
        chunks.push(b.subarray(4));status.offset+=16;
        if(options.lostAfterWrite&&!lost){lost=true;throw Error('lost');}
      }
    }
  };
  const discovery={characteristics:Object.entries(U).filter(([k])=>k!=='service').map(([key,uuid])=>({uuid,serviceUuid:U.service,properties:key==='status'?['read','notify']:['write']}))};
  const progress=[];
  return {f,calls,chunks,progress,connection,get unsubscribed(){return unsubscribed;},run:()=>runSignedOad({adapter,connection,discovery,bytes:f.bytes,manifest:f.manifest,auth8:Buffer.from('TEST1234'),onProgress:n=>progress.push(n),trust,pollMs:1,waitMs:5})};
}
test('signed OAD sends bound BEGIN, complete manifest and original bin; only COMMITTED reaches 100',async()=>{
  const p=peripheral();assert.equal((await p.run()).state,'committed');assert.deepEqual(Buffer.concat(p.chunks),p.f.bytes);assert.equal(p.progress.at(-1),100);assert.ok(p.unsubscribed);assert.equal(p.calls.filter(([id,b])=>id===U.control&&b[0]===2).length,8);assert.equal(p.calls.at(-1)[1][0],4);
});
test('a previous device ERROR can start a fresh authenticated signed session',async()=>{
  const p=peripheral({previousError:true});assert.equal((await p.run()).state,'committed');assert.equal(p.progress.at(-1),100);
});
test('latest compiled APP bin transfers completely with an ephemeral test signature',async(t)=>{
  const image=await readFile(new URL('../../bk-hw-temp/projects/t100/fw_release/app/BK3633_T100_oad.bin',import.meta.url)).catch(()=>null);
  if(!image){t.skip('Firmware checkout unavailable');return;}
  const p=peripheral({fixture:signedFixture(1,{image})});
  assert.equal((await p.run()).state,'committed');assert.deepEqual(Buffer.concat(p.chunks),image);
  assert.equal(p.chunks.length,image.length/16);assert.equal(p.progress.at(-1),100);
});
for(const mode of ['lostBeforeWrite','lostAfterWrite'])test(`signed OAD recovers ${mode} by status offset without skipping data`,async()=>{
  const p=peripheral({[mode]:true});assert.equal((await p.run()).ok,true);assert.deepEqual(Buffer.concat(p.chunks),p.f.bytes);
});
test('commit notification survives reset before FINISH ATT response',async()=>{
  const p=peripheral({disconnectAtCommit:true});assert.equal((await p.run()).ok,true);assert.equal(p.progress.at(-1),100);
});
for(const resetDuringRead of [false,true])test(`COMMITTED notification survives a stale or failed in-flight read (reset=${resetDuringRead})`,async()=>{
  const p=peripheral({commitDuringRead:true,resetDuringRead});assert.equal((await p.run()).ok,true);assert.equal(p.progress.at(-1),100);
});
for(const options of [{digestError:true},{startError:true},{timeout:true},{noCommit:true},{disconnectAtData:true},{flags:1}])test(`signed OAD rejects incomplete or failed device confirmation ${JSON.stringify(options)}`,async()=>{
  const p=peripheral(options);await assert.rejects(p.run());assert.ok(!p.progress.includes(100));assert.ok(p.unsubscribed);
  if(p.calls.some(([id,b])=>id===U.control&&b[0]===1)&&p.connection.active)assert.equal(p.calls.at(-1)[1][0],5);
});
test('status parser rejects invalid schema, state and offset',()=>{
  assert.throws(()=>parseOtaStatus(Buffer.alloc(12)));const b=Buffer.alloc(12);b[0]=1;b[1]=8;assert.throws(()=>parseOtaStatus(b));b[1]=4;b.writeUInt32LE(1,4);assert.throws(()=>parseOtaStatus(b));
});
