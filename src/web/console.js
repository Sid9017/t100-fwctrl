import { Buffer } from 'buffer';
import { WebGattAdapter, deviceOptions } from './gatt.js';
import { AuthStore } from './auth-store.js';
import { verifyAdmissionToken } from './auth.js';
import { DeviceActions, buildFee0VendorWirePayload } from './actions.js';
import { loadPreset } from './assets.js';
import sessionModule from '../vendor/ble/session/t100-session.js';
import protocol from '../vendor/ble/protocol/index.js';
import uuidHelpers from '../vendor/ble/core/uuids.js';
import scale from '../vendor/ble/core/fee0-scale-wire.js';
import { runSignedOad } from './signed-oad.js';
import { SIGNED_OTA_UUIDS, parseManifest } from './signed-ota-format.js';
import { oadVersion } from './ota-format.js';
const { T100Session, canonicalUuid } = sessionModule;
const { GATT, TOPICS } = protocol;
const matches = (a,b) => canonicalUuid(a) === canonicalUuid(b) || (String(b).replaceAll('-','').length === 32 && uuidHelpers.uuidMatches128(a,b));

export class BrowserConsole extends DeviceActions {
  constructor({ adapter = new WebGattAdapter(), auth = new AuthStore(), bluetooth = globalThis.navigator?.bluetooth } = {}) {
    super(); this.adapter=adapter; this.auth=auth; this.bluetooth=bluetooth;
    this.session=new T100Session({adapter}); this.listeners=new Map(); this.devices=new Map();
    this.connection=null; this.entry=null; this.busy=false; this.connecting=false; this.selecting=false; this.abortRef=null;
  }
  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event,new Set());
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event).delete(callback);
  }
  emit(event,payload) { for (const listener of this.listeners.get(event)||[]) listener(payload); }
  _previewCommit(name, data) { this.emit('PreviewCommit', {name, ...data}); }
  _actionLog(line, options={}) { this.emit('SimActionLog',{line, ...options}); }
  listDevices() { return [...this.devices.values()].map(entry=>entry.ui); }
  selectDevice() {
    if (this.busy || this.connecting || this.selecting) throw new Error('Wait for the current Bluetooth action to finish.');
    if (!this.bluetooth) throw new Error('This browser does not support Web Bluetooth. Use Chrome / Edge over HTTPS.');
    // No await before requestDevice: it must run inside the click gesture.
    this.selecting=true;
    let selection;
    try { selection=this.bluetooth.requestDevice(deviceOptions()); }
    catch (error) { this.selecting=false; throw error; }
    return selection.then(native => {
      if (!/^YD-[0-9a-f]{12}$/.test(native.name||'')) throw new Error('The device does not have a valid T100 identity.');
      const previous=this.devices.get(native.id);
      if (previous && this.entry === previous && this.connection?.active) {
        return previous.ui;
      }
      const entry={ device:{id:native.id,name:native.name,native}, ui:{id:native.id,name:native.name,mac:native.id,
        rssi:null,bindState:'unknown',advProductId:1,advProductLabel:'T100',lastSeen:Date.now()} };
      this.devices.set(native.id,entry); this.emit('ScanUpdate',this.listDevices());
      return entry.ui;
    }).finally(()=>{this.selecting=false;});
  }
  async connect(device) {
    if (this.busy || this.connecting) throw new Error('Another Bluetooth action is in progress.');
    const entry=this.devices.get(device.id);
    if (!entry) throw new Error('Select the device in the browser dialog first.');
    this.connecting=true;
    try {
      await this.disconnect();
      const connection=await this.adapter.connect(entry.device);
      this.connection=connection; this.entry=entry;
      this.emit('PreviewReset', {deviceId:entry.ui.id});
      entry.ui.deviceStatus=null;
      connection.native.on('disconnect',()=>{
        if (this.connection!==connection) return;
        if (this.abortRef) this.abortRef.aborted=true;
        this.connection=null; this.entry=null;
        this.emit('ConnectionLost',{deviceId:entry.ui.id,reason:connection.resetPending ? 'reset-complete' : 'Bluetooth link disconnected'});
      });
      const {services}=await this.discoverAll(connection);
      if (!services.some(service=>matches(service.uuid,GATT.vendor.service))) throw new Error('T100 vendor service is missing. Check firmware and browser permissions.');
      entry.ui.bindState=services.some(service=>matches(service.uuid,GATT.bind.service))?'unbind':'unknown';
      const optional=async (label, fn) => {
        try { return await fn(); } catch (error) { this._actionLog(`${label}: ${error.message}`); return null; }
      };
      const unixSeconds=Math.floor(Date.now()/1000);
      const synced=await optional('Time sync',()=>this.session.setTime(connection,unixSeconds));
      const firmware=await optional('Firmware read',()=>this.session.readFirmwareVersion(connection))||'Unknown';
      entry.ui.firmware=firmware;
      const deviceUnixSeconds=await optional('Device time',()=>this.session.readDeviceTime(connection));
      for (const [key,event,subscribe,read,format] of [
        ['batteryLevel','BatteryUpdate','subscribeBatteryLevel','readBatteryLevel',v=>v],
        ['scaleReading','ScaleUpdate','subscribeScaleNotify','readScaleReading',scale.formatFee0ScaleReading],
        ['deviceStatus','StatusUpdate','subscribeDeviceStatus','readDeviceStatus',v=>v],
      ]) {
        const update=value=>{
          if (this.connection!==connection) return;
          entry.ui[key]=format(value);
          if (key === 'deviceStatus' && Number.isInteger(value?.flags)) {
            entry.ui.bindState = (value.flags & 1) ? 'bound' : 'unbind';
            this.emit('ScanUpsert',[entry.ui]);
          }
          this.emit(event,{deviceId:entry.ui.id,[key==='scaleReading'?'reading':key==='deviceStatus'?'status':key]:entry.ui[key]});
        };
        await optional(`${key} notifications`,()=>this.session[subscribe](connection,update));
        const value=await optional(`${key} read`,()=>this.session[read](connection));
        if(value!==null) update(value);
      }
      if (!connection.active) throw new Error('Device disconnected during setup');
      this.emit('ScanUpsert',[entry.ui]);
      return {ok:true,state:'connected',device:entry.ui,firmware,deviceUnixSeconds,bleTimeEnabled:true,
        timeSync:{ok:!!synced,unixSeconds,message:synced?'Device time synced':'Time sync unavailable'}};
    } catch(error) { await this.disconnect(); throw error; }
    finally { this.connecting=false; }
  }
  async disconnect() {
    const connection=this.connection;
    if(this.abortRef) this.abortRef.aborted=true;
    this.connection=null;this.entry=null;
    if(connection) { this.session.clearVendorDownlinkCache(connection); await this.adapter.disconnect(connection); }
    return {ok:true,state:'idle'};
  }
  requireConnection() {
    if(!this.connection?.active) throw new Error('Connect a T100 first.');
    return this.connection;
  }
  requireConnectedEntry() { return {connection:this.requireConnection(),entry:this.entry}; }
  async discoverAll(connection) {
    if (connection.discovery) return connection.discovery;
    const services=await this.adapter.discoverServices(connection);
    const characteristics=[];
    for(const service of services) characteristics.push(...await this.adapter.discoverCharacteristics(connection,service));
    connection.discovery={services,characteristics};return connection.discovery;
  }
  pickBindTokenChar(chars) { return chars.find(c=>matches(c.uuid,GATT.bind.token)); }
  pickThemeIdChar(chars) { return chars.find(c=>matches(c.serviceUuid,GATT.vendor.service)&&matches(c.uuid,GATT.vendor.themeId)); }
  writeTypeFromCharacteristic(char) { return char.properties.includes('write')?'withResponse':char.properties.includes('writeWithoutResponse')?'withoutResponse':null; }
  async runFeeSessionAuth(connection,entry,chars,required=false) {
    const record=this.auth.resolve(entry.device);
    if(!record && required) throw new Error('No browser auth credential for this device. Bind it or import its auth JSON.');
    return {ctx:{deviceP256PubHex:record?.pub_key},auth8:record?Buffer.from(record.auth_key,'ascii'):null};
  }
  async writeVendorPayloadWithOptionalAuth(payload,options={}) {
    const {connection,entry}=this.requireConnectedEntry();
    const {characteristics}=await this.discoverAll(connection);
    const publicTopic=[TOPICS.factoryReset,TOPICS.bindCommit,TOPICS.lightControl].includes(payload[0]);
    const {auth8}=publicTopic?{auth8:null}:await this.runFeeSessionAuth(connection,entry,characteristics,true);
    return this.session.writeVendorPayload(connection,buildFee0VendorWirePayload(payload,{auth8}),{requireWriteResponse:true,...options});
  }
  async runGattAction(label,action,timeoutMs=15000) {
    if(this.busy || this.connecting || this.selecting) throw new Error(`${label}: another Bluetooth action is in progress`);
    const connection=this.requireConnection();
    this.busy=true; const abortRef={aborted:false}; this.abortRef=abortRef; this.emit('ActionBusy',{busy:true});
    let timer;
    try {
      return await Promise.race([action(abortRef),new Promise((_,reject)=>{
        timer=setTimeout(()=>{
          abortRef.aborted=true;
          // Disconnect before releasing the action lock so late writes cannot affect a new action.
          void this.adapter.disconnect(connection);
          reject(new Error(`${label} timed out. Reconnect to retry.`));
        },timeoutMs);
      })]);
    } finally { clearTimeout(timer);this.busy=false;this.abortRef=null;this.emit('ActionBusy',{busy:false}); }
  }
  async readDeviceTime() { return {ok:true,unixSeconds:await this.session.readDeviceTime(this.requireConnection())}; }
  bindDevice() {
    const {connection,entry}=this.requireConnectedEntry();
    return this.runGattAction('Bind + emotion',async abortRef=>{
      if (entry.ui.bindState === 'bound' && !this.auth.resolve(entry.device)) {
        throw new Error('Device reports BOUND, but this browser has no saved auth credential. Restore its auth JSON from the browser or app used to bind it. Clicking Bind again cannot recover the credential.');
      }
      const preset=await loadPreset();
      if(abortRef.aborted || this.connection!==connection) throw new Error('Binding cancelled');
      const {characteristics}=await this.discoverAll(connection);
      if(entry.ui.bindState!=='bound') {
        const token=this.pickBindTokenChar(characteristics);
        if(!token) throw new Error('Binding token is unavailable. Disconnect, select the device again to refresh Bluetooth permissions, and retry.');
        const raw=await this.adapter.readCharacteristic(connection,token);
        const record=await verifyAdmissionToken(raw.toString('utf8').replace(/\0.*$/s,''));
        if(abortRef.aborted || this.connection!==connection) throw new Error('Binding cancelled');
        // Persist and verify BEFORE committing; retain it if the link/upload fails.
        this.auth.save({...record,deviceId:entry.device.id,name:entry.device.name});
        await this.session.writeVendorPayload(connection,Buffer.concat([Buffer.from([TOPICS.bindCommit]),Buffer.from(record.auth_key,'ascii')]),{requireWriteResponse:true});
        entry.ui.bindState='bound';this.emit('ScanUpsert',[entry.ui]);
      }
      // Verify credentials before reporting upload progress, including bound-device retries.
      await this.runFeeSessionAuth(connection,entry,characteristics,true);
      this._actionLog('Uploading preset1 emotion pack…');
      await this._uploadBindEmotion(connection,entry,characteristics,preset,abortRef);
      await this.disconnect();this.emit('SessionIdle',{state:'idle'});
      return {ok:true,state:'idle',message:'Bind complete. Emotion installed; device is restarting.'};
    },180000);
  }
  clearCredential(device) {
    try { this.auth.remove(device); return ''; }
    catch (error) { return `Reset command written, but browser credential cleanup failed: ${error.message}`; }
  }
  async waitForResetDisconnect(connection) {
    // Match the desktop app's reboot watchdog: allow firmware to drain ATT,
    // erase flash and reboot before releasing the browser connection.
    connection.resetPending = true;
    const disconnected = await new Promise(resolve => {
      let timer;
      const finish = value => {
        clearTimeout(timer);
        connection.native.off('disconnect', onDisconnect);
        resolve(value);
      };
      const onDisconnect = () => finish(true);
      connection.native.on('disconnect', onDisconnect);
      timer = setTimeout(() => finish(false), 6000);
      if (!connection.active) finish(true);
    });
    await this.disconnect();
    return disconnected
      ? 'Device disconnected; reconnect to verify reset.'
      : 'No device reboot observed within 6 seconds; connection closed. Reconnect to verify reset.';
  }
  async resetDevice() {
    return this.runGattAction('Reset',async()=>{
      const {entry,connection}=this.requireConnectedEntry();
      await this.writeVendorPayloadWithOptionalAuth([TOPICS.reset]);
      const cleanupWarning=this.clearCredential(entry.device);
      this._actionLog('Reset command written. Waiting for device restart…');
      const outcome=await this.waitForResetDisconnect(connection);
      return {ok:true,state:'idle',message:`Reset sent. ${cleanupWarning || 'Browser auth cleared.'} ${outcome}`};
    });
  }
  async factoryDevice() {
    return this.runGattAction('Factory reset',async()=>{
      const {entry,connection}=this.requireConnectedEntry();
      await this.writeVendorPayloadWithOptionalAuth([TOPICS.factoryReset]);
      const cleanupWarning=this.clearCredential(entry.device);
      this._actionLog('Factory command written. Waiting for device restart…');
      const outcome=await this.waitForResetDisconnect(connection);
      return {ok:true,state:'idle',message:`Factory reset sent. ${cleanupWarning || 'Browser auth cleared.'} ${outcome}`};
    });
  }
  async downloadOad(file, manifestFile) {
    return this.runGattAction('OAD',async abortRef=>{
      const started=Date.now();
      const connection=this.requireConnection();
      if(!manifestFile || file.size>245760 || manifestFile.size!==128)throw new Error('Select a signed firmware BIN and its matching 128-byte manifest');
      const credential=this.auth.resolve(this.entry.device);
      if(!credential)throw new Error('Bind this device or import its browser auth credential before signed OAD');
      const bytes=Buffer.from(await file.arrayBuffer()),manifest=Buffer.from(await manifestFile.arrayBuffer());
      const targetVersion=parseManifest(manifest).version;
      // Read DIS again at the point of use, instead of trusting the UI cache.
      const firmware=await this.session.readFirmwareVersion(connection);
      this.entry.ui.firmware=firmware;this.emit('ScanUpsert',[this.entry.ui]);
      const currentVersion=oadVersion(firmware);
      if(!currentVersion)throw new Error('Cannot determine the device firmware version. Reconnect before upgrading.');
      if(currentVersion===targetVersion)throw new Error(`The device already runs firmware ${targetVersion}. No upgrade is needed.`);
      const discovery=await this.discoverSignedOad(connection);
      const result=await runSignedOad({adapter:this.adapter,connection,discovery,bytes,manifest,auth8:Buffer.from(credential.auth_key,'ascii'),abortRef,
        onProgress:progress=>this.emit('SimOadProgress',{progress})});
      await this.disconnect();this.emit('SessionIdle',{state:'idle'});
      return {...result,message:'Signed firmware committed by the device. Reconnect to verify firmware.',elapsedMs:Date.now()-started};
    },45*60*1000);
  }
  async discoverSignedOad(connection) {
    const cached=await this.discoverAll(connection),has=items=>items.some(s=>matches(s.uuid,SIGNED_OTA_UUIDS.service));
    if(has(cached.services))return cached;
    let services;
    try{services=await this.adapter.discoverServices(connection,[SIGNED_OTA_UUIDS.service]);}
    catch(error){throw new Error(`Signed OAD access unavailable. Re-select the device to grant the new service: ${error.message}`,{cause:error});}
    if(!has(services))throw new Error('This device does not expose signed OAD. First install the new merge_crc firmware and BIM by cable; Chrome cannot update old TI OAD firmware.');
    const characteristics=[];
    for(const service of services)characteristics.push(...await this.adapter.discoverCharacteristics(connection,service));
    connection.discovery={services:[...cached.services,...services],characteristics:[...cached.characteristics,...characteristics]};
    return connection.discovery;
  }
}
