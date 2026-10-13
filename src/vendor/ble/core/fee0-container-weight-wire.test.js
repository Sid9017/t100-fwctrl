const test=require('node:test');
const assert=require('node:assert/strict');
const {buildContainerWeightPayload:build,containerUuid,containerFromSnapshot}=require('./fee0-container-weight-wire');
const uuid='12345678-1234-4321-8765-123456789abc';
test('container v2 includes exact mg and canonical UUID bytes; clear is all zero',()=>{
  const p=build({grams:100,uuid});assert.equal(p.length,23);assert.deepEqual([...p.subarray(0,7)],[0x77,2,1,0xa0,0x86,1,0]);assert.equal(containerUuid(p.subarray(7)),uuid);
  assert.equal(build({grams:0,uuid})[2],1);assert.equal(build({grams:1999.9,uuid}).readUInt32LE(3),1999900);assert.equal(build({grams:'123.456',uuid}).readUInt32LE(3),123456);
  assert.deepEqual([...build({grams:null})],[0x77,2,0,...Array(20).fill(0)]);
  assert.notEqual(containerUuid(build({grams:100}).subarray(7)),containerUuid(build({grams:100}).subarray(7)));
});
test('invalid weight or UUID is rejected before sending',()=>{
  for(const grams of ['', ' ',NaN,Infinity,-1,2000,true,{},'oops'])assert.throws(()=>build({grams,uuid}));
  for(const id of ['', 'bad','00000000-0000-0000-0000-000000000000'])assert.throws(()=>build({grams:0,uuid:id}));
  assert.throws(()=>build({grams:null,uuid}));
});
test('container topic retains auth8 and requires confirmation after a successful write',async()=>{
  const {DeviceActions,buildFee0VendorWirePayload,fee0TopicPublic}=require('../../../web/actions.js');
  const payload=build({grams:100,uuid}),auth8=Buffer.alloc(8,0x5a);
  assert.equal(fee0TopicPublic(0x77),false);assert.throws(()=>buildFee0VendorWirePayload(payload,{auth8:null}),/bind first/);
  const wire=buildFee0VendorWirePayload(payload,{auth8});assert.equal(wire.length,31);assert.deepEqual(wire,Buffer.concat([payload.subarray(0,1),auth8,payload.subarray(1)]));
  const service=Object.create(DeviceActions.prototype),order=[];
  service.runGattAction=async(_label,fn)=>fn();service.requireConnection=()=>({});service.requireContainerSnapshot=async()=>order.push('ready');service.writeVendorPayloadWithOptionalAuth=async p=>{assert.deepEqual(p,payload);order.push('write');};service.confirmContainerSnapshot=async()=>order.push('echo');
  const result=await service.setContainerWeight({grams:100,uuid});assert.equal(result.uuid,uuid);assert.deepEqual(order,['ready','write','echo']);
  service.confirmContainerSnapshot=async()=>{throw Error('No matching echo');};await assert.rejects(service.setContainerWeight({grams:100,uuid}),/No matching echo/);
});
test('only active KCal v3 can confirm or clear a container; valid zero is configured',()=>{
  const r={version:3,profile:3,mainValid:true,upper:{kind:1,valid:true,value:0},containerUuid:uuid};
  assert.deepEqual(containerFromSnapshot(r),{uuid,mg:0});
  assert.equal(containerFromSnapshot({...r,containerUuid:null,upper:{kind:1,valid:false,value:0}}),null);
  for(const other of [{...r,version:2},{...r,profile:0},{...r,mainValid:false},{...r,upper:{kind:0,valid:false,value:0}}])assert.equal(containerFromSnapshot(other),undefined);
});
