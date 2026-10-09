'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildKcalHistRecordPayload,
  buildKcalHistDeletePayload,
  buildKcalHistImageBeginPayload,
  buildKcalHistImageCommitPayload,
  buildKcalHistChunkSequence,
  CHUNK_DATA_MAX,
  crc32,
  kcalHistUuidBytes,
  maxKcalHistChunkData,
  resolveKcalHistUuid,
} = require('./fee0-kcal-hist-wire');

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const TIMESTAMP = 1_723_333_333;

test('RECORD packs caller UUID, timestamp and metadata', () => {
  const buf = buildKcalHistRecordPayload({
    uuid: UUID,
    timestampUtc: TIMESTAMP,
    kcal: 1234,
    hasImage: true,
  });
  assert.equal(buf.length, 26);
  assert.equal(buf[0], 0x65);
  assert.deepEqual(buf.subarray(1, 17), kcalHistUuidBytes(UUID));
  assert.equal(buf.readUInt32LE(17), TIMESTAMP);
  assert.equal(buf.readUInt32LE(21), 1234);
  assert.equal(buf[25], 0x01);
});

test('RECORD delete packs only UUID and delete flag', () => {
  const buf = buildKcalHistDeletePayload(UUID);
  assert.equal(buf.length, 26);
  assert.equal(buf[0], 0x65);
  assert.deepEqual(buf.subarray(1, 17), kcalHistUuidBytes(UUID));
  assert.deepEqual(buf.subarray(17, 25), Buffer.alloc(8));
  assert.equal(buf[25], 0x02);
});

test('IMAGE_BEGIN and COMMIT reuse the same UUID and timestamp', () => {
  const raw = Buffer.alloc(40 * 40 * 3, 0xab);
  const begin = buildKcalHistImageBeginPayload({
    uuid: UUID,
    timestampUtc: TIMESTAMP,
    wx: 40,
    wy: 40,
    totalLen: raw.length,
    payloadCrc32: crc32(raw),
  });
  const commit = buildKcalHistImageCommitPayload(UUID, TIMESTAMP);

  assert.equal(begin.length, 33);
  assert.equal(begin[0], 0x66);
  assert.deepEqual(begin.subarray(1, 17), kcalHistUuidBytes(UUID));
  assert.equal(begin.readUInt32LE(17), TIMESTAMP);
  assert.equal(begin.readUInt16LE(21), 40);
  assert.equal(begin.readUInt16LE(23), 40);
  assert.equal(begin.readUInt32LE(25), raw.length);
  assert.equal(begin.readUInt32LE(29), crc32(raw));

  assert.equal(commit[0], 0x68);
  assert.deepEqual(commit.subarray(1, 17), kcalHistUuidBytes(UUID));
  assert.equal(commit.readUInt32LE(17), TIMESTAMP);
});

test('missing UUID is generated and caller UUID is normalized', () => {
  assert.match(resolveKcalHistUuid(), /^[0-9a-f-]{36}$/);
  assert.equal(resolveKcalHistUuid(UUID.toUpperCase()), UUID);
  assert.throws(
    () => resolveKcalHistUuid('00000000-0000-0000-0000-000000000000'),
    /must not be all zero/
  );
});

test('IMAGE_DATA sequence covers full raw image', () => {
  const raw = Buffer.alloc(40 * 40 * 3, 0xab);
  const chunks = buildKcalHistChunkSequence(raw, CHUNK_DATA_MAX);
  const merged = Buffer.concat(chunks.map((chunk) => chunk.subarray(3)));
  assert.equal(merged.length, raw.length);
  assert.deepEqual(merged, raw);
  chunks.forEach((chunk, index) => {
    assert.equal(chunk[0], 0x67);
    assert.equal(chunk.readUInt16LE(1), index);
  });
});

test('resolveKcalHistChunkDataMax uses probe MTU even when unconfirmed', () => {
  const { resolveKcalHistChunkDataMax } = require('./fee0-kcal-hist-wire');
  assert.equal(resolveKcalHistChunkDataMax({ mtu: 512, negotiated: false }), 498);
  assert.equal(resolveKcalHistChunkDataMax({ mtu: 247, negotiated: true }), 233);
  assert.equal(resolveKcalHistChunkDataMax(null), 9);
  assert.equal(resolveKcalHistChunkDataMax({ mtu: 23, negotiated: false }), 9);
});

test('estimateKcalHistActionTimeoutMs scales with chunk count and extras', () => {
  const { estimateKcalHistActionTimeoutMs } = require('./fee0-kcal-hist-wire');
  assert.equal(estimateKcalHistActionTimeoutMs(0), 60000);
  assert.equal(estimateKcalHistActionTimeoutMs(300), 60000);
  assert.ok(estimateKcalHistActionTimeoutMs(400) > 60000);
  assert.ok(estimateKcalHistActionTimeoutMs(400) <= 180000);
});

test('maxKcalHistChunkData shrinks for default ATT MTU', () => {
  assert.equal(maxKcalHistChunkData(23), 9);
  assert.equal(maxKcalHistChunkData(512), 498);
  assert.equal(maxKcalHistChunkData(640), CHUNK_DATA_MAX);
});

test('Multi-image metadata carries rating and expected transfer count only', () => {
  const args = { uuid: UUID, timestampUtc: TIMESTAMP, kcal: 682,
    hasImage: true, rating: 5, photoCount: 3 };
  const record = buildKcalHistRecordPayload(args);
  assert.equal(record.length, 28);
  assert.deepEqual([...record.subarray(25)], [1, 5, 3]);
  for (const patch of [{rating: 0}, {rating: 6}, {rating: 1.5}, {photoCount: 4}, {photoCount: 0}, {hasImage: false}]) {
    assert.throws(() => buildKcalHistRecordPayload({...args, ...patch}));
  }
  const noImage = buildKcalHistRecordPayload({...args, hasImage: false, photoCount: 0});
  assert.deepEqual([...noImage.subarray(25)], [0, 5, 0]);
});

test('Each photo remains a square with RGB565+alpha and independent index', () => {
  const args = { uuid: UUID, timestampUtc: TIMESTAMP, wx: 40, wy: 40,
    totalLen: 4800, payloadCrc32: 123, photoIndex: 0 };
  for (let i = 0; i < 3; i++) {
    const begin = buildKcalHistImageBeginPayload({...args, photoIndex: i});
    assert.equal(begin.length, 34); assert.equal(begin[33], i);
    assert.equal(begin.readUInt16LE(21), 40); assert.equal(begin.readUInt16LE(23), 40);
    assert.equal(begin.readUInt32LE(25), 4800);
  }
  for (const patch of [{wx: 80}, {wy: 80}, {totalLen: 3200}, {photoIndex: 3}, {photoIndex: -1}]) {
    assert.throws(() => buildKcalHistImageBeginPayload({...args, ...patch}));
  }
});


test('Authenticated RECORD supports 0..3 photos without weight/unit and exact new offsets', () => {
  const { buildFee0VendorWirePayload } = require('../../../web/actions.js');
  const auth8=Buffer.from('TEST1234');
  for (let photoCount=0;photoCount<=3;photoCount++) {
    const record=buildKcalHistRecordPayload({uuid:UUID,timestampUtc:TIMESTAMP,kcal:682,
      hasImage:photoCount>0,rating:5,photoCount});
    assert.equal(record.length,28);
    const wire=buildFee0VendorWirePayload(record,{auth8});
    assert.equal(wire.length,36);
    assert.equal(wire[0],0x65);
    assert.deepEqual(wire.subarray(1,9),auth8);
    assert.deepEqual(wire.subarray(9,25),kcalHistUuidBytes(UUID));
    assert.equal(wire.readUInt32LE(25),TIMESTAMP);
    assert.equal(wire.readUInt32LE(29),682);
    assert.deepEqual([...wire.subarray(33)],[photoCount?1:0,5,photoCount]);
  }
  for (const hasImage of [false,true]) {
    const record=buildKcalHistRecordPayload({uuid:UUID,timestampUtc:TIMESTAMP,kcal:0,hasImage});
    const wire=buildFee0VendorWirePayload(record,{auth8});
    assert.equal(wire.length,34);assert.equal(wire[33],hasImage?1:0);
  }
  const deleted=buildFee0VendorWirePayload(buildKcalHistDeletePayload(UUID),{auth8});
  assert.equal(deleted.length,34);assert.equal(deleted[33],2);
  assert.deepEqual(deleted.subarray(25,33),Buffer.alloc(8));
});
