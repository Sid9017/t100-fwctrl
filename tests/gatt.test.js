import test from 'node:test';
import assert from 'node:assert/strict';
import { WebGattAdapter, deviceOptions, uuid } from '../src/web/gatt.js';
import { BrowserConsole } from '../src/web/console.js';

test('picker grants required services and matches every T100 shell and advertisement version',()=>{
  const options=deviceOptions();assert.ok(options.optionalServices.includes(uuid('fee0')));
  assert.ok(options.optionalServices.includes('f000ffc0-0451-4000-b000-000000000000'));
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

test('OAD discovery queries both authorized UUID bases when enumeration missed it', async()=>{
  const full='f000ffc0-0451-4000-b000-000000000000';
  const calls=[];
  const native={uuid:full,async getCharacteristics(){return ['ffc1','ffc3'].map(id=>({uuid:`f000${id}-0451-4000-b000-000000000000`,properties:{write:true,notify:true}}));}};
  const connection={active:true,queue:Promise.resolve(),discovery:{services:[{uuid:uuid('fee0')}],characteristics:[]},server:{connected:true,async getPrimaryService(id){
    calls.push(id);
    if(id===full)return native;
    throw Object.assign(new Error('not granted'),{name:'SecurityError'});
  }}};
  const service=new BrowserConsole();
  const discovered=await service.discoverOad(connection);
  assert.deepEqual(calls,[uuid('ffc0'),full]);
  assert.equal(discovered.characteristics.length,2);
  assert.ok(discovered.services.some(s=>s.uuid===full));
  await service.discoverOad(connection);
  assert.equal(calls.length,2);
});

test('OAD missing-service error reports discovered UUIDs without claiming firmware is disabled',async()=>{
  const service=new BrowserConsole();
  service.adapter.discoverServices=async()=>[];
  const connection={discovery:{services:[{uuid:uuid('fee0')}],characteristics:[]}};
  await assert.rejects(service.discoverOad(connection),error=>error.message.includes(uuid('fee0'))&&error.message.includes('f000ffc0'));
});

test('targeted OAD discovery preserves transport failures',async()=>{
  const adapter=new WebGattAdapter();
  const connection={active:true,queue:Promise.resolve(),server:{connected:true,async getPrimaryService(){throw Object.assign(new Error('link lost'),{name:'NetworkError'});}}};
  await assert.rejects(adapter.discoverServices(connection,['ffc0']),/link lost/);
});
