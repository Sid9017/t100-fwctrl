// T100 firmware advertising contract: company 0x6000, P, T100 product 1.
// The version byte is masked out so legacy v1 and current v2 both match.
export function scanOptions() {
  return { filters: [{
    namePrefix: 'YD-',
    manufacturerData: [{
      companyIdentifier: 0x6000,
      dataPrefix: new Uint8Array([0x50, 0x00, 0x01]),
      mask: new Uint8Array([0xff, 0x00, 0xff]),
    }],
  }] };
}

export function capability(env = globalThis) {
  if (!env.isSecureContext) return { ok: false, title: 'Secure connection required', detail: 'Open this site over HTTPS. Use localhost for local development. Bluetooth is unavailable when a phone accesses a computer over a local network HTTP address.' };
  if (typeof env.navigator?.bluetooth?.requestDevice !== 'function') return {
    ok: false, title: 'This browser does not support Bluetooth scanning',
    detail: 'Use desktop Chrome / Edge or Chrome on Android. Standard iPhone / iPad browsers do not currently support this feature, but you can still view the page.',
  };
  return { ok: true, title: 'This browser supports Bluetooth scanning', detail: 'Turn on Bluetooth, wake up a nearby T100, and select it in the browser dialog.' };
}

export function scanError(error) {
  switch (error?.name) {
    case 'NotFoundError': return { kind: 'info', message: 'No device selected. If the list is empty, wake up your T100, check that Bluetooth is on and system permissions are granted, then try again.' };
    case 'NotAllowedError':
    case 'SecurityError': return { kind: 'error', message: 'Bluetooth access denied. Check browser and system Bluetooth permissions, then try again with this page opened directly over HTTPS.' };
    case 'NotSupportedError':
    case 'TypeError': return { kind: 'error', message: 'This browser cannot scan for T100 devices. Update Chrome / Edge and try again.' };
    case 'NetworkError': return { kind: 'error', message: 'Bluetooth is currently unavailable. Make sure Bluetooth is on and try again.' };
    default: return { kind: 'error', message: 'Scanning did not complete. Check Bluetooth and browser permissions, then try again.' };
  }
}

export class Scanner {
  constructor(bluetooth) {
    this.bluetooth = bluetooth;
    this.busy = false;
    this.devices = new Map();
  }

  async select() {
    if (this.busy) return { kind: 'busy' };
    this.busy = true;
    try {
      // Must run directly in the click's user activation, before any await.
      const device = await this.bluetooth.requestDevice(scanOptions());
      if (!/^YD-[0-9a-f]{12}$/.test(device.name || '') || !device.id) {
        return { kind: 'error', message: 'The selected device name does not match the T100 identity format. Check the firmware version.' };
      }
      const repeated = this.devices.has(device.id);
      const record = { id: device.id, name: device.name, selectedAt: new Date() };
      this.devices.set(device.id, record);
      return { kind: 'selected', record, repeated };
    } catch (error) {
      return scanError(error);
    } finally {
      this.busy = false;
    }
  }

  clear() { this.devices.clear(); }
}
