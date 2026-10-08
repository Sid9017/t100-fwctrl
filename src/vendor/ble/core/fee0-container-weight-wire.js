'use strict';
const { TOPICS } = require('../protocol');
function buildContainerWeightPayload({ grams = null } = {}) {
  const enabled = grams !== null;
  if (enabled && (typeof grams !== 'number' && typeof grams !== 'string' || String(grams).trim() === '')) {
    throw new Error('Enter a container weight from 0 to 1999.9 g');
  }
  const value = enabled ? Number(grams) : 0;
  const mg = Math.round(value * 1000);
  if (!Number.isFinite(value) || value < 0 || value > 1999.9 || !Number.isSafeInteger(mg)) {
    throw new Error('Container weight must be between 0 and 1999.9 g');
  }
  const out = Buffer.alloc(7);
  out[0] = TOPICS.containerWeight; out[1] = 1; out[2] = enabled ? 1 : 0;
  out.writeUInt32LE(mg, 3);
  return out;
}
module.exports = { buildContainerWeightPayload };
