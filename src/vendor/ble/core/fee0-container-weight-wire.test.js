const test = require('node:test');
const assert = require('node:assert/strict');
const { buildContainerWeightPayload: build } = require('./fee0-container-weight-wire');
test('container weight uses exact mg and distinct clear flag', () => {
  assert.deepEqual([...build({grams:100})], [0x77,1,1,0xA0,0x86,1,0]);
  assert.deepEqual([...build({grams:0})], [0x77,1,1,0,0,0,0]);
  assert.deepEqual([...build({grams:null})], [0x77,1,0,0,0,0,0]);
  assert.equal(build({grams:1999.9}).readUInt32LE(3),1999900);
  assert.equal(build({grams:'123.456'}).readUInt32LE(3),123456);
});
test('invalid input is rejected before sending', () => {
  for(const grams of ['', ' ',NaN,Infinity,-1,2000,true,{},'oops']) assert.throws(()=>build({grams}));
});
test('container topic requires auth and service sends the same payload', async () => {
  const { DeviceActions: BleService, buildFee0VendorWirePayload, fee0TopicPublic } = require('../../../web/actions.js');
  const payload=build({grams:100});
  assert.equal(fee0TopicPublic(0x77),false);
  assert.throws(()=>buildFee0VendorWirePayload(payload,{auth8:null}),/bind first/);
  const auth8=Buffer.alloc(8,0x5A);
  assert.deepEqual(buildFee0VendorWirePayload(payload,{auth8}),Buffer.concat([payload.subarray(0,1),auth8,payload.subarray(1)]));
  const service=Object.create(BleService.prototype);
  let sent;
  service.runGattAction=async (_label,fn)=>fn();
  service.writeVendorPayloadWithOptionalAuth=async (value)=>{sent=value;};
  assert.equal((await service.setContainerWeight({grams:100})).ok,true);
  assert.deepEqual(sent,payload);
  await service.setContainerWeight({grams:null}); assert.deepEqual(sent,build({grams:null}));
});
