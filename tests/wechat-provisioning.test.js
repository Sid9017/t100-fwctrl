import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeProvisioningBarcode,nativeProduct} from '../src/miniprogram/provisioning.js';
import {KnownDeviceStore} from '../src/miniprogram/device-store.js';
import {viewModel} from '../src/miniprogram/view-model.js';
import {WechatGattAdapter} from '../src/miniprogram/gatt.js';
const alphabet='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#';
function firmwareEncode(hex,shell,version=1){const pub=Buffer.from(hex,'hex');let bits=BigInt(pub[0]&1)<<40n;for(let i=1;i<=5;i++)bits|=BigInt(pub[i])<<BigInt(8*(5-i));let n=(BigInt(version)<<49n)|(bits<<8n)|BigInt(shell),text='';for(let i=0;i<9;i++){text=alphabet[Number(n%85n)]+text;n/=85n;}return text;}
test('nine-character Code128 Base85 exactly restores firmware public-key identity and shell',()=>{
 for(const hex of ['03148c52fb00','02fffffffffe','03fffffffffe','020000000000','030000000001'])for(const shell of [0,1,255]){const decoded=decodeProvisioningBarcode(firmwareEncode(hex,shell));assert.equal(decoded.name,'YD-'+hex);assert.equal(decoded.shellId,shell);assert.equal(decoded.schema,1);}
 assert.equal(decodeProvisioningBarcode('YD-03148C52FB00 / 0a').name,'YD-03148c52fb00');
});
test('invalid, overflowing and unsupported-schema device codes cannot start matching',()=>{
 for(const value of ['bad','12345678 ','#########','         ','YD-ffffffffff00',firmwareEncode('03148c52fb00',1,2)])assert.throws(()=>decodeProvisioningBarcode(value));
});
test('manufacturer filtering recognises current product and shell fields in raw and AD forms',()=>{
 const bytes=Uint8Array.from([0,0x60,0x50,2,1,0x0a]);assert.deepEqual(nativeProduct(bytes.buffer),{version:2,productId:1,shellId:10});assert.deepEqual(nativeProduct(Uint8Array.from([7,0xff,...bytes])),{version:2,productId:1,shellId:10});assert.equal(nativeProduct(Uint8Array.from([4,0,0,0])),null);
});
test('one-device store rejects replacement until removed and can refresh the OS device ID',()=>{
 const cache=new Map(),api={getStorageSync:k=>cache.get(k),setStorageSync:(k,v)=>cache.set(k,v)},store=new KnownDeviceStore(api);store.remember({id:'A',name:'YD-03148c52fb00'},1);assert.throws(()=>store.remember({id:'B',name:'YD-02ffffffff00'},2),/Remove/);assert.equal(store.list().length,1);store.remember({id:'A2',name:'YD-03148c52fb00'},3);assert.equal(store.list()[0].id,'A2');store.remove();store.remember({id:'B',name:'YD-02ffffffff00'},4);assert.equal(store.list().length,1);
});
test('nearby picker excludes saved identities even when the platform ID changes',()=>{
 const vm=viewModel({knownDevices:[{id:'old',name:'YD-03148c52fb00',lastConnectedAt:1}],nearbyDevices:[{id:'new',name:'YD-03148c52fb00',cached:false}],devices:[{id:'new',name:'YD-03148c52fb00',cached:false},{id:'other',name:'YD-02ffffffff00',cached:false}],battery:null,mtu:null});assert.equal(vm.newNearbyDevices.length,1);assert.equal(vm.knownDeviceRows[0].id,'new');assert.equal(vm.knownDeviceRows[0].available,true);
});
test('native BLE scan rejects a peer product despite its YD name',async()=>{
 const events=new Set(),api={onBLECharacteristicValueChange(){},onBLEConnectionStateChange(){},onBluetoothDeviceFound:fn=>events.add(fn),offBluetoothDeviceFound:fn=>events.delete(fn),getDeviceInfo:()=>({platform:'ios'}),openBluetoothAdapter:o=>o.success({}),startBluetoothDevicesDiscovery:o=>{o.success({});for(const fn of events)fn({devices:[{deviceId:'peer',name:'YD-03148c52fb00',advertisData:Uint8Array.from([0,0x60,0x50,2,0,1]).buffer},{deviceId:'scale',name:'YD-02ffffffff00',advertisData:Uint8Array.from([0,0x60,0x50,2,1,2]).buffer}]});},stopBluetoothDevicesDiscovery:o=>o.success({})};const adapter=new WechatGattAdapter(api),found=[];await adapter.startScan({},d=>found.push(d));assert.deepEqual(found.map(d=>d.id),['scale']);assert.equal(found[0].shellId,2);await adapter.stopScan();
});
test('last confirmed weighing mode survives restart and can update without a BLE write',()=>{
 const cache=new Map(),api={getStorageSync:k=>cache.get(k),setStorageSync:(k,v)=>cache.set(k,v)},store=new KnownDeviceStore(api);store.remember({id:'A',name:'YD-03148c52fb00'},1);store.saveWeighing({profile:0,unit:1,stage:0,valueText:'3.53',updatedAt:2});const restored=new KnownDeviceStore(api);assert.equal(restored.list()[0].lastWeighing.profile,0);assert.equal(viewModel({knownDevices:restored.list(),battery:null,mtu:null}).profile,0);store.remove();assert.equal(store.list().length,0);
});
