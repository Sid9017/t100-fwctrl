import test from 'node:test';
import assert from 'node:assert/strict';
import { WebGattAdapter, deviceOptions, uuid } from '../src/web/gatt.js';
import {SIGNED_OTA_UUIDS as U} from '../src/web/signed-ota-format.js';
import { BrowserConsole } from '../src/web/console.js';

test('picker grants required services and matches every T100 shell and advertisement version',()=>{
  const options=deviceOptions();assert.ok(options.optionalServices.includes(uuid('fee0')));
  assert.ok(options.optionalServices.includes(U.service));
  assert.ok(!options.optionalServices.some(s=>s.includes('ffc0')));
  assert.deepEqual([...options.filters[0].manufacturerData[0].mask],[255,0,255]);
  const filter=options.filters[0];
  assert.equal(filter.namePrefix,'YD-');
  const rule=filter.manufacturerData[0];
  for (const version of [1,2]) for (const shell of [0,1,2,255]) for (const product of [0,1,2]) {
    const advertisement=[0x50,version,product,shell];
    const matches=rule.dataPrefix.every((byte,index)=>(byte&rule.mask[index])===(advertisement[index]&rule.mask[index]));
    assert.equal(matches,product===1);
  }
});
test('adapter serializes operations and rejects queued work after disconnection',async()=>{
  const adapter=new WebGattAdapter();const connection={active:true,server:{connected:true},queue:Promise.resolve()};
  const order=[];let release;
  const first=adapter.operation(connection,()=>new Promise(resolve=>{order.push('start');release=resolve;}));
  const second=adapter.operation(connection,async()=>order.push('second'));
  await Promise.resolve();assert.deepEqual(order,['start']);
  release();await first;await second;assert.deepEqual(order,['start','second']);
  connection.active=false;
  await assert.rejects(adapter.operation(connection,()=>order.push('unexpected')),/disconnected/);
});
test('device picker is invoked synchronously and actions block device switching',async()=>{
  let called=false;
  const native={id:'id',name:'YD-021122334455'};
  const service=new BrowserConsole({bluetooth:{requestDevice(){called=true;return Promise.resolve(native);}}});
  const pending=service.selectDevice();assert.equal(called,true);await pending;
  service.busy=true;assert.throws(()=>service.selectDevice(),/finish/);
});
test('action timeout aborts and disconnects before a subsequent action can run',async()=>{
  const service=new BrowserConsole();let disconnected=false;
  service.connection={active:true};
  service.adapter.disconnect=async connection=>{disconnected=true;connection.active=false;};
  let ref;
  await assert.rejects(service.runGattAction('test',abort=>{ref=abort;return new Promise(()=>{});},5),/timed out/);
  assert.equal(disconnected,true);assert.equal(ref.aborted,true);assert.equal(service.busy,false);
  await assert.rejects(service.runGattAction('again',async()=>{}),/Connect/);
});

test('signed OAD discovers the exact new UUID when connection enumeration omitted it',async()=>{
  const native={uuid:U.service,async getCharacteristics(){return [U.control,U.data,U.status].map(id=>({uuid:id,properties:{write:true,read:true,notify:true}}));}};
  const calls=[],connection={active:true,queue:Promise.resolve(),discovery:{services:[],characteristics:[]},server:{connected:true,async getPrimaryService(id){calls.push(id);return native;}}};
  const service=new BrowserConsole();const result=await service.discoverSignedOad(connection);
  assert.deepEqual(calls,[U.service]);assert.equal(result.characteristics.length,3);
});
test('old devices require cable installation and have no unsigned fallback',async()=>{
  const service=new BrowserConsole();service.adapter.discoverServices=async()=>[];
  await assert.rejects(service.discoverSignedOad({discovery:{services:[],characteristics:[]}}),/merge_crc.*by cable/);
});
test('targeted discovery preserves transport errors',async()=>{
  const adapter=new WebGattAdapter(),connection={active:true,queue:Promise.resolve(),server:{connected:true,async getPrimaryService(){throw Object.assign(new Error('link lost'),{name:'NetworkError'});}}};
  await assert.rejects(adapter.discoverServices(connection,[U.service]),/link lost/);
});
