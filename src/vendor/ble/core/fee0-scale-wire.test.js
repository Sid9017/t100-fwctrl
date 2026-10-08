'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  FEE0_SCALE_UNIT_G,
  FEE0_SCALE_UNIT_OZ,
  decodeFee0ScaleWire,
  formatFee0ScaleReading,
} = require('./fee0-scale-wire');

test('decodeFee0ScaleWire parses little-endian grams in milligrams', () => {
  const buf = Buffer.from([FEE0_SCALE_UNIT_G, 0x10, 0x27, 0x00, 0x00]);
  assert.deepEqual(decodeFee0ScaleWire(buf), { unit: FEE0_SCALE_UNIT_G, value: 10000 });
  assert.deepEqual(formatFee0ScaleReading(decodeFee0ScaleWire(buf)), {
    valueText: '10.0',
    unitText: 'g',
    unit: FEE0_SCALE_UNIT_G,
    value: 10000,
  });
});

test('decodeFee0ScaleWire parses hundredths of oz', () => {
  const buf = Buffer.from([FEE0_SCALE_UNIT_OZ, 0x8f, 0x1b, 0x00, 0x00]);
  assert.deepEqual(decodeFee0ScaleWire(buf), { unit: FEE0_SCALE_UNIT_OZ, value: 7055 });
  assert.deepEqual(formatFee0ScaleReading(decodeFee0ScaleWire(buf)), {
    valueText: '70.55',
    unitText: 'oz',
    unit: FEE0_SCALE_UNIT_OZ,
    value: 7055,
  });
});

test('decodeFee0ScaleWire rejects short or unknown unit payloads', () => {
  assert.equal(decodeFee0ScaleWire(Buffer.from([0x00, 0x01])), null);
  assert.equal(decodeFee0ScaleWire(Buffer.from([0x02, 0x00, 0x00, 0x00, 0x00])), null);
});
