import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {brotliDecompressSync} from 'node:zlib';
const require=createRequire(import.meta.url);
const {connectionState,pairingBounds,DURATION,ICON_BOUNDS}=require('../miniprogram/pairing/scalebot/state.js');
test('connection indicator follows transport and sync operations, not cached binding',()=>{
 assert.equal(connectionState({knownDevices:[{id:'saved'}]}),'Disconnected');
 assert.equal(connectionState({connecting:true}),'Connecting');
 assert.equal(connectionState({connected:true,adding:true,busy:true}),'Connecting');
 assert.equal(connectionState({connected:true}),'Connected');
 for(const field of ['busy','actionName','planSyncing'])assert.equal(connectionState({connected:true,[field]:true}),'Syncing');
 assert.equal(connectionState({connected:false,planSyncing:true}),'Disconnected');
});
test('pairing endpoint exactly overlays the real header on different viewport sizes and safe-area offsets',()=>{
 for(const [width,height,offset] of [[320,568,0],[390,744,88],[430,820,96]]){
  const anchor={left:20*width/375,top:30+offset,width:20*width/375,height:20*width/375};
  const viewport={left:0,top:offset,width,height},b=pairingBounds(anchor,viewport),scale=width/(b.maxX-b.minX);
  assert.ok(Math.abs((34-b.minX)*scale+viewport.left-(anchor.left+anchor.width/2))<1e-8);
  assert.ok(Math.abs((40-b.minY)*scale+viewport.top-(anchor.top+anchor.height/2))<1e-8);
  assert.ok(Math.abs(20*scale-anchor.width)<1e-8);
 }
});
function component(){
 let definition,listener;const timers=[],events=[],rives=[];let serviceState={connected:false};
 const service={onChange(fn){listener=fn;fn(serviceState);return ()=>{};}};
 class Rive {constructor(opts){this.opts=opts;this.ready=Promise.resolve();this.playing=false;rives.push(this);}seek(t){this.time=t;}setAnimation(n){this.animation=n;}play(){this.playing=true;}pause(){this.playing=false;}cleanup(){this.cleaned=true;this.playing=false;}}
 runInNewContext(readFileSync('miniprogram/pairing/scalebot/index.js','utf8'),{Component:d=>definition=d,require:p=>p.endsWith('/runtime')?{RiveInstance:Rive}:p.endsWith('/loader')?{setWasmPath(){}}:p==='./state'?{DURATION,ICON_BOUNDS,connectionState,pairingBounds}:'AA==',getApp:()=>({service}),wx:{base64ToArrayBuffer:()=>new ArrayBuffer(1),getWindowInfo:()=>({pixelRatio:2}),nextTick:fn=>fn()},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}});
 const c={...definition.methods,data:structuredClone(definition.data),properties:{active:true,intro:false},mounted:true,query:async s=>s==='#anchor'?{left:20,top:40,width:20,height:20}:{node:{},left:0,top:0,width:390,height:720},setData(p,cb){Object.assign(this.data,p);cb?.();},triggerEvent(name){events.push(name);this.properties.intro=false;}};
 return {c,definition,rives,events,timers,emit:s=>{serviceState=s;listener(s);}};
}
test('fullscreen pairing finishes over the existing page, hidden playback pauses, and repeat status changes do not replay it',async()=>{
 const {c,rives,events,emit,timers}=component();c.subscribe();await c.setupIndicator();
 c.properties.intro=true;c.startPairing();await new Promise(r=>setImmediate(r));const intro=rives.at(-1);
 assert.equal(c.data.pairing,true);assert.equal(intro.playing,true);
 c.hidden=true;c.updatePlayback();assert.equal(intro.playing,false);c.hidden=false;c.updatePlayback();
 intro.opts.onFrame(2);assert.equal(c.data.revealing,true);intro.opts.onFrame(1);timers.shift()();
 assert.deepEqual(events,['finished']);assert.equal(c.data.pairing,false);assert.equal(intro.cleaned,true);
 emit({connected:true});assert.equal(c.data.celebrating,true);const count=rives.length;
 c.setData({celebrating:false});emit({connected:true,planSyncing:true});assert.equal(c.indicator.animation,'Syncing');emit({connected:true});assert.equal(c.data.celebrating,false);assert.equal(rives.length,count);assert.equal(c.data.pairing,false);
 emit({connected:false});emit({connected:true});assert.equal(c.data.celebrating,true);
});
test('Rive initialization failure releases the fullscreen cover',async()=>{
 const {c,events}=component();c.query=async()=>null;c.startPairing();await new Promise(r=>setImmediate(r));assert.equal(c.data.pairing,false);assert.deepEqual(events,['finished']);
});
test('home plays once for a completed add flow and never for ordinary reconnection',()=>{
 let definition,listener;const app={isDevtools:false,service:{onChange(fn){listener=fn;fn({connected:true,knownDevices:[{}]});return ()=>{};}}};
 const journal={data:{profile:{target:1800}},summary:()=>({records:[]})};
 const utils={ensurePlan:()=>true,isPreview:()=>false,store:()=>journal,currentTheme:()=>3,recordRows:()=>[]};
 runInNewContext(readFileSync('miniprogram/pages/index/index.js','utf8'),{Page:d=>definition=d,require:p=>p.includes('utils')?utils:{dayKey:()=> '2026-10-15'},getApp:()=>app});
 const p={...definition,data:structuredClone(definition.data),setData(patch){Object.assign(this.data,patch);}};p.onLoad({intro:'1'});p.onShow();assert.equal(p.data.playIntro,false);
 listener({connected:false,knownDevices:[{}]});listener({connected:true,knownDevices:[{}]});assert.equal(p.data.playIntro,false);
 p.setupIntroPending=true;p.deviceAdded();assert.equal(p.data.playIntro,true);p.pairingFinished();p.deviceAdded();assert.equal(p.data.playIntro,false);
 listener({connected:true,busy:true,knownDevices:[{}]});assert.equal(p.data.playIntro,false);
});
test('shipped scalebot renders settled geometry, switches paint animations and stops its frame loop',async()=>{
 globalThis.WXWebAssembly={instantiate:(_,imports)=>WebAssembly.instantiate(brotliDecompressSync(readFileSync('miniprogram/pairing/libs/rive/vendor/rive.wasm.br')),imports)};
 const {RiveInstance}=require('../miniprogram/pairing/libs/rive/runtime.js');let callback;const paths=[],noop=()=>{};
 const ctx={beginPath:noop,moveTo:(...p)=>paths.push(p),lineTo:(...p)=>paths.push(p),bezierCurveTo:noop,closePath:noop,fill:noop,stroke:noop,clip:noop,save:noop,restore:noop,transform:noop,setTransform:noop,clearRect:()=>paths.length=0,createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop})};
 const canvas={getContext:()=>ctx,requestAnimationFrame:cb=>{callback=cb;return 1;},cancelAnimationFrame:()=>callback=null};ctx.canvas=canvas;
 const r=new RiveInstance({canvas,buffer:readFileSync('assets/scalebot/kcalack-scalebot-status.riv'),width:20,height:20,devicePixelRatio:2,bounds:ICON_BOUNDS,animation:'Pairing',autoplay:false});
 try{await r.ready;r.seek(DURATION);const settled=JSON.stringify(paths);assert.ok(paths.length>200);for(const state of ['Disconnected','Connecting','Connected','Syncing']){r.setAnimation(state);assert.equal(JSON.stringify(paths),settled);}
 r.play();assert.equal(typeof callback,'function');r.pause();assert.equal(callback,null);
 }finally{r.cleanup();}
});
