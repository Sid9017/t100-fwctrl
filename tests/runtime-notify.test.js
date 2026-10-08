import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
async function runtime(rows) {
  const {instance: {exports: x}} = await WebAssembly.instantiate(fs.readFileSync(new URL('../assets/runtime/preview.wasm', import.meta.url)), {});
  x.preview_reset();
  const gray = new Uint8Array(x.memory.buffer, x.preview_notify_gray(), 5088);
  gray.fill(0);
  for (let row=0; row<rows; row++) gray[row*24+row%24] = 255;
  x.notify_ui_show_bitmap(0xb6e0, x.preview_notify_gray());
  x.notify_ui_native_invalidate();
  return x;
}

function pixels(x) { return new Uint16Array(x.memory.buffer,x.preview_pixels(),25600).slice(); }
test('entry and exit use only 150ms backlight ramps, with opaque frame swaps at black', async()=>{
  const x=await runtime(30);
  // runtime helper starts the notice without drawing over the previous page.
  const idle=pixels(x);
  x.preview_tick(75);
  assert.ok(Math.abs(x.preview_backlight_level()-127.5)<=0.5);
  assert.deepEqual(pixels(x),idle,'source page stays frozen during fade-out');
  x.preview_tick(75);
  assert.equal(x.preview_backlight_level(),0);
  const notice=pixels(x);
  assert.notDeepEqual(notice,idle);
  x.preview_tick(40);
  assert.equal(x.preview_backlight_level(),0);
  x.preview_tick(75);
  assert.ok(Math.abs(x.preview_backlight_level()-127.5)<=0.5);
  assert.deepEqual(pixels(x),notice,'entry changes backlight, not pixels');
  x.preview_tick(75);
  assert.equal(x.preview_backlight_level(),255);
  x.notify_ui_dismiss_by_key();
  x.preview_tick(75);
  assert.ok(Math.abs(x.preview_backlight_level()-127.5)<=0.5);
  assert.deepEqual(pixels(x),notice,'exit does not shrink or fade individual elements');
  x.preview_tick(75);
  assert.equal(x.preview_scene(),0);
  assert.equal(x.preview_backlight_level(),0);
  assert.deepEqual(pixels(x),idle,'Idle is restored while dark');
  x.preview_tick(115);
  assert.ok(Math.abs(x.preview_backlight_level()-127.5)<=0.5);
  x.preview_tick(75);
  assert.equal(x.preview_backlight_level(),255);
});
test('status bridge preserves notify entry and exit PWM instead of overwriting the scene',async()=>{
  const {instance:{exports:x}}=await WebAssembly.instantiate(fs.readFileSync(new URL('../assets/runtime/preview.wasm',import.meta.url)),{});
  x.preview_reset();x.preview_apply_status(1,-1,-1,-1);
  const idle=pixels(x);
  x.preview_apply_status(6,-1,-1,-1);
  x.preview_tick(75);x.preview_apply_status(6,-1,-1,-1);
  assert.ok(Math.abs(x.preview_backlight_level()-127.5)<=0.5);
  assert.deepEqual(pixels(x),idle);
  x.preview_tick(75);x.preview_apply_status(6,-1,-1,-1);
  assert.equal(x.preview_backlight_level(),0);
  x.preview_tick(190);x.preview_apply_status(6,-1,-1,-1);
  assert.equal(x.preview_backlight_level(),255);
  const notice=pixels(x);
  x.preview_apply_status(1,-1,-1,-1);
  x.preview_tick(75);x.preview_apply_status(1,-1,-1,-1);
  assert.ok(Math.abs(x.preview_backlight_level()-127.5)<=0.5);
  assert.deepEqual(pixels(x),notice);
  x.preview_tick(75);x.preview_apply_status(1,-1,-1,-1);
  assert.equal(x.preview_backlight_level(),0);
  assert.deepEqual(pixels(x),idle);
  x.preview_tick(190);x.preview_apply_status(1,-1,-1,-1);
  assert.equal(x.preview_backlight_level(),255);
  assert.equal(x.preview_scene(),0);
});
