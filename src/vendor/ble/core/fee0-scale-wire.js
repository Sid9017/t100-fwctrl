'use strict';

/** FEE1 notify/read payload length (matches firmware `fee0_scale_wire.h`). */
const FEE0_SCALE_WIRE_LEN = 5;

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
 * @returns {{ unit: number, value: number } | null}
 */
function decodeFee0ScaleWire(buf) {
  const data = toBuffer(buf);
  if (data.length < FEE0_SCALE_WIRE_LEN) return null;
  const unit = data[0];
  if (unit !== FEE0_SCALE_UNIT_G && unit !== FEE0_SCALE_UNIT_OZ) return null;
  return {
    unit,
    value: data.readUInt32LE(1) >>> 0,
  };
}

/** Human-readable value + unit for UI (g: 0.1, oz: 0.01). */
function formatFee0ScaleReading(reading) {
  if (!reading) {
    return { valueText: '--', unitText: '', unit: null, value: null };
  }
  const { unit, value } = reading;
  if (unit === FEE0_SCALE_UNIT_OZ) {
    return {
      valueText: Math.min(999.99, value / 100).toFixed(2),
      unitText: 'oz',
      unit,
      value,
    };
  }
  return {
    valueText: Math.min(9999.9, value / 1000).toFixed(1),
    unitText: 'g',
    unit,
    value,
  };
}

module.exports = {
  FEE0_SCALE_WIRE_LEN,
  FEE0_SCALE_UNIT_G,
  FEE0_SCALE_UNIT_OZ,
  decodeFee0ScaleWire,
  formatFee0ScaleReading,
};
