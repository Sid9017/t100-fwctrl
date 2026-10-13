'use strict';
const { TOPICS } = require('../protocol');
const ZERO_UUID='00000000-0000-0000-0000-000000000000';
function containerUuid(bytes) {
  const hex=Buffer.from(bytes).toString('hex');
  if(hex.length!==32)throw new Error('Container UUID requires 16 bytes');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function newContainerUuid() {
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  if(!globalThis.crypto?.getRandomValues)throw new Error('Secure random UUID generation is unavailable');
  const bytes=new Uint8Array(16);globalThis.crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  return containerUuid(bytes);
}
function buildContainerWeightPayload({ grams = null, uuid } = {}) {
  const enabled = grams !== null;
  if (enabled && (typeof grams !== 'number' && typeof grams !== 'string' || String(grams).trim() === '')) {
    throw new Error('Enter a container weight from 0 to 1999.9 g');
  }
  const value = enabled ? Number(grams) : 0;
  const mg = Math.round(value * 1000);
  if (!Number.isFinite(value) || value < 0 || value > 1999.9 || !Number.isSafeInteger(mg)) {
    throw new Error('Container weight must be between 0 and 1999.9 g');
  }
  const id=String(uuid??(enabled?newContainerUuid():ZERO_UUID)).toLowerCase();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) || (id===ZERO_UUID)===enabled)throw new Error('Invalid container UUID');
  const out = Buffer.alloc(23);
  out[0] = TOPICS.containerWeight; out[1] = 2; out[2] = enabled ? 1 : 0;
  out.writeUInt32LE(mg, 3);
  Buffer.from(id.replaceAll('-',''),'hex').copy(out,7);
  return out;
}
// undefined: this packet cannot describe the current KCal container.
// null: an active KCal v3 snapshot confirms that the container is cleared.
function containerFromSnapshot(reading) {
  if(reading?.version!==3 || reading.profile!==3 || !reading.mainValid || reading.upper?.kind!==1)return undefined;
  if(!reading.upper.valid)return reading.containerUuid===null?null:undefined;
  if(!reading.containerUuid || reading.containerUuid===ZERO_UUID || reading.upper.value<0 || reading.upper.value>1999900)return undefined;
  return {uuid:reading.containerUuid,mg:reading.upper.value};
}
module.exports = { buildContainerWeightPayload,containerUuid,newContainerUuid,containerFromSnapshot,ZERO_UUID };
