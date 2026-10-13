import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserConsole} from '../src/web/console.js';
import wire from '../src/vendor/ble/core/fee0-container-weight-wire.js';
const id='12345678-1234-4321-8765-123456789abc';
const reading=(uuid=id,mg=100000)=>({version:3,profile:3,unit:0,value:0,mainValid:true,upper:{kind:1,valid:!!uuid,value:mg},containerUuid:uuid});
function fixture(read){const service=new BrowserConsole();const connection={active:true};service.connection=connection;service.entry={ui:{id:'test'}};service.session.readScaleReading=read;return {service,connection};}
test('UUID and weight must both match, including a valid zero container',async()=>{
  for(const mg of [0,100000]){let count=0;const {service,connection}=fixture(async()=>++count===1?reading('87654321-4321-4321-8765-123456789abc',mg):count===2?reading(id,mg+1):reading(id,mg));
    await service.confirmContainerSnapshot(connection,wire.buildContainerWeightPayload({grams:mg/1000,uuid:id}),{timeoutMs:100,pollMs:1});assert.equal(count,3);
  }
});
test('wrong UUID never succeeds and disconnect stops confirmation',async()=>{
  const {service,connection}=fixture(async()=>reading('87654321-4321-4321-8765-123456789abc'));
  await assert.rejects(service.confirmContainerSnapshot(connection,wire.buildContainerWeightPayload({grams:100,uuid:id}),{timeoutMs:3,pollMs:1}),/not confirmed/);
  connection.active=false;await assert.rejects(service.confirmContainerSnapshot(connection,wire.buildContainerWeightPayload({grams:100,uuid:id})),/disconnected/);
});
test('zero UUID off KCal does not confirm clear; active KCal missing container does',async()=>{
  let count=0;const {service,connection}=fixture(async()=>++count===1?{...reading(null,0),mainValid:false}:reading(null,0));
  await service.confirmContainerSnapshot(connection,wire.buildContainerWeightPayload({grams:null}),{timeoutMs:100,pollMs:1});assert.equal(count,2);
});
test('an older Read cannot restore a container after a newer Reset notification, including sequence wrap',async()=>{
  const cleared={...reading(null,0),sequence:0};
  const {service,connection}=fixture(async()=>{service.publishScaleReading(connection,service.entry,cleared);return {...reading(id),sequence:255};});
  const result=await service.readContainerSnapshot(connection);assert.equal(result.containerUuid,null);assert.equal(service.entry.ui.scaleReading.containerUuid,null);
});
test('a live Reset after more than half a sequence cycle is still accepted',()=>{
  const {service,connection}=fixture(async()=>reading(id));
  service.publishScaleReading(connection,service.entry,{...reading(id),sequence:1});
  service.publishScaleReading(connection,service.entry,{...reading(null,0),sequence:200});
  assert.equal(service.entry.ui.scaleReading.containerUuid,null);
});
