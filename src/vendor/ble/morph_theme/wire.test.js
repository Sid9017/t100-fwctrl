'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  PAYLOAD_BYTES,
  crc32,
  buildBeginPayload,
  buildChunkSequence,
  buildCommitPayload,
  buildFactoryPayload,
  buildThemeIdPayload,
} = require('./wire');
const { KF_BYTES } = require('./protocol');

test('morph theme wire constants match firmware layout', () => {
  assert.equal(KF_BYTES, 225);
  assert.equal(PAYLOAD_BYTES, 1125);
});

test('buildBeginPayload encodes revision and crc', () => {
  const payload = Buffer.alloc(PAYLOAD_BYTES, 0xab);
  const buf = buildBeginPayload({ revision: 42, payload });
  assert.equal(buf[0], 0x6a);
  assert.equal(buf.readUInt32LE(1), 42);
  assert.equal(buf.readUInt32LE(5), crc32(payload));
});

test('buildChunkSequence covers full payload', () => {
  const payload = Buffer.alloc(PAYLOAD_BYTES, 0x55);
  const chunks = buildChunkSequence(payload, 400);
  assert.ok(chunks.length >= 3);
  let total = 0;
  chunks.forEach((c, i) => {
    assert.equal(c[0], 0x6b);
    assert.equal(c.readUInt16LE(1), i);
    total += c.length - 3;
  });
  assert.equal(total, PAYLOAD_BYTES);
});

test('control topics are single byte', () => {
  assert.deepEqual([...buildCommitPayload()], [0x6c]);
  assert.deepEqual([...buildFactoryPayload()], [0x6e]);
});

test('buildThemeIdPayload binds a non-zero ID to the payload crc', () => {
  const payload = Buffer.alloc(PAYLOAD_BYTES, 0x5a);
  const buf = buildThemeIdPayload({ themeId: 0x01, payload });
  assert.equal(buf.length, 5);
  assert.equal(buf[0], 0x01);
  assert.equal(buf.readUInt32LE(1), crc32(payload));
  assert.throws(
    () => buildThemeIdPayload({ themeId: 0x00, payload }),
    /themeId/
  );
});

test('estimateMorphThemeUploadTimeoutMs budgets MTU probe and commit flash', () => {
  const { estimateMorphThemeUploadTimeoutMs } = require('./upload');
  const { PAYLOAD_BYTES: PB } = require('./protocol');
  const payload = Buffer.alloc(PB, 0);
  const ms = estimateMorphThemeUploadTimeoutMs(payload, 23, 10, {
    mtuProbeMs: 8000,
    topicSettleMs: 400,
    commitSlackMs: 15000,
  });
  // Conservative MTU yields many WR chunks; must exceed the old 15s ceiling.
  assert.ok(ms >= 60000);
  assert.ok(ms <= 180000);
});
