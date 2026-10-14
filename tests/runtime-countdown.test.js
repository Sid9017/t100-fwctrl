import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const wasm=fs.readFileSync(new URL('../assets/runtime/preview.wasm',import.meta.url));
test('remote countdown follows firmware TDEE color boundaries and repaints when only TDEE changes',async()=>{
  const {instance:{exports:x}}=await WebAssembly.instantiate(wasm,{});x.preview_reset();
  x.preview_apply_device_status(3,1,2,1,2,3,0,0,0,0);
  const show=(remaining,target,tdee)=>{x.preview_remote_countdown(remaining,target,tdee);x.preview_tick(1600);x.preview_render();};
  const pixel=(col,row)=>new Uint16Array(x.memory.buffer,x.preview_pixels(),25600)[col*80+row];
  for(const [remaining,target,tdee,color] of [[100,1350,1600,0xb6e0],[-250,1350,1600,0xfeac],[-251,1350,1600,0xea2a],[-251,1350,1700,0xfeac],[-1,1600,1600,0xea2a],[-1,1800,1600,0xea2a],[-9999,1350,1600,0xea2a]]){
    show(remaining,target,tdee);assert.equal(pixel(remaining>=0?39:40,3),color);
  }
  show(0,1350,1600);assert.equal(pixel(20,40),0x7bef);assert.equal(pixel(60,40),0x7bef);
  show(675,1350,1600);assert.equal(pixel(20,40),0xb6e0);assert.equal(pixel(60,40),0x7bef);
  show(-675,1350,1600);assert.equal(pixel(20,40),0x7bef);assert.equal(pixel(60,40),0xea2a);
});
test('remote remaining clamps to a positive target and a clear renders the unconfigured gray circle',async()=>{
  const {instance:{exports:x}}=await WebAssembly.instantiate(wasm,{});x.preview_reset();
  x.preview_apply_device_status(3,1,2,1,2,3,0,0,0,0);x.preview_remote_countdown(9000,1350,1600);x.preview_tick(1600);
  const pixels=()=>new Uint16Array(x.memory.buffer,x.preview_pixels(),25600).slice();
  const actual=pixels();x.countdown_view_draw(x.preview_pixels(),1350,1350,1600,0,0,320,80,1);assert.deepEqual(pixels(),actual);
  x.preview_remote_countdown(0,0,0);x.preview_apply_device_status(3,0,2,1,2,3,0,0,0,0);x.preview_tick(1600);
  assert.equal(new Uint16Array(x.memory.buffer,x.preview_pixels(),25600)[20*80+40],0x7bef);
});
