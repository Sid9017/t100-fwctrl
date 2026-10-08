'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { decodeFee0StatusWire } = require('./fee0-status-wire');

test('decodes FEE5 status snapshot and flags', () => {
  const status = decodeFee0StatusWire(
    Buffer.from([8, 4, 2, 2, 0x53, 0x00, 0x00, 0x00])
  );

  assert.deepEqual(status, {
    length: 8,
    screen: 4,
    screenName: 'SCALE',
    phase: 2,
    phaseName: 'STABLE',
    mode: 2,
    modeName: 'RUNNING',
    flags: 0x53,
    flagNames: ['BOUND', 'CHARGING', 'DISPLAY_READY', 'HISTORY_AVAILABLE'],
  });
});

test('decodes all scale stability phases', () => {
  const expected = ['MOVING', 'SETTLING', 'STABLE'];

  expected.forEach((phaseName, phase) => {
    const status = decodeFee0StatusWire(
      Buffer.from([8, 4, phase, 2, 0, 0, 0, 0])
    );
    assert.equal(status.phaseName, phaseName);
  });
});

test('rejects truncated or invalid FEE5 status snapshots', () => {
  assert.equal(decodeFee0StatusWire(Buffer.from([8, 1])), null);
  assert.equal(decodeFee0StatusWire(Buffer.from([7, 1, 0, 2, 0, 0, 0, 0])), null);
  assert.equal(decodeFee0StatusWire(Buffer.from([9, 1, 0, 2, 0, 0, 0, 0])), null);
});

test('accepts extended FEE5 snapshots while parsing the known prefix', () => {
  const status = decodeFee0StatusWire(
    Buffer.from([10, 3, 2, 2, 0x20, 0, 0, 0, 0xaa, 0xbb])
  );

  assert.equal(status.screenName, 'COUNTDOWN');
  assert.equal(status.phaseName, 'COMPLETE');
  assert.deepEqual(status.flagNames, ['COUNTDOWN_CONFIGURED']);
});

test('decodes the 20-byte weighing profile status extension', () => {
  const wire = Buffer.alloc(20);
  wire.set([20, 4, 1, 2], 0);
  wire.writeUInt32LE((1 << 8) | (1 << 10) | (1 << 13), 4);
  wire.set([2, 2, 1, 2], 8);
  wire.writeUInt32LE(15000, 12);
  wire.writeUInt32LE(240000, 16);

  const status = decodeFee0StatusWire(wire);
  assert.deepEqual(status.coffee, {
    schema: 2,
    mode: 2,
    profile: 2,
    stage: 1,
    uiPhase: 2,
    primaryTargetMg: 15000,
    waterTargetMg: 240000,
  });
  assert.deepEqual(status.flagNames, [
    'COFFEE_CONFIGURED',
    'COFFEE_POUR_OVER',
    'COFFEE_CONFIG_DIRTY',
  ]);
});

test('decodes coffee scale timer-running status', () => {
  const status = decodeFee0StatusWire(
    Buffer.from([8, 7, 1, 2, 0x10, 0, 0, 0])
  );

  assert.equal(status.screenName, 'COFFEE_SCALE');
  assert.equal(status.phaseName, 'RUNNING');
});

test('decodes Diet profile 3 with zero coffee targets', () => {
  const payload = Buffer.alloc(20);
  payload[0] = 20;
  payload[8] = 2;
  payload[9] = 3;
  const status = decodeFee0StatusWire(payload);
  assert.equal(status.coffee.profile, 3);
  assert.equal(status.coffee.primaryTargetMg, 0);
  assert.equal(status.coffee.waterTargetMg, 0);
});
