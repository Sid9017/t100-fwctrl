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

module.exports = {
  FEE0_KCAL_DIGITS,
  FEE0_KCAL_MAX,
  buildFee0KcalTopicPayload,
};
