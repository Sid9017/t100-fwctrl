import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

async function component({intro=false,fail=false}={}){
  let definition;const events=[],timers=new Map();let timerId=0;let onFrame,paused=0,played=0,cleaned=0,unloaded=0;
  const controller={data:{connected:true},onLoad(){this.service={};},onUnload(){unloaded++;},openSettings(){this.setData({showSettings:true});}};
  class Rive {constructor(options){onFrame=options.onFrame;this.ready=fail?Promise.reject(new Error('No engine')):Promise.resolve();}play(){played++;}pause(){paused++;}cleanup(){cleaned++;}}
  runInNewContext(await readFile('miniprogram/pairing/device/index.js','utf8'),{
    Component:d=>definition=d,require:path=>path.includes('controller')?()=>controller:path.includes('runtime')?{RiveInstance:Rive}:path.includes('loader')?{setWasmPath(){}}:path.includes('frame')?{left:12,top:58,width:76,height:25}:'',
    wx:{base64ToArrayBuffer:()=>new ArrayBuffer(0),getWindowInfo:()=>({pixelRatio:2})},setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)
  });
  const c={...definition.methods,data:structuredClone(definition.data),properties:{intro,demo:true,active:true},setData(p,cb){Object.assign(this.data,p);cb?.();},triggerEvent:type=>events.push(type),createSelectorQuery(){const q={select:()=>q,fields:()=>q,exec:cb=>cb([{node:{},width:340,height:260}])};return q;}};
  definition.lifetimes.ready.call(c);await new Promise(r=>setImmediate(r));
  return {c,definition,events,timers,frame:dt=>onFrame(dt),counts:()=>({paused,played,cleaned,unloaded})};
}
test('inline Rive finishes on animation time, pauses in the background and yields to the live display',async()=>{
 const f=await component({intro:true});assert.equal(f.c.embedded,true);assert.deepEqual(f.events,['loaded']);assert.equal(f.c.data.animating,true);
 f.frame(1);assert.equal(f.timers.size,0);f.definition.pageLifetimes.hide.call(f.c);assert.equal(f.counts().paused,1);
 f.definition.pageLifetimes.show.call(f.c);assert.equal(f.counts().played,2);f.frame(1.71);f.timers.get(1)();f.timers.delete(1);assert.equal(f.c.data.compact,false);for(const fn of [...f.timers.values()])fn();
 assert.equal(f.c.data.animating,false);assert.equal(f.c.data.displayReady,true);assert.equal(f.counts().cleaned,1);
 f.c.openControls();assert.equal(f.c.data.showControls,true);f.c.openSettings();assert.equal(f.c.data.showControls,false);assert.equal(f.c.data.showSettings,true);
 f.definition.lifetimes.detached.call(f.c);assert.equal(f.counts().unloaded,1);
});
test('animation engine failure still exposes the live firmware display and controls',async()=>{
 const f=await component({intro:true,fail:true});assert.equal(f.c.data.displayReady,true);assert.equal(f.c.data.animating,false);
 f.c.openControls();assert.equal(f.c.data.showControls,true);f.definition.lifetimes.detached.call(f.c);
});
test('returning to Today skips replay and detached animation callbacks cannot change the page',async()=>{
 const f=await component();assert.equal(f.c.data.displayReady,true);assert.equal(f.counts().played,0);
 f.definition.lifetimes.detached.call(f.c);const count=f.events.length;f.c.finishIntro();assert.equal(f.events.length,count);
});
test('Rive pitch keeps paired indicators level; zoom starts only after the pitch ends',async()=>{
 const rml=await readFile('assets/pairing/scene.rml','utf8');
 const ids=[...rml.matchAll(/<Shape id="([^"]+)" name="Indicator"/g)].map(m=>m[1]);assert.equal(ids.length,2);
 function track(id,property){const obj=rml.match(new RegExp(`<KeyedObject objectId="${id}">([\\s\\S]*?)</KeyedObject>`))[1];const prop=obj.match(new RegExp(`<KeyedProperty property="${property}">([\\s\\S]*?)</KeyedProperty>`))[1];return [...prop.matchAll(/frame="(\d+)" value="([^"]+)"/g)].map(m=>[Number(m[1]),Number(m[2])]);}
 assert.deepEqual(track(ids[0],'y'),track(ids[1],'y'));
 const vertical=track(ids[0],'scaleY');assert.ok(Math.abs(vertical[0][1]-Math.SQRT1_2)<.000001,'starts at 45 degrees');assert.equal(vertical.at(-1)[1],1.06,'ends overhead at full screen height');
 const scale=track(ids[0],'scaleX');assert.ok(scale.filter(([f])=>f<=90).every(([,v])=>v===1));assert.equal(scale.at(-1)[1],1.06);
 const source=await readFile('miniprogram/pairing/assets/frame.js','utf8');const module={exports:{}};runInNewContext(source,{module});const frame=module.exports;
 assert.ok(frame.left>0&&frame.left+frame.width<100);assert.ok(frame.width*.8>59,'the WASM screen occupies over 59% of the preview width');
 assert.ok(Math.abs((frame.width*680)/(frame.height*520)-4)<.001,'display and Rive front window preserve the 320×80 aspect');
});
test('the tilted display stays inside the chassis at every interpolated animation frame',async()=>{
 const xml=await readFile('assets/pairing/scene.rml','utf8');
 const attrs=text=>Object.fromEntries([...text.matchAll(/(\w+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
 const tracks=new Map([...xml.matchAll(/<KeyedObject objectId="([^"]+)">([\s\S]*?)<\/KeyedObject>/g)].map(m=>[m[1],Object.fromEntries([...m[2].matchAll(/<KeyedProperty property="([^"]+)">([\s\S]*?)<\/KeyedProperty>/g)].map(p=>[p[1],[...p[2].matchAll(/<KeyFrameDouble ([^>]+)\/>/g)].map(k=>{const a=attrs(k[1]);return [Number(a.frame),Number(a.value)];})]))]));
 const path=name=>[...xml.match(new RegExp(`<Shape name="${name}"[^>]*>([\\s\\S]*?)</Shape>`))[1].matchAll(/<CubicDetachedVertex ([^>]+)\/>/g)].map(m=>attrs(m[1]));
 function interpolate(keys,t){const right=keys.findIndex(k=>k[0]>=t);if(right<=0)return keys[0][1];const a=keys[right-1],b=keys[right];return a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0]);}
 function polygon(vertices,t){const pts=vertices.map(v=>Object.fromEntries(Object.entries(v).filter(([k])=>k!=='id').map(([k,n])=>[k,tracks.get(v.id)?.[k]?interpolate(tracks.get(v.id)[k],t):Number(n)])));const out=[];
  for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],c=[a.x+Math.cos(a.outRotation)*a.outDistance,a.y+Math.sin(a.outRotation)*a.outDistance],d=[b.x+Math.cos(b.inRotation)*b.inDistance,b.y+Math.sin(b.inRotation)*b.inDistance];for(let j=0;j<20;j++){const u=j/20,v=1-u;out.push([v**3*a.x+3*v*v*u*c[0]+3*v*u*u*d[0]+u**3*b.x,v**3*a.y+3*v*v*u*c[1]+3*v*u*u*d[1]+u**3*b.y]);}}return out;}
 function inside(p,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
 const panel=path('Display window'),body=path('Top outline');
 for(let frame=0;frame<=162;frame++){const shell=polygon(body,frame);assert.ok(polygon(panel,frame).every(point=>inside(point,shell)),`display intersects chassis at frame ${frame}`);}
});
