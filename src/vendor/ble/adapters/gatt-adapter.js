'use strict';

const GATT_WRITE_TYPE = Object.freeze({
  WITH_RESPONSE: 'withResponse',
  WITHOUT_RESPONSE: 'withoutResponse',
});

class GattAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GattAdapterError';
    this.code = code;
  }
}

function normalizeUuid(uuid) {
  return String(uuid || '')
    .replace(/-/g, '')
    .toLowerCase();
}

/** Expand 16/32-bit BLE UUIDs to 128-bit canonical form (matches WinRT helper). */
function expandBluetoothUuid(uuid) {
  const s = normalizeUuid(uuid);
  if (s.length === 4) return `0000${s}000010008000805f9b34fb`;
  if (s.length === 8) return `${s}000010008000805f9b34fb`;
  return s;
}

function toData(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return Buffer.from(value);
  if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }
  throw new GattAdapterError('invalid-data', 'value must be Buffer, Uint8Array, or byte array');
}

function createDevice(fields) {
  return Object.freeze({
    id: String(fields.id || ''),
    name: String(fields.name || ''),
    address: String(fields.address || fields.id || ''),
    rssi: typeof fields.rssi === 'number' ? fields.rssi : null,
    advertisement: fields.advertisement || {},
    native: fields.native,
  });
}

function createConnection(fields) {
  return Object.freeze({
    id: String(fields.id || ''),
    device: fields.device,
    native: fields.native,
  });
}

function createService(fields) {
  return Object.freeze({
    uuid: normalizeUuid(fields.uuid),
    native: fields.native,
  });
}

function createCharacteristic(fields) {
  return Object.freeze({
    uuid: normalizeUuid(fields.uuid),
    serviceUuid: normalizeUuid(fields.serviceUuid),
    properties: Object.freeze([...(fields.properties || [])]),
    native: fields.native,
  });
}

class GattAdapter {
  get state() {
    return 'unknown';
  }

  async waitReady() {
    throw new GattAdapterError('not-implemented', 'waitReady is not implemented');
  }

  startScan(_options, _onDevice) {
    throw new GattAdapterError('not-implemented', 'startScan is not implemented');
  }

  stopScan() {
    throw new GattAdapterError('not-implemented', 'stopScan is not implemented');
  }

  async connect(_device) {
    throw new GattAdapterError('not-implemented', 'connect is not implemented');
  }

  async disconnect(_connection) {
    throw new GattAdapterError('not-implemented', 'disconnect is not implemented');
  }

  async discoverServices(_connection, _serviceUuids) {
    throw new GattAdapterError('not-implemented', 'discoverServices is not implemented');
  }

  async discoverCharacteristics(_connection, _service, _characteristicUuids) {
    throw new GattAdapterError('not-implemented', 'discoverCharacteristics is not implemented');
  }

  async readCharacteristic(_connection, _characteristic) {
    throw new GattAdapterError('not-implemented', 'readCharacteristic is not implemented');
  }

  async writeCharacteristic(_connection, _characteristic, _value, _writeType) {
    throw new GattAdapterError('not-implemented', 'writeCharacteristic is not implemented');
  }

  async subscribe(_connection, _characteristic, _onData) {
    throw new GattAdapterError('not-implemented', 'subscribe is not implemented');
  }

  async unsubscribe(_connection, _characteristic) {
    throw new GattAdapterError('not-implemented', 'unsubscribe is not implemented');
  }

  /** Drop platform scan cache for one peripheral (no-op unless adapter overrides). */
  forgetScanCacheForDevice(_device) {}

  /** Drop all platform scan cache entries (no-op unless adapter overrides). */
  clearAllScanCache() {}
}

function assertGattAdapter(adapter) {
  const required = [
    'waitReady',
    'startScan',
    'stopScan',
    'connect',
    'disconnect',
    'discoverServices',
    'discoverCharacteristics',
    'readCharacteristic',
    'writeCharacteristic',
    'subscribe',
    'unsubscribe',
  ];
  for (const method of required) {
    if (!adapter || typeof adapter[method] !== 'function') {
      throw new GattAdapterError('invalid-adapter', `adapter missing method: ${method}`);
    }
  }
  return adapter;
}

module.exports = {
  GattAdapter,
  GattAdapterError,
  GATT_WRITE_TYPE,
  assertGattAdapter,
  createCharacteristic,
  createConnection,
  createDevice,
  createService,
  normalizeUuid,
  expandBluetoothUuid,
  toData,
};
