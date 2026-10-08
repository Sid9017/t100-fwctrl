const STORAGE_KEY = 't100.mfg.auth.v1';
export function validateRecord(record) {
  if (!record || !/^(02|03)[0-9a-f]{64}$/.test(record.pub_key) || !/^[\x20-\x7e]{8}$/.test(record.auth_key)) {
    throw new Error('Invalid auth record: expected a compressed P-256 public key and an 8-character ASCII auth key.');
  }
  return { pub_key: record.pub_key, auth_key: record.auth_key, deviceId: String(record.deviceId || ''), name: String(record.name || '') };
}
export class AuthStore {
  constructor(storage) { this.storage = storage; }
  getStorage() { return this.storage || globalThis.localStorage; }
  records() {
    const raw = this.getStorage().getItem(STORAGE_KEY);
    if (!raw) return [];
    const records = JSON.parse(raw);
    if (!Array.isArray(records)) throw new Error('Browser auth storage is corrupt. Import a valid backup.');
    return records.map(validateRecord);
  }
  write(records) {
    const value = JSON.stringify(records.map(validateRecord));
    try {
      this.getStorage().setItem(STORAGE_KEY, value);
      if (this.getStorage().getItem(STORAGE_KEY) !== value) throw new Error('Storage verification failed');
    } catch { throw new Error('Cannot persist auth in this browser. Enable local storage before binding.'); }
  }
  save(record) {
    const valid = validateRecord(record);
    this.write([...this.records().filter(item => item.pub_key !== valid.pub_key && (!valid.deviceId || item.deviceId !== valid.deviceId)), valid]);
  }
  resolve(device, publicKey) {
    const prefix = /^YD-([a-f0-9]{12})$/.exec(device.name || '')?.[1];
    const records = this.records();
    const matches = publicKey ? records.filter(r => r.pub_key === publicKey) : records.filter(r =>
      (r.deviceId && r.deviceId === device.id) || (prefix && r.pub_key.startsWith(prefix)));
    if (matches.length > 1) throw new Error('Multiple auth records match this device. Import the correct device credential.');
    return matches[0] || null;
  }
  remove(device, publicKey) {
    const prefix = /^YD-([a-f0-9]{12})$/.exec(device.name || '')?.[1];
    this.write(this.records().filter(r => r.pub_key !== publicKey && r.deviceId !== device.id && !(prefix && r.pub_key.startsWith(prefix))));
  }
  import(text) {
    const parsed = JSON.parse(text);
    const list = (Array.isArray(parsed) ? parsed : [parsed]).map(record => validateRecord({ ...record,
      pub_key: record.pub_key || record.device_p256_pub_hex,
      auth_key: record.auth_key || record.session_auth,
    }));
    const records = new Map(this.records().map(r => [r.pub_key, r]));
    for (const r of list) records.set(r.pub_key, r);
    this.write([...records.values()]);
    return list.length;
  }
}
