'use strict';

const {
  TOPIC_BEGIN,
  TOPIC_CHUNK,
  TOPIC_COMMIT,
  TOPIC_ABORT,
  TOPIC_FACTORY,
  CHUNK_DATA_MAX,
  CHUNK_HDR_LEN,
  BEGIN_PAYLOAD_LEN,
  PAYLOAD_BYTES,
  crc32,
  assertPayload,
  maxChunkData,
  resolveChunkDataMax,
  estimateUploadTimeoutMs,
} = require('./protocol');

function buildBeginPayload({ revision, payload, payloadCrc32 } = {}) {
  const revN = Number(revision);
  if (!Number.isFinite(revN) || !Number.isInteger(revN) || revN < 0 || revN > 0xffffffff) {
    throw new Error('revision must be uint32');
  }
  const payloadBuf = payload == null ? null : assertPayload(payload);
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
  const buf = Buffer.alloc(1 + BEGIN_PAYLOAD_LEN);
  buf[0] = TOPIC_BEGIN;
  buf.writeUInt32LE(revN >>> 0, 1);
  buf.writeUInt32LE(crcN >>> 0, 5);
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

function buildFactoryPayload() {
  return Buffer.from([TOPIC_FACTORY]);
}

function buildThemeIdPayload({ themeId, payload, payloadCrc32 } = {}) {
  const idN = Number(themeId);
  if (!Number.isInteger(idN) || idN < 1 || idN > 0xff) {
    throw new Error('themeId must be uint8 in range 1..255');
  }
  const payloadBuf = payload == null ? null : assertPayload(payload);
  let crcN = payloadCrc32;
  if (crcN == null) {
    if (payloadBuf == null) {
      throw new Error('payload or payloadCrc32 required');
    }
    crcN = crc32(payloadBuf);
  } else {
    crcN = Number(crcN);
    if (!Number.isInteger(crcN) || crcN < 0 || crcN > 0xffffffff) {
      throw new Error('payloadCrc32 must be uint32');
    }
  }

  const buf = Buffer.alloc(5);
  buf[0] = idN;
  buf.writeUInt32LE(crcN >>> 0, 1);
  return buf;
}

function buildChunkSequence(payloadBytes, chunkSize = CHUNK_DATA_MAX) {
  const src = assertPayload(payloadBytes);
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

module.exports = {
  PAYLOAD_BYTES,
  CHUNK_DATA_MAX,
  crc32,
  maxChunkData,
  resolveChunkDataMax,
  estimateUploadTimeoutMs,
  buildBeginPayload,
  buildChunkPayload,
  buildCommitPayload,
  buildAbortPayload,
  buildFactoryPayload,
  buildThemeIdPayload,
  buildChunkSequence,
};
