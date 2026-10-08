'use strict';

// T100 protocol facts only. Do not import platform BLE adapters or core logic here.

const UUIDS = Object.freeze({
  services: Object.freeze({
    genericAccess: '1800',
    vendor: 'fee0',
    deviceInfo: '180a',
    battery: '180f',
    cts: '1805',
    oad: 'ffc0',
    bind: '6b300001ef004a5b8dc12e9fcdef0001',
    nfc: '6b300002ef004a5b8dc12e9fcdef0002',
  }),
  characteristics: Object.freeze({
    deviceName: '2a00',
    vendorDownlinkCommand: 'fee2',
    vendorDownlinkRequest: 'fee3',
    vendorUplinkNotify: 'fee1',
    vendorThemeId: 'fee4',
    vendorDeviceStatus: 'fee5',
    ctsCurrentTime: '2a2b',
    firmwareRevision: '2a26',
    batteryLevel: '2a19',
    oadImageIdentify: 'ffc1',
    oadBlock: 'ffc2',
    oadChunkX: 'ffc3',
    bindToken: '6b300013ef004a5b8dc12e9fcdef0001',
    nfcPeek: '6b300021ef004a5b8dc12e9fcdef0002',
    nfcPull: '6b300022ef004a5b8dc12e9fcdef0002',
    nfcRecord: '6b300023ef004a5b8dc12e9fcdef0002',
    nfcTap: '6b300024ef004a5b8dc12e9fcdef0002',
  }),
});

const TOPICS = Object.freeze({
  /** Reset business/bind state and auth while preserving the P-256 identity. */
  reset: 0x52,
  factoryReset: 0x53,
  /** Bind commit after reading bind token; payload is topic + session_auth(8B). */
  bindCommit: 0x54,
  scaleTare: 0x61,
  scaleUnit: 0x62,
  /** Countdown preset (target KCal) → Flash via FEE0 topic 0x63. */
  countdownPreset: 0x63,
  /** Countdown remaining (current KCal) → Flash via FEE0 topic 0x64. */
  countdownRemaining: 0x64,
  /** UUID/timestamp-correlated kcal record + image upload. */
  kcalHistRecord: 0x65,
  kcalHistImageBegin: 0x66,
  kcalHistImageData: 0x67,
  kcalHistImageCommit: 0x68,
  /** Notify bitmap BEGIN: utc + color + crc + nbytes (24×H gray, H≤212). */
  notifyBegin: 0x69,
  /** @deprecated use notifyBegin */
  notifyDisplay: 0x69,
  /** Mouth morph theme upload session (5×225 B 1-bit keyframes). */
  morphThemeBegin: 0x6a,
  morphThemeChunk: 0x6b,
  morphThemeCommit: 0x6c,
  morphThemeAbort: 0x6d,
  /** Restore factory circle mouth theme (not full device wipe). */
  morphThemeFactory: 0x6e,
  /** Notify bitmap CHUNK / COMMIT / ABORT. */
  notifyChunk: 0x6f,
  notifyCommit: 0x70,
  notifyAbort: 0x71,
  /** Authenticated screen-state navigation command. */
  uiNavigate: 0x72,
  kcalHistAbort: 0x73,
  /** Coffee recipe preview/commit: schema + mode + flags + two mg targets. */
  coffeeRecipe: 0x74,
  /** Persist active Diet/Kitchen/Americano/PourOver profile and relevant targets. */
  weighingProfile: 0x75,
  /** Two white lights: schema + left/right enable mask + common brightness. */
  lightControl: 0x76,
  containerWeight: 0x77,
});

const UI_NAV_TARGETS = Object.freeze({
  countdown: 0x01,
  scale: 0x02,
});

const GATT = Object.freeze({
  genericAccess: Object.freeze({
    service: UUIDS.services.genericAccess,
    deviceName: UUIDS.characteristics.deviceName,
  }),
  vendor: Object.freeze({
    service: UUIDS.services.vendor,
    downlink: Object.freeze({
      preferredOrder: Object.freeze([
        UUIDS.characteristics.vendorDownlinkRequest,
        UUIDS.characteristics.vendorDownlinkCommand,
      ]),
      writeRequest: UUIDS.characteristics.vendorDownlinkRequest,
      writeCommand: UUIDS.characteristics.vendorDownlinkCommand,
    }),
    uplinkNotify: UUIDS.characteristics.vendorUplinkNotify,
    themeId: UUIDS.characteristics.vendorThemeId,
    deviceStatus: UUIDS.characteristics.vendorDeviceStatus,
  }),
  time: Object.freeze({
    service: UUIDS.services.cts,
    currentTime: UUIDS.characteristics.ctsCurrentTime,
  }),
  deviceInfo: Object.freeze({
    service: UUIDS.services.deviceInfo,
    firmwareRevision: UUIDS.characteristics.firmwareRevision,
  }),
  battery: Object.freeze({
    service: UUIDS.services.battery,
    level: UUIDS.characteristics.batteryLevel,
  }),
  oad: Object.freeze({
    service: UUIDS.services.oad,
    imageIdentify: UUIDS.characteristics.oadImageIdentify,
    block: UUIDS.characteristics.oadBlock,
    chunkX: UUIDS.characteristics.oadChunkX,
  }),
  bind: Object.freeze({
    service: UUIDS.services.bind,
    token: UUIDS.characteristics.bindToken,
  }),
  nfc: Object.freeze({
    service: UUIDS.services.nfc,
    peek: UUIDS.characteristics.nfcPeek,
    pull: UUIDS.characteristics.nfcPull,
    record: UUIDS.characteristics.nfcRecord,
    tap: UUIDS.characteristics.nfcTap,
  }),
});

const FRAMES = Object.freeze({
  reset: Object.freeze({
    topic: TOPICS.reset,
    length: 1,
  }),
  setTime: Object.freeze({
    characteristic: UUIDS.characteristics.ctsCurrentTime,
    length: 4,
    endian: 'little',
    unit: 'unix-seconds',
  }),
  factoryReset: Object.freeze({
    topic: TOPICS.factoryReset,
    length: 1,
  }),
  bindCommit: Object.freeze({
    topic: TOPICS.bindCommit,
    sessionAuthLen: 8,
  }),
});

const T100_PROTOCOL = Object.freeze({
  uuidStyle: 'short-or-canonical-lower-hex',
  uuids: UUIDS,
  topics: TOPICS,
  uiNavTargets: UI_NAV_TARGETS,
  gatt: GATT,
  frames: FRAMES,
});

module.exports = {
  T100_PROTOCOL,
  UUIDS,
  TOPICS,
  UI_NAV_TARGETS,
  GATT,
  FRAMES,
};
