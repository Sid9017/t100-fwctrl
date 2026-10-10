import { Buffer } from 'buffer';
import adapterContract from '../vendor/ble/adapters/gatt-adapter.js';
import protocol from '../vendor/ble/protocol/index.js';
const { GattAdapter } = adapterContract;
const { UUIDS } = protocol;
export function uuid(value) {
  const s = String(value).replaceAll('-', '').toLowerCase();
  if (s.length === 4) return `0000${s}-0000-1000-8000-00805f9b34fb`;
  if (s.length !== 32) throw new Error(`Invalid UUID: ${value}`);
  return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}
// The firmware stores custom UUID fields in mixed-endian order. Browser stacks
// can expose either the canonical UUID or the raw/reversed 16-byte form.
export function serviceUuidForms(value) {
  const canonical = uuid(value);
  if (['fee0', 'ffc0'].includes(String(value).toLowerCase())) {
    return [canonical, `f000${String(value).toLowerCase()}-0451-4000-b000-000000000000`];
  }
  if (!canonical.startsWith('6b30')) return [canonical];
  const bytes = Buffer.from(canonical.replaceAll('-', ''), 'hex');
  bytes.subarray(0,4).reverse(); bytes.subarray(4,6).reverse(); bytes.subarray(6,8).reverse();
  return [canonical, uuid(bytes.toString('hex')), uuid(Buffer.from(bytes).reverse().toString('hex'))];
}
export const optionalServices = [...new Set(Object.entries(UUIDS.services)
  .filter(([key]) => key !== 'genericAccess').flatMap(([, value]) => serviceUuidForms(value)))];
export function deviceOptions() {
  const filter = { namePrefix: 'YD-', manufacturerData: [{
    companyIdentifier: 0x6000,
    dataPrefix: new Uint8Array([0x50, 0, 1]),
    mask: new Uint8Array([255, 0, 255]),
  }] };
  return { filters: [filter], optionalServices, optionalManufacturerData: [0x6000] };
}

// Every platform call shares one queue. Web Bluetooth rejects overlapping GATT operations.
export class WebGattAdapter extends GattAdapter {
  constructor() { super(); this.connections = new Set(); }
  async waitReady() {
    if (!globalThis.isSecureContext || !globalThis.navigator?.bluetooth) {
      throw new Error('Use Chrome / Edge over HTTPS or localhost to access Bluetooth.');
    }
  }
  startScan() {}
  stopScan() {}
  async connect(device) {
    const nativeDevice = device.native;
    const listeners = new Set();
    const connection = { device, nativeDevice, active: true, queue: Promise.resolve(), subscriptions: new Set(),
      native: {
        on: (event, fn) => { if (event === 'disconnect') listeners.add(fn); },
        off: (event, fn) => listeners.delete(fn),
      },
    };
    connection.disconnected = () => {
      if (!connection.active) return;
      connection.active = false;
      for (const sub of connection.subscriptions) sub.detach();
      connection.subscriptions.clear();
      this.connections.delete(connection);
      nativeDevice.removeEventListener('gattserverdisconnected', connection.disconnected);
      for (const fn of listeners) fn();
      listeners.clear();
    };
    nativeDevice.addEventListener('gattserverdisconnected', connection.disconnected);
    let timer;
    try {
      connection.server = await Promise.race([
        nativeDevice.gatt.connect().then(server => {
          if (!connection.active) { server.disconnect(); throw new Error('Connection cancelled'); }
          return server;
        }),
        new Promise((_, reject) => { timer = setTimeout(() => {
          connection.disconnected(); nativeDevice.gatt.disconnect(); reject(new Error('Connection timed out. Try again.'));
        }, 15000); }),
      ]);
      this.connections.add(connection);
      return connection;
    } catch (error) { connection.disconnected(); throw error; }
    finally { clearTimeout(timer); }
  }
  async disconnect(connection) {
    if (!connection) return;
    connection.nativeDevice.gatt.disconnect();
    connection.disconnected();
  }
  operation(connection, task) {
    const run = connection.queue.then(async () => {
      if (!connection.active || !connection.server.connected) throw new Error('Device disconnected');
      let timer;
      try {
        return await Promise.race([task(), new Promise((_, reject) => {
          timer = setTimeout(() => {
            void this.disconnect(connection);
            reject(new Error('Bluetooth operation timed out. Reconnect and try again.'));
          }, 15000);
        })]);
      } finally { clearTimeout(timer); }
    });
    connection.queue = run.catch(() => {});
    return run;
  }
  discoverServices(connection, serviceUuids = []) {
    return this.operation(connection, async () => {
      if (!serviceUuids.length) return (await connection.server.getPrimaryServices())
        .map(native => ({ uuid: native.uuid, native }));
      const services = new Map();
      let permissionError;
      for (const value of serviceUuids) for (const candidate of serviceUuidForms(value)) {
        try {
          const native = await connection.server.getPrimaryService(candidate);
          services.set(native.uuid, { uuid: native.uuid, native });
        } catch (error) {
          // An older grant may include only one alias. Still try the other one.
          if (error.name === 'SecurityError' || error.name === 'NotAllowedError') permissionError = error;
          else if (error.name !== 'NotFoundError') throw error;
        }
      }
      if (!services.size && permissionError) throw new Error(`Bluetooth service access denied. Re-select the device to grant access: ${permissionError.message}`);
      return [...services.values()];
    });
  }
  discoverCharacteristics(connection, service) {
    return this.operation(connection, async () => (await service.native.getCharacteristics())
      .map(native => ({ uuid: native.uuid, serviceUuid: service.uuid, native,
        properties: ['read','write','writeWithoutResponse','notify','indicate'].filter(key => native.properties[key]),
      })));
  }
  readCharacteristic(connection, characteristic) {
    return this.operation(connection, async () => {
      const data = await characteristic.native.readValue();
      return Buffer.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    });
  }
  writeCharacteristic(connection, characteristic, value, writeType) {
    const bytes = Uint8Array.from(value);
    return this.operation(connection, () => writeType === 'withoutResponse'
      ? characteristic.native.writeValueWithoutResponse(bytes)
      : characteristic.native.writeValueWithResponse(bytes));
  }
  async subscribe(connection, characteristic, onData) {
    const native = characteristic.native;
    const listener = event => {
      if (!connection.active) return;
      const value = event.target.value;
      onData(Buffer.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)));
    };
    const sub = { characteristic, detach: () => native.removeEventListener('characteristicvaluechanged', listener),
      unsubscribe: async () => {
        sub.detach(); connection.subscriptions.delete(sub);
        if (connection.active) await this.operation(connection, () => native.stopNotifications());
      },
    };
    native.addEventListener('characteristicvaluechanged', listener);
    connection.subscriptions.add(sub);
    try { await this.operation(connection, () => native.startNotifications()); }
    catch (error) { sub.detach(); connection.subscriptions.delete(sub); throw error; }
    return sub;
  }
  async unsubscribe(connection, characteristic) {
    for (const sub of connection.subscriptions) if (sub.characteristic === characteristic) await sub.unsubscribe();
  }
}
