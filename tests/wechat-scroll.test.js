import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

async function surface(clock={setTimeout,clearTimeout}){
  let definition;runInNewContext(await readFile('miniprogram/components/scroll-surface/index.js','utf8'),{Component:d=>definition=d,...clock});
  const patches=[],s={...definition.methods,...definition,data:structuredClone(definition.data),mounted:true,properties:{snapEdges:false,snapPaused:false},setData(p,cb){Object.assign(this.data,p);patches.push(p);cb?.();}};
  return {s,patches,definition};
}
test('native scrolling tracks position and range without indicator bridge updates',async()=>{
  const {s,patches}=await surface();s.viewportHeight=400;
  for(const top of [0,400,410,1000,-80]){
    s.onScroll({detail:{scrollTop:top,scrollHeight:1200}});
    assert.equal(s.lastTop,top);assert.equal(s.contentHeight,1200);
  }
  assert.equal(patches.length,0);
});
test('changing wizard steps resets native scroll position and detached surfaces ignore pending measurements',async()=>{
  const {s,patches,definition}=await surface();s.lastTop=280;s.queueMeasure=()=>{};definition.observers.resetKey.call(s);assert.deepEqual(patches.map(p=>p.scrollTop),[280,0]);
  let callback;s.createSelectorQuery=()=>({select(){return this;},boundingClientRect(){return this;},exec(fn){callback=fn;}});s.measure();s.mounted=false;const count=patches.length;callback([{height:300},{height:900}]);assert.equal(patches.length,count);
});
test('all routes disable native page scroll and every inner scroll-view hides its scrollbar',async()=>{
  const app=JSON.parse(await readFile('miniprogram/app.json','utf8'));
  for(const path of [...app.pages,...app.subpackages.flatMap(p=>p.pages.map(name=>p.root+'/'+name))]){
    const config=JSON.parse(await readFile('miniprogram/'+path+'.json','utf8'));assert.equal(config.disableScroll,true,path);
    const source=await readFile('miniprogram/'+path+'.wxml','utf8');assert.ok(!source.includes('<scroll-view'),path);
  }
  const template=await readFile('miniprogram/components/scroll-surface/index.wxml','utf8');assert.match(template,/enhanced show-scrollbar="\{\{false\}\}"/);
});

function fakeClock(){let time=0,id=0;const tasks=new Map();return {setTimeout(fn,ms){tasks.set(++id,{at:time+ms,fn});return id;},clearTimeout(id){tasks.delete(id);},advance(ms){const end=time+ms;while(true){const next=[...tasks].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;tasks.delete(next[0]);next[1].fn();}time=end;}};}
test('report scrolling settles at the nearest page edge only after touch and momentum stop',async()=>{
  const clock=fakeClock(),{s}=await surface(clock);s.properties.snapEdges=true;s.viewportHeight=400;
  s.onTouchStart();s.onScroll({detail:{scrollTop:300,scrollHeight:1400}});clock.advance(1000);assert.equal(s.data.scrollTop,0);
  s.onTouchEnd();clock.advance(100);s.onScroll({detail:{scrollTop:420,scrollHeight:1400}});clock.advance(179);assert.equal(s.snapping,false);
  clock.advance(1);assert.equal(s.data.scrollTop,0);assert.equal(s.data.animateScroll,true);
  s.onScroll({detail:{scrollTop:0,scrollHeight:1400}});clock.advance(680);assert.equal(s.snapping,false);
  s.onScroll({detail:{scrollTop:650,scrollHeight:1400}});clock.advance(180);assert.equal(s.data.scrollTop,1000);
  s.onScroll({detail:{scrollTop:1000,scrollHeight:1400}});clock.advance(680);assert.equal(s.lastTop,1000);assert.equal(s.snapping,false);
});
test('snap yields to another gesture, report transitions and page lifecycle',async()=>{
  const clock=fakeClock(),{s,definition,patches}=await surface(clock);s.properties.snapEdges=true;s.viewportHeight=400;
  s.onScroll({detail:{scrollTop:600,scrollHeight:1400}});clock.advance(180);assert.equal(s.snapping,true);
  s.onScroll({detail:{scrollTop:700,scrollHeight:1400}});s.onTouchStart();assert.equal(s.data.animateScroll,false);assert.equal(s.data.scrollTop,700);
  s.properties.snapPaused=true;definition.observers.snapPaused.call(s,true);s.onTouchEnd();clock.advance(1000);assert.equal(s.snapping,false);
  s.properties.snapPaused=false;s.onScroll({detail:{scrollTop:700,scrollHeight:1400}});definition.pageLifetimes.hide.call(s);const count=patches.length;clock.advance(1000);assert.equal(patches.length,count);
});
