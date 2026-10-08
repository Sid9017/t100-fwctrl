'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  COFFEE_RECIPE_MODE_ESPRESSO,
  COFFEE_RECIPE_MODE_POUR_OVER,
  COFFEE_RECIPE_MAX_TARGET_MG,
  calculateCoffeeTargets,
  buildCoffeeRecipePayload,
  displayMassToMg,
} = require('./fee0-coffee-recipe-wire');

test('builds a 12-byte preview and persisted coffee recipe payload', () => {
  const preview = buildCoffeeRecipePayload({
    mode: COFFEE_RECIPE_MODE_POUR_OVER,
    primaryTargetMg: 15_000,
    waterTargetMg: 240_000,
  });
  assert.equal(preview.toString('hex'), '74010200983a000080a90300');

  const commit = buildCoffeeRecipePayload({
    mode: COFFEE_RECIPE_MODE_ESPRESSO,
    primaryTargetMg: 36_000,
    waterTargetMg: 72_000,
    persist: true,
  });
  assert.equal(commit.toString('hex'), '74010101a08c000040190100');
});

test('calculates balanced gram and ounce targets in canonical mg', () => {
  assert.deepEqual(
    calculateCoffeeTargets({ mode: 2, baseMass: 15, ratio: 16, unit: 'g' }),
    { mode: 2, primaryTargetMg: 15_000, waterTargetMg: 240_000 }
  );
  assert.equal(displayMassToMg(1, 'oz'), 28_350);
  assert.deepEqual(
    calculateCoffeeTargets({ mode: 1, baseMass: 1, ratio: 2, unit: 'oz' }),
    { mode: 1, primaryTargetMg: 28_350, waterTargetMg: 56_700 }
  );
});

test('clear requires persist and zeroes recipe fields', () => {
  assert.throws(() => buildCoffeeRecipePayload({ clear: true }), /persisted/);
  assert.equal(
    buildCoffeeRecipePayload({ clear: true, persist: true }).toString('hex'),
    '740100030000000000000000'
  );
});

test('limits each coffee target to the DDD.D g display range', () => {
  assert.doesNotThrow(() =>
    buildCoffeeRecipePayload({
      mode: COFFEE_RECIPE_MODE_POUR_OVER,
      primaryTargetMg: 1,
      waterTargetMg: COFFEE_RECIPE_MAX_TARGET_MG,
    })
  );
  assert.throws(
    () =>
      buildCoffeeRecipePayload({
        mode: COFFEE_RECIPE_MODE_POUR_OVER,
        primaryTargetMg: 1,
        waterTargetMg: 1_000_000,
      }),
    /999900 mg/
  );
});
