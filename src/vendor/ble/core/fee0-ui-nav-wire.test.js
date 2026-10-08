'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { TOPICS, UI_NAV_TARGETS } = require('../protocol');
const { buildFee0VendorWirePayload } = require('../../../web/actions.js');
const {
  buildFee0CountdownUpdateSequence,
  buildFee0UiNavPayload,
} = require('./fee0-ui-nav-wire');

test('buildFee0UiNavPayload encodes countdown and scale targets', () => {
  assert.deepEqual(
    [...buildFee0UiNavPayload(UI_NAV_TARGETS.countdown)],
    [TOPICS.uiNavigate, UI_NAV_TARGETS.countdown]
  );
  assert.deepEqual(
    [...buildFee0UiNavPayload(UI_NAV_TARGETS.scale)],
    [TOPICS.uiNavigate, UI_NAV_TARGETS.scale]
  );
});

test('buildFee0UiNavPayload rejects unknown targets', () => {
  assert.throws(() => buildFee0UiNavPayload(0));
  assert.throws(() => buildFee0UiNavPayload(3));
});

test('UI navigation wire is protected by auth8', () => {
  const auth8 = Buffer.from('AUTHKEY1');
  const payload = buildFee0UiNavPayload(UI_NAV_TARGETS.scale);
  assert.deepEqual(
    [...buildFee0VendorWirePayload(payload, { auth8 })],
    [TOPICS.uiNavigate, ...auth8, UI_NAV_TARGETS.scale]
  );
});

test('countdown update sequence writes preset, remaining, then navigation', () => {
  const sequence = buildFee0CountdownUpdateSequence({
    currentKcal: 42,
    targetKcal: 1234,
  });
  assert.deepEqual(
    sequence.map((payload) => [...payload]),
    [
      [TOPICS.countdownPreset, 0x31, 0x32, 0x33, 0x34],
      [TOPICS.countdownRemaining, 0x30, 0x30, 0x34, 0x32],
      [TOPICS.uiNavigate, UI_NAV_TARGETS.countdown],
    ]
  );
});

test('negative remaining keeps preset/remaining/navigation order', () => {
  const sequence = buildFee0CountdownUpdateSequence({ currentKcal: -180, targetKcal: 1800 });
  assert.deepEqual(sequence, [
    Buffer.from([0x63, ...Buffer.from('1800')]),
    Buffer.from([0x64, ...Buffer.from('-0180')]),
    Buffer.from([TOPICS.uiNavigate, UI_NAV_TARGETS.countdown]),
  ]);
});
