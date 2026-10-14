import {BrowserConsole} from '../web/console.js';
import {AuthStore} from '../web/auth-store.js';
import {verifyMiniToken,miniSubtle,miniStorage,randomUuid,readLocalFile,byteFile,wxCall} from './platform.js';
import {loadMiniPreset,miniRasterFood,renderMiniNotify} from './assets.js';
import {latestMiniFirmware} from './firmware.js';
import {validateSignedOad} from '../web/signed-ota-format.js';
import {oadVersion} from '../web/ota-format.js';
import containerWire from '../vendor/ble/core/fee0-container-weight-wire.js';
import sessionModule from '../vendor/ble/session/t100-session.js';
import scaleWire from '../vendor/ble/core/fee0-scale-wire.js';
import {WechatGattAdapter} from './gatt.js';
import {KnownDeviceStore} from './device-store.js';
const {canonicalUuid}=sessionModule;
export class MiniService {
  constructor(api,{adapter=new WechatGattAdapter(api),deviceStore=new KnownDeviceStore(api),scanMs=10000}={}) {
    this.api=api;this.auth=new AuthStore(miniStorage(api));this.firmwareGeneration=0;this.firmwareBundle=null;
    this.actions=new BrowserConsole({adapter,auth:this.auth,bluetooth:null,verifyToken:verifyMiniToken,loadEmotion:loadMiniPreset,rasterFood:miniRasterFood(api),oadTrust:{subtle:miniSubtle}});
    this.adapter=adapter;this.deviceStore=deviceStore;this.session=this.actions.session;this.listeners=new Set();this.devices=new Map();this.nearbyDevices=new Map();this.connection=null;this.connecting=false;this.scanMs=scanMs;this.scanTimer=null;this.scanGeneration=0;
    this.state={lastWeighingState:deviceStore.list()[0]?.lastWeighing||null,activity:[],busy:false,actionName:'',feedback:'',previewCommits:[],authCount:0,hasAuth:false,containerState:null,containerPending:null,containerMessage:'',firmwareLoading:false,firmwareInfo:null,firmwareError:'',oadProgress:0,bridgeOnly:!!adapter.bridgeOnly,devices:[],knownDevices:deviceStore.list(),nearbyDevices:[],scanning:false,scanStats:null,scanComplete:false,connecting:false,connectingDeviceId:null,connected:false,device:null,firmware:'--',battery:null,mtu:null,reading:null,status:null,warnings:deviceStore.loadError?[deviceStore.loadError]:[],error:''};
    this.actions.on('ScanUpsert',rows=>{const row=rows.find(item=>item.id===this.state.device?.id);if(row?.firmware)this.update({firmware:row.firmware});});
    this.actions.on('ActionBusy',({busy})=>this.update({busy}));
    this.actions.on('SimActionLog',({line,progressKey})=>this.log(line,progressKey));
    this.actions.on('PreviewCommit',data=>this.update({previewCommits:[...this.state.previewCommits.filter(row=>row.name!==data.name),{...data,...(data.gray?{gray:Array.from(data.gray)}:{}),id:(this.commitSeq=(this.commitSeq||0)+1)}]}));
    this.actions.on('SimOadProgress',({progress})=>this.update({oadProgress:progress}));
    this.actions.on('ScaleUpdate',({reading})=>{if(this.connection?.active)this.publish('reading',reading);});
    this.updateAuth();
  }
  log(line,progressKey){line=String(line).replace(/browser/gi,'Mini Program');const rows=this.state.activity.filter(row=>!progressKey||row.progressKey!==progressKey);this.update({activity:[...rows,{line,time:new Date().toLocaleTimeString(),...(progressKey?{progressKey}:{})}].slice(-120)});}
  updateAuth(){try{this.update({authCount:this.auth.records().length,hasAuth:!!(this.state.device&&this.auth.resolve(this.state.device))});}catch(error){this.update({hasAuth:false,error:error.message.replace(/browser/gi,'Mini Program')});}}
  publish(key,value){
    if(this.actions.entry)this.actions.entry.ui[key==='reading'?'scaleReading':key==='status'?'deviceStatus':key==='battery'?'batteryLevel':key]=value;
    const patch={[key]:value};
    if(key==='status'&&this.actions.entry)this.actions.entry.ui.bindState=value.flags&1?'bound':'unbind';
    if(key==='reading'){
      const container=containerWire.containerFromSnapshot(value);
      if(container!==undefined){
        const pending=this.state.containerPending;
        const matches=!pending||(pending.uuid===null?container===null:container?.uuid===pending.uuid&&container.mg===Math.round(pending.grams*1000));
        Object.assign(patch,{containerState:container,containerPending:null,containerMessage:matches?(container?`Container confirmed: ${container.mg/1000} g`:'Container cleared by the device'):'Container not confirmed: device reports a different container.'});
      }
    }
    const reported=key==='reading'?value.profile:key==='status'?value.coffee?.profile:undefined;
    if([0,1,2,3].includes(reported)){
      const previous=this.state.lastWeighingState,reading=key==='reading'?value:this.state.reading;
      patch.lastWeighingState={profile:reported,unit:reading?.unit??previous?.unit??0,stage:reading?.stage??0,valueText:reading?.valueText||previous?.valueText||'--',unitText:reading?.unit===1?'oz':'g',updatedAt:Date.now()};
      const changed=!previous||previous.profile!==reported||previous.unit!==patch.lastWeighingState.unit;
      this.update(patch);if(changed&&this.state.connected)this.flushWeighingState();return;
    }
    this.update(patch);
  }
  flushWeighingState(){if(!this.state.lastWeighingState||!this.deviceStore.list().length)return;try{const knownDevices=this.deviceStore.saveWeighing(this.state.lastWeighingState);this.update({knownDevices});}catch{const warning='Last weighing state could not be saved.';if(!this.state.warnings.includes(warning))this.update({warnings:[...this.state.warnings,warning]});}}
  onChange(fn) {this.listeners.add(fn);fn(this.state);return ()=>this.listeners.delete(fn);}
  update(patch) {this.state={...this.state,...patch};for(const fn of this.listeners)fn(this.state);}
  async scan() {
    if(this.connecting||this.state.busy)return;
    await this.stopScan();const generation=this.scanGeneration;this.devices.clear();this.nearbyDevices.clear();this.update({devices:[],nearbyDevices:[],error:'',scanning:true,scanComplete:false,scanStats:null});
    try{
      await this.adapter.startScan({onProgress:scanStats=>{if(generation===this.scanGeneration)this.update({scanStats});},onNearbyDevice:device=>{if(generation!==this.scanGeneration)return;const {native,...row}=device;this.nearbyDevices.set(device.id,row);this.update({nearbyDevices:[...this.nearbyDevices.values()]});}},device=>{if(generation!==this.scanGeneration)return;this.devices.set(device.id,device);this.update({devices:[...this.devices.values()].map(({native,...row})=>row)});});
      if(generation!==this.scanGeneration){await this.adapter.stopScan();return;}
      this.scanTimer=setTimeout(()=>void this.stopScan().catch(error=>this.update({error:error.message})),this.scanMs);
    }catch(error){if(generation!==this.scanGeneration)return;this.update({scanning:false,error:error.message});throw error;}
  }
  async stopScan() {const wasScanning=this.state.scanning;this.scanGeneration++;clearTimeout(this.scanTimer);this.scanTimer=null;try{await this.adapter.stopScan();}finally{this.update({scanning:false,...(wasScanning?{scanComplete:true}:{})});}}
  async connect(id) {
    if(this.connecting||this.state.busy)return;
    if(this.state.connected&&this.state.device?.id===id)return;
    const device=this.devices.get(id)||this.state.knownDevices.find(row=>row.id===id);if(!device)throw new Error('Scan and select a KCALACK first');
    const saved=this.state.knownDevices[0];if(saved&&saved.name.toLowerCase()!==device.name.toLowerCase())throw new Error('Remove your current device before adding another.');
    this.log(`Connecting ${device.name}`);this.connecting=true;this.update({connecting:true,connectingDeviceId:id,error:'',warnings:[]});
    try{
      await this.stopScan();await this.disconnect();
      const connection=await this.adapter.connect(device);this.connection=connection;
      this.actions.connection=connection;this.actions.entry={device,ui:{id:device.id,name:device.name,bindState:'unknown',scaleReading:null,deviceStatus:null}};

      connection.native.on('disconnect',()=>{if(this.connection===connection){this.flushWeighingState();this.connection=null;this.actions.connection=null;this.actions.entry=null;if(this.actions.abortRef)this.actions.abortRef.aborted=true;this.firmwareGeneration++;this.firmwareBundle=null;this.update({connected:false,device:null,mtu:null,reading:null,status:null,battery:null,firmware:'--',nearbyDevices:[],devices:[],scanComplete:false,hasAuth:false,containerState:null,containerPending:null,previewCommits:[],firmwareInfo:null,firmwareLoading:false,error:['bindDevice','resetDevice','factoryDevice','downloadOad'].includes(this.state.actionName)?'':'Device disconnected. Select it to reconnect.'});}});
      const services=await this.adapter.discoverServices(connection);
      if(!services.some(s=>canonicalUuid(s.uuid)==='fee0'))throw new Error('This device does not expose the T100 service');
      this.actions.entry.ui.bindState=services.some(row=>row.uuid.replaceAll('-','').toLowerCase()==='6b300001ef004a5b8dc12e9fcdef0001')?'unbind':'unknown';
      const warnings=[];
      const optional=async(label,fn)=>{try{return await fn();}catch(error){warnings.push(`${label}: ${error.message}`);return null;}};
      const publish=(key,value)=>{if(this.connection===connection && connection.active)this.publish(key,value);};
      const timeSync=await optional('Time sync',()=>this.session.setTime(connection,Math.floor(Date.now()/1000)));if(timeSync)this.log('Device time synced');
      await optional('Status notifications',()=>this.session.subscribeDeviceStatus(connection,value=>publish('status',value)));
      await optional('Scale notifications',()=>this.session.subscribeScaleNotify(connection,value=>publish('reading',scaleWire.formatFee0ScaleReading(value))));
      await optional('Battery notifications',()=>this.session.subscribeBatteryLevel(connection,value=>publish('battery',value)));
      const firmware=await optional('Firmware',()=>this.session.readFirmwareVersion(connection));
      // Data is delivered by the same platform callback as notify. Reads remain
      // serialized by the adapter; a new notification cannot cross device IDs.
      for(const [key,read,format] of [['status','readDeviceStatus',v=>v],['reading','readScaleReading',scaleWire.formatFee0ScaleReading],['battery','readBatteryLevel',v=>v]]){
        const value=await optional(key,()=>this.session[read](connection));if(value!==null)publish(key,format(value));
      }
      if(!connection.active)throw new Error('Device disconnected during setup');
      let knownDevices=this.state.knownDevices;
      try{knownDevices=this.deviceStore.remember(device);}catch{warnings.push('Connected, but your device could not be saved.');}
      this.actions.entry.ui.firmware=firmware||'--';this.update({connected:true,knownDevices,device:{id:device.id,name:device.name},mtu:connection.mtu,firmware:firmware||'--',warnings});this.flushWeighingState();this.updateAuth();this.log(`Connected ${device.name}`);void this.loadLatestFirmware();
    }catch(error){await this.disconnect();this.update({error:error.message});throw error;}
    finally{this.connecting=false;this.update({connecting:false,connectingDeviceId:null});}
  }
  async refresh() {
    if(this.state.busy)throw new Error('Wait for the current device action');
    const connection=this.connection;if(!connection?.active)throw new Error('Connect a T100 first');
    const warnings=[];
    for(const [key,read,format] of [['firmware','readFirmwareVersion',v=>v],['status','readDeviceStatus',v=>v],['reading','readScaleReading',scaleWire.formatFee0ScaleReading],['battery','readBatteryLevel',v=>v]]){
      try{const value=await this.session[read](connection);if(this.connection===connection && connection.active)this.publish(key,format(value));}
      catch(error){warnings.push(`${key}: ${error.message}`);}
    }
    this.update({warnings,error:''});
  }
  async disconnect() {
    this.flushWeighingState();
    const connection=this.connection;this.connection=null;this.actions.connection=null;this.actions.entry=null;this.firmwareGeneration++;this.firmwareBundle=null;if(this.actions.abortRef)this.actions.abortRef.aborted=true;
    if(connection){this.session.clearVendorDownlinkCache(connection);await this.adapter.disconnect(connection);}
    this.update({connected:false,device:null,mtu:null,reading:null,status:null,battery:null,firmware:'--',nearbyDevices:[],devices:[],scanComplete:false,hasAuth:false,containerState:null,containerPending:null,containerMessage:'',previewCommits:[],firmwareInfo:null,firmwareLoading:false});
  }
  async removeDevice(){if(this.state.busy||this.connecting)throw new Error('Wait for the current device action.');const knownDevices=this.deviceStore.remove();try{await this.disconnect();}finally{this.update({knownDevices,lastWeighingState:null});}}

  async invoke(name,args){
    if(this.state.busy||this.connecting)throw new Error('Wait for the current device action.');
    this.update({actionName:name,error:'',feedback:''});
    try{
      const result=await (name==='downloadOad'?this.actions.downloadOad(args.file,args.manifest):this.actions[name](args));if(result.message)result.message=result.message.replace(/browser/gi,'Mini Program');this.update({feedback:result.message||'Command sent'});this.log(result.message||'Command sent');
      if(name==='setContainerWeight'){this.update({containerPending:result.confirmed===false?{uuid:result.uuid,grams:result.grams}:null,containerMessage:result.message});if(result.confirmed===false&&this.state.reading)this.publish('reading',this.state.reading);}
      this.updateAuth();return result;
    }catch(error){this.log(error.message);this.update({error:error.message.replace(/browser/gi,'Mini Program')});throw error;}
    finally{this.update({actionName:''});}
  }
  async setContainer(grams,uuid){return this.invoke('setContainerWeight',{grams,uuid:grams===null?undefined:uuid||await randomUuid(this.api)});}
  async sendNotify(text,color){
    if(!/^#[0-9a-f]{6}$/i.test(color))throw new Error('Use a six-digit hex color');const rgb=parseInt(color.slice(1),16);
    return this.invoke('notifyDisplay',{text,colorRgb565:((rgb>>19)&31)<<11|((rgb>>10)&63)<<5|((rgb>>3)&31),gray:renderMiniNotify(this.api,text)});
  }
  async appendHistory(data){return this.invoke('appendKcalHist',{...data,uuid:data.uuid||await randomUuid(this.api)});}
  importAuth(text){if(this.state.busy||this.connecting)throw new Error('Wait for the current device action.');const count=this.auth.import(text);this.updateAuth();this.update({feedback:`Imported ${count} credentials`});return count;}
  async importAuthFile(){const result=await wxCall(this.api,'chooseMessageFile',{count:1,type:'file',extension:['json']});const file=result.tempFiles?.[0];if(!file)return;return this.importAuth(await readLocalFile(this.api,file.path,{text:true}));}
  async exportAuth(){const path=this.api.env.USER_DATA_PATH+'/t100-auth-backup.json';await wxCall(this.api.getFileSystemManager(),'writeFile',{filePath:path,data:JSON.stringify(this.auth.records(),null,2),encoding:'utf8'});return path;}
  async loadLatestFirmware(){
    if(this.state.busy)return;const generation=++this.firmwareGeneration;this.update({firmwareLoading:true,firmwareError:''});
    try{const bundle=await latestMiniFirmware(this.api);if(generation!==this.firmwareGeneration)return;this.firmwareBundle=bundle;this.update({firmwareInfo:bundle.metadata,oadProgress:0});}
    catch(error){if(generation===this.firmwareGeneration)this.update({firmwareError:error.message});}
    finally{if(generation===this.firmwareGeneration)this.update({firmwareLoading:false});}
  }
  async chooseFirmware(){
    if(this.state.busy)throw new Error('Wait for the current action');const generation=++this.firmwareGeneration;this.update({firmwareLoading:false,firmwareError:''});
    const result=await wxCall(this.api,'chooseMessageFile',{count:2,type:'file',extension:['bin','manifest']});if(generation!==this.firmwareGeneration)return;
    const files=result.tempFiles||[],bin=files.find(f=>/\.bin$/i.test(f.name)),sidecar=files.find(f=>/\.manifest$/i.test(f.name));
    if(files.length!==2||!bin||!sidecar)throw new Error('Choose a signed BIN and its matching manifest');
    const bytes=await readLocalFile(this.api,bin.path,{max:245760}),manifest=await readLocalFile(this.api,sidecar.path,{max:128});
    const metadata=await validateSignedOad(bytes,manifest,undefined,{subtle:miniSubtle});if(generation!==this.firmwareGeneration)return;
    this.firmwareBundle={metadata,file:byteFile('T100_OAD.bin',bytes),manifest:byteFile('T100_OAD.manifest',manifest)};this.update({firmwareInfo:metadata,oadProgress:0});
  }
  async startOad(){
    if(!this.firmwareBundle)throw new Error('Choose signed firmware first');if(!oadVersion(this.state.firmware))throw new Error('Refresh the device firmware version before upgrading');
    const bundle=this.firmwareBundle;return this.invoke('downloadOad',bundle);
  }
}
