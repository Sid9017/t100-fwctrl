'use strict';

/** FEE1 notify/read payload length (matches firmware `fee0_scale_wire.h`). */
const FEE0_SCALE_WIRE_LEN = 20;
const FEE0_SCALE_WIRE_VERSION = 2;

const FEE0_SCALE_UNIT_G = 0x00;
const FEE0_SCALE_UNIT_OZ = 0x01;

function toBuffer(value) {
  if (!value) return Buffer.alloc(0);
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return Buffer.from(value);
  if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }
  return Buffer.alloc(0);
}

/**
 * Parse FEE1 scale wire payload.
 * Legacy signed weight, or complete v2 main/upper/lower snapshot.
 */
function decodeFee0ScaleWire(buf) {
  const data = toBuffer(buf);
  if (data.length !== 5 && data.length !== FEE0_SCALE_WIRE_LEN) return null;
  const unit = data[0];
  if (unit !== FEE0_SCALE_UNIT_G && unit !== FEE0_SCALE_UNIT_OZ) return null;
  const reading={unit,value:data.readInt32LE(1)};
  if(data.length===5)return reading;
  if(data[5]!==2 || data[6]>3 || data[7]>2 || data[9]>5 || data[14]>5 || (data[8]&~31))return null;
  return {...reading,version:2,profile:data[6],stage:data[7],flags:data[8],
    mainValid:!!(data[8]&1),overload:!!(data[8]&8),timerRunning:!!(data[8]&16),
    upper:{kind:data[9],value:data.readInt32LE(10),valid:!!(data[8]&2)},
    lower:{kind:data[14],value:data.readInt32LE(15),valid:!!(data[8]&4)},sequence:data[19]};
}

/** Human-readable value + unit for UI (g: 0.1, oz: 0.01). */
function formatFee0ScaleReading(reading) {
  if (!reading) {
    return { valueText: '--', unitText: '', unit: null, value: null };
  }
  const { unit, value } = reading;
  const fields=reading.version===2?reading:{unit,value};
  if(reading.version===2 && !reading.mainValid)return {...fields,valueText:'--',unitText:unit===1?'oz':'g'};
  if (unit === FEE0_SCALE_UNIT_OZ) {
    return {
      ...fields,
      valueText: (value / 100).toFixed(2),
      unitText: 'oz',
      unit,
      value,
    };
  }
  return {
    ...fields,
    valueText: (Math.sign(value)*Math.floor((Math.abs(value)+50)/100)/10).toFixed(1),
    unitText: 'g',
    unit,
    value,
  };
}

module.exports = {
  FEE0_SCALE_WIRE_LEN,
  FEE0_SCALE_WIRE_VERSION,
  FEE0_SCALE_UNIT_G,
  FEE0_SCALE_UNIT_OZ,
  decodeFee0ScaleWire,
  formatFee0ScaleReading,
};
