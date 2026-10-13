import {Buffer} from 'buffer';
import {decompressP256} from './auth.js';
const STORAGE_KEY = 't100.mfg.auth.v1';
const deviceName = value => String(value || '').trim().toLowerCase();
export function validateRecord(record) {
  if(!record || typeof record!=='object' || Array.isArray(record))throw new Error('Expected an auth record object.');
  if(typeof record.pub_key!=='string' || !/^(02|03)[0-9a-f]{64}$/.test(record.pub_key))throw new Error('pub_key must be 66 hexadecimal characters beginning with 02 or 03.');
  if(typeof record.auth_key!=='string' || !/^[\x20-\x7e]{8}$/.test(record.auth_key))throw new Error('auth_key must be exactly 8 printable ASCII characters.');
  for(const field of ['name','deviceId'])if(record[field]!==undefined && typeof record[field]!=='string')throw new Error(`${field} must be a string.`);
  return { pub_key: record.pub_key, auth_key: record.auth_key, deviceId: String(record.deviceId || ''), name: String(record.name || '') };
}
export function parseAuthImport(text) {
  if(typeof text!=='string' || new TextEncoder().encode(text).length>1024*1024)throw new Error('Auth JSON must be smaller than 1 MB.');
  let parsed;
  try{parsed=JSON.parse(text.replace(/^\uFEFF/,''));}
  catch{throw new Error('Invalid JSON. Paste an auth object or an array of auth records.');}
  const list=Array.isArray(parsed)?parsed:[parsed];
  if(!list.length)throw new Error('The JSON must contain at least one auth record.');
  return list.map((record,index)=>{
    try{
      if(!record || typeof record!=='object' || Array.isArray(record))throw new Error('Expected an auth record object.');
      const key=record.pub_key??record.device_p256_pub_hex;
      const valid=validateRecord({...record,pub_key:typeof key==='string'?key.toLowerCase():key,auth_key:record.auth_key??record.session_auth});
      try{decompressP256(Buffer.from(valid.pub_key,'hex'));}
      catch{throw new Error('pub_key is not a valid P-256 curve point.');}
      return valid;
    }catch(error){throw new Error(`Record ${index+1}: ${error.message}`);}
  });
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
    this.write([...this.records().filter(item => item.pub_key !== valid.pub_key && (!valid.name || deviceName(item.name) !== deviceName(valid.name)) && (!valid.deviceId || item.deviceId !== valid.deviceId)), valid]);
  }
  resolve(device, publicKey) {
    const name = deviceName(device.name);
    const records = this.records();
    let matches = records.filter(r => name && deviceName(r.name) === name);
    // Compatibility for older, unnamed desktop exports only. Named records
    // always belong to the selected name, not a browser's reusable device ID.
    if (!matches.length) {
      const prefix = /^yd-([a-f0-9]{12})$/.exec(name)?.[1];
      matches = records.filter(r => !r.name && (publicKey ? r.pub_key === publicKey : prefix && r.pub_key.startsWith(prefix)));
    }
    if (matches.length > 1) throw new Error('Multiple auth records match this device. Import the correct device credential.');
    return matches[0] || null;
  }
  remove(device, publicKey) {
    const prefix = /^YD-([a-f0-9]{12})$/.exec(device.name || '')?.[1];
    this.write(this.records().filter(r => r.pub_key !== publicKey && (!device.name || deviceName(r.name) !== deviceName(device.name)) && (!device.id || r.deviceId !== device.id) && !(prefix && r.pub_key.startsWith(prefix))));
  }
  import(text) {
    const list = parseAuthImport(text);
    const records = new Map(this.records().map(r => [r.pub_key, r]));
    for (const r of list) {
      const existing = records.get(r.pub_key);
      const merged = {...r, name:r.name || existing?.name || '', deviceId:r.deviceId || existing?.deviceId || ''};
      for (const [key, old] of records) {
        if (merged.name && deviceName(old.name) === deviceName(merged.name)) records.delete(key);
      }
      records.set(r.pub_key, merged);
    }
    this.write([...records.values()]);
    return list.length;
  }
}
