'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  ATT_WRITE_VALUE_OVERHEAD,
  buildChunkxWriteBuffer,
  computeChunkxLayout,
  maxChunkxAttWriteBytes,
  maxChunkxPayloadBytes,
} = require('./chunkx');

test('computeChunkxLayout uses full ATT value for ChunkX payload', () => {
  const mtu = 512;
  const { framesPerChunk, maxAttWriteBytes } = computeChunkxLayout(mtu, 2000);
  assert.equal(framesPerChunk, 28);
  assert.equal(maxAttWriteBytes, 3 + framesPerChunk * 18);
  assert.ok(maxAttWriteBytes <= mtu - ATT_WRITE_VALUE_OVERHEAD);
  assert.equal(maxChunkxPayloadBytes(mtu), 509);
  assert.equal(maxChunkxAttWriteBytes(mtu), 509);
});

test('buildChunkxWriteBuffer full chunk stays within firmware ChunkX cap', () => {
  const mtu = 512;
  const oadBlkTot = 2000;
  const { framesPerChunk, chunkTot } = computeChunkxLayout(mtu, oadBlkTot);
  const payload = buildChunkxWriteBuffer(chunkTot, 1, Buffer.alloc(oadBlkTot * 16), framesPerChunk, oadBlkTot);
  assert.equal(payload.length, 3 + framesPerChunk * 18);
  assert.ok(payload.length <= maxChunkxPayloadBytes(mtu));
  assert.ok(payload.length <= mtu - ATT_WRITE_VALUE_OVERHEAD);
});
