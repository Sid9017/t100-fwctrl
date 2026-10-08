'use strict';

const { TOPICS } = require('../protocol');

/** Aligned with firmware NOTIFY_BMP_* / NOTIFY_UTC_IMMEDIATE. */
  const NOTIFY_BMP_W = 24;
  /** Must match firmware NOTIFY_BMP_H_MAX (RAM-safe gray budget). */
  const NOTIFY_BMP_H_MAX = 212;
  const NOTIFY_BMP_BYTES_MAX = NOTIFY_BMP_W * NOTIFY_BMP_H_MAX;
/** @deprecated Alias of MAX — payloads are variable length up to this. */
const NOTIFY_BMP_H = NOTIFY_BMP_H_MAX;
const NOTIFY_BMP_BYTES = NOTIFY_BMP_BYTES_MAX;
const NOTIFY_UTC_IMMEDIATE = 0xffffffff;

const TOPIC_BEGIN = TOPICS.notifyBegin;
const TOPIC_CHUNK = TOPICS.notifyChunk;
const TOPIC_COMMIT = TOPICS.notifyCommit;
const TOPIC_ABORT = TOPICS.notifyAbort;

const BEGIN_PAYLOAD_LEN = 12;
const CHUNK_HDR_LEN = 3;
const SESSION_AUTH_LEN = 8;
const CHUNK_DATA_MAX = 617;
const FEE0_CHAR_VALUE_MAX = 628;
const ATT_WRITE_VALUE_OVERHEAD = 3;
const CONSERVATIVE_MTU = 23;

function crc32(data) {
  const src = Buffer.from(data);
  let crc = 0xffffffff;
  for (let i = 0; i < src.length; i += 1) {
    crc ^= src[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (~crc) >>> 0;
}

function maxChunkData(mtu) {
  const mtuN = Number(mtu);
  const effectiveMtu = Number.isFinite(mtuN) && mtuN >= 24 ? mtuN : CONSERVATIVE_MTU;
  const attMax = Math.max(1, effectiveMtu - ATT_WRITE_VALUE_OVERHEAD);
  const charCap = FEE0_CHAR_VALUE_MAX - CHUNK_HDR_LEN - SESSION_AUTH_LEN;
  const attCap = attMax - CHUNK_HDR_LEN - SESSION_AUTH_LEN;
  return Math.max(1, Math.min(CHUNK_DATA_MAX, charCap, attCap));
}

/**
 * Pick CHUNK data bytes per link.
 * Prefer a known/fallback MTU from the probe (incl. unconfirmed 512 on macOS);
 * only use ATT 23 when no usable MTU is present.
 */
function resolveChunkDataMax(mtuProbe) {
  const mtu = mtuProbe && Number(mtuProbe.mtu);
  if (Number.isFinite(mtu) && mtu >= 24) {
    return maxChunkData(mtu);
  }
  return maxChunkData(CONSERVATIVE_MTU);
}

function estimateUploadTimeoutMs(chunkCount, chunkSettleMs = 0, extras = {}) {
  const chunks = Math.max(0, Number(chunkCount) || 0);
  const settle = Math.max(0, Number(chunkSettleMs) || 0);
  const mtuProbeMs = Math.max(0, Number(extras.mtuProbeMs) || 0);
  const topicSettleMs = Math.max(0, Number(extras.topicSettleMs) || 0);
  const commitSlackMs = Math.max(0, Number(extras.commitSlackMs) || 8000);
  const authDiscoverMs = Math.max(0, Number(extras.authDiscoverMs) || 0);
  const perChunkMs = 150 + settle;
  const baseMs = 5000 + mtuProbeMs + topicSettleMs * 2 + commitSlackMs + authDiscoverMs;
  const computed = baseMs + chunks * perChunkMs;
  return Math.max(60000, Math.min(180000, computed));
}

function assertGrayPayload(payload) {
  const buf = Buffer.from(payload);
  if (buf.length === 0 || buf.length > NOTIFY_BMP_BYTES_MAX) {
    throw new Error(
      `Notify gray payload must be 1..${NOTIFY_BMP_BYTES_MAX} bytes`
    );
  }
  if (buf.length % NOTIFY_BMP_W !== 0) {
    throw new Error(
      `Notify gray payload length must be a multiple of ${NOTIFY_BMP_W}`
    );
  }
  return buf;
}

function assertNotifyColor(colorRgb565) {
  const color = Number(colorRgb565);
  if (!Number.isFinite(color) || !Number.isInteger(color) || color < 0 || color > 0xffff) {
    throw new Error('Notify color must be an RGB565 integer 0–65535');
  }
  return color;
}

function assertNotifyUtc(utc) {
  if (utc == null) {
    return NOTIFY_UTC_IMMEDIATE;
  }
  const n = Number(utc);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 0xffffffff) {
    throw new Error('Notify utc must be uint32 (use 0xFFFFFFFF for immediate)');
  }
  return n >>> 0;
}

/** Soft text check for UI; rendering grows canvas up to H_MAX. */
function assertNotifyText(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s) {
    throw new Error('Notify text is required');
  }
  if ([...s].length > 64) {
    throw new Error('Notify text too long');
  }
  return s;
}

function buildBeginPayload({ utc, colorRgb565, payload, payloadCrc32 } = {}) {
  const utcN = assertNotifyUtc(utc);
  const color = assertNotifyColor(colorRgb565);
  const payloadBuf = payload == null ? null : assertGrayPayload(payload);
  let crcN = payloadCrc32;
  if (crcN == null) {
    if (payloadBuf == null) {
      throw new Error('payload or payloadCrc32 required');
    }
    crcN = crc32(payloadBuf);
  } else {
    crcN = Number(crcN);
    if (!Number.isFinite(crcN) || !Number.isInteger(crcN) || crcN < 0 || crcN > 0xffffffff) {
      throw new Error('payloadCrc32 must be uint32');
    }
  }
  const nbytes = payloadBuf ? payloadBuf.length : NOTIFY_BMP_BYTES_MAX;
  const buf = Buffer.alloc(1 + BEGIN_PAYLOAD_LEN);
  buf[0] = TOPIC_BEGIN;
  buf.writeUInt32LE(utcN, 1);
  buf.writeUInt16LE(color, 5);
  buf.writeUInt32LE(crcN >>> 0, 7);
  buf.writeUInt16LE(nbytes, 11);
  return buf;
}

function buildChunkPayload(seq, chunk) {
  const seqN = Number(seq);
  if (!Number.isInteger(seqN) || seqN < 0 || seqN > 0xffff) {
    throw new Error('seq must be uint16');
  }
  const data = Buffer.from(chunk);
  if (data.length === 0 || data.length > CHUNK_DATA_MAX) {
    throw new Error(`chunk length must be 1..${CHUNK_DATA_MAX}`);
  }
  const buf = Buffer.alloc(1 + 2 + data.length);
  buf[0] = TOPIC_CHUNK;
  buf.writeUInt16LE(seqN, 1);
  data.copy(buf, 3);
  return buf;
}

function buildCommitPayload() {
  return Buffer.from([TOPIC_COMMIT]);
}

function buildAbortPayload() {
  return Buffer.from([TOPIC_ABORT]);
}

function buildChunkSequence(payloadBytes, chunkSize = CHUNK_DATA_MAX) {
  const src = assertGrayPayload(payloadBytes);
  const size = Number(chunkSize);
  if (!Number.isInteger(size) || size < 1 || size > CHUNK_DATA_MAX) {
    throw new Error(`chunkSize must be 1..${CHUNK_DATA_MAX}`);
  }
  const out = [];
  let off = 0;
  let seq = 0;
  while (off < src.length) {
    const n = Math.min(size, src.length - off);
    out.push(buildChunkPayload(seq, src.subarray(off, off + n)));
    off += n;
    seq += 1;
  }
  return out;
}

/**
 * @deprecated Legacy single-packet API removed; use BEGIN/CHUNK/COMMIT builders.
 */
function buildFee0NotifyDisplayPayload(colorRgb565, text) {
  void text;
  throw new Error(
    'buildFee0NotifyDisplayPayload is obsolete; render gray and use uploadNotifyBitmap'
  );
}

module.exports = {
  NOTIFY_BMP_W,
  NOTIFY_BMP_H,
  NOTIFY_BMP_H_MAX,
  NOTIFY_BMP_BYTES,
  NOTIFY_BMP_BYTES_MAX,
  NOTIFY_UTC_IMMEDIATE,
  TOPIC_BEGIN,
  TOPIC_CHUNK,
  TOPIC_COMMIT,
  TOPIC_ABORT,
  BEGIN_PAYLOAD_LEN,
  CHUNK_HDR_LEN,
  CHUNK_DATA_MAX,
  FEE0_CHAR_VALUE_MAX,
  crc32,
  maxChunkData,
  resolveChunkDataMax,
  estimateUploadTimeoutMs,
  assertGrayPayload,
  assertNotifyColor,
  assertNotifyUtc,
  assertNotifyText,
  buildBeginPayload,
  buildChunkPayload,
  buildCommitPayload,
  buildAbortPayload,
  buildChunkSequence,
  buildFee0NotifyDisplayPayload,
  /** @deprecated */
  FEE0_NOTIFY_TEXT_MAX_LEN: 64,
};
