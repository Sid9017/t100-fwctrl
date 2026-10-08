'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { TOPICS } = require('../protocol');
const {
  NOTIFY_BMP_W,
  NOTIFY_BMP_BYTES_MAX,
  NOTIFY_UTC_IMMEDIATE,
  TOPIC_BEGIN,
  TOPIC_CHUNK,
  TOPIC_COMMIT,
  TOPIC_ABORT,
  crc32,
  buildBeginPayload,
  buildChunkPayload,
  buildCommitPayload,
  buildAbortPayload,
  buildChunkSequence,
  assertNotifyText,
  maxChunkData,
} = require('./fee0-notify-wire');

function solidGray(level, bytes = NOTIFY_BMP_BYTES_MAX) {
  return Buffer.alloc(bytes, level & 0xff);
}

test('notify topics match SPEC', () => {
  assert.equal(TOPIC_BEGIN, 0x69);
  assert.equal(TOPIC_CHUNK, 0x6f);
  assert.equal(TOPIC_COMMIT, 0x70);
  assert.equal(TOPIC_ABORT, 0x71);
  assert.equal(TOPICS.notifyBegin, 0x69);
  assert.equal(TOPICS.notifyDisplay, 0x69);
});

test('buildBeginPayload encodes utc color crc nbytes', () => {
  const gray = solidGray(0xff);
  const payload = buildBeginPayload({
    utc: NOTIFY_UTC_IMMEDIATE,
    colorRgb565: 0xb6e0,
    payload: gray,
  });
  assert.equal(payload.length, 1 + 12);
  assert.equal(payload[0], TOPIC_BEGIN);
  assert.equal(payload.readUInt32LE(1), NOTIFY_UTC_IMMEDIATE);
  assert.equal(payload.readUInt16LE(5), 0xb6e0);
  assert.equal(payload.readUInt32LE(7), crc32(gray));
  assert.equal(payload.readUInt16LE(11), gray.length);
});

test('buildChunkSequence covers full gray payload', () => {
  const gray = solidGray(0x80, NOTIFY_BMP_W * 96);
  const chunks = buildChunkSequence(gray, 100);
  assert.ok(chunks.length > 1);
  assert.equal(chunks[0][0], TOPIC_CHUNK);
  assert.equal(chunks[0].readUInt16LE(1), 0);
  let total = 0;
  for (const c of chunks) {
    total += c.length - 3;
  }
  assert.equal(total, gray.length);
  assert.ok(gray.length <= NOTIFY_BMP_BYTES_MAX);
});

test('commit and abort are single-byte topics', () => {
  assert.deepEqual([...buildCommitPayload()], [TOPIC_COMMIT]);
  assert.deepEqual([...buildAbortPayload()], [TOPIC_ABORT]);
});

test('assertNotifyText allows unicode and rejects empty', () => {
  assert.equal(assertNotifyText('你好'), '你好');
  assert.equal(assertNotifyText('  Hello  '), 'Hello');
  assert.throws(() => assertNotifyText(''));
  assert.throws(() => assertNotifyText('x'.repeat(200)));
});

test('maxChunkData respects MTU', () => {
  assert.equal(maxChunkData(23), 23 - 3 - 3 - 8);
  assert.ok(maxChunkData(247) > maxChunkData(23));
});

test('buildChunkPayload validates seq and size', () => {
  assert.throws(() => buildChunkPayload(-1, Buffer.from([1])));
  assert.throws(() => buildChunkPayload(0, Buffer.alloc(0)));
});
