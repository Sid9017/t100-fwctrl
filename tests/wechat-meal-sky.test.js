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

test('Rive snapshots are throttled, final frames flush, and export errors fall back safely',()=>{
 const f=setup(),c=f.component;let exports=0;const events=[];
 c.data.frameSource='';c.setData=p=>Object.assign(c.data,p);c.triggerEvent=e=>events.push(e);
 const canvas={toDataURL(){exports++;return 'data:image/png;base64,frame'+exports;}};
 c.publishFrame(canvas);assert.equal(exports,1);c.publishFrame(canvas);assert.equal(exports,1);
 f.advance(40);c.publishFrame(canvas);assert.equal(exports,2);
 c.forceFrame=true;c.publishFrame(canvas);assert.equal(exports,3);
 canvas.toDataURL=()=>{throw Error('unsupported');};c.publishFrame(canvas);assert.equal(c.data.frameSource,'');assert.deepEqual(events,['unavailable']);
});
