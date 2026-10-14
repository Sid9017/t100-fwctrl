import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=await readFile('miniprogram/pairing/meal-sky/index.js','utf8');
function setup(){
 let definition,now=0,id=0;const frames=new Map(),rendered=[];
 runInNewContext(source,{Component:d=>definition=d,Date:{now:()=>now},require:p=>p.endsWith('runtime')?{}:p.endsWith('loader')?{setWasmPath(){}}:''});
 const component={...definition.methods,data:{meal:0,active:true},mounted:true,ready:true,position:0,canvas:{requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(n){frames.delete(n);}},rive:{seek:n=>rendered.push(n)}};
 const advance=ms=>{now+=ms;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());};
 return {component,frames,rendered,advance,definition};
}
test('meal landscape eases between snapped stops, stops rendering at rest and wraps in the short direction',()=>{
 const f=setup();f.component.moveTo(1);assert.equal(f.rendered.length,0);f.advance(310);assert.equal(f.rendered.at(-1),.5);f.advance(310);assert.equal(f.rendered.at(-1),1);assert.equal(f.frames.size,0);
 f.component.moveTo(0,true);f.component.moveTo(3);f.advance(310);assert.equal(f.rendered.at(-1),3.5);f.advance(310);assert.equal(f.rendered.at(-1),3);assert.equal(f.frames.size,0);
});
test('rapid retargets replace pending animation; hiding cancels frames and resumes at the selected stop',()=>{
 const f=setup();f.component.moveTo(1);f.advance(200);const previous=f.component.position;
 f.component.moveTo(2);assert.equal(f.frames.size,1);assert.equal(f.component.position,previous);
 f.definition.pageLifetimes.hide.call(f.component);assert.equal(f.frames.size,0);
 f.component.data.meal=2;f.definition.pageLifetimes.show.call(f.component);assert.equal(f.rendered.at(-1),2);assert.equal(f.frames.size,0);
});

test('canvas camera hit testing handles local touches and viewport tap coordinates',()=>{
 const {component}=setup();let captures=0;
 component.triggerEvent=name=>{assert.equal(name,'capture');captures++;};
 component.createSelectorQuery=()=>({select(){return this;},boundingClientRect(fn){fn({left:40,top:180,width:250,height:250});return this;},exec(){}});
 component.captureTap({changedTouches:[{x:125,y:125,clientX:165,clientY:305}]});
 component.captureTap({detail:{x:165,y:305}});assert.equal(captures,2);
 component.captureTap({changedTouches:[{x:10,y:10}]});component.captureTap({});assert.equal(captures,2);
 const point={x:125,y:125};
 component.captureStart({touches:[point]});component.captureEnd({changedTouches:[point]});assert.equal(captures,3);
 component.captureStart({touches:[point]});component.captureMove({touches:[{x:150,y:125}]});component.captureEnd({changedTouches:[point]});assert.equal(captures,3);
 component.captureStart({touches:[point]});component.captureCancel();component.captureEnd({changedTouches:[point]});assert.equal(captures,3);
 component.captureStart({touches:[point,point]});component.captureEnd({changedTouches:[point]});assert.equal(captures,3);
});
