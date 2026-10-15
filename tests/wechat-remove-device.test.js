import test from 'node:test';
import assert from 'node:assert/strict';
import {MiniService} from '../src/miniprogram/service.js';
import {KnownDeviceStore} from '../src/miniprogram/device-store.js';
import {JournalStore} from '../src/miniprogram/journal.js';
import {runInNewContext} from 'node:vm';
import {readFile} from 'node:fs/promises';
const device={id:'A',name:'YD-03148c52fb00'};
function fixture(connected=false){
 const storage=new Map(),writes=[];
 const api={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v)};
 const journal=new JournalStore(api),adapter={stopScan:async()=>{},disconnect:async c=>{c.active=false;}};
 for(const method of ['waitReady','startScan','connect','discoverServices','discoverCharacteristics','readCharacteristic','writeCharacteristic','subscribe','unsubscribe'])adapter[method]=async()=>{};
 const service=new MiniService(api,{adapter,journal});
 service.auth.save({pub_key:'03148c52fb00'+'0'.repeat(54),auth_key:'12345678',deviceId:'old-id',name:device.name});
 service.deviceStore.remember(device);service.deviceStore.saveWeighing({profile:3,unit:0,updatedAt:Date.now()});
 journal.data.records=[{id:'meal',name:'Lunch',sync:{A:'sent',other:'sent'}}];journal.data.deletions=[{id:'old-meal',deviceId:'A'},{id:'other-meal',deviceId:'other'}];
 service.update({knownDevices:service.deviceStore.list(),connected,device:connected?device:null,lastWeighingState:{profile:3},hasAuth:connected});
 if(connected){service.connection={active:true,discovery:{characteristics:[]}};service.actions.connection=service.connection;service.actions.entry={device,ui:{}};}
 service.session.clearVendorDownlinkCache=()=>{};
 service.session.writeVendorPayload=async(c,bytes)=>{
  assert.equal(service.auth.records().length,0,'credential must be removed before transmission');
  assert.deepEqual(service.deviceStore.list(),[]);assert.equal(service.state.lastWeighingState,null);
  assert.equal(Buffer.from(bytes).includes(Buffer.from('12345678')),true,'reset retains authentication in its prepared wire bytes');
  writes.push(bytes);
 };
 service.actions.waitForResetDisconnect=async()=>{await service.disconnect();return 'Restarted';};
 return {service,journal,writes,storage};
}
test('offline Remove clears credentials and device cache without a BLE write, preserving journal',async()=>{
 const {service,journal,writes,storage}=fixture();await service.removeDevice();
 assert.equal(service.auth.records().length,0);assert.deepEqual(service.deviceStore.list(),[]);assert.deepEqual(writes,[]);
 assert.equal(service.state.lastWeighingState,null);assert.equal(journal.data.records[0].name,'Lunch');assert.deepEqual(journal.data.records[0].sync,{other:'sent'});assert.equal(journal.data.deletions.length,1);
 assert.deepEqual(new KnownDeviceStore({getStorageSync:k=>storage.get(k)}).list(),[]);
});
test('online Reset removes local data before sending the authenticated reset',async()=>{
 const {service,writes}=fixture(true);await service.removeDevice({reset:true});assert.equal(writes.length,1);assert.equal(service.state.connected,false);assert.equal(service.removing,false);
});
test('removal publishes the unbound state before reset finishes, retaining transport for reset',async()=>{
 const {service}=fixture(true);let release,cleared=false;
 service.actions.waitForResetDisconnect=()=>new Promise(resolve=>release=resolve);
 const pending=service.removeDevice({reset:true,onCleared:()=>{
  cleared=true;assert.equal(service.state.connected,false);assert.equal(service.state.device,null);
  assert.deepEqual(service.state.knownDevices,[]);assert.equal(service.state.firmware,'--');
  assert.equal(service.connection.active,true,'the reset still needs the transport');
 }});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(cleared,true);assert.ok(release);
 release('Restarted');await pending;assert.equal(service.connection,null);
});
test('failed reset does not restore deleted credentials and releases the connection',async()=>{
 const {service}=fixture(true);service.session.writeVendorPayload=async()=>{throw new Error('Write failed');};
 await assert.rejects(service.removeDevice({reset:true}),/Write failed/);assert.equal(service.auth.records().length,0);assert.deepEqual(service.state.knownDevices,[]);assert.equal(service.state.connected,false);assert.equal(service.removing,false);
});
test('missing auth prevents reset cleanup and competing actions prevent removal',async()=>{
 const {service}=fixture(true);service.auth.write([]);await assert.rejects(service.removeDevice({reset:true}),/No browser auth/);assert.equal(service.deviceStore.list().length,1);
 service.update({planSyncing:true});await assert.rejects(service.removeDevice(),/Wait for/);assert.equal(service.deviceStore.list().length,1);
});
test('device page confirms Reset online and Remove offline and guards connection changes',async()=>{
 for(const connected of [false,true]){
  let page,modal,args,route;const app={pendingPairingIntro:true};const service={state:{connected,device:connected?device:null,knownDevices:[device]},removeDevice:async a=>args=a};
  runInNewContext(await readFile('miniprogram/pages/devices/index.js','utf8'),{require:()=>()=>({data:{}}),Page:p=>page=p,getApp:()=>app,wx:{reLaunch:o=>route=o.url,showModal:o=>{modal=o;o.success({confirm:true});}}});
  const ctx={data:{},service,run:fn=>fn(),setData:()=>{}};await page.resetDevice.call(ctx);
  assert.equal(modal.confirmText,connected?'Reset':'Remove');assert.equal(args.reset,connected);assert.equal(route,'/pages/index/index');assert.equal(app.pendingPairingIntro,false);
  args=null;ctx.run=fn=>{service.state.connected=!connected;return fn();};await assert.rejects(page.resetDevice.call(ctx),/Connection changed/);assert.equal(args,null);
 }
});
