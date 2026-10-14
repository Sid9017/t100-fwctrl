import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

async function surface(){
  let definition;runInNewContext(await readFile('miniprogram/components/scroll-surface/index.js','utf8'),{Component:d=>definition=d,setTimeout,clearTimeout});
  const patches=[],s={...definition.methods,...definition,data:structuredClone(definition.data),mounted:true,setData(p,cb){Object.assign(this.data,p);patches.push(p);cb?.();}};
  return {s,patches,definition};
}
test('scroll ticks follow the real scroll range and clamp elastic overscroll at both ends',async()=>{
  const {s,patches}=await surface();s.viewportHeight=400;
  s.onScroll({detail:{scrollTop:0,scrollHeight:1200}});assert.equal(s.data.overflow,true);assert.equal(s.data.activeIndex,0);
  s.onScroll({detail:{scrollTop:400,scrollHeight:1200}});assert.equal(s.data.activeIndex,3);const count=patches.length;
  s.onScroll({detail:{scrollTop:410,scrollHeight:1200}});assert.equal(patches.length,count,'no redundant bridge updates within the same tick');
  s.onScroll({detail:{scrollTop:1000,scrollHeight:1200}});assert.equal(s.data.activeIndex,6);
  s.onScroll({detail:{scrollTop:-80,scrollHeight:1200}});assert.equal(s.data.activeIndex,0);
  s.onScroll({detail:{scrollTop:0,scrollHeight:400}});assert.equal(s.data.overflow,false);
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
