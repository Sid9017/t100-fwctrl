'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { FRAMES, GATT, TOPICS, UI_NAV_TARGETS, UUIDS } = require('./index');

test('protocol exports T100 vendor GATT layout', () => {
  assert.equal(UUIDS.services.vendor, 'fee0');
  assert.equal(GATT.vendor.downlink.writeCommand, 'fee2');
  assert.equal(GATT.vendor.downlink.writeRequest, 'fee3');
  assert.equal(GATT.vendor.uplinkNotify, 'fee1');
  assert.equal(GATT.vendor.themeId, 'fee4');
  assert.equal(GATT.vendor.deviceStatus, 'fee5');
  assert.equal(GATT.time.service, '1805');
  assert.equal(GATT.time.currentTime, '2a2b');
  assert.deepEqual(GATT.vendor.downlink.preferredOrder, ['fee3', 'fee2']);
});

test('protocol exports standard GATT services', () => {
  assert.equal(GATT.genericAccess.service, '1800');
  assert.equal(GATT.genericAccess.deviceName, '2a00');
  assert.equal(GATT.deviceInfo.service, '180a');
  assert.equal(GATT.deviceInfo.firmwareRevision, '2a26');
  assert.equal(GATT.battery.service, '180f');
  assert.equal(GATT.battery.level, '2a19');
});

test('protocol exports firmware update, bind, and NFC GATT services', () => {
  assert.equal(GATT.oad.service, 'ffc0');
  assert.equal(GATT.oad.imageIdentify, 'ffc1');
  assert.equal(GATT.oad.block, 'ffc2');
  assert.equal(GATT.oad.chunkX, 'ffc3');
  assert.equal(GATT.bind.service, '6b300001ef004a5b8dc12e9fcdef0001');
  assert.equal(GATT.bind.token, '6b300013ef004a5b8dc12e9fcdef0001');
  assert.equal(GATT.nfc.service, '6b300002ef004a5b8dc12e9fcdef0002');
  assert.equal(GATT.nfc.peek, '6b300021ef004a5b8dc12e9fcdef0002');
  assert.equal(GATT.nfc.pull, '6b300022ef004a5b8dc12e9fcdef0002');
  assert.equal(GATT.nfc.record, '6b300023ef004a5b8dc12e9fcdef0002');
  assert.equal(GATT.nfc.tap, '6b300024ef004a5b8dc12e9fcdef0002');
});

test('protocol exports T100 FEE0 topic frame facts', () => {
  assert.equal(TOPICS.reset, 0x52);
  assert.equal(TOPICS.factoryReset, 0x53);
  assert.equal(TOPICS.bindCommit, 0x54);
  assert.equal(TOPICS.reboot, undefined);
  assert.equal(TOPICS.scaleTare, 0x61);
  assert.equal(TOPICS.scaleUnit, 0x62);
  assert.equal(TOPICS.countdownPreset, 0x63);
  assert.equal(TOPICS.countdownRemaining, 0x64);
  assert.equal(TOPICS.kcalHistRecord, 0x65);
  assert.equal(TOPICS.kcalHistImageBegin, 0x66);
  assert.equal(TOPICS.kcalHistImageData, 0x67);
  assert.equal(TOPICS.kcalHistImageCommit, 0x68);
  assert.equal(TOPICS.notifyDisplay, 0x69);
  assert.equal(TOPICS.notifyBegin, 0x69);
  assert.equal(TOPICS.notifyChunk, 0x6f);
  assert.equal(TOPICS.notifyCommit, 0x70);
  assert.equal(TOPICS.notifyAbort, 0x71);
  assert.equal(TOPICS.uiNavigate, 0x72);
  assert.equal(TOPICS.kcalHistAbort, 0x73);
  assert.equal(TOPICS.coffeeRecipe, 0x74);
  assert.equal(TOPICS.weighingProfile, 0x75);
  assert.equal(TOPICS.lightControl, 0x76);
  assert.equal(UI_NAV_TARGETS.countdown, 0x01);
  assert.equal(UI_NAV_TARGETS.scale, 0x02);
  assert.equal(FRAMES.reset.topic, 0x52);
  assert.equal(FRAMES.factoryReset.topic, 0x53);
  assert.equal(FRAMES.bindCommit.topic, 0x54);
  assert.equal(FRAMES.reboot, undefined);
});

test('protocol separates characteristic payloads from vendor topic frames', () => {
  assert.equal(GATT.time.currentTime, '2a2b');
  assert.equal(FRAMES.setTime.characteristic, '2a2b');
  assert.equal(FRAMES.setTime.endian, 'little');
  assert.equal(FRAMES.setTime.unit, 'unix-seconds');
});
