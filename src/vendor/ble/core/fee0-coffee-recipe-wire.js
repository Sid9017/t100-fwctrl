'use strict';

const { TOPICS } = require('../protocol');

const COFFEE_RECIPE_SCHEMA_V1 = 1;
const COFFEE_RECIPE_MODE_ESPRESSO = 1;
const COFFEE_RECIPE_MODE_POUR_OVER = 2;
const COFFEE_RECIPE_FLAG_PERSIST = 1 << 0;
const COFFEE_RECIPE_FLAG_CLEAR = 1 << 1;
const COFFEE_RECIPE_PAYLOAD_LEN = 12;
const COFFEE_RECIPE_MAX_TARGET_MG = 999_900;
const MG_PER_OZ = 28_349.523125;

function normalizeMode(mode) {
  const value = Number(mode);
  if (value !== COFFEE_RECIPE_MODE_ESPRESSO && value !== COFFEE_RECIPE_MODE_POUR_OVER) {
    throw new Error('Coffee recipe mode must be Americano or PourOver');
  }
  return value;
}

function normalizeTargetMg(value, label) {
  const mg = Math.round(Number(value));
  if (!Number.isSafeInteger(mg) || mg <= 0 || mg > COFFEE_RECIPE_MAX_TARGET_MG) {
    throw new Error(`${label} must be between 1 and ${COFFEE_RECIPE_MAX_TARGET_MG} mg`);
  }
  return mg;
}

function displayMassToMg(value, unit) {
  const mass = Number(value);
  if (!Number.isFinite(mass) || mass <= 0) throw new Error('Base mass must be positive');
  return normalizeTargetMg(unit === 'oz' || Number(unit) === 1 ? mass * MG_PER_OZ : mass * 1000, 'Base mass');
}

function mgToDisplayMass(mg, unit) {
  const value = Number(mg);
  if (!Number.isFinite(value)) return 0;
  return unit === 'oz' || Number(unit) === 1 ? value / MG_PER_OZ : value / 1000;
}

function calculateCoffeeTargets({ mode, baseMass, ratio, unit = 'g' } = {}) {
  const recipeMode = normalizeMode(mode);
  const ratioValue = Number(ratio);
  if (!Number.isFinite(ratioValue) || ratioValue <= 0) {
    throw new Error('Coffee recipe ratio must be positive');
  }
  const primaryTargetMg = displayMassToMg(baseMass, unit);
  const waterTargetMg = normalizeTargetMg(primaryTargetMg * ratioValue, 'Water target');
  return { mode: recipeMode, primaryTargetMg, waterTargetMg };
}

function buildCoffeeRecipePayload({
  mode,
  primaryTargetMg,
  waterTargetMg,
  persist = false,
  clear = false,
} = {}) {
  const out = Buffer.alloc(COFFEE_RECIPE_PAYLOAD_LEN);
  out[0] = TOPICS.coffeeRecipe;
  out[1] = COFFEE_RECIPE_SCHEMA_V1;
  if (clear) {
    if (!persist) throw new Error('Coffee recipe clear must be persisted');
    out[3] = COFFEE_RECIPE_FLAG_PERSIST | COFFEE_RECIPE_FLAG_CLEAR;
    return out;
  }
  out[2] = normalizeMode(mode);
  out[3] = persist ? COFFEE_RECIPE_FLAG_PERSIST : 0;
  out.writeUInt32LE(normalizeTargetMg(primaryTargetMg, 'Primary target'), 4);
  out.writeUInt32LE(normalizeTargetMg(waterTargetMg, 'Water target'), 8);
  return out;
}

module.exports = {
  COFFEE_RECIPE_SCHEMA_V1,
  COFFEE_RECIPE_MODE_ESPRESSO,
  COFFEE_RECIPE_MODE_POUR_OVER,
  COFFEE_RECIPE_FLAG_PERSIST,
  COFFEE_RECIPE_FLAG_CLEAR,
  COFFEE_RECIPE_PAYLOAD_LEN,
  COFFEE_RECIPE_MAX_TARGET_MG,
  MG_PER_OZ,
  calculateCoffeeTargets,
  buildCoffeeRecipePayload,
  displayMassToMg,
  mgToDisplayMass,
};
