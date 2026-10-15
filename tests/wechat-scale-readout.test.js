import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
async function fixture(properties={}){
 let definition;runInNewContext(await readFile('miniprogram/components/scale-readout/index.js','utf8'),{Component:d=>definition=d});
 const events=[],c={...definition.methods,properties:{value:0,total:0,totalValid:false,container:null,unit:0,overload:false,...properties},data:structuredClone(definition.data),setData(p){Object.assign(this.data,p);},triggerEvent(name,detail){events.push({name,detail});}};c.renderValues();return {c,events};
}
test('firmware readout keeps selected container separate from live gross and preserves signed net',async()=>{
 const {c}=await fixture({value:362,total:482,totalValid:true,container:{id:'plate',grams:120}});
 assert.equal(c.data.text,'362.0');assert.equal(c.data.containerText,'120.0');assert.equal(c.data.totalText,'482.0');
 c.properties.value=-12;c.renderValues();assert.equal(c.data.text,'-12.0');
 c.properties.totalValid=false;c.renderValues();assert.equal(c.data.totalText,'108.0');
 c.properties.container=null;c.renderValues();assert.equal(c.data.containerText,'CNTR');assert.equal(c.data.totalText,'TOTAL');
});
test('oz input converts to canonical grams and incoming updates do not interrupt editing',async()=>{
 const {c,events}=await fixture({value:28.349523125,unit:1});assert.equal(c.data.text,'1.00');
 c.startEdit();c.input({detail:{value:'2.50'}});assert.equal(events[0].name,'editstart');assert.equal(events[1].detail.value,70.8738078125);
 c.properties.unit=0;c.properties.value=70.8738078125;c.renderValues();assert.equal(c.data.text,'2.50');assert.equal(c.data.digits.map(d=>d.char).join(''),'2.50');assert.equal(c.data.unitText,'oz');
 c.endEdit();assert.equal(c.data.text,'70.9');assert.equal(c.data.unitText,'g');
 c.startEdit();c.input({detail:{value:'12.'}});assert.equal(c.data.digits.map(d=>d.char).join(''),'12.');c.properties.value=12;c.renderValues();assert.equal(c.data.digits.map(d=>d.char).join(''),'12.');
 c.input({detail:{value:''}});assert.equal(events.at(-1).detail.value,'');assert.equal(c.data.digits.length,0);
});
test('gram rounding and large editable values fit the fixed capsule',async()=>{
 const {c}=await fixture({value:12.35});assert.equal(c.data.text,'12.4');c.properties.value=99999.9;c.renderValues();assert.ok(c.data.digitScale<1);assert.equal(c.data.text,'99999.9');
});

test('offline and manual totals use net plus selected container, including edits in oz',async()=>{
 const {c}=await fixture({value:765.1});
 c.properties.container={id:'bowl',grams:123};c.renderValues();
 assert.equal(c.data.containerText,'123.0');assert.equal(c.data.totalText,'888.1');
 c.properties.totalValid=true;c.properties.total=900;c.renderValues();assert.equal(c.data.totalText,'900.0');
 c.startEdit();c.input({detail:{value:'100'}});assert.equal(c.data.totalText,'223.0');
 c.properties.unit=1;c.properties.value=28.349523125;c.properties.totalValid=false;c.endEdit();
 c.startEdit();c.input({detail:{value:'2.00'}});assert.equal(c.data.totalText,'6.34');
 c.properties.container=null;c.renderValues();assert.equal(c.data.totalText,'TOTAL');
});
