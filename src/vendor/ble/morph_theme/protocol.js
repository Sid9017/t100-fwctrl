'use strict';

const { TOPICS } = require('../protocol');

/** Mouth AA bitmap (aligned with sdf_morph_demo / firmware). */
const DRAW_W = 60;
const DRAW_H = 30;
const EXPR_COUNT = 5;
const KF_BYTES = Math.ceil((DRAW_W * DRAW_H) / 8);
const PAYLOAD_BYTES = EXPR_COUNT * KF_BYTES;

const TOPIC_BEGIN = TOPICS.morphThemeBegin;
const TOPIC_CHUNK = TOPICS.morphThemeChunk;
const TOPIC_COMMIT = TOPICS.morphThemeCommit;
const TOPIC_ABORT = TOPICS.morphThemeAbort;
const TOPIC_FACTORY = TOPICS.morphThemeFactory;

const BEGIN_PAYLOAD_LEN = 8;
const CHUNK_HDR_LEN = 3;
const SESSION_AUTH_LEN = 8;
const CHUNK_DATA_MAX = 617;
const FEE0_CHAR_VALUE_MAX = 628;
const ATT_WRITE_VALUE_OVERHEAD = 3;
const CONSERVATIVE_MTU = 23;

/** Flash mouth slot order: 0 mouth0 … 4 mouth4. */
const MOUTH_SLOT_NAMES = Object.freeze([
  'mouth0',
  'mouth1',
  'mouth2',
  'mouth3',
  'mouth4',
]);

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
  // COMMIT runs flash slot write before ATT write-response; leave headroom.
  const commitSlackMs = Math.max(0, Number(extras.commitSlackMs) || 8000);
  // Write-with-response latency on desktop stacks is often well above 55ms/chunk.
  const perChunkMs = 150 + settle;
  const baseMs = 5000 + mtuProbeMs + topicSettleMs * 2 + commitSlackMs;
  const computed = baseMs + chunks * perChunkMs;
  return Math.max(60000, Math.min(180000, computed));
}

function assertPayload(payload) {
  const buf = Buffer.from(payload);
  if (buf.subarray(0, 4).equals(Buffer.from("EMO2"))) {
    return require("../../morph_theme/v2").validate(buf);
  }
  if (buf.length !== PAYLOAD_BYTES) {
    throw new Error(`morph theme payload must be ${PAYLOAD_BYTES} bytes`);
  }
  return buf;
}

module.exports = {
  DRAW_W,
  DRAW_H,
  EXPR_COUNT,
  KF_BYTES,
  PAYLOAD_BYTES,
  TOPIC_BEGIN,
  TOPIC_CHUNK,
  TOPIC_COMMIT,
  TOPIC_ABORT,
  TOPIC_FACTORY,
  BEGIN_PAYLOAD_LEN,
  CHUNK_HDR_LEN,
  CHUNK_DATA_MAX,
  FEE0_CHAR_VALUE_MAX,
  MOUTH_SLOT_NAMES,
  /** @deprecated use MOUTH_SLOT_NAMES */
  EXPR_NAMES: MOUTH_SLOT_NAMES,
  crc32,
  maxChunkData,
  resolveChunkDataMax,
  estimateUploadTimeoutMs,
  assertPayload,
};
