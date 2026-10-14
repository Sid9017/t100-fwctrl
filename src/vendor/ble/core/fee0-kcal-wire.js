'use strict';

const FEE0_KCAL_DIGITS = 4;
const FEE0_KCAL_MAX = 9999;

function buildFee0KcalTopicPayload(topicByte, kcal) {
  const n = Number(kcal);
  const min = topicByte === 0x64 ? -FEE0_KCAL_MAX : 0;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > FEE0_KCAL_MAX) {
    throw new Error(`KCal must be an integer ${min}–${FEE0_KCAL_MAX}`);
  }
  const digits = String(Math.abs(n)).padStart(FEE0_KCAL_DIGITS, '0');
  const body = `${n < 0 ? '-' : ''}${digits}`;
  const buf = Buffer.concat([Buffer.from([topicByte & 0xff]), Buffer.from(body, 'ascii')]);
  return buf;
}

function buildFee0CountdownTargetPayload(targetKcal, tdeeKcal = targetKcal) {
  for(const [label,value] of [['Target',targetKcal],['TDEE',tdeeKcal]]) {
    if((typeof value!=='number' && typeof value!=='string') || String(value).trim()==='' ||
       !Number.isInteger(Number(value)) || Number(value)<0 || Number(value)>FEE0_KCAL_MAX)
      throw new Error(`${label} must be an integer 0–${FEE0_KCAL_MAX}`);
  }
  if((Number(targetKcal)===0)!==(Number(tdeeKcal)===0))throw new Error('Target and TDEE must both be positive, or both 0 to clear countdown');
  return Buffer.concat([buildFee0KcalTopicPayload(0x63,targetKcal),buildFee0KcalTopicPayload(0x63,tdeeKcal).subarray(1)]);
}

module.exports = {
  FEE0_KCAL_DIGITS,
  FEE0_KCAL_MAX,
  buildFee0KcalTopicPayload,
  buildFee0CountdownTargetPayload,
};
