'use strict';

const { GATT, T100_PROTOCOL, TOPICS } = require('../protocol');
const core = require('../core');
const {
  GATT_WRITE_TYPE,
  assertGattAdapter,
  normalizeUuid,
  toData,
} = require('../adapters');

class T100SessionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'T100SessionError';
    this.code = code;
  }
}

function hasProperty(characteristic, property) {
  return (characteristic.properties || []).includes(property);
}

function canonicalUuid(uuid) {
  const s = normalizeUuid(uuid);
  const sig = /^0000([0-9a-f]{4})00001000800000805f9b34fb$/i.exec(s);
  if (sig) return sig[1].toLowerCase();
  const ti = /^f000([0-9a-f]{4})04514000b000000000000000$/i.exec(s);
  if (ti) return ti[1].toLowerCase();
  return s;
}

function sameUuid(a, b) {
  return canonicalUuid(a) === canonicalUuid(b);
}

function pickVendorDownlinkTarget(characteristics, { requireWriteResponse = false } = {}) {
  const list = characteristics || [];
  const preferred = GATT.vendor.downlink.preferredOrder;

  for (const uuid of preferred) {
    const characteristic = list.find((ch) => sameUuid(ch.uuid, uuid));
    if (!characteristic) continue;

    if (hasProperty(characteristic, 'write')) {
      return {
        characteristic,
        writeType: GATT_WRITE_TYPE.WITH_RESPONSE,
      };
    }
    if (!requireWriteResponse && hasProperty(characteristic, 'writeWithoutResponse')) {
      return {
        characteristic,
        writeType: GATT_WRITE_TYPE.WITHOUT_RESPONSE,
      };
    }
  }

  return null;
}

function encodeUnixSecondsLe(unixSeconds) {
  const n = Number(unixSeconds);
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) {
    throw new T100SessionError('invalid-time', 'unixSeconds must be a uint32 integer');
  }
  const out = Buffer.alloc(4);
  out.writeUInt32LE(n >>> 0, 0);
  return out;
}

function decodeBleCurrentTimeUnix(buf) {
  const data = toData(buf);
  if (data.length < 10) {
    throw new T100SessionError(
      'cts-read-invalid',
      `CTS Current Time expected >=10 bytes, got ${data.length}`
    );
  }
  const year = data.readUInt16LE(0);
  const month = data.readUInt8(2);
  const day = data.readUInt8(3);
  const hour = data.readUInt8(4);
  const minute = data.readUInt8(5);
  const second = data.readUInt8(6);
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  return (Math.floor(utcMs / 1000) >>> 0);
}

/** @deprecated use decodeBleCurrentTimeUnix */
function decodeFee6UnixRead(buf) {
  return decodeBleCurrentTimeUnix(buf);
}

function decodeBatteryLevel(buf) {
  const data = toData(buf);
  if (data.length < 1) {
    throw new T100SessionError('battery-read-invalid', 'Battery Level expected at least 1 byte');
  }
  const level = data.readUInt8(0);
  return level === 0xff ? -1 : level;
}

class T100Session {
  constructor(options) {
    if (!options || !options.adapter) {
      throw new T100SessionError('missing-adapter', 'adapter is required');
    }
    this.adapter = assertGattAdapter(options.adapter);
    this.protocol = options.protocol || T100_PROTOCOL;
    /** @type {WeakMap<object, { characteristic: object, writeType: string }>} */
    this._vendorDownlinkCache = new WeakMap();
  }

  clearVendorDownlinkCache(connection) {
    if (connection) {
      this._vendorDownlinkCache.delete(connection);
    }
  }

  async _resolveVendorDownlink(connection, requireWriteResponse) {
    const cacheKey = requireWriteResponse ? 'wr' : 'any';
    let cached = this._vendorDownlinkCache.get(connection);
    if (cached && cached.key === cacheKey) {
      return cached.target;
    }

    const service = await this._getService(connection, GATT.vendor.service);
    const characteristics = await this.adapter.discoverCharacteristics(
      connection,
      service,
      GATT.vendor.downlink.preferredOrder
    );
    const target = pickVendorDownlinkTarget(characteristics, { requireWriteResponse });
    if (!target) {
      const msg = requireWriteResponse
        ? 'vendor downlink write-with-response characteristic not found'
        : 'vendor downlink characteristic not writable';
      throw new T100SessionError('vendor-downlink-not-found', msg);
    }
    this._vendorDownlinkCache.set(connection, { key: cacheKey, target });
    return target;
  }

  waitReady() {
    return this.adapter.waitReady();
  }

  startScan(options = {}, onDevice) {
    const namePrefix = options.namePrefix == null ? 'YD-' : String(options.namePrefix);
    const allowAll = !!options.allowAll;
    const scanOptions = { ...(options.scanOptions || {}) };
    if (options.extendedScan != null) {
      scanOptions.extendedScan = !!options.extendedScan;
    }
    if (options.allowDuplicates != null) {
      scanOptions.allowDuplicates = !!options.allowDuplicates;
    }
    this.adapter.startScan(scanOptions, (device) => {
      if (!allowAll && namePrefix && !String(device.name || '').startsWith(namePrefix)) {
        return;
      }
      onDevice(device);
    });
  }

  stopScan() {
    this.adapter.stopScan();
  }

  connect(device, options = {}) {
    return this.adapter.connect(device, options);
  }

  disconnect(connection) {
    return this.adapter.disconnect(connection);
  }

  async readFirmwareVersion(connection) {
    const characteristic = await this._getCharacteristic(
      connection,
      GATT.deviceInfo.service,
      GATT.deviceInfo.firmwareRevision
    );
    return core.decodeDisUtf8(await this.adapter.readCharacteristic(connection, characteristic));
  }

  async writeVendorPayload(connection, payload, options = {}) {
    const { requireWriteResponse = false, refreshDownlink = false } = options;
    if (refreshDownlink) {
      this.clearVendorDownlinkCache(connection);
    }
    const target = await this._resolveVendorDownlink(connection, requireWriteResponse);

    const data = toData(payload);
    await this.adapter.writeCharacteristic(connection, target.characteristic, data, target.writeType);
    return {
      characteristic: target.characteristic,
      writeType: target.writeType,
      bytesWritten: data.length,
    };
  }

  factoryReset(connection) {
    return this.writeVendorPayload(connection, Buffer.from([TOPICS.factoryReset]));
  }

  async setTime(connection, unixSeconds) {
    const characteristic = await this._getCharacteristic(
      connection,
      GATT.time.service,
      GATT.time.currentTime
    );
    const payload = encodeUnixSecondsLe(unixSeconds);
    await this.adapter.writeCharacteristic(
      connection,
      characteristic,
      payload,
      GATT_WRITE_TYPE.WITH_RESPONSE
    );
    return {
      characteristic,
      writeType: GATT_WRITE_TYPE.WITH_RESPONSE,
      bytesWritten: payload.length,
    };
  }

  async readDeviceTime(connection) {
    const characteristic = await this._getCharacteristic(
      connection,
      GATT.time.service,
      GATT.time.currentTime
    );
    if (!hasProperty(characteristic, 'read')) {
      throw new T100SessionError('cts-read-not-supported', 'CTS Current Time is not readable');
    }
    const raw = await this.adapter.readCharacteristic(connection, characteristic);
    return decodeBleCurrentTimeUnix(raw);
  }

  async readBatteryLevel(connection) {
    const characteristic = await this._getCharacteristic(
      connection,
      GATT.battery.service,
      GATT.battery.level
    );
    if (!hasProperty(characteristic, 'read')) {
      throw new T100SessionError('battery-read-not-supported', 'Battery Level is not readable');
    }
    return decodeBatteryLevel(await this.adapter.readCharacteristic(connection, characteristic));
  }

  async subscribeBatteryLevel(connection, onLevel) {
    if (typeof onLevel !== 'function') {
      throw new T100SessionError('invalid-callback', 'onLevel must be a function');
    }
    const characteristic = await this._getCharacteristic(
      connection,
      GATT.battery.service,
      GATT.battery.level
    );
    if (!hasProperty(characteristic, 'notify')) {
      throw new T100SessionError('battery-notify-not-supported', 'Battery Level notify is not supported');
    }
    return this.adapter.subscribe(connection, characteristic, (data) => {
      onLevel(decodeBatteryLevel(data));
    });
  }

  async readScaleReading(connection) {
    const characteristic = await this._getCharacteristic(
      connection,
      GATT.vendor.service,
      GATT.vendor.uplinkNotify
    );
    if (!hasProperty(characteristic, 'read')) {
      throw new T100SessionError('scale-read-not-supported', 'FEE1 scale read is not supported');
    }
    const reading = core.decodeFee0ScaleWire(
      await this.adapter.readCharacteristic(connection, characteristic)
    );
    if (!reading) {
      throw new T100SessionError('scale-read-invalid', 'FEE1 scale read payload is invalid');
    }
    return reading;
  }

  async readMorphThemeId(connection) {
    const characteristic = await this._getCharacteristic(
      connection,
      GATT.vendor.service,
      GATT.vendor.themeId
    );
    if (!hasProperty(characteristic, 'read')) {
      throw new T100SessionError('theme-id-read-not-supported', 'FEE4 theme ID is not readable');
    }
    const raw = Buffer.from(
      await this.adapter.readCharacteristic(connection, characteristic)
    );
    if (raw.length !== 1) {
      throw new T100SessionError('theme-id-read-invalid', 'FEE4 theme ID payload is invalid');
    }
    return raw[0];
  }

  async readDeviceStatus(connection) {
    const characteristic = await this._getCharacteristic(
      connection,
      GATT.vendor.service,
      GATT.vendor.deviceStatus
    );
    if (!hasProperty(characteristic, 'read')) {
      throw new T100SessionError('status-read-not-supported', 'FEE5 device status is not readable');
    }
    const status = core.decodeFee0StatusWire(
      await this.adapter.readCharacteristic(connection, characteristic)
    );
    if (!status) {
      throw new T100SessionError('status-read-invalid', 'FEE5 device status payload is invalid');
    }
    return status;
  }

  async subscribeScaleNotify(connection, onReading) {
    if (typeof onReading !== 'function') {
      throw new T100SessionError('invalid-callback', 'onReading must be a function');
    }
    const characteristic = await this._getCharacteristic(
      connection,
      GATT.vendor.service,
      GATT.vendor.uplinkNotify
    );
    if (!hasProperty(characteristic, 'notify') && !hasProperty(characteristic, 'indicate')) {
      throw new T100SessionError(
        'scale-notify-not-supported',
        'FEE1 scale notify is not supported'
      );
    }
    return this.adapter.subscribe(connection, characteristic, (data) => {
      const reading = core.decodeFee0ScaleWire(data);
      if (reading) onReading(reading);
    });
  }

  async subscribeDeviceStatus(connection, onStatus) {
    if (typeof onStatus !== 'function') {
      throw new T100SessionError('invalid-callback', 'onStatus must be a function');
    }
    const characteristic = await this._getCharacteristic(
      connection,
      GATT.vendor.service,
      GATT.vendor.deviceStatus
    );
    if (!hasProperty(characteristic, 'notify') && !hasProperty(characteristic, 'indicate')) {
      throw new T100SessionError('status-notify-not-supported', 'FEE5 device status notify is not supported');
    }
    return this.adapter.subscribe(connection, characteristic, (data) => {
      const status = core.decodeFee0StatusWire(data);
      if (status) onStatus(status);
    });
  }

  async _getService(connection, serviceUuid) {
    const services = await this.adapter.discoverServices(connection, [serviceUuid]);
    const service = services.find((s) => sameUuid(s.uuid, serviceUuid));
    if (!service) {
      const allServices = await this.adapter.discoverServices(connection, []);
      const fullMatch = allServices.find((s) => sameUuid(s.uuid, serviceUuid));
      if (fullMatch) {
        return fullMatch;
      }
      throw new T100SessionError('service-not-found', `service not found: ${serviceUuid}`);
    }
    return service;
  }

  async _getCharacteristic(connection, serviceUuid, characteristicUuid) {
    const service = await this._getService(connection, serviceUuid);
    const characteristics = await this.adapter.discoverCharacteristics(connection, service, [
      characteristicUuid,
    ]);
    let characteristic = characteristics.find((ch) => sameUuid(ch.uuid, characteristicUuid));
    let allCharacteristics = characteristics;
    if (!characteristic) {
      allCharacteristics = await this.adapter.discoverCharacteristics(
        connection,
        service,
        []
      );
      characteristic = allCharacteristics.find((ch) => sameUuid(ch.uuid, characteristicUuid));
    }
    if (!characteristic) {
      throw new T100SessionError(
        'characteristic-not-found',
        `characteristic not found: ${characteristicUuid}; discovered: ${
          allCharacteristics.map((ch) => canonicalUuid(ch.uuid)).join(',') || 'none'
        } (firmware GATT schema may be old or the platform cache may be stale)`
      );
    }
    return characteristic;
  }
}

module.exports = {
  T100Session,
  T100SessionError,
  canonicalUuid,
  encodeUnixSecondsLe,
  decodeBatteryLevel,
  decodeBleCurrentTimeUnix,
  decodeFee6UnixRead,
  pickVendorDownlinkTarget,
};
