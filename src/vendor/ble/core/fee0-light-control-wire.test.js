'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { buildLightControlPayload } = require('./fee0-light-control-wire');
const { buildFee0VendorWirePayload } = require('../../../web/actions.js');

test('builds two-light control payloads', () => {
  assert.equal(
    buildLightControlPayload({ leftOn: true, rightOn: false, brightnessPercent: 50 }).toString('hex'),
    '76010132'
  );
  assert.equal(
    buildLightControlPayload({ leftOn: true, rightOn: true, brightnessPercent: 100 }).toString('hex'),
    '76010364'
  );
  assert.equal(buildLightControlPayload({ brightnessPercent: 25 }).toString('hex'), '76010019');
});

test('rejects invalid light brightness', () => {
  assert.throws(() => buildLightControlPayload({ brightnessPercent: -1 }), /0 to 100/);
  assert.throws(() => buildLightControlPayload({ brightnessPercent: 101 }), /0 to 100/);
  assert.throws(() => buildLightControlPayload({ brightnessPercent: 1.5 }), /integer/);
});

test('light control stays public so an unbound connected device can be tested', () => {
  const payload = buildLightControlPayload({
    leftOn: true,
    rightOn: true,
    brightnessPercent: 80,
  });
  assert.deepEqual([...buildFee0VendorWirePayload(payload, { auth8: null })], [0x76, 1, 3, 80]);
});
