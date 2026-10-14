import {Buffer} from 'buffer';
import contract from '../vendor/ble/adapters/gatt-adapter.js';
import session from '../vendor/ble/session/t100-session.js';
import {nativeProduct} from './provisioning.js';
const {GattAdapter}=contract;
const {canonicalUuid}=session;
const same=(a,b)=>canonicalUuid(a)===canonicalUuid(b);
const valueKey=(deviceId,serviceId,characteristicId)=>[deviceId,canonicalUuid(serviceId),canonicalUuid(characteristicId)].join('/');
const errorMessage=error=>{
  const messages={10001:'Bluetooth is off or permission is unavailable. Enable Bluetooth and allow WeChat access.',10003:'Connection failed. Wake your T100 and try again.',10006:'Device disconnected.',10009:'This system does not support BLE.',10012:'Bluetooth operation timed out.',10013:'Invalid Bluetooth device.',103:'Bluetooth permission was denied. Allow it in WeChat settings.'};
  return new Error(messages[error?.errCode]||error?.errMsg||error?.message||'Bluetooth operation failed');
};

export class WechatGattAdapter extends GattAdapter {
  constructor(api,{timeoutMs=15000}={}) {
    super();this.api=api;this.timeoutMs=timeoutMs;this.connections=new Map();this.pendingReads=new Map();this.scanListener=null;this.scanGeneration=0;this.scanCacheTimer=null;
    this.bridgeOnly=(api.getDeviceInfo?.()||api.getSystemInfoSync?.()||{}).platform==='devtools';
    this.valueListener=event=>{
      const connection=this.connections.get(event.deviceId);
      if(!connection?.active)return;
      const key=valueKey(event.deviceId,event.serviceId,event.characteristicId);
      const bytes=Buffer.from(new Uint8Array(event.value));
      const pending=this.pendingReads.get(key);
      if(pending){this.pendingReads.delete(key);pending.resolve(bytes);}
      for(const sub of connection.subscriptions)if(sub.key===key)sub.onData(bytes);
    };
    this.connectionListener=event=>{if(!event.connected){const connection=this.connections.get(event.deviceId);if(connection)this.drop(connection);}};
    api.onBLECharacteristicValueChange(this.valueListener);
    api.onBLEConnectionStateChange(this.connectionListener);
  }
  call(name,options={}) {
    return new Promise((resolve,reject)=>{
      if(typeof this.api[name]!=='function'){reject(new Error(`${name} is unavailable. Update WeChat and use Preview on your phone.`));return;}
      let settled=false;
      const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);fn(value);};
      const timer=setTimeout(()=>finish(reject,Object.assign(new Error(`${name} timed out`),{code:'wechat-api-timeout'})),this.timeoutMs);
      try{this.api[name]({...options,success:value=>finish(resolve,value),fail:error=>finish(reject,errorMessage(error))});}
      catch(error){finish(reject,error);}
    });
  }
  async waitReady() {
    try{await this.call('openBluetoothAdapter',{mode:'central'});}
    catch(error){
      // Devtools/hot reload can leave the native adapter open. Confirm its
      // real state before recovering; permission/off errors must still fail.
      if(!/already open(?:ed)?/i.test(error.message)||typeof this.api.getBluetoothAdapterState!=='function')throw error;
      let state;
      try{state=await this.call('getBluetoothAdapterState');}catch{throw error;}
      if(!state.available)throw error;
    }
  }
  async startScan(options={},onDevice) {
    await this.stopScan();const generation=this.scanGeneration;await this.waitReady();
    if(generation!==this.scanGeneration)return;
    const seen=new Map(),matched=new Set(),live=new Set();
    const report=(cacheError='')=>options.onProgress?.({nearbyCount:seen.size,t100Count:matched.size,liveCount:live.size,cacheError});
    const publish=(devices,cached)=>{
      if(generation!==this.scanGeneration)return;
      for(const incoming of devices||[]){
        if(!incoming.deviceId)continue;
        const previous=seen.get(incoming.deviceId)||{};
        const device={...previous,...incoming,name:incoming.name||previous.name,localName:incoming.localName||previous.localName};
        // The desktop bridge replays selected/cached devices as found events.
        // These events cannot establish that an advertisement was received.
        seen.set(device.deviceId,device);if(!cached&&!this.bridgeOnly)live.add(device.deviceId);
        // macOS/iOS can retain an old GATT name. Prefer the advertised name,
        // while accepting a valid system name if the advertisement omits it.
        const names=[device.localName,device.name].filter(v=>typeof v==='string').map(v=>v.replace(/\0+$/,'').trim());
        const product=nativeProduct(device.advertisData);
        const candidate=names.find(v=>/^YD-[0-9a-f]{12}$/i.test(v));
        const name=product&&product.productId!==1?null:candidate;
        const record={id:device.deviceId,name:name||names.find(Boolean)||'Unnamed device',rssi:device.RSSI??null,cached:!live.has(device.deviceId),isT100:!!name,productId:product?.productId??null,shellId:product?.shellId??null,native:device};
        options.onNearbyDevice?.(record);
        if(name){matched.add(device.deviceId);onDevice(record);}
      }
      report();
    };
    const listener=event=>publish(event.devices,false);
    this.scanListener=listener;this.api.onBluetoothDeviceFound(listener);
    try{
      const discoveryOptions={allowDuplicatesKey:true,interval:500};
      try{await this.call('startBluetoothDevicesDiscovery',discoveryOptions);}
      catch(error){
        // Hot reload can retain native discovery after losing our JS listener.
        // Only recover this specific error after confirming native state.
        if(!/already discover/i.test(error.message)||typeof this.api.getBluetoothAdapterState!=='function')throw error;
        let state;
        try{state=await this.call('getBluetoothAdapterState');}catch{throw error;}
        if(generation!==this.scanGeneration)return;
        if(!state.available||!state.discovering)throw error;
        await this.call('stopBluetoothDevicesDiscovery');
        if(generation!==this.scanGeneration)return;
        await this.call('startBluetoothDevicesDiscovery',discoveryOptions);
      }
      if(generation!==this.scanGeneration){await this.call('stopBluetoothDevicesDiscovery');return;}
      report();
      // Already discovered devices may not generate a new found event after
      // recompilation. Read the native list too, without blocking Stop scan.
      if(typeof this.api.getBluetoothDevices==='function'){
        const readCache=async()=>{
          try{const result=await this.call('getBluetoothDevices');publish(result.devices,true);}
          catch(error){if(generation===this.scanGeneration)report(error.message);}
          if(generation===this.scanGeneration&&this.scanListener===listener)this.scanCacheTimer=setTimeout(readCache,1000);
        };
        void readCache();
      }
    }
    catch(error){this.api.offBluetoothDeviceFound(listener);if(this.scanListener===listener)this.scanListener=null;throw error;}
  }
  async stopScan() {
    this.scanGeneration++;
    clearTimeout(this.scanCacheTimer);this.scanCacheTimer=null;
    if(!this.scanListener)return;
    this.api.offBluetoothDeviceFound(this.scanListener);this.scanListener=null;
    await this.call('stopBluetoothDevicesDiscovery');
  }
  async connect(device) {
    if(this.bridgeOnly)throw new Error('BLE connection is unavailable in this desktop simulator. Use WeChat Preview on your phone.');
    await this.stopScan();await this.waitReady();
    const listeners=new Set();
    const connection={device,active:true,queue:Promise.resolve(),subscriptions:new Set(),services:null,characteristics:new Map(),mtu:null,
      native:{get mtu(){return connection.mtu??23;},on:(name,fn)=>{if(name==='disconnect')listeners.add(fn);},off:(_name,fn)=>listeners.delete(fn)},listeners};
    this.connections.set(device.id,connection);
    try{
      await this.call('createBLEConnection',{deviceId:device.id,timeout:this.timeoutMs});
      const info=this.api.getDeviceInfo?.()||this.api.getSystemInfoSync?.()||{};
      if(info.platform==='android' && this.api.setBLEMTU){
        try{await this.call('setBLEMTU',{deviceId:device.id,mtu:185});}catch{/* Inspect the actual MTU even if negotiation was refused. */}
      }
      if(this.api.getBLEMTU){try{connection.mtu=(await this.call('getBLEMTU',{deviceId:device.id,writeType:'write'})).mtu;}catch{/* Older WeChat versions can still attempt a complete FEE1 read. */}}
      if(!connection.active)throw new Error('Device disconnected during setup');
      return connection;
    }catch(error){await this.disconnect(connection);throw error;}
  }
  drop(connection) {
    if(!connection.active)return;
    connection.active=false;
    if(this.connections.get(connection.device.id)===connection)this.connections.delete(connection.device.id);
    for(const [key,pending] of this.pendingReads)if(pending.connection===connection){this.pendingReads.delete(key);pending.reject(new Error('Device disconnected before the read completed'));}
    connection.subscriptions.clear();
    for(const listener of connection.listeners)listener();connection.listeners.clear();
  }
  async disconnect(connection) {
    if(!connection)return;
    this.drop(connection);
    try{await this.call('closeBLEConnection',{deviceId:connection.device.id});}catch{/* The link may already be closed. */}
  }
  operation(connection,task) {
    const run=connection.queue.then(async()=>{
      if(!connection.active)throw new Error('Device disconnected');
      let timer;
      try{return await Promise.race([task(),new Promise((_,reject)=>{timer=setTimeout(()=>{
        this.drop(connection);void this.call('closeBLEConnection',{deviceId:connection.device.id}).catch(()=>{});
        reject(new Error('Bluetooth operation timed out. Reconnect and try again.'));
      },this.timeoutMs);})]);}
      catch(error){
        if(error.code==='wechat-api-timeout' && connection.active){this.drop(connection);void this.call('closeBLEConnection',{deviceId:connection.device.id}).catch(()=>{});}
        throw error;
      }finally{clearTimeout(timer);}
    });
    connection.queue=run.catch(()=>{});return run;
  }
  discoverServices(connection,uuids=[]) {
    return this.operation(connection,async()=>{
      if(!connection.services){const result=await this.call('getBLEDeviceServices',{deviceId:connection.device.id});connection.services=result.services.map(native=>({uuid:native.uuid,native}));}
      return uuids.length?connection.services.filter(service=>uuids.some(id=>same(service.uuid,id))):connection.services;
    });
  }
  discoverCharacteristics(connection,service,uuids=[]) {
    return this.operation(connection,async()=>{
      if(!connection.characteristics.has(service.uuid)){
        const result=await this.call('getBLEDeviceCharacteristics',{deviceId:connection.device.id,serviceId:service.uuid});
        connection.characteristics.set(service.uuid,result.characteristics.map(native=>({uuid:native.uuid,serviceUuid:service.uuid,native,
          properties:Object.entries(native.properties).filter(([,enabled])=>enabled).map(([name])=>name==='writeNoResponse'?'writeWithoutResponse':name)})));
      }
      const chars=connection.characteristics.get(service.uuid);return uuids.length?chars.filter(c=>uuids.some(id=>same(c.uuid,id))):chars;
    });
  }
  target(connection,characteristic) {return {deviceId:connection.device.id,serviceId:characteristic.serviceUuid,characteristicId:characteristic.uuid};}
  checkScaleMtu(connection,characteristic) {
    if(same(characteristic.uuid,'fee1') && connection.mtu!==null && connection.mtu<39)throw new Error(`Scale unavailable: MTU ${connection.mtu}, firmware requires at least 39`);
  }
  readCharacteristic(connection,characteristic) {
    return this.operation(connection,()=>{
      this.checkScaleMtu(connection,characteristic);
      return new Promise((resolve,reject)=>{
        const target=this.target(connection,characteristic),key=valueKey(target.deviceId,target.serviceId,target.characteristicId);
        const pending={connection,resolve,reject};this.pendingReads.set(key,pending);
        // success only confirms the request. Data arrives through the global
        // value callback, which also carries notifications on the same channel.
        this.call('readBLECharacteristicValue',target).catch(error=>{
          if(this.pendingReads.get(key)===pending){this.pendingReads.delete(key);reject(error);}
        });
      });
    });
  }
  writeCharacteristic(connection,characteristic,bytes,type='withResponse') {
    return this.operation(connection,()=>{
      const value=Uint8Array.from(bytes).buffer;
      if(connection.mtu!==null && value.byteLength>connection.mtu-3)throw new Error('Bluetooth payload exceeds negotiated MTU');
      return this.call('writeBLECharacteristicValue',{...this.target(connection,characteristic),value,writeType:type==='withoutResponse'?'writeNoResponse':'write'});
    });
  }
  async subscribe(connection,characteristic,onData) {
    this.checkScaleMtu(connection,characteristic);
    const target=this.target(connection,characteristic);
    const sub={key:valueKey(target.deviceId,target.serviceId,target.characteristicId),onData};
    connection.subscriptions.add(sub);
    try{await this.operation(connection,()=>this.call('notifyBLECharacteristicValueChange',{...target,state:true}));}
    catch(error){connection.subscriptions.delete(sub);throw error;}
    return {unsubscribe:async()=>{connection.subscriptions.delete(sub);if(connection.active)await this.operation(connection,()=>this.call('notifyBLECharacteristicValueChange',{...target,state:false}));}};
  }
  async dispose() {
    await this.stopScan();await Promise.all([...this.connections.values()].map(connection=>this.disconnect(connection)));
    this.api.offBLECharacteristicValueChange(this.valueListener);this.api.offBLEConnectionStateChange(this.connectionListener);
    await this.call('closeBluetoothAdapter');
  }
}
