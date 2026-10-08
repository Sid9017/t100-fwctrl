'use strict';

const DEFAULT_MTU_FALLBACK = 512;
const MTU_PROBE_MAX_MS = 1000;
/** GATT Write Request/Command: 1-byte opcode + 2-byte handle before attribute value. */
const ATT_WRITE_VALUE_OVERHEAD = 3;
/** Firmware caps ChunkX payload at 512 B (oads.c OADS_FFC3_ATT_MAX). */
const CHUNKX_FFC3_MAX_PAYLOAD_LEN = 512;
const CHUNKX_MAX_TOT = 4095;
const CHUNKX_BLOCK_FRAME_LEN = 18;
const OAD_FLASH_WORD = 4;
const OAD_BLOCK_PAYLOAD = 16;
const OAD_FFC1_WRITE_LEN = 20;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseOadHeader(buf) {
  if (buf.length < 16) throw new Error('OAD file too small (need at least 16-byte img_hdr_t)');
  return {
    crc: buf.readUInt32LE(0),
    ver: buf.readUInt16LE(4),
    len: buf.readUInt16LE(6),
    uid: buf.readUInt32LE(8),
    romVer: buf.readUInt16LE(14),
  };
}

async function waitForNegotiatedMtu(connection, { minMtu = 24, maxWaitMs = MTU_PROBE_MAX_MS } = {}) {
  const native = connection && connection.native;
  const t0 = Date.now();
  while (Date.now() - t0 < maxWaitMs) {
    const m = native && native.mtu;
    if (typeof m === 'number' && m >= minMtu) {
      return { mtu: m, negotiated: true, waitMs: Date.now() - t0 };
    }
    await delay(40);
  }
  return { mtu: DEFAULT_MTU_FALLBACK, negotiated: false, waitMs: maxWaitMs };
}

function packChunkxHeader(tot, seq) {
  if (tot < 1 || tot > 0xfff || seq < 1 || seq > tot) {
    throw new Error(`ChunkX invalid tot=${tot} seq=${seq}`);
  }
  return Buffer.from([(tot & 0xff0) >> 4, ((tot & 0xf) << 4) | ((seq & 0xf00) >> 8), seq & 0xff]);
}

function maxChunkxPayloadBytes(mtu) {
  const maxAttValue = Math.max(0, mtu - ATT_WRITE_VALUE_OVERHEAD);
  return Math.min(maxAttValue, CHUNKX_FFC3_MAX_PAYLOAD_LEN);
}

function maxChunkxAttWriteBytes(mtu) {
  return maxChunkxPayloadBytes(mtu);
}

function computeChunkxLayout(mtu, oadBlkTot) {
  const maxPayload = maxChunkxPayloadBytes(mtu);
  const framesPerChunk = Math.floor((maxPayload - 3) / CHUNKX_BLOCK_FRAME_LEN);
  if (framesPerChunk < 1) {
    throw new Error(
      `ATT MTU=${mtu} too small for ChunkX (need mtu >= ${ATT_WRITE_VALUE_OVERHEAD + 3 + CHUNKX_BLOCK_FRAME_LEN})`
    );
  }
  const dataChunkSz = framesPerChunk * CHUNKX_BLOCK_FRAME_LEN;
  const chunkTot = Math.ceil(oadBlkTot / framesPerChunk);
  if (chunkTot > CHUNKX_MAX_TOT) {
    throw new Error(`ChunkX tot=${chunkTot} exceeds protocol max ${CHUNKX_MAX_TOT}`);
  }
  return { framesPerChunk, dataChunkSz, chunkTot, maxAttWriteBytes: 3 + dataChunkSz };
}

function buildChunkxWriteBuffer(chunkTot, seq, fileBuf, framesPerChunk, oadBlkTot) {
  const startBlk = (seq - 1) * framesPerChunk;
  const framesThis = Math.min(framesPerChunk, oadBlkTot - startBlk);
  if (framesThis <= 0) throw new Error(`ChunkX invalid framesThis=${framesThis} seq=${seq}/${chunkTot}`);
  const payload = Buffer.alloc(3 + framesThis * CHUNKX_BLOCK_FRAME_LEN);
  packChunkxHeader(chunkTot, seq).copy(payload, 0);
  for (let i = 0; i < framesThis; i++) {
    const blk = startBlk + i;
    const off = blk * OAD_BLOCK_PAYLOAD;
    const frameOff = 3 + i * CHUNKX_BLOCK_FRAME_LEN;
    payload.writeUInt16LE(blk, frameOff);
    fileBuf.copy(payload, frameOff + 2, off, off + OAD_BLOCK_PAYLOAD);
  }
  return payload;
}

function parseFfc3Notify(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (b.length < 2) return { kind: 'unknown' };
  if (b.readUInt16LE(0) === 0xffff) return { kind: 'ack' };
  if (b.length % 2 === 1) return { kind: 'unknown' };
  const missing = [];
  for (let o = 0; o + 2 <= b.length; o += 2) missing.push(b.readUInt16BE(o));
  return { kind: 'loss', missing };
}

module.exports = {
  DEFAULT_MTU_FALLBACK,
  MTU_PROBE_MAX_MS,
  ATT_WRITE_VALUE_OVERHEAD,
  CHUNKX_FFC3_MAX_PAYLOAD_LEN,
  CHUNKX_MAX_TOT,
  CHUNKX_BLOCK_FRAME_LEN,
  OAD_FLASH_WORD,
  OAD_BLOCK_PAYLOAD,
  OAD_FFC1_WRITE_LEN,
  parseOadHeader,
  waitForNegotiatedMtu,
  packChunkxHeader,
  maxChunkxPayloadBytes,
  maxChunkxAttWriteBytes,
  computeChunkxLayout,
  buildChunkxWriteBuffer,
  parseFfc3Notify,
};
