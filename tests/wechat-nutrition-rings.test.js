import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=await readFile('miniprogram/components/nutrition-rings/index.js','utf8');
function setup(){
 let definition;runInNewContext(source,{Component:d=>definition=d,Uint8Array,wx:{arrayBufferToBase64:b=>Buffer.from(b).toString('base64')}});
 const component={...definition.methods,data:structuredClone(definition.data),setData(p){Object.assign(this.data,p);},createSelectorQuery(){return {select(){return this;},boundingClientRect(fn){fn({left:10,top:20,width:150,height:150});return this;},exec(){}};}};
 component.updateNutrients(['carbs','protein','fat','fiber'].map((key,i)=>({key,total:i*10,goal:100,progress:i*10,partial:i===0})));
 return component;
}
const svg=ring=>Buffer.from(ring.source.split(',')[1],'base64').toString();
test('nutrition rings keep zero intake visibly selectable, wrap over-target arcs, and retain partial data',()=>{
 const c=setup();assert.equal(c.data.selected.key,'carbs');assert.equal(c.data.selected.partial,true);
 assert.match(svg(c.data.rings[0]),/data-start-marker="true"/);assert.doesNotMatch(svg(c.data.rings[0]),/<path /);assert.equal(c.data.rings[0].ratio,0);
 assert.match(svg(c.data.rings[1]),/data-progress-cap="true"/);
 c.selectNutrient('protein');c.updateNutrients([{key:'protein',total:140,goal:100,progress:140,partial:false}]);
 assert.equal(c.data.selectedKey,'protein');assert.equal(c.data.selected.total,140);assert.equal(c.data.selected.ratio,1.4);assert.equal(c.data.selected.excess,40);assert.match(svg(c.data.selected),/data-completed-lap="true"/);
});
test('ring taps choose the radial track even when another ring button overlaps its square',()=>{
 const c=setup();
 for(const [key,radius] of [['carbs',126],['protein',98],['fat',70],['fiber',42]]){
  c.selectRing({currentTarget:{dataset:{key:'fiber'}},detail:{x:85+radius/2,y:95}});assert.equal(c.data.selectedKey,key);
 }
 c.selectRing({currentTarget:{dataset:{key:'carbs'}},detail:{x:85,y:95}});assert.equal(c.data.selectedKey,'fiber');
 c.selectRing({currentTarget:{dataset:{key:'carbs'}},detail:{x:170,y:95}});assert.equal(c.data.selectedKey,'fiber');
 c.selectRing({currentTarget:{dataset:{key:'fat'}},detail:{}});assert.equal(c.data.selectedKey,'fat');
});
test('a late geometry result cannot overwrite the latest ring selection',()=>{
 const c=setup(),pending=[];c.createSelectorQuery=()=>({select(){return this;},boundingClientRect(fn){pending.push(fn);return this;},exec(){}});
 c.selectRing({currentTarget:{dataset:{key:'carbs'}},detail:{x:147,y:95}});
 c.selectRing({currentTarget:{dataset:{key:'fat'}},detail:{x:119,y:95}});
 pending[1]({left:10,top:20,width:150,height:150});pending[0]({left:10,top:20,width:150,height:150});assert.equal(c.data.selectedKey,'fat');
});

test('dragging out from the center selects each track and blocks the trailing tap',()=>{
 const c=setup();c.ringTouchStart({touches:[{clientX:85,clientY:95}]});assert.equal(c.data.selectedKey,'carbs');
 for(const [key,radius] of [['fiber',42],['fat',70],['protein',98],['carbs',126]]){
  c.ringTouchMove({touches:[{clientX:85+radius/2,clientY:95}]});assert.equal(c.data.selectedKey,key);
 }
 c.ringTouchEnd({changedTouches:[{clientX:120,clientY:95}]});assert.equal(c.data.selectedKey,'fat');assert.equal(c.ringGesture,null);
 c.selectRing({currentTarget:{dataset:{key:'fiber'}},detail:{}});assert.equal(c.data.selectedKey,'fat');
});
test('100%, 125%, and multiple laps retain their exact totals and zero goals never divide by zero',()=>{
 const c=setup();
 for(const total of [100,125,200,250]){
  c.updateNutrients([{key:'carbs',total,goal:100,progress:100}]);assert.equal(c.data.selected.percent,total);
  assert.equal(c.data.selected.excess,total-100);assert.match(svg(c.data.selected),/data-completed-lap="true"/);
  assert.match(svg(c.data.selected),/data-progress-cap="true"/);assert.doesNotMatch(svg(c.data.selected),/NaN|Infinity/);
 }
 c.updateNutrients([{key:'fiber',total:5,goal:0,progress:0}]);c.selectNutrient('fiber');assert.equal(c.data.selected.percent,null);assert.equal(c.data.selected.excess,5);assert.doesNotMatch(svg(c.data.selected),/NaN|Infinity/);
});

test('all ring layers share one center and adjacent tracks overlap without separator gaps',()=>{
 const c=setup();const tracks=c.data.rings.map(ring=>{
  const normal=svg(ring),expanded=Buffer.from(ring.expandedSource.split(',')[1],'base64').toString();
  for(const image of [normal,expanded]){
   assert.match(image,/viewBox="0 0 300 300"/);
   assert.match(image,/<circle cx="150" cy="150" r=/);
  }
  const track=normal.match(/<circle cx="150" cy="150" r="([\d.]+)" fill="none" stroke="#[\da-f]+" stroke-width="([\d.]+)"/);
  const radius=Number(track[1]),width=Number(track[2]);return {inner:radius-width/2,outer:radius+width/2};
 });
 for(let i=0;i<tracks.length-1;i++)assert.ok(tracks[i+1].outer>tracks[i].inner,'neighboring tracks must overlap to cover antialiasing seams');
});
