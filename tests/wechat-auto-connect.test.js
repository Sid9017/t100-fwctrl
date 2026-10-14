import test from 'node:test';
import assert from 'node:assert/strict';
import {AutoConnect} from '../src/miniprogram/auto-connect.js';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(auth=true){
 let listener,adapterListener,id=0;const timers=new Map(),calls=[];
 const row={id:'saved',name:'YD-03148c52fb00'};
 const service={state:{connected:false,knownDevices:[row],devices:[]},auth:{resolve:()=>auth?{}:null},onChange(fn){listener=fn;fn(this.state);return ()=>listener=null;},update(p){this.state={...this.state,...p};listener?.(this.state);},async scan(){calls.push('scan');this.update({scanning:true});},async stopScan(){calls.push('stop');this.update({scanning:false});},async connect(id){calls.push(id);this.update({connecting:true});await tick();this.update({connecting:false,connected:true,device:{id}});}};
 const api={onBluetoothAdapterStateChange:fn=>adapterListener=fn,offBluetoothAdapterStateChange:()=>adapterListener=null};
 const auto=new AutoConnect(service,{api,setTimer:fn=>{const n=++id;timers.set(n,fn);return n;},clearTimer:id=>timers.delete(id)});
 return {auto,service,calls,timers,adapter:s=>adapterListener(s)};
}
test('foreground reconnect uses only an authenticated saved identity and a fresh matching broadcast',async()=>{
 const f=fixture();await tick();assert.deepEqual(f.calls,[]);f.auto.show();await tick();assert.deepEqual(f.calls,['scan']);
 f.service.update({devices:[{id:'wrong',name:'YD-000000000001'},{id:'cached',name:'YD-03148c52fb00',cached:true}]});await tick();assert.equal(f.calls.length,1);
 f.service.update({devices:[{id:'new-os-id',name:'YD-03148c52fb00'}]});await tick();await tick();assert.deepEqual(f.calls,['scan','new-os-id']);assert.equal(f.service.state.connected,true);f.auto.dispose();
});
test('no saved auth means no scan, connection or automatic binding',async()=>{
 const f=fixture(false);f.auto.show();await tick();assert.deepEqual(f.calls,[]);f.auto.dispose();
});
test('Bluetooth availability and foreground lifecycle stop and restart discovery',async()=>{
 const f=fixture();f.auto.show();await tick();f.adapter({available:false});await tick();assert.equal(f.service.state.scanning,false);
 f.adapter({available:true});await tick();assert.equal(f.calls.filter(c=>c==='scan').length,2);
 f.auto.hide();await tick();f.service.update({devices:[{id:'near',name:'YD-03148c52fb00'}]});await tick();assert.equal(f.calls.includes('near'),false);
 f.auto.show();await tick();await tick();assert.equal(f.calls.includes('near'),true);f.auto.dispose();
});
test('scan cycles back off and active device operations prevent reconnection',async()=>{
 const f=fixture();f.auto.show();await tick();f.service.update({scanning:false});await tick();assert.equal(f.calls.filter(c=>c==='scan').length,1);assert.equal(f.timers.size,1);
 f.service.update({busy:true});await tick();assert.equal(f.timers.size,0);f.auto.hide();f.service.update({busy:false});await tick();assert.equal(f.calls.filter(c=>c==='scan').length,1);f.auto.dispose();
});
test('a failed connection backs off instead of retrying on every notification',async()=>{
 const f=fixture();f.service.connect=async()=>{f.calls.push('failed-connect');throw new Error('Out of range');};
 f.auto.show();await tick();f.service.update({devices:[{id:'near',name:'YD-03148c52fb00'}]});await tick();await tick();
 for(let i=0;i<4;i++)f.service.update({battery:i});await tick();
 assert.equal(f.calls.filter(c=>c==='failed-connect').length,1);assert.equal(f.timers.size,1);
 f.auto.hide();assert.equal(f.timers.size,0);f.auto.dispose();
});
test('an unexpected disconnect resumes discovery but removing the saved device stops it',async()=>{
 const f=fixture();f.service.update({connected:true});f.auto.show();await tick();assert.deepEqual(f.calls,[]);
 f.service.update({connected:false,devices:[]});await tick();assert.deepEqual(f.calls,['scan']);
 f.auto.hide();f.service.update({knownDevices:[],devices:[{id:'near',name:'YD-03148c52fb00'}]});f.auto.show();await tick();assert.equal(f.calls.includes('near'),false);f.auto.dispose();
});
