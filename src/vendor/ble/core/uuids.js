'use strict';

function normalizeUuid(uuid) {
  return String(uuid || '')
    .replace(/-/g, '')
    .toLowerCase();
}

/**
 * Match a 16-bit UUID short against raw short, SIG 128-bit, or Beken-style 128-bit forms.
 * @param {string|Buffer} uuid
 * @param {string} short16 Hyphen-free 4-hex short, e.g. fee0.
 */
function uuidMatchesShort(uuid, short16) {
  const s = normalizeUuid(uuid);
  const sh = String(short16).toLowerCase();
  if (s === sh) return true;
  if (s.includes(`0000${sh}`)) return true;
  if (s.includes(`f000${sh}`)) return true;
  return s.endsWith(sh);
}

function bleUuid128BufferToKey32(buf) {
  if (!Buffer.isBuffer(buf) || buf.length !== 16) return null;
  const t0 = buf.readUInt32LE(0);
  const t1 = buf.readUInt16LE(4);
  const t2 = buf.readUInt16LE(6);
  return (
    t0.toString(16).padStart(8, '0') +
    t1.toString(16).padStart(4, '0') +
    t2.toString(16).padStart(4, '0') +
    buf.slice(8, 16).toString('hex')
  );
}

function ble128BufferMatchesWant(buf, want) {
  if (bleUuid128BufferToKey32(buf) === want) return true;
  const r = Buffer.from(buf);
  r.reverse();
  return bleUuid128BufferToKey32(r) === want;
}

function uuidMatches128(uuid, full128) {
  const want = normalizeUuid(full128);
  if (!want) return false;
  if (Array.isArray(uuid) && uuid.length === 16) return uuidMatches128(Buffer.from(uuid), full128);
  if (uuid instanceof Uint8Array && !Buffer.isBuffer(uuid) && uuid.length === 16) {
    return uuidMatches128(Buffer.from(uuid), full128);
  }
  if (Buffer.isBuffer(uuid) && uuid.length === 16) return ble128BufferMatchesWant(uuid, want);
  const asStr = normalizeUuid(String(uuid));
  if (asStr === want) return true;
  if (asStr.length === 32 && /^[0-9a-f]{32}$/.test(asStr)) {
    return ble128BufferMatchesWant(Buffer.from(asStr, 'hex'), want);
  }
  if (asStr.length === 4 && want.length === 32) return want.startsWith(asStr) && want.endsWith('0000');
  if (asStr.length === 32 && want.length === 4) return asStr.startsWith(want) && asStr.endsWith('0000');
  return false;
}

function uuidMatchesGatt(uuid, want) {
  return uuidMatchesShort(uuid, want) || uuidMatches128(uuid, want);
}

function findGattService(services, uuid) {
  return (services || []).find((s) => uuidMatchesGatt(s.uuid, uuid));
}

function findGattCharacteristic(characteristics, serviceUuid, charUuid) {
  return (characteristics || []).find(
    (c) => uuidMatchesGatt(c.serviceUuid, serviceUuid) && uuidMatchesGatt(c.uuid, charUuid)
  );
}

module.exports = {
  normalizeUuid,
  uuidMatchesShort,
  uuidMatches128,
  uuidMatchesGatt,
  findGattService,
  findGattCharacteristic,
};
