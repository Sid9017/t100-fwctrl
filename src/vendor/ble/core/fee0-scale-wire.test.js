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

function snapshot({unit=0,value=0,profile=3,stage=0,flags=5,upperKind=1,upper=0,lowerKind=2,lower=0,sequence=0}={}) {
  const b=Buffer.alloc(20);b[0]=unit;b.writeInt32LE(value,1);b.set([2,profile,stage,flags,upperKind],5);b.writeInt32LE(upper,10);b[14]=lowerKind;b.writeInt32LE(lower,15);b[19]=sequence;return b;
}
test('FEE1 v2 preserves signed KCal net, gross, container validity and sequence',()=>{
  const d=decodeFee0ScaleWire(snapshot({value:-25000,upper:0,lower:125000,flags:7,sequence:255}));
  assert.equal(d.value,-25000);assert.equal(d.version,2);assert.equal(d.profile,3);assert.equal(d.sequence,255);
  assert.deepEqual(d.upper,{kind:1,value:0,valid:true});assert.deepEqual(d.lower,{kind:2,value:125000,valid:true});
  const formatted=formatFee0ScaleReading(d);assert.equal(formatted.valueText,'-25.0');assert.deepEqual(formatted.lower,d.lower);
  assert.equal(decodeFee0ScaleWire(snapshot()).upper.valid,false);
});
test('v2 coffee time and flow remain canonical seconds and mg/s even when main uses oz',()=>{
  const d=decodeFee0ScaleWire(snapshot({unit:1,value:-55,profile:1,stage:2,flags:23,upperKind:4,upper:599,lowerKind:5,lower:12300}));
  assert.equal(formatFee0ScaleReading(d).valueText,'-0.55');assert.equal(d.timerRunning,true);assert.equal(d.upper.value,599);assert.equal(d.lower.value,12300);
});
test('invalid or future snapshots are rejected; valid inactive readings stay blank',()=>{
  const b=snapshot({value:12000,flags:0,upperKind:0,lowerKind:0});assert.equal(formatFee0ScaleReading(decodeFee0ScaleWire(b)).valueText,'--');
  for(const size of [0,4,6,19,21])assert.equal(decodeFee0ScaleWire(Buffer.alloc(size)),null);
  for(const [index,value] of [[0,2],[5,3],[6,4],[7,3],[8,32],[9,6],[14,6]]){const invalid=Buffer.from(b);invalid[index]=value;assert.equal(decodeFee0ScaleWire(invalid),null);}
});
test('signed legacy weights and firmware half-away-from-zero grams formatting do not wrap or show negative zero',()=>{
  for(const [mg,text] of [[-10050,'-10.1'],[-50,'-0.1'],[-49,'0.0'],[50,'0.1']]){
    const b=Buffer.alloc(5);b.writeInt32LE(mg,1);assert.equal(formatFee0ScaleReading(decodeFee0ScaleWire(b)).valueText,text);
  }
});
