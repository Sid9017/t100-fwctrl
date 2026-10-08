'use strict';

const { TOPICS } = require('../protocol');
const {
  COFFEE_RECIPE_MAX_TARGET_MG,
} = require('./fee0-coffee-recipe-wire');

const WEIGHING_PROFILE_SCHEMA_V1 = 1;
const WEIGHING_PROFILE_KITCHEN = 0;
const WEIGHING_PROFILE_AMERICANO = 1;
const WEIGHING_PROFILE_POUR_OVER = 2;
const WEIGHING_PROFILE_DIET = 3;
const WEIGHING_PROFILE_PAYLOAD_LEN = 11;

function normalizeProfile(profile) {
  const value = Number(profile);
  if (
    value !== WEIGHING_PROFILE_KITCHEN &&
    value !== WEIGHING_PROFILE_DIET &&
    value !== WEIGHING_PROFILE_AMERICANO &&
    value !== WEIGHING_PROFILE_POUR_OVER
  ) {
    throw new Error('Scale mode must be Diet, Kitchen, Americano, or PourOver');
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

function buildWeighingProfilePayload({
  profile,
  primaryTargetMg = 0,
  waterTargetMg = 0,
} = {}) {
  const normalized = normalizeProfile(profile);
  const out = Buffer.alloc(WEIGHING_PROFILE_PAYLOAD_LEN);
  out[0] = TOPICS.weighingProfile;
  out[1] = WEIGHING_PROFILE_SCHEMA_V1;
  out[2] = normalized;
  if (normalized === WEIGHING_PROFILE_KITCHEN || normalized === WEIGHING_PROFILE_DIET) {
    if (Number(primaryTargetMg) !== 0 || Number(waterTargetMg) !== 0) {
      throw new Error('Kitchen and Diet profile targets must be zero');
    }
    return out;
  }
  out.writeUInt32LE(normalizeTargetMg(primaryTargetMg, 'Primary target'), 3);
  out.writeUInt32LE(normalizeTargetMg(waterTargetMg, 'Water target'), 7);
  return out;
}

module.exports = {
  WEIGHING_PROFILE_SCHEMA_V1,
  WEIGHING_PROFILE_KITCHEN,
  WEIGHING_PROFILE_DIET,
  WEIGHING_PROFILE_AMERICANO,
  WEIGHING_PROFILE_POUR_OVER,
  WEIGHING_PROFILE_PAYLOAD_LEN,
  buildWeighingProfilePayload,
};
