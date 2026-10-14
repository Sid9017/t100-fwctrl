import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesktopBleApi} from '../src/miniprogram/desktop-ble.js';
import {WechatGattAdapter} from '../src/miniprogram/gatt.js';
const config={url:'http://127.0.0.1:8768/rpc',token:'development-test-token-not-real-0123456789'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const calls=[],polls=[];
  const wx={getDeviceInfo:()=>({platform:'devtools'}),request(o){calls.push(o);if(o.data.method==='events'){polls.push(o);return;}
    const result=o.data.method==='hello'?{cursor:0}:o.data.method==='getBLEMTU'?{mtu:185}:{};
    queueMicrotask(()=>o.success({statusCode:200,data:{ok:true,result}}));
  }};
  const api=createDesktopBleApi(wx,config);
  return {api,wx,calls,polls,publish(events){polls.shift().success({statusCode:200,data:{ok:true,result:{events}}});}};
}
test('desktop bridge is restricted to Devtools and the fixed loopback endpoint',()=>{
  assert.throws(()=>createDesktopBleApi({getDeviceInfo:()=>({platform:'ios'})},config),/only available/);
  assert.throws(()=>createDesktopBleApi({getDeviceInfo:()=>({platform:'devtools'})},{...config,url:'https://example.com'}),/Invalid/);
});
test('bridge advertisements are real scan events and preserve binary manufacturer data',async()=>{
  const f=fixture(),adapter=new WechatGattAdapter(f.api),found=[];
  await adapter.startScan({},d=>found.push(d));
  f.publish([{seq:1,event:'BluetoothDeviceFound',data:{devices:[{deviceId:'mac-uuid',name:'YD-03148c52fb00',RSSI:-46,advertisData:[0,96,80,2,1,1]}]}}]);await tick();
  assert.equal(adapter.bridgeOnly,false);assert.equal(found[0].cached,false);assert.equal(found[0].shellId,1);
  assert.equal(f.calls[0].header.Authorization,`Bearer ${config.token}`);
  await adapter.dispose();f.publish([]);await tick();
});
test('desktop bridge preserves GATT binary IO and propagates lost connections',async()=>{
  const f=fixture(),adapter=new WechatGattAdapter(f.api);
  const c=await adapter.connect({id:'mac-uuid',name:'YD-03148c52fb00'}),ch={uuid:'fee5',serviceUuid:'fee0'};
  assert.equal(c.mtu,185);
  const read=adapter.readCharacteristic(c,ch);await tick();
  f.publish([{seq:1,event:'BLEConnectionStateChange',data:{deviceId:'mac-uuid',connected:true}},
    {seq:2,event:'BLECharacteristicValueChange',data:{deviceId:'mac-uuid',serviceId:'fee0',characteristicId:'fee5',value:[0,128,255]}}]);
  assert.deepEqual([...await read],[0,128,255]);
  await adapter.writeCharacteristic(c,ch,new Uint8Array([0,128,255]),'withoutResponse');
  const sent=f.calls.find(o=>o.data.method==='writeBLECharacteristicValue');assert.deepEqual(sent.data.options.value,[0,128,255]);assert.equal(sent.data.options.writeType,'writeNoResponse');
  const warn=console.warn;console.warn=()=>{};
  try{f.polls.shift().fail({errMsg:'disconnected'});await tick();}finally{console.warn=warn;}
  assert.equal(c.active,false);assert.equal(adapter.connections.size,0);
  await adapter.dispose();if(f.polls.length)f.publish([]);await tick();
});
