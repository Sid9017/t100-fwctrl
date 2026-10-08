'use strict';

const { TOPICS } = require('../protocol');

const LIGHT_CONTROL_SCHEMA_V1 = 1;
const LIGHT_CONTROL_MASK_LEFT = 1 << 0;
const LIGHT_CONTROL_MASK_RIGHT = 1 << 1;
const LIGHT_CONTROL_MASK_BOTH = LIGHT_CONTROL_MASK_LEFT | LIGHT_CONTROL_MASK_RIGHT;
const LIGHT_CONTROL_PAYLOAD_LEN = 4;

function normalizeBrightnessPercent(value) {
  const brightnessPercent = Number(value);
  if (!Number.isInteger(brightnessPercent) || brightnessPercent < 0 || brightnessPercent > 100) {
    throw new Error('Light brightness must be an integer percentage from 0 to 100');
  }
  return brightnessPercent;
}

function buildLightControlPayload({
  leftOn = false,
  rightOn = false,
  brightnessPercent = 100,
} = {}) {
  let mask = 0;
  if (leftOn) mask |= LIGHT_CONTROL_MASK_LEFT;
  if (rightOn) mask |= LIGHT_CONTROL_MASK_RIGHT;
  return Buffer.from([
    TOPICS.lightControl,
    LIGHT_CONTROL_SCHEMA_V1,
    mask,
    normalizeBrightnessPercent(brightnessPercent),
  ]);
}

module.exports = {
  LIGHT_CONTROL_SCHEMA_V1,
  LIGHT_CONTROL_MASK_LEFT,
  LIGHT_CONTROL_MASK_RIGHT,
  LIGHT_CONTROL_MASK_BOTH,
  LIGHT_CONTROL_PAYLOAD_LEN,
  normalizeBrightnessPercent,
  buildLightControlPayload,
};
