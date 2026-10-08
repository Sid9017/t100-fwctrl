'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  GATT_WRITE_TYPE,
  GattAdapter,
  createCharacteristic,
  createConnection,
  createDevice,
  createService,
  normalizeUuid,
  toData,
} = require('../adapters');
const core = require('../core');
const { GATT, TOPICS } = require('../protocol');
const {
  T100Session,
  canonicalUuid,
  encodeUnixSecondsLe,
  pickVendorDownlinkTarget,
} = require('./t100-session');

function sigUuid16(shortUuid) {
  return `0000${String(shortUuid).toLowerCase()}00001000800000805f9b34fb`;
}

function sameService(a, b) {
  return canonicalUuid(a) === canonicalUuid(b);
}

class MockGattAdapter extends GattAdapter {
  constructor() {
    super();
    this.devices = [
      createDevice({ id: '1', name: 'YD-ONE', rssi: -40 }),
      createDevice({ id: '2', name: 'OTHER', rssi: -50 }),
    ];
    this.services = [
      createService({ uuid: GATT.vendor.service }),
      createService({ uuid: GATT.time.service }),
      createService({ uuid: GATT.deviceInfo.service }),
      createService({ uuid: GATT.battery.service }),
    ];
    this.characteristics = [
      createCharacteristic({
        serviceUuid: GATT.vendor.service,
        uuid: GATT.vendor.downlink.writeCommand,
        properties: ['writeWithoutResponse'],
      }),
      createCharacteristic({
        serviceUuid: GATT.vendor.service,
        uuid: GATT.vendor.downlink.writeRequest,
        properties: ['write'],
      }),
      createCharacteristic({
        serviceUuid: GATT.vendor.service,
        uuid: GATT.vendor.uplinkNotify,
        properties: ['read', 'notify'],
      }),
      createCharacteristic({
        serviceUuid: GATT.vendor.service,
        uuid: GATT.vendor.themeId,
        properties: ['read', 'write'],
      }),
      createCharacteristic({
        serviceUuid: GATT.vendor.service,
        uuid: GATT.vendor.deviceStatus,
        properties: ['read', 'notify'],
      }),
      createCharacteristic({
        serviceUuid: GATT.time.service,
        uuid: GATT.time.currentTime,
        properties: ['read', 'write'],
      }),
      createCharacteristic({
        serviceUuid: GATT.deviceInfo.service,
        uuid: GATT.deviceInfo.firmwareRevision,
        properties: ['read'],
      }),
      createCharacteristic({
        serviceUuid: GATT.battery.service,
        uuid: GATT.battery.level,
        properties: ['read', 'notify'],
      }),
    ];
    this.values = new Map([
      [GATT.deviceInfo.firmwareRevision, Buffer.from('fw-1.2.3\0')],
      /* BLE Current Time 10 B for UTC 1970-01-01 03:25:45 = unix 12345 */
      [
        GATT.time.currentTime,
        Buffer.from([0xb2, 0x07, 1, 1, 3, 25, 45, 4, 0, 0]),
      ],
      [GATT.battery.level, Buffer.from([86])],
      [GATT.vendor.uplinkNotify, Buffer.from([0x00, 0x10, 0x27, 0x00, 0x00])],
      [GATT.vendor.themeId, Buffer.from([0x01])],
      [GATT.vendor.deviceStatus, Buffer.from([8, 4, 1, 2, 0x51, 0, 0, 0])],
    ]);
    this.writes = [];
    this.subscriptions = [];
    this.filteredMissServices = new Set();
    this.filteredMissCharacteristics = new Set();
    this.useFullSigUuids = false;
  }

  async waitReady() {}

  startScan(_options, onDevice) {
    this.devices.forEach(onDevice);
  }

  stopScan() {}

  async connect(device) {
    return createConnection({ id: `c-${device.id}`, device });
  }

  async disconnect(_connection) {}

  async discoverServices(_connection, serviceUuids) {
    const wanted = (serviceUuids || []).map(canonicalUuid);
    if (wanted.length === 1 && this.filteredMissServices.has(wanted[0])) {
      return [];
    }
    return this.services
      .filter((s) => !wanted.length || wanted.includes(canonicalUuid(s.uuid)))
      .map((s) => this.useFullSigUuids && canonicalUuid(s.uuid).length === 4
        ? createService({ uuid: sigUuid16(s.uuid) })
        : s);
  }

  async discoverCharacteristics(_connection, service, characteristicUuids) {
    const wanted = (characteristicUuids || []).map(canonicalUuid);
    if (wanted.length === 1 && this.filteredMissCharacteristics.has(wanted[0])) {
      return [];
    }
    return this.characteristics
      .filter(
        (ch) => sameService(ch.serviceUuid, service.uuid) &&
          (!wanted.length || wanted.includes(canonicalUuid(ch.uuid)))
      )
      .map((ch) => this.useFullSigUuids && canonicalUuid(ch.uuid).length === 4
        ? createCharacteristic({
          serviceUuid: sigUuid16(ch.serviceUuid),
          uuid: sigUuid16(ch.uuid),
          properties: ch.properties,
        })
        : ch);
  }

  async readCharacteristic(_connection, characteristic) {
    return Buffer.from(this.values.get(canonicalUuid(characteristic.uuid)) || Buffer.alloc(0));
  }

  async writeCharacteristic(_connection, characteristic, value, writeType) {
    this.writes.push({
      characteristic,
      value: toData(value),
      writeType,
    });
  }

  async subscribe(_connection, characteristic, onData) {
    this.subscriptions.push({ characteristic, onData });
    return { unsubscribe() {} };
  }

  async unsubscribe() {}
}

test('T100 session filters scan results by default name prefix', () => {
  const adapter = new MockGattAdapter();
  const session = new T100Session({ adapter });
  const found = [];

  session.startScan({}, (device) => found.push(device));

  assert.deepEqual(
    found.map((d) => d.name),
    ['YD-ONE']
  );
});

test('T100 session reads DIS firmware revision string', async () => {
  const adapter = new MockGattAdapter();
  const session = new T100Session({ adapter });
  const connection = await session.connect(adapter.devices[0]);

  assert.equal(await session.readFirmwareVersion(connection), 'fw-1.2.3');
});

test('T100 session reads device time from CTS Current Time', async () => {
  const adapter = new MockGattAdapter();
  const session = new T100Session({ adapter });
  const connection = await session.connect(adapter.devices[0]);

  const unix = await session.readDeviceTime(connection);

  assert.equal(unix, 0x3039);
});

test('T100 session accepts full SIG UUID service discovery results', async () => {
  const adapter = new MockGattAdapter();
  adapter.useFullSigUuids = true;
  const session = new T100Session({ adapter });
  const connection = await session.connect(adapter.devices[0]);

  const fw = await session.readFirmwareVersion(connection);
  const unix = await session.readDeviceTime(connection);
  const battery = await session.readBatteryLevel(connection);

  assert.equal(fw, 'fw-1.2.3');
  assert.equal(unix, 0x3039);
  assert.equal(battery, 86);
});

test('T100 session falls back when filtered service discovery misses', async () => {
  const adapter = new MockGattAdapter();
  adapter.filteredMissServices.add(normalizeUuid(GATT.time.service));
  const session = new T100Session({ adapter });
  const connection = await session.connect(adapter.devices[0]);

  const unix = await session.readDeviceTime(connection);

  assert.equal(unix, 0x3039);
});

test('T100 session falls back when filtered characteristic discovery misses', async () => {
  const adapter = new MockGattAdapter();
  adapter.filteredMissCharacteristics.add(canonicalUuid(GATT.vendor.deviceStatus));
  const session = new T100Session({ adapter });
  const connection = await session.connect(adapter.devices[0]);

  const status = await session.readDeviceStatus(connection);

  assert.equal(status.screenName, 'SCALE');
});

test('T100 session reads and subscribes Battery Level percent', async () => {
  const adapter = new MockGattAdapter();
  const session = new T100Session({ adapter });
  const connection = await session.connect(adapter.devices[0]);
  const levels = [];

  assert.equal(await session.readBatteryLevel(connection), 86);
  await session.subscribeBatteryLevel(connection, (level) => levels.push(level));
  adapter.subscriptions[0].onData(Buffer.from([0x7b]));
  adapter.subscriptions[0].onData(Buffer.from([0xff]));

  assert.equal(adapter.subscriptions[0].characteristic.uuid, GATT.battery.level);
  assert.deepEqual(levels, [123, -1]);
});

test('T100 session reads and subscribes FEE1 scale wire payloads', async () => {
  const adapter = new MockGattAdapter();
  const session = new T100Session({ adapter });
  const connection = await session.connect(adapter.devices[0]);
  const readings = [];

  assert.deepEqual(await session.readScaleReading(connection), {
    unit: 0,
    value: 10000,
  });
  await session.subscribeScaleNotify(connection, (reading) => readings.push(reading));
  adapter.subscriptions[0].onData(Buffer.from([0x01, 0xd2, 0x04, 0x00, 0x00]));

  assert.equal(adapter.subscriptions[0].characteristic.uuid, GATT.vendor.uplinkNotify);
  assert.deepEqual(readings, [{ unit: 0x01, value: 1234 }]);
});

test('T100 session reads one-byte FEE4 morph theme ID', async () => {
  const adapter = new MockGattAdapter();
  const session = new T100Session({ adapter });
  const connection = await session.connect(adapter.devices[0]);

  assert.equal(await session.readMorphThemeId(connection), 0x01);
});

test('T100 session reads and subscribes FEE5 device status', async () => {
  const adapter = new MockGattAdapter();
  const session = new T100Session({ adapter });
  const connection = await session.connect(adapter.devices[0]);
  const statuses = [];

  assert.equal((await session.readDeviceStatus(connection)).screenName, 'SCALE');
  await session.subscribeDeviceStatus(connection, (status) => statuses.push(status));
  adapter.subscriptions[0].onData(Buffer.from([8, 5, 1, 2, 1, 0, 0, 0]));

  assert.equal(adapter.subscriptions[0].characteristic.uuid, GATT.vendor.deviceStatus);
  assert.equal(statuses[0].screenName, 'KCAL_HISTORY');
  assert.equal(statuses[0].phaseName, 'SLIDING');
});

test('T100 session writes factory reset and set time payloads', async () => {
  const adapter = new MockGattAdapter();
  const session = new T100Session({ adapter });
  const connection = await session.connect(adapter.devices[0]);

  await session.factoryReset(connection);
  await session.setTime(connection, 1);

  assert.deepEqual(adapter.writes[0].value, Buffer.from([TOPICS.factoryReset]));
  assert.equal(adapter.writes[1].characteristic.uuid, GATT.time.currentTime);
  assert.deepEqual(adapter.writes[1].value, Buffer.from([1, 0, 0, 0]));
});

test('T100 session helpers validate write targets and time payloads', () => {
  const fee2 = createCharacteristic({
    serviceUuid: GATT.vendor.service,
    uuid: GATT.vendor.downlink.writeCommand,
    properties: ['writeWithoutResponse'],
  });
  assert.deepEqual(pickVendorDownlinkTarget([fee2]), {
    characteristic: fee2,
    writeType: GATT_WRITE_TYPE.WITHOUT_RESPONSE,
  });
  assert.deepEqual(encodeUnixSecondsLe(0xffffffff), Buffer.from([0xff, 0xff, 0xff, 0xff]));
  assert.throws(() => encodeUnixSecondsLe(-1), /uint32/);
});
