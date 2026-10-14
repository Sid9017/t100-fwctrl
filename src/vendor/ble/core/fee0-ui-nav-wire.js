'use strict';

const { TOPICS, UI_NAV_TARGETS } = require('../protocol');
const { buildFee0KcalTopicPayload,buildFee0CountdownTargetPayload } = require('./fee0-kcal-wire');

function buildFee0UiNavPayload(target) {
  const value = Number(target);
  if (value !== UI_NAV_TARGETS.countdown && value !== UI_NAV_TARGETS.scale) {
    throw new Error('UI navigation target must be countdown or scale');
  }
  return Buffer.from([TOPICS.uiNavigate, value]);
}

function buildFee0CountdownUpdateSequence({ currentKcal, targetKcal, tdeeKcal = targetKcal } = {}) {
  if(Number(targetKcal)===0 && Number(currentKcal)!==0)throw new Error('Remaining must be 0 when clearing countdown');
  return [
    buildFee0CountdownTargetPayload(targetKcal,tdeeKcal),
    buildFee0KcalTopicPayload(TOPICS.countdownRemaining, currentKcal),
    buildFee0UiNavPayload(UI_NAV_TARGETS.countdown),
  ];
}

module.exports = {
  buildFee0CountdownUpdateSequence,
  buildFee0UiNavPayload,
};
