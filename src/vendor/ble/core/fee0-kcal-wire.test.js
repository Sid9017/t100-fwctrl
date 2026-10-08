'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { TOPICS } = require('../protocol');
const { buildFee0KcalTopicPayload } = require('./fee0-kcal-wire');
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
