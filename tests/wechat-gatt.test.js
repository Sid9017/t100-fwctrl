import test from 'node:test';
import assert from 'node:assert/strict';
import {WechatGattAdapter} from '../src/miniprogram/gatt.js';
import {MiniService} from '../src/miniprogram/service.js';
import {viewModel} from '../src/miniprogram/view-model.js';
import {KnownDeviceStore} from '../src/miniprogram/device-store.js';
import {build} from 'esbuild';
import {runInNewContext} from 'node:vm';
const full=id=>`0000${id}-0000-1000-8000-00805f9b34fb`;
const device={id:'phone-device',name:'YD-03148c52fb00',rssi:-55};
const uuid='12345678-1234-4321-8765-123456789abc';
function scale({value=-25000,container=true}={}){
  const b=Buffer.alloc(36);b.writeInt32LE(value,1);b.set([3,3,0,container?7:5,1],5);b.writeInt32LE(container?100000:0,10);b[14]=2;b.writeInt32LE(350000,15);
  if(container)b.set(Buffer.from(uuid.replaceAll('-',''),'hex'),20);return b;
}
function mock({mtu=185,platform='ios',readEvents=true}={}){
  const calls=[],events={value:new Set(),connection:new Set(),scan:new Set()};
  const storage=new Map();
  const status=Buffer.from([20,4,2,2,1,0,0,0,2,3,0,0,0,0,0,0,0,0,0,0]);
  const values=new Map([['fee1',scale()],['fee5',status],['2a19',Buffer.from([87])],['2a26',Buffer.from('1.0.0-1234')]]);
  const chars={'fee0':['fee1','fee3','fee4','fee5'],'180f':['2a19'],'180a':['2a26']};
  const emitValue=(id,value,deviceId=device.id)=>{const service=id.startsWith('fee')?'fee0':id==='2a19'?'180f':'180a';for(const fn of events.value)fn({deviceId,serviceId:full(service),characteristicId:full(id),value:Uint8Array.from(value).buffer});};
  const record=(name,fn)=>(options)=>{calls.push({name,options});fn(options);};
  const api={
    getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,structuredClone(value)),
    onBLECharacteristicValueChange:fn=>events.value.add(fn),offBLECharacteristicValueChange:fn=>events.value.delete(fn),
    onBLEConnectionStateChange:fn=>events.connection.add(fn),offBLEConnectionStateChange:fn=>events.connection.delete(fn),
    onBluetoothDeviceFound:fn=>events.scan.add(fn),offBluetoothDeviceFound:fn=>events.scan.delete(fn),
    getDeviceInfo:()=>({platform}),
    openBluetoothAdapter:record('open',o=>o.success({})),closeBluetoothAdapter:record('close',o=>o.success({})),
    startBluetoothDevicesDiscovery:record('scan',o=>{o.success({});for(const fn of events.scan)fn({devices:[{deviceId:device.id,name:device.name,RSSI:-55},{deviceId:'other',name:'Other scale'}]});}),
    stopBluetoothDevicesDiscovery:record('stop',o=>o.success({})),
    createBLEConnection:record('connect',o=>o.success({})),closeBLEConnection:record('disconnect',o=>o.success({})),
    setBLEMTU:record('setMTU',o=>o.success({mtu})),getBLEMTU:record('getMTU',o=>o.success({mtu})),
    getBLEDeviceServices:record('services',o=>o.success({services:Object.keys(chars).map(id=>({uuid:full(id)}))})),
    getBLEDeviceCharacteristics:record('chars',o=>o.success({characteristics:chars[o.serviceId.slice(4,8)].map(id=>({uuid:full(id),properties:{read:true,notify:id!=='2a26',write:['fee3','fee4'].includes(id)}}))})),
    notifyBLECharacteristicValueChange:record('notify',o=>o.success({})),
    readBLECharacteristicValue:record('read',o=>{o.success({});if(readEvents)queueMicrotask(()=>emitValue(o.characteristicId.slice(4,8),values.get(o.characteristicId.slice(4,8))));}),
    writeBLECharacteristicValue:record('write',o=>o.success({})),
  };
  return {api,calls,events,emitValue,storage,values};
}
test('WeChat Read waits for the value event and ignores another device, while preserving subscriptions',async()=>{
  const m=mock({readEvents:false}),adapter=new WechatGattAdapter(m.api,{timeoutMs:100});const c=await adapter.connect(device);
  const ch={uuid:full('fee1'),serviceUuid:full('fee0')};let updates=0;
  const sub=await adapter.subscribe(c,ch,()=>updates++);
  let completed=false;const read=adapter.readCharacteristic(c,ch).then(value=>{completed=true;return value;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(completed,false);
  m.emitValue('fee1',scale(),'other-device');assert.equal(completed,false);assert.equal(updates,0);
  m.emitValue('fee1',scale());assert.deepEqual(await read,scale());assert.equal(updates,1);
  await sub.unsubscribe();m.emitValue('fee1',scale());assert.equal(updates,1);await adapter.dispose();
  assert.equal(m.events.value.size,0);assert.equal(m.events.connection.size,0);
});
test('WeChat operations are serialized and a disconnect rejects queued/pending reads',async()=>{
  const m=mock({readEvents:false}),adapter=new WechatGattAdapter(m.api,{timeoutMs:100});const c=await adapter.connect(device);
  const ch={uuid:full('fee5'),serviceUuid:full('fee0')};const first=adapter.readCharacteristic(c,ch),second=adapter.readCharacteristic(c,ch);
  const rejected=Promise.allSettled([first,second]);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(m.calls.filter(x=>x.name==='read').length,1);
  for(const fn of m.events.connection)fn({deviceId:device.id,connected:false});
  assert.ok((await rejected).every(result=>result.status==='rejected'));
  assert.equal(m.calls.filter(x=>x.name==='read').length,1);assert.equal(adapter.pendingReads.size,0);await adapter.dispose();
});
test('MTU negotiation is Android-only and oversized writes fail without transmitting',async()=>{
  for(const platform of ['android','ios']){
    const m=mock({platform,mtu:39}),adapter=new WechatGattAdapter(m.api);const c=await adapter.connect(device);
    assert.equal(m.calls.filter(x=>x.name==='setMTU').length,platform==='android'?1:0);
    const ch={uuid:full('fee3'),serviceUuid:full('fee0')};await adapter.writeCharacteristic(c,ch,Buffer.alloc(31),'withResponse');
    assert.equal(m.calls.find(x=>x.name==='write').options.writeType,'write');
    await assert.rejects(adapter.writeCharacteristic(c,ch,Buffer.alloc(37)),/MTU/);assert.equal(m.calls.filter(x=>x.name==='write').length,1);
    await adapter.dispose();
  }
});
test('missing read events time out and close the link instead of reporting success',async()=>{
  const m=mock({readEvents:false}),adapter=new WechatGattAdapter(m.api,{timeoutMs:10});const c=await adapter.connect(device);
  await assert.rejects(adapter.readCharacteristic(c,{uuid:full('fee5'),serviceUuid:full('fee0')}),/disconnected|timed out/i);
  assert.equal(c.active,false);assert.equal(adapter.pendingReads.size,0);assert.ok(m.calls.some(x=>x.name==='disconnect'));await adapter.dispose();
});
test('missing native success/fail callbacks also close the link and cannot leave queued operations running',async()=>{
  const m=mock(),adapter=new WechatGattAdapter(m.api,{timeoutMs:10});const c=await adapter.connect(device);
  m.api.getBLEDeviceServices=()=>{};
  await assert.rejects(adapter.discoverServices(c),/timed out/);assert.equal(c.active,false);
  assert.ok(m.calls.some(x=>x.name==='disconnect'));await adapter.dispose();
});
test('stopping scan during Bluetooth initialization prevents late discovery from starting',async()=>{
  const m=mock();let ready;m.api.openBluetoothAdapter=options=>{ready=options;};
  const adapter=new WechatGattAdapter(m.api,{timeoutMs:100});
  const scanning=adapter.startScan({},()=>{});await new Promise(resolve=>setImmediate(resolve));
  await adapter.stopScan();ready.success({});await scanning;
  assert.ok(!m.calls.some(x=>x.name==='scan'));assert.equal(m.events.scan.size,0);await adapter.dispose();
});
test('an already-open adapter recovers only when its native state confirms Bluetooth is available',async()=>{
  for(const available of [true,false]){
    const m=mock();
    m.api.openBluetoothAdapter=o=>o.fail({errMsg:'openBluetoothAdapter:fail already opened'});
    m.api.getBluetoothAdapterState=o=>o.success({available});
    const adapter=new WechatGattAdapter(m.api);
    if(available){await adapter.startScan({},()=>{});assert.ok(m.calls.some(x=>x.name==='scan'));}
    else{await assert.rejects(adapter.startScan({},()=>{}),/already opened/);assert.ok(!m.calls.some(x=>x.name==='scan'));}
    await adapter.dispose();
  }
});
test('Bluetooth permission errors are never recovered merely because the adapter is powered on',async()=>{
  const m=mock();m.api.openBluetoothAdapter=o=>o.fail({errCode:103});m.api.getBluetoothAdapterState=o=>o.success({available:true});
  const adapter=new WechatGattAdapter(m.api);await assert.rejects(adapter.startScan({},()=>{}),/denied/);assert.ok(!m.calls.some(x=>x.name==='scan'));await adapter.dispose();
});
test('native discovery left by hot reload is stopped and restarted with the current listener',async()=>{
  const m=mock(),start=m.api.startBluetoothDevicesDiscovery;let attempts=0;
  m.api.startBluetoothDevicesDiscovery=o=>{if(!attempts++)o.fail({errMsg:'startBluetoothDevicesDiscovery:fail already discovering devices'});else start(o);};
  m.api.getBluetoothAdapterState=o=>o.success({available:true,discovering:true});
  const adapter=new WechatGattAdapter(m.api),found=[];await adapter.startScan({},d=>found.push(d));
  assert.equal(attempts,2);assert.equal(found.length,1);assert.equal(found[0].id,device.id);
  assert.deepEqual(m.calls.filter(x=>['stop','scan'].includes(x.name)).map(x=>x.name),['stop','scan']);
  assert.equal(m.events.scan.size,1);await adapter.stopScan();assert.equal(m.events.scan.size,0);await adapter.dispose();
});
test('discovery recovery does not swallow permission/off failures or restart after cancellation',async()=>{
  for(const nativeState of [{available:false,discovering:true},{available:true,discovering:false}]){
    const m=mock();let attempts=0;m.api.startBluetoothDevicesDiscovery=o=>{attempts++;o.fail({errMsg:'startBluetoothDevicesDiscovery:fail already discovering devices'});};
    m.api.getBluetoothAdapterState=o=>o.success(nativeState);
    const adapter=new WechatGattAdapter(m.api);await assert.rejects(adapter.startScan({},()=>{}),/already discovering/);
    assert.equal(attempts,1);assert.equal(m.events.scan.size,0);assert.ok(!m.calls.some(x=>x.name==='stop'));await adapter.dispose();
  }
  const m=mock();let attempts=0,stateRequest;
  m.api.startBluetoothDevicesDiscovery=o=>{attempts++;o.fail({errMsg:'startBluetoothDevicesDiscovery:fail already discovering devices'});};
  m.api.getBluetoothAdapterState=o=>{stateRequest=o;};
  const adapter=new WechatGattAdapter(m.api),scanning=adapter.startScan({},()=>{});
  await new Promise(resolve=>setImmediate(resolve));await adapter.stopScan();stateRequest.success({available:true,discovering:true});await scanning;
  assert.equal(attempts,1);assert.equal(m.events.scan.size,0);await adapter.dispose();
});
test('discovery reads native cached devices even without found events and prefers advertised T100 names',async()=>{
  const m=mock();m.api.startBluetoothDevicesDiscovery=o=>o.success({});
  m.api.getBluetoothDevices=o=>o.success({devices:[{deviceId:'cached',name:'Kitchen Scale',localName:device.name,RSSI:-60},{deviceId:'name-only',name:'YD-001122334455'},{deviceId:'other',name:'Other'}]});
  const adapter=new WechatGattAdapter(m.api),found=[],reports=[];
  await adapter.startScan({onProgress:r=>reports.push(r)},d=>found.push(d));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(found.length,2);assert.equal(found[0].name,device.name);assert.equal(found[0].cached,true);
  assert.deepEqual(reports.at(-1),{nearbyCount:3,t100Count:2,liveCount:0,cacheError:''});
  for(const fn of m.events.scan)fn({devices:[{deviceId:'cached',localName:device.name,RSSI:-40}]});
  assert.equal(found.at(-1).cached,false);assert.equal(found.at(-1).rssi,-40);assert.equal(reports.at(-1).nearbyCount,3);
  await adapter.dispose();assert.equal(adapter.scanCacheTimer,null);
});
test('late native device-list results cannot publish devices after Stop scan',async()=>{
  const m=mock();m.api.startBluetoothDevicesDiscovery=o=>o.success({});let request;
  m.api.getBluetoothDevices=o=>{request=o;};
  const adapter=new WechatGattAdapter(m.api,{timeoutMs:100}),found=[];
  await adapter.startScan({},d=>found.push(d));await adapter.stopScan();request.success({devices:[{deviceId:device.id,localName:device.name}]});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(found.length,0);assert.equal(adapter.scanCacheTimer,null);assert.equal(m.events.scan.size,0);await adapter.dispose();
});
test('desktop bridge records never confirm nearby presence or attempt unsupported GATT connections',async()=>{
  const m=mock({platform:'devtools'}),adapter=new WechatGattAdapter(m.api),service=new MiniService(m.api,{adapter});
  await service.scan();assert.equal(service.state.bridgeOnly,true);
  assert.equal(service.state.scanStats.liveCount,0);assert.equal(service.state.devices[0].cached,true);
  const model=viewModel(service.state);assert.equal(model.newNearbyDevices.length,0);assert.equal(model.previouslySeenDevices.length,1);
  await assert.rejects(service.connect(device.id),/Preview on your phone/);
  assert.ok(!m.calls.some(row=>row.name==='connect'));assert.equal(m.storage.size,0);assert.equal(service.state.connected,false);
  await adapter.dispose();
});
test('MiniService scans T100, uses the shared FEE1/FEE5 decoders and clears live state on disconnect',async()=>{
  const m=mock(),adapter=new WechatGattAdapter(m.api),service=new MiniService(m.api,{adapter,scanMs:10000});
  await service.scan();assert.equal(service.state.devices.length,1);await service.connect(device.id);
  assert.equal(service.state.connected,true);assert.equal(service.state.reading.valueText,'-25.0');assert.equal(service.state.reading.containerUuid,uuid);
  assert.equal(service.state.status.coffee.profile,3);assert.equal(service.state.battery,87);assert.equal(service.state.firmware,'1.0.0-1234');
  const model=viewModel(service.state);assert.equal(model.profileName,'KCal');assert.equal(model.upperText,'100.0 g');assert.equal(model.bindingText,'Bound');
  assert.equal(service.state.knownDevices.length,1);assert.equal(service.state.knownDevices[0].id,device.id);
  m.emitValue('fee1',scale({value:0,container:false}));assert.equal(service.state.reading.containerUuid,null);assert.equal(service.state.reading.valueText,'0.0');
  for(const fn of m.events.connection)fn({deviceId:device.id,connected:false});assert.equal(service.state.connected,false);assert.equal(service.state.reading,null);assert.equal(service.state.status,null);
  await service.stopScan();await adapter.dispose();
});
test('saved connection history survives a fresh service and a cached scan cannot imply current presence',async()=>{
  const m=mock(),service=new MiniService(m.api);await service.scan();await service.connect(device.id);await service.disconnect();await service.adapter.dispose();
  const next=new MiniService(m.api);assert.equal(next.state.knownDevices.length,1);
  m.api.startBluetoothDevicesDiscovery=o=>o.success({});m.api.getBluetoothDevices=o=>o.success({devices:[{deviceId:device.id,name:device.name,RSSI:-50}]});
  await next.scan();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(viewModel(next.state).knownDeviceRows[0].presence,'Checking…');
  await next.stopScan();assert.equal(viewModel(next.state).knownDeviceRows[0].presence,'Not seen in this scan');
  await next.scan();for(const fn of m.events.scan)fn({devices:[{deviceId:device.id,name:device.name,RSSI:-40}]});
  assert.equal(viewModel(next.state).knownDeviceRows[0].presence,'Nearby');assert.equal(viewModel(next.state).newNearbyDevices.length,0);
  await next.stopScan();await next.connect(device.id);assert.equal(viewModel(next.state).knownDeviceRows[0].presence,'Connected');
  const creates=m.calls.filter(row=>row.name==='connect').length;await next.connect(device.id);assert.equal(m.calls.filter(row=>row.name==='connect').length,creates);
  await next.disconnect();assert.equal(next.state.knownDevices.length,1);await next.adapter.dispose();
});
test('only a verified successful T100 connection is saved; discovery and rejected devices are not',async()=>{
  const m=mock();m.api.getBLEDeviceServices=o=>o.success({services:[{uuid:full('180f')}]});
  const service=new MiniService(m.api);await service.scan();assert.equal(m.storage.size,0);
  await assert.rejects(service.connect(device.id),/T100 service/);assert.equal(service.state.knownDevices.length,0);assert.equal(m.storage.size,0);await service.adapter.dispose();
});
test('saved device storage validates records and leaves an active connection intact when saving fails',async()=>{
  const m=mock();const good={id:device.id,name:device.name,lastConnectedAt:1};
  m.api.getStorageSync=()=>({version:1,devices:[good,{...good,id:'bad',name:'Other'},{...good,id:'bad-date',lastConnectedAt:1e100}]});
  assert.deepEqual(new KnownDeviceStore(m.api).list(),[good]);
  m.api.setStorageSync=()=>{throw new Error('Storage full');};
  const service=new MiniService(m.api);await service.connect(device.id);assert.equal(service.state.connected,true);assert.ok(service.state.warnings.some(message=>message.includes('could not be saved')));
  await service.disconnect();await service.adapter.dispose();
});
test('low MTU keeps device status available and never accepts truncated FEE1 as a live scale',async()=>{
  const m=mock({mtu:23}),adapter=new WechatGattAdapter(m.api),service=new MiniService(m.api,{adapter});
  await service.scan();await service.connect(device.id);assert.equal(service.state.connected,true);assert.equal(service.state.status.screen,4);
  assert.equal(service.state.reading,null);assert.ok(service.state.warnings.some(x=>x.includes('requires at least 39')));
  assert.ok(!m.calls.some(x=>['read','notify'].includes(x.name)&&x.options.characteristicId===full('fee1')));
  await service.disconnect();await adapter.dispose();
});
test('the Mini Program bundle runs without Node Buffer, DOM or Web Bluetooth globals',async()=>{
  const result=await build({entryPoints:['src/miniprogram/entry.js'],bundle:true,platform:'browser',format:'cjs',target:'es2020',write:false,inject:['scripts/buffer-shim.js']});
  const module={exports:{}};
  runInNewContext(result.outputFiles[0].text,{module,setTimeout,clearTimeout,console});
  const m=mock(),service=new module.exports.MiniService(m.api);
  await service.scan();await service.connect(device.id);
  assert.equal(service.state.reading.valueText,'-25.0');assert.equal(service.state.status.screenName,'SCALE');
  assert.equal(module.exports.viewModel(service.state).upperText,'100.0 g');
  await service.stopScan();await service.adapter.dispose();
});

test('native controls reuse authenticated web wire payloads, confirm UUID echoes and clear auth after reset',async()=>{
  const m=mock(),service=new MiniService(m.api);await service.scan();await service.connect(device.id);
  service.importAuth(JSON.stringify({pub_key:'036b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296',auth_key:'abcd1234',name:device.name}));
  assert.equal(viewModel(service.state).canControl,true);
  const before=m.calls.filter(x=>x.name==='write').length;
  await service.invoke('scaleTare');const tare=m.calls.filter(x=>x.name==='write').at(-1);assert.equal(Buffer.from(tare.options.value).subarray(1,9).toString(),'abcd1234');assert.equal(tare.options.writeType,'write');
  await service.invoke('scaleUpdateKcal',{currentKcal:-250,targetKcal:1350,tdeeKcal:1600});
  const packets=m.calls.filter(x=>x.name==='write').slice(before).map(x=>Buffer.from(x.options.value));assert.equal(packets[1].subarray(9).toString(),'13501600');assert.equal(packets[2].subarray(9).toString(),'-0250');assert.equal(service.state.previewCommits[0].tdeeKcal,1600);
  m.api.getRandomValues=o=>o.success({randomValues:Uint8Array.from({length:16},(_,i)=>i+1).buffer});
  const normalWrite=m.api.writeBLECharacteristicValue;m.api.writeBLECharacteristicValue=o=>{const bytes=Buffer.from(o.value);if(bytes.length===31){const reading=scale();reading.writeInt32LE(bytes.readUInt32LE(11),10);reading.set(bytes.subarray(15),20);m.values.set('fee1',reading);}normalWrite(o);};
  const result=await service.setContainer(123.4);assert.equal(result.confirmed,true);assert.equal(service.state.containerState.mg,123400);assert.equal(service.state.containerState.uuid,result.uuid);assert.match(service.state.containerMessage,/confirmed/);
  m.emitValue('fee1',scale({container:false}));assert.equal(service.state.containerState,null);assert.match(service.state.containerMessage,/cleared/);
  m.api.writeBLECharacteristicValue=o=>{normalWrite(o);queueMicrotask(()=>{for(const fn of m.events.connection)fn({deviceId:device.id,connected:false});});};
  await service.invoke('factoryDevice');assert.equal(service.auth.records().length,0);assert.equal(service.state.connected,false);
  await service.adapter.dispose();
});
test('background calorie sync sends only authenticated data topics, preserving the current screen',async()=>{
 const m=mock(),service=new MiniService(m.api);
 try{
  await service.scan();await service.connect(device.id);
  service.importAuth(JSON.stringify({pub_key:'036b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296',auth_key:'abcd1234',name:device.name}));
  const before=m.calls.filter(c=>c.name==='write').length;
  const commits=JSON.stringify(service.state.previewCommits);
  await service.invoke('scaleUpdateKcal',{currentKcal:-250,targetKcal:1350,tdeeKcal:1600,navigate:false});
  const packets=m.calls.filter(c=>c.name==='write').slice(before).map(c=>Buffer.from(c.options.value));
  assert.deepEqual(packets.map(p=>p[0]),[0x63,0x64]);
  assert.ok(packets.every(p=>p.subarray(1,9).toString()==='abcd1234'));
  assert.equal(packets[0].subarray(9).toString(),'13501600');assert.equal(packets[1].subarray(9).toString(),'-0250');
  assert.equal(JSON.stringify(service.state.previewCommits),commits);
 }finally{await service.adapter.dispose();}
});
test('firmware mode reports update cached weighing state without sending a mode command',async()=>{
 const m=mock(),service=new MiniService(m.api);service.devices.set(device.id,device);await service.connect(device.id);const before=m.calls.filter(c=>c.name==='write').length;service.publish('status',{flags:1,coffee:{profile:2}});assert.equal(viewModel(service.state).profile,2);assert.equal(m.calls.filter(c=>c.name==='write').length,before);await service.disconnect();const saved=new KnownDeviceStore(m.api);assert.equal(saved.list()[0].lastWeighing.profile,2);assert.equal(viewModel(service.state).profile,2);await service.adapter.dispose();
});
test('last firmware survives disconnect and restart, including refreshed and OAD-read versions',async()=>{
  const m=mock(),service=new MiniService(m.api);await service.scan();await service.connect(device.id);
  assert.equal(service.state.knownDevices[0].firmware,'1.0.0-1234');
  m.values.set('2a26',Buffer.from('1.0.0-ea98'));await service.refresh();
  assert.equal(service.state.knownDevices[0].firmware,'1.0.0-ea98');
  service.actions.emit('ScanUpsert',[{id:device.id,firmware:'1.0.0-abcd'}]);
  for(const fn of m.events.connection)fn({deviceId:device.id,connected:false});
  assert.equal(viewModel(service.state).knownDeviceRows[0].firmware,'1.0.0-abcd');
  const saved=new KnownDeviceStore(m.api);assert.equal(saved.list()[0].firmware,'1.0.0-abcd');
  saved.remember({...device,firmware:'--'});assert.equal(saved.list()[0].firmware,'1.0.0-abcd');
  saved.saveFirmware(device,'');saved.saveFirmware({...device,name:'YD-031122334455'},'1.0.0-ffff');
  assert.equal(saved.list()[0].firmware,'1.0.0-abcd');
  saved.remove();saved.saveFirmware(device,'1.0.0-abcd');assert.deepEqual(new KnownDeviceStore(m.api).list(),[]);
  await service.adapter.dispose();
});
