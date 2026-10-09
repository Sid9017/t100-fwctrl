'use strict';

const crypto = globalThis.crypto;

const { TOPICS } = require('../protocol');

const TOPIC_RECORD = TOPICS.kcalHistRecord;
const TOPIC_IMAGE_BEGIN = TOPICS.kcalHistImageBegin;
const TOPIC_IMAGE_DATA = TOPICS.kcalHistImageData;
const TOPIC_IMAGE_COMMIT = TOPICS.kcalHistImageCommit;
const TOPIC_ABORT = TOPICS.kcalHistAbort;

const RECORD_FLAG_HAS_IMAGE = 0x01;
const RECORD_FLAG_DELETE = 0x02;
const UUID_BYTES = 16;

/** Max image bytes per IMAGE_DATA write (628 B value − topic − auth8 − seq). */
const CHUNK_DATA_MAX = 617;
const FEE0_CHAR_VALUE_MAX = 628;
const CHUNK_HDR_LEN = 3;
const SESSION_AUTH_LEN = 8;
const ATT_WRITE_VALUE_OVERHEAD = 3;
const KCAL_HIST_CONSERVATIVE_MTU = 23;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeKcalHistUuid(uuid) {
  const value = String(uuid == null ? '' : uuid).trim().toLowerCase();
  if (!UUID_RE.test(value)) {
    throw new Error('uuid must be a canonical 36-character UUID');
  }
  if (value === '00000000-0000-0000-0000-000000000000') {
    throw new Error('uuid must not be all zero');
  }
  return value;
}

/** Public API helper: use caller UUID, or generate one for this record/image pair. */
function resolveKcalHistUuid(uuid) {
  if (uuid == null || String(uuid).trim() === '') {
    return crypto.randomUUID();
  }
  return normalizeKcalHistUuid(uuid);
}

function kcalHistUuidBytes(uuid) {
  return Buffer.from(normalizeKcalHistUuid(uuid).replaceAll('-', ''), 'hex');
}

function normalizeTimestampUtc(timestampUtc) {
  const value = Number(timestampUtc);
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error('timestampUtc must be a uint32 Unix timestamp');
  }
  return value;
}

function crc32(data) {
  const buf = Buffer.from(data || []);
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function maxKcalHistChunkData(mtu) {
  const mtuN = Number(mtu);
  const effectiveMtu =
    Number.isFinite(mtuN) && mtuN >= 24 ? mtuN : KCAL_HIST_CONSERVATIVE_MTU;
  const attMax = Math.max(1, effectiveMtu - ATT_WRITE_VALUE_OVERHEAD);
  const charCap = FEE0_CHAR_VALUE_MAX - CHUNK_HDR_LEN - SESSION_AUTH_LEN;
  const attCap = attMax - CHUNK_HDR_LEN - SESSION_AUTH_LEN;
  return Math.max(1, Math.min(CHUNK_DATA_MAX, charCap, attCap));
}

function buildKcalHistRecordPayload({
  uuid,
  timestampUtc,
  kcal,
  hasImage,
  rating,
  photoCount,
}) {
  const uuidBytes = kcalHistUuidBytes(uuid);
  const timestamp = normalizeTimestampUtc(timestampUtc);
  const kcalN = Number(kcal);
  if (!Number.isInteger(kcalN) || kcalN < 0 || kcalN > 0xffffffff) {
    throw new Error('kcal must be uint32');
  }
  const multi = rating !== undefined || photoCount !== undefined;
  if (multi && (!Number.isInteger(rating) || rating < 1 || rating > 5 ||
      !Number.isInteger(photoCount) || photoCount < 0 || photoCount > 3 ||
      Boolean(photoCount) !== Boolean(hasImage))) {
    throw new Error('Invalid history rating (1..5), photos (0..3)');
  }
  const buf = Buffer.alloc(multi ? 28 : 26);
  buf[0] = TOPIC_RECORD;
  uuidBytes.copy(buf, 1);
  buf.writeUInt32LE(timestamp >>> 0, 17);
  buf.writeUInt32LE(kcalN >>> 0, 21);
  buf[25] = hasImage ? RECORD_FLAG_HAS_IMAGE : 0;
  if (multi) { buf[26] = rating; buf[27] = photoCount; }
  return buf;
}

/** Delete one history entry by UUID; all RECORD fields except UUID/flags are ignored. */
function buildKcalHistDeletePayload(uuid) {
  const buf = Buffer.alloc(1 + 25);
  buf[0] = TOPIC_RECORD;
  kcalHistUuidBytes(uuid).copy(buf, 1);
  buf[25] = RECORD_FLAG_DELETE;
  return buf;
}

function buildKcalHistImageBeginPayload({
  uuid,
  timestampUtc,
  wx,
  wy,
  totalLen,
  payloadCrc32,
  photoIndex,
}) {
  const uuidBytes = kcalHistUuidBytes(uuid);
  const timestamp = normalizeTimestampUtc(timestampUtc);
  const wxN = Number(wx);
  const wyN = Number(wy);
  const totalN = Number(totalLen);
  const crcN = Number(payloadCrc32);
  if (!Number.isInteger(wxN) || wxN < 0 || wxN > 0xffff) {
    throw new Error('wx must be uint16');
  }
  if (!Number.isInteger(wyN) || wyN < 0 || wyN > 0xffff) {
    throw new Error('wy must be uint16');
  }
  if (!Number.isInteger(totalN) || totalN < 0 || totalN > 0xffffffff) {
    throw new Error('totalLen must be uint32');
  }
  if (!Number.isInteger(crcN) || crcN < 0 || crcN > 0xffffffff) {
    throw new Error('payloadCrc32 must be uint32');
  }

  if (photoIndex !== undefined && (!Number.isInteger(photoIndex) || photoIndex < 0 ||
      photoIndex > 2 || wxN !== 40 || wyN !== 40 || totalN !== 4800)) {
    throw new Error('Multi-image photo must be square 40x40 RGB565+alpha, index 0..2');
  }
  const buf = Buffer.alloc(photoIndex === undefined ? 33 : 34);
  buf[0] = TOPIC_IMAGE_BEGIN;
  uuidBytes.copy(buf, 1);
  buf.writeUInt32LE(timestamp >>> 0, 17);
  buf.writeUInt16LE(wxN, 21);
  buf.writeUInt16LE(wyN, 23);
  buf.writeUInt32LE(totalN >>> 0, 25);
  buf.writeUInt32LE(crcN >>> 0, 29);
  if (photoIndex !== undefined) buf[33] = photoIndex;
  return buf;
}

function buildKcalHistImageDataPayload(seq, chunk) {
  const seqN = Number(seq);
  if (!Number.isInteger(seqN) || seqN < 0 || seqN > 0xffff) {
    throw new Error('seq must be uint16');
  }
  const data = Buffer.from(chunk);
  if (data.length === 0 || data.length > CHUNK_DATA_MAX) {
    throw new Error(`chunk length must be 1..${CHUNK_DATA_MAX}`);
  }
  const buf = Buffer.alloc(CHUNK_HDR_LEN + data.length);
  buf[0] = TOPIC_IMAGE_DATA;
  buf.writeUInt16LE(seqN, 1);
  data.copy(buf, CHUNK_HDR_LEN);
  return buf;
}

function buildKcalHistIdPayload(topic, uuid, timestampUtc) {
  const buf = Buffer.alloc(1 + UUID_BYTES + 4);
  buf[0] = topic;
  kcalHistUuidBytes(uuid).copy(buf, 1);
  buf.writeUInt32LE(normalizeTimestampUtc(timestampUtc) >>> 0, 17);
  return buf;
}

function buildKcalHistImageCommitPayload(uuid, timestampUtc) {
  return buildKcalHistIdPayload(TOPIC_IMAGE_COMMIT, uuid, timestampUtc);
}

function buildKcalHistAbortPayload(uuid, timestampUtc) {
  return buildKcalHistIdPayload(TOPIC_ABORT, uuid, timestampUtc);
}

function resolveKcalHistChunkDataMax(mtuProbe) {
  const mtu = mtuProbe && Number(mtuProbe.mtu);
  if (Number.isFinite(mtu) && mtu >= 24) {
    return maxKcalHistChunkData(mtu);
  }
  return maxKcalHistChunkData(23);
}

function estimateKcalHistActionTimeoutMs(chunkCount, chunkSettleMs = 0, extras = {}) {
  const chunks = Math.max(0, Number(chunkCount) || 0);
  const settle = Math.max(0, Number(chunkSettleMs) || 0);
  const mtuProbeMs = Math.max(0, Number(extras.mtuProbeMs) || 0);
  const topicSettleMs = Math.max(0, Number(extras.topicSettleMs) || 0);
  const commitSlackMs = Math.max(0, Number(extras.commitSlackMs) || 8000);
  const perChunkMs = 150 + settle;
  const baseMs = 5000 + mtuProbeMs + topicSettleMs * 3 + commitSlackMs;
  return Math.max(60000, Math.min(180000, baseMs + chunks * perChunkMs));
}

function buildKcalHistChunkSequence(imageBytes, chunkSize = CHUNK_DATA_MAX) {
  const src = Buffer.from(imageBytes);
  const size = Number(chunkSize);
  if (!Number.isInteger(size) || size < 1 || size > CHUNK_DATA_MAX) {
    throw new Error(`chunkSize must be 1..${CHUNK_DATA_MAX}`);
  }
  const out = [];
  let off = 0;
  let seq = 0;
  while (off < src.length) {
    const n = Math.min(size, src.length - off);
    out.push(buildKcalHistImageDataPayload(seq, src.subarray(off, off + n)));
    off += n;
    seq += 1;
  }
  return out;
}

module.exports = {
  TOPIC_RECORD,
  TOPIC_IMAGE_BEGIN,
  TOPIC_IMAGE_DATA,
  TOPIC_IMAGE_COMMIT,
  TOPIC_ABORT,
  RECORD_FLAG_HAS_IMAGE,
  RECORD_FLAG_DELETE,
  CHUNK_DATA_MAX,
  FEE0_CHAR_VALUE_MAX,
  normalizeKcalHistUuid,
  resolveKcalHistUuid,
  kcalHistUuidBytes,
  normalizeTimestampUtc,
  crc32,
  maxKcalHistChunkData,
  resolveKcalHistChunkDataMax,
  estimateKcalHistActionTimeoutMs,
  buildKcalHistRecordPayload,
  buildKcalHistDeletePayload,
  buildKcalHistImageBeginPayload,
  buildKcalHistImageDataPayload,
  buildKcalHistImageCommitPayload,
  buildKcalHistAbortPayload,
  buildKcalHistChunkSequence,
  TOPICS,
};
