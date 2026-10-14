import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {wxCall} from '../src/miniprogram/platform.js';
import {decodeProvisioningBarcode} from '../src/miniprogram/provisioning.js';

async function fixture({devtools=false,bridgeOnly=false,result='YD-03148c52fb00',cancel=false}={}) {
  const requests=[];let scans=0;
  const module={exports:{}},wx={scanCode(options){requests.push(options);cancel?options.fail({errMsg:'scanCode:fail cancel'}):options.success({result});}};
  runInNewContext(await readFile('miniprogram/pages/shared/device-controller.js','utf8'),{
    module,wx,getApp:()=>({isDevtools:devtools}),
    require:path=>path.includes('utils')?{}:{wxCall,decodeProvisioningBarcode,foodItems:[]},
  });
  const definition=module.exports(0),page={...definition,data:{...definition.data,bridgeOnly,showAddDevice:true},
    setData(patch){Object.assign(this.data,patch);},
    service:{state:{knownDevices:[]},async scan(){scans++;}},
  };
  return {page,requests,scans:()=>scans};
}

test('Devtools barcode picker accepts local images with or without an active BLE bridge',async()=>{
  for(const bridgeOnly of [false,true]) {
    const f=await fixture({devtools:true,bridgeOnly});await f.page.scanBarcode();
    assert.equal(f.requests.length,1);assert.equal(f.requests[0].onlyFromCamera,false);
    assert.equal(f.page.data.scanTarget,'YD-03148c52fb00');assert.equal(f.page.data.showScanner,true);
    assert.equal(f.scans(),1);assert.equal(f.page.data.error,'');
  }
});

test('phone barcode addition keeps camera-only scanning',async()=>{
  const f=await fixture();await f.page.scanBarcode();
  assert.equal(f.requests[0].onlyFromCamera,true);assert.equal(f.scans(),1);
});

test('cancelled or invalid barcode images never start device discovery',async()=>{
  const cancelled=await fixture({devtools:true,cancel:true});await cancelled.page.scanBarcode();
  assert.equal(cancelled.scans(),0);assert.equal(cancelled.page.data.error,'');
  const invalid=await fixture({devtools:true,result:'invalid'});await invalid.page.scanBarcode();
  assert.equal(invalid.scans(),0);assert.ok(invalid.page.data.error);assert.equal(invalid.page.data.showScanner,false);
});
