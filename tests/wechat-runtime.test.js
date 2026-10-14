import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MiniRuntime} from '../src/miniprogram/runtime.js';
import {miniProgramWasm} from '../scripts/miniprogram-wasm.mjs';
import {runInNewContext} from 'node:vm';
const bytes=await readFile(new URL('../assets/runtime/preview.wasm',import.meta.url));
async function renderer(mini=false){return (await WebAssembly.instantiate(mini?miniProgramWasm(bytes):bytes,{})).instance.exports;}
const status=(screen,profile=3)=>({screen,phase:0,mode:2,flags:1,coffee:{schema:2,profile,stage:0,uiPhase:0,primaryTargetMg:15000,waterTargetMg:240000}});
const reading={version:3,unit:0,profile:3,stage:0,flags:7,value:-25000,upper:{kind:1,value:100000},lower:{kind:2,value:75000}};
test('mini display pixel transport matches the web renderer for every reported screen',async()=>{
  for(const screen of [1,2,3,4,5,6,7]){
    const mobile=await renderer(true),web=await renderer();web.preview_reset();const mini=new MiniRuntime(mobile),s=status(screen);
    mini.sync(s,reading);
    web.preview_apply_device_status(s.screen,s.phase,s.mode,s.flags,2,3,0,0,15000,240000);
    web.preview_apply_scale_snapshot(0,3,0,7,-25000,1,100000,2,75000);
    const frame=mini.frame();web.preview_tick(40);web.preview_render();
    const raw=new Uint16Array(web.memory.buffer,web.preview_pixels(),320*80),bright=web.preview_backlight_level()/255;
    for(let y=0;y<80;y++)for(let x=0;x<320;x++){
      const color=raw[x*80+y],i=(y*320+x)*4,expected=new Uint8ClampedArray([((color>>11)&31)*255/31*bright,((color>>5)&63)*255/63*bright,(color&31)*255/31*bright,255]);
      assert.deepEqual(frame.rgba.subarray(i,i+4),expected);
    }
    if(screen===5)assert.match(frame.missing,/History/);if(screen===6)assert.match(frame.missing,/Notification/);
  }
});
test('unbound pairing takes precedence over a stale scale snapshot and follows web boot rendering',async()=>{
  const miniExports=await renderer(true),web=await renderer(),mini=new MiniRuntime(miniExports);
  mini.sync(status(4),reading);mini.frame();mini.sync({screen:1,flags:0},reading);
  web.preview_detach_status();web.preview_reset();web.preview_boot_start();web.preview_tick(10000);web.preview_tick(40);web.preview_render();
  mini.frame();assert.deepEqual(new Uint16Array(miniExports.memory.buffer,miniExports.preview_pixels(),25600),new Uint16Array(web.memory.buffer,web.preview_pixels(),25600));
  mini.sync(status(1),reading);mini.frame();assert.equal(miniExports.preview_scene(),0);
});
test('mini packaging removes only exported globals and preserves all rendering functions',()=>{
  const original=WebAssembly.Module.exports(new WebAssembly.Module(bytes)),packaged=WebAssembly.Module.exports(new WebAssembly.Module(miniProgramWasm(bytes)));
  assert.ok(original.some(e=>e.kind==='global'));assert.deepEqual(packaged,original.filter(e=>e.kind!=='global'));
});
test('Canvas renderer resumes after background/resize, pauses offscreen and stops on detach',async()=>{
  let definition,nextTimer=1,painted=0;const timers=new Set(),x=await renderer(true);
  const gradient={addColorStop(){}};
  const ctx=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,createImageData:()=>({data:new Uint8ClampedArray(102400)}),putImageData(){painted++;}},{get(target,key){return target[key]||(()=>{});}});
  const canvas={getContext:()=>ctx};
  const source=await readFile(new URL('../miniprogram/components/device-preview/index.js',import.meta.url),'utf8');
  runInNewContext(source,{Component:d=>{definition=d;},require:()=>({MiniRuntime}),wx:{getWindowInfo:()=>({pixelRatio:2})},WXWebAssembly:{instantiate:async()=>({instance:{exports:x}})},setInterval(){const id=nextTimer++;timers.add(id);return id;},clearInterval:id=>timers.delete(id)});
  const c={mounted:true,properties:{connected:true,active:true,status:status(4),reading},data:{...definition.data},setData(patch){Object.assign(this.data,patch);},createSelectorQuery(){const q={select:()=>q,fields:()=>q,exec:callback=>callback([{node:canvas,width:320,height:244},{node:canvas,width:200,height:50}])};return q;}};
  for(const [name,fn] of Object.entries(definition.methods))c[name]=fn.bind(c);
  await c.setup();assert.equal(timers.size,1);assert.ok(painted>0);
  definition.pageLifetimes.hide.call(c);assert.equal(timers.size,0);
  definition.pageLifetimes.show.call(c);assert.equal(timers.size,1);
  await c.setup();assert.equal(timers.size,1);
  c.properties.active=false;c.start();assert.equal(timers.size,0);
  c.properties.active=true;c.start();assert.equal(timers.size,1);
  definition.lifetimes.detached.call(c);assert.equal(timers.size,0);c.start();assert.equal(timers.size,0);
});
