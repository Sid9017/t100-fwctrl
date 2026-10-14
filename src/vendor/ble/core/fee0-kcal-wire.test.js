'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { TOPICS } = require('../protocol');
const { buildFee0KcalTopicPayload,buildFee0CountdownTargetPayload } = require('./fee0-kcal-wire');
const { buildFee0VendorWirePayload } = require('../../../web/actions.js');

test('buildFee0KcalTopicPayload encodes 4 ASCII digits', () => {
  assert.deepEqual(
    [...buildFee0KcalTopicPayload(TOPICS.countdownRemaining, 42)],
    [0x64, 0x30, 0x30, 0x34, 0x32]
  );
  assert.deepEqual(
    [...buildFee0KcalTopicPayload(TOPICS.countdownPreset, 1234)],
    [0x63, 0x31, 0x32, 0x33, 0x34]
  );
});

test('buildFee0KcalTopicPayload rejects invalid values', () => {
  assert.throws(() => buildFee0KcalTopicPayload(TOPICS.countdownPreset, -1));
  assert.throws(() => buildFee0KcalTopicPayload(TOPICS.countdownPreset, 10000));
  assert.throws(() => buildFee0KcalTopicPayload(TOPICS.countdownPreset, 1.5));
});

test('remaining supports negative kcal with four magnitude digits', () => {
  for (const [value, body] of [[-1, '-0001'], [-180, '-0180'], [-9999, '-9999'],
    [0, '0000'], [-0, '0000'], [9999, '9999']]) {
    const payload = buildFee0KcalTopicPayload(TOPICS.countdownRemaining, value);
    assert.equal(payload[0], 0x64);
    assert.equal(payload.subarray(1).toString('ascii'), body);
  }
  for (const value of [-10000, 10000, -1.5, NaN, Infinity, -Infinity]) {
    assert.throws(() => buildFee0KcalTopicPayload(TOPICS.countdownRemaining, value));
  }
});

test('negative remaining retains auth8 framing', () => {
  const auth8 = Buffer.from('12345678');
  const payload = buildFee0KcalTopicPayload(TOPICS.countdownRemaining, -180);
  assert.deepEqual(
    buildFee0VendorWirePayload(payload, { bound: true, auth8 }),
    Buffer.concat([Buffer.from([0x64]), auth8, Buffer.from('-0180')])
  );
});

test('buildFee0VendorWirePayload wraps kcal topics when bound', () => {
  const auth8 = Buffer.from('12345678');
  const payload = buildFee0KcalTopicPayload(TOPICS.countdownRemaining, 7);
  assert.deepEqual(
    [...buildFee0VendorWirePayload(payload, { bound: true, auth8 })],
    [0x64, ...auth8, 0x30, 0x30, 0x30, 0x37]
  );
});
test('countdown target and TDEE use a single 17-byte authenticated ASCII8 command',()=>{
  const payload=buildFee0CountdownTargetPayload(1350,1600);
  assert.equal(payload.subarray(1).toString(),'13501600');
  const wire=buildFee0VendorWirePayload(payload,{auth8:Buffer.from('TEST1234')});
  assert.equal(wire.length,17);assert.deepEqual(wire,Buffer.concat([Buffer.from([0x63]),Buffer.from('TEST1234'),Buffer.from('13501600')]));
  assert.equal(buildFee0CountdownTargetPayload(0,0).subarray(1).toString(),'00000000');
  assert.equal(buildFee0CountdownTargetPayload(9999,9999).subarray(1).toString(),'99999999');
  assert.equal(buildFee0CountdownTargetPayload(1350).subarray(1).toString(),'13501350');
});
test('invalid TDEE or target is rejected before an authenticated command can be built',()=>{
  for(const value of [-1,10000,1.5,NaN,Infinity,null,'',false]){
    assert.throws(()=>buildFee0CountdownTargetPayload(1350,value));
    assert.throws(()=>buildFee0CountdownTargetPayload(value,1600));
  }
  assert.throws(()=>buildFee0CountdownTargetPayload(0,1600));
  assert.throws(()=>buildFee0CountdownTargetPayload(1350,0));
});
