import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const wasm=await readFile(new URL('../assets/runtime/preview.wasm',import.meta.url));
const pixels=x=>new Uint16Array(x.memory.buffer,x.preview_pixels(),25600).slice();
async function runtime(profile=3){const {instance:{exports:x}}=await WebAssembly.instantiate(wasm,{});x.preview_reset();x.preview_apply_device_status(4,0,2,1,2,profile,1,0,15000,240000);return x;}
function expectRenderer(x,draw){const actual=pixels(x);draw();assert.deepEqual(actual,pixels(x));}
test('FEE1 KCal renders the supplied net without a second container subtraction, including tare zero',async()=>{
  const x=await runtime();
  for(const net of [250000,0,-25000]){x.preview_apply_scale_snapshot(0,3,0,7,net,1,100000,2,350000);expectRenderer(x,()=>x.kcal_scale_view_draw(x.preview_pixels(),350000,100000,net,0));}
});
test('unset and valid-zero containers are distinct; total is available without a container',async()=>{
  const x=await runtime();x.preview_apply_scale_snapshot(0,3,0,5,125000,1,0,2,125000);const unset=pixels(x);
  assert.equal(x.preview_snapshot_lower(),125000);
  x.preview_apply_scale_snapshot(0,3,0,7,125000,1,0,2,125000);assert.notDeepEqual(pixels(x),unset);
  expectRenderer(x,()=>x.kcal_scale_view_draw(x.preview_pixels(),125000,0,125000,0));
});
test('Kitchen snapshot carries Add and TOTAL without replaying a local key',async()=>{
  const x=await runtime(0);x.preview_apply_scale_snapshot(0,0,0,7,30000,3,100000,2,130000);
  expectRenderer(x,()=>x.kitchen_scale_view_draw(x.preview_pixels(),100000,100000,30000,0));
});
test('coffee timer and flow use the device snapshot and do not drift with browser ticks',async()=>{
  const x=await runtime(1);x.preview_apply_scale_snapshot(0,1,2,23,10000,4,17,5,12300);
  const actual=pixels(x);x.preview_tick(1000);assert.deepEqual(pixels(x),actual);
  expectRenderer(x,()=>x.espresso_scale_view_draw(x.preview_pixels(),10000,0,1,1,17000,12300));
});
test('explicit overload wins even when the main net/current weight is small',async()=>{
  const x=await runtime();x.preview_apply_scale_snapshot(0,3,0,15,10000,1,100000,2,2000050);
  expectRenderer(x,()=>x.kcal_scale_view_draw(x.preview_pixels(),2000000,-1,0,0));
});
test('inactive scale data cannot navigate out of Idle or persist into the next connection',async()=>{
  const x=await runtime();x.preview_apply_device_status(1,0,2,1,2,3,0,0,15000,240000);const idle=pixels(x);
  const weight=x.preview_weight_mg();
  x.preview_apply_scale_snapshot(0,3,0,0,300000,0,0,0,0);assert.deepEqual(pixels(x),idle);
  assert.equal(x.preview_weight_mg(),weight);
  x.preview_detach_status();assert.equal(x.preview_snapshot_flags(),-1);
});
