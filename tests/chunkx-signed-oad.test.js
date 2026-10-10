import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runSignedOad,parseOtaStatus} from '../src/web/signed-oad.js';
import {SIGNED_OTA_UUIDS as U} from '../src/web/signed-ota-format.js';
import {signedFixture,trust} from './fixtures/signed-ota.js';

function peripheral(options={}) {
  const f=options.fixture??signedFixture(1,{size:16384+16});
  const connection={active:true},flash=Buffer.alloc(f.bytes.length),manifest=Buffer.alloc(128);
  const accepted=new Set(),dropped=new Set(),packets=[],configs=[],pending=[],progress=[];
  let notify,state=0,offset=0,chunkBytes=options.limit??496,configured=false,barriers=0,aborted=false;
  const window=8;
  const bitmap=()=>{let bits=0;for(let i=0;i<window;i++)if(accepted.has(offset+i*chunkBytes)&&offset+i*chunkBytes<f.bytes.length)bits|=1<<i;return bits;};
  const encode=()=>{const b=Buffer.alloc(20);b.set([2,state,0,7]);b.writeUInt32LE(offset,4);b.writeUInt32LE(state>=4?f.bytes.length:0,8);b.writeUInt16LE(chunkBytes,12);b[14]=window;b[15]=+configured;b.writeUInt32LE(bitmap(),16);return b;};
  const emit=()=>{if(!options.noNotifications)notify?.(encode());};
  const receive=b=>{
    const off=b.readUInt32LE(0),n=Math.min(chunkBytes,f.bytes.length-off);
    assert.equal(b.length,n+4);assert.equal(off%chunkBytes,0);assert.ok(off<offset+window*chunkBytes);
    assert.deepEqual(b.subarray(4),f.bytes.subarray(off,off+n));
    if(accepted.has(off)){assert.deepEqual(flash.subarray(off,off+n),b.subarray(4));return;}
    b.subarray(4).copy(flash,off);accepted.add(off);
    while(accepted.has(offset)&&offset<f.bytes.length)offset+=Math.min(chunkBytes,f.bytes.length-offset);
  };
  const adapter={
    async subscribe(c,char,fn){notify=fn;return()=>{};},
    async readCharacteristic(){return encode();},
    async writeCharacteristic(c,char,b,type){
      if(char.uuid===U.control){
        assert.equal(type,'withResponse');assert.ok(b.length<=20);
        switch(b[0]){
          case 1:assert.equal(b.subarray(1).toString(),'TEST1234');state=1;break;
          case 2:b.subarray(2).copy(manifest,b[1]);break;
          case 3:assert.deepEqual(manifest,f.manifest);state=4;emit();break;
          case 6:assert.equal(offset,0);assert.equal(bitmap(),0);chunkBytes=b.readUInt16LE(1);assert.equal(b[3],8);configured=true;configs.push(chunkBytes);break;
          case 7:barriers++;while(pending.length)receive(pending.pop());emit();break;
          case 4:assert.equal(offset,f.bytes.length);assert.deepEqual(flash,f.bytes);state=6;emit();break;
          case 5:aborted=true;state=0;break;
          default:assert.fail('Unexpected control');
        }
      }else{
        assert.equal(char.uuid,U.data);packets.push({off:b.readUInt32LE(0),bytes:b.length,type});
        if(options.disconnect){connection.active=false;throw Error('Disconnected');}
        if(b.length>4+(options.platformLimit??496))throw Error('Host write too large');
        const off=b.readUInt32LE(0),slot=off/chunkBytes;
        if(type==='withResponse'){
          if(options.lostProbeBefore&&!dropped.has(-1)){dropped.add(-1);throw Error('Lost probe before write');}
          receive(b);
          if(options.lostProbeAfter&&!dropped.has(-1)){dropped.add(-1);throw Error('Lost probe response');}
        }else{
          assert.equal(type,'withoutResponse');
          if(options.dropAll)return;
          if(options.drop && [2,5,9].includes(slot)&&!dropped.has(off)){dropped.add(off);return;}
          if(options.reorder)pending.push(Buffer.from(b));else receive(b);
        }
      }
    }
  };
  const discovery={characteristics:Object.entries(U).filter(([k])=>k!=='service').map(([key,uuid])=>({uuid,serviceUuid:U.service,properties:key==='status'?['read','notify']:key==='data'?['write','writeWithoutResponse']:['write']}))};
  return {f,flash,packets,configs,progress,get barriers(){return barriers;},get aborted(){return aborted;},
    run:()=>runSignedOad({adapter,connection,discovery,bytes:f.bytes,manifest:f.manifest,auth8:Buffer.from('TEST1234'),trust,pollMs:1,waitMs:10,onProgress:n=>{
      if(n<100)assert.ok(n<=offset/f.bytes.length*99);progress.push(n);
    }})};
}
for(const limit of [16,48,112,240,496])test(`ChunkX negotiates ${limit} bytes and commits only complete Flash`,async()=>{
  const p=peripheral({limit});assert.equal((await p.run()).state,'committed');
  assert.deepEqual(p.flash,p.f.bytes);assert.equal(p.progress.at(-1),100);
  assert.equal(p.packets[0].type,'withResponse');assert.ok(p.packets.slice(1).every(p=>p.type==='withoutResponse'));
  assert.ok(p.packets.every(p=>p.bytes<=limit+4));
  assert.ok(p.barriers<=Math.ceil((Math.ceil(p.f.bytes.length/limit)-1)/8));
});
for(const options of [{drop:true},{drop:true,reorder:true,noNotifications:true},{lostProbeBefore:true},{lostProbeAfter:true},{platformLimit:48}])test(`ChunkX recovers ${JSON.stringify(options)}`,async()=>{
  const p=peripheral(options);assert.equal((await p.run()).ok,true);assert.deepEqual(p.flash,p.f.bytes);
  if(options.drop){const resent=p.packets.filter(packet=>packet.off===2*p.configs[0]);assert.equal(resent.length,2);assert.equal(p.packets.filter(packet=>packet.off===3*p.configs[0]).length,1);}
  if(options.platformLimit)assert.equal(p.configs.at(-1),48);
});
for(const options of [{dropAll:true},{disconnect:true}])test(`ChunkX aborts persistent failure ${JSON.stringify(options)}`,async()=>{
  const p=peripheral(options);await assert.rejects(p.run());assert.ok(!p.progress.includes(100));
  if(!options.disconnect){assert.equal(p.barriers,6);assert.ok(p.aborted);}
});
test('ChunkX transfers a complete real packaged APP',async t=>{
  const image=await readFile(new URL('../../bk-hw-temp/projects/t100/fw_release/app/BK3633_T100_oad.bin',import.meta.url)).catch(()=>null);
  if(!image){t.skip('Firmware checkout unavailable');return;}
  const p=peripheral({fixture:signedFixture(1,{image}),drop:true,reorder:true});
  assert.equal((await p.run()).ok,true);assert.deepEqual(p.flash,image);
});
test('ChunkX parser rejects malformed capability and acknowledgment bitmap',()=>{
  const valid=Buffer.alloc(20);valid.set([2,4,0,7]);valid.writeUInt32LE(4096,8);valid.writeUInt16LE(496,12);valid[14]=8;valid[15]=1;
  assert.equal(parseOtaStatus(valid).chunkBytes,496);
  for(const mutate of [b=>b[14]=9,b=>b[15]=2,b=>b.writeUInt16LE(497,12),b=>b.writeUInt32LE(1,16),b=>b.writeUInt32LE(256,16),b=>b.writeUInt32LE(1,4),b=>{b.writeUInt32LE(4096,4);b.writeUInt32LE(2,16);}]){
    const bad=Buffer.from(valid);mutate(bad);assert.throws(()=>parseOtaStatus(bad));
  }
});
