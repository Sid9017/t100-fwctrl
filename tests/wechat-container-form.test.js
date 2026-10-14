import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const module={exports:{}};
runInNewContext(await readFile('miniprogram/pages/shared/device-controller.js','utf8'),{
 module,require:()=>({}),getApp:()=>({journalFor:()=>({data:{containers:[]}})})
});
const controller=module.exports(0);
function open(reading){
 const page={data:{reading,form:{container:'999'}},setData(patch){for(const [key,value] of Object.entries(patch)){if(key==='form.container')this.data.form.container=value;else this.data[key]=value;}}};
 controller.openContainers.call(page);return page;
}
test('opening container settings snapshots the current weight in grams, including ounce readings',()=>{
 const page=open({version:3,mainValid:true,unit:0,value:350000});assert.equal(page.data.form.container,'350.0');assert.equal(page.data.showContainers,true);
 page.data.form.container='240';page.data.reading.value=420000;assert.equal(page.data.form.container,'240');
 controller.openContainers.call(page);assert.equal(page.data.form.container,'420.0');
 assert.equal(open({version:3,mainValid:true,unit:1,value:100}).data.form.container,'28.3');
});
test('invalid or overloaded readings leave the container field empty instead of reusing a stale value',()=>{
 for(const reading of [null,{version:3,mainValid:false,value:350000},{version:3,mainValid:true,value:350000,overload:true},{version:3,mainValid:true,value:NaN}])assert.equal(open(reading).data.form.container,'');
 assert.equal(open({version:3,mainValid:true,unit:0,value:0}).data.form.container,'0.0');
});
