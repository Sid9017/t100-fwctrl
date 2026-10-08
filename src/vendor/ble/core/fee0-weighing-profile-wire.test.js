'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  WEIGHING_PROFILE_KITCHEN,
  WEIGHING_PROFILE_DIET,
  WEIGHING_PROFILE_AMERICANO,
  WEIGHING_PROFILE_POUR_OVER,
  buildWeighingProfilePayload,
} = require('./fee0-weighing-profile-wire');

test('builds Kitchen, Diet, Americano, and PourOver profile payloads', () => {
  assert.equal(
    buildWeighingProfilePayload({ profile: WEIGHING_PROFILE_KITCHEN }).toString('hex'),
    '7501000000000000000000'
  );
  assert.equal(
    buildWeighingProfilePayload({ profile: WEIGHING_PROFILE_DIET }).toString('hex'),
    '7501030000000000000000'
  );
  assert.equal(
    buildWeighingProfilePayload({
      profile: WEIGHING_PROFILE_AMERICANO,
      primaryTargetMg: 36_000,
      waterTargetMg: 72_000,
    }).toString('hex'),
    '750101a08c000040190100'
  );
  assert.equal(
    buildWeighingProfilePayload({
      profile: WEIGHING_PROFILE_POUR_OVER,
      primaryTargetMg: 15_000,
      waterTargetMg: 240_000,
    }).toString('hex'),
    '750102983a000080a90300'
  );
});

test('rejects invalid profiles and plain weighing targets', () => {
  assert.throws(() => buildWeighingProfilePayload({ profile: 4 }), /Diet, Kitchen, Americano/);
  assert.throws(
    () => buildWeighingProfilePayload({ profile: WEIGHING_PROFILE_KITCHEN, primaryTargetMg: 1 }),
    /must be zero/
  );
});

test('Diet rejects recipe targets and coffee profiles still need targets', () => {
  for (const profile of [WEIGHING_PROFILE_DIET, WEIGHING_PROFILE_KITCHEN]) {
    assert.throws(() => buildWeighingProfilePayload({ profile, waterTargetMg: 1 }), /must be zero/);
  }
  for (const profile of [WEIGHING_PROFILE_AMERICANO, WEIGHING_PROFILE_POUR_OVER]) {
    assert.throws(() => buildWeighingProfilePayload({ profile }), /must be between/);
  }
});
