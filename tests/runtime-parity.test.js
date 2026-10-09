import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const bytes=fs.readFileSync(new URL('../assets/runtime/preview.wasm',import.meta.url));
async function runtime(){const {instance:{exports:x}}=await WebAssembly.instantiate(bytes,{});x.preview_reset();return x;}
const pixels=x=>new Uint16Array(x.memory.buffer,x.preview_pixels(),25600).slice();
const status=(x,screen,{phase=0,board=2,flags=1,profile=3,stage=1,schema=2}={})=>x.preview_apply_device_status(screen,phase,board,flags,schema,profile,stage,2,15000,240000);
const mid=x=>assert.ok(Math.abs(x.preview_backlight_level()-127.5)<=.5);

test('native Idle Sleep dims the mouth to firmware alpha 51, without turning off the panel',async()=>{
  const x=await runtime();status(x,1);const awake=pixels(x);
  new Uint16Array(x.memory.buffer,x.preview_pixels(),25600).fill(0);
  x.emotion_theme_draw(x.preview_pixels(),0,0,320,1,51);const expected=pixels(x);
  status(x,2);assert.deepEqual(pixels(x),expected);assert.notDeepEqual(expected,awake);
  assert.ok(expected.some(v=>v));assert.equal(x.preview_backlight_level(),255);
  status(x,1);assert.deepEqual(pixels(x),awake);
});
test('observed Scale entry plays the native title, with dark upload and PWM; snapshots do not replay entry',async()=>{
  const x=await runtime();status(x,1);status(x,4);
  const title=pixels(x);assert.equal(x.preview_backlight_level(),0);
  x.preview_tick(40);assert.equal(x.preview_backlight_level(),0);
  x.preview_tick(75);mid(x);assert.deepEqual(pixels(x),title);
  status(x,4);x.preview_set_weight(123500);assert.deepEqual(pixels(x),title);
  x.preview_tick(75);assert.equal(x.preview_backlight_level(),255);
  x.preview_tick(150);assert.equal(x.preview_backlight_level(),0);
  const weight=pixels(x);assert.notDeepEqual(weight,title);
  x.preview_tick(40);assert.equal(x.preview_backlight_level(),0);
  x.preview_tick(150);assert.equal(x.preview_backlight_level(),255);
  assert.deepEqual(pixels(x),weight);
  const y=await runtime();status(y,4);assert.equal(y.preview_intro_active(),0);
});
test('Countdown hands the black frame to the Scale title without overlapping page fades',async()=>{
  const x=await runtime();status(x,3);const old=pixels(x);status(x,4);
  x.preview_tick(75);mid(x);assert.deepEqual(pixels(x),old);
  x.preview_tick(75);assert.equal(x.preview_backlight_level(),0);
  x.preview_tick(40);assert.equal(x.preview_backlight_level(),0);
  const title=pixels(x);x.preview_tick(75);mid(x);assert.deepEqual(pixels(x),title);
  x.preview_tick(75);assert.equal(x.preview_backlight_level(),255);
  x.preview_tick(150);assert.equal(x.preview_backlight_level(),0);
  assert.notDeepEqual(pixels(x),title);
  x.preview_tick(190);assert.equal(x.preview_backlight_level(),255);
});
test('Scale exit and Countdown transitions preserve the old pixels throughout fade-out',async()=>{
  for(const target of [1,3]){const x=await runtime();status(x,4);x.preview_set_weight(125000);const before=pixels(x);
    status(x,target);x.preview_tick(75);mid(x);assert.deepEqual(pixels(x),before);
    x.preview_tick(75);assert.equal(x.preview_backlight_level(),0);
    assert.notDeepEqual(pixels(x),before);x.preview_tick(190);assert.equal(x.preview_backlight_level(),255);
  }
});
for(const key of [0,1])test(`KCal key ${key} uses four hardware-style PWM ramps, not pixel fades`,async()=>{
  const x=await runtime();x.preview_key(0);x.preview_tick(1000);x.preview_set_weight(350000);x.preview_container_topic(1,100000);
  const before=pixels(x);x.preview_key(key);x.preview_tick(75);mid(x);assert.deepEqual(pixels(x),before);
  x.preview_tick(75);const hint=pixels(x);assert.equal(x.preview_backlight_level(),0);assert.notDeepEqual(hint,before);
  x.preview_tick(40);assert.equal(x.preview_backlight_level(),0);x.preview_tick(75);mid(x);assert.deepEqual(pixels(x),hint);
  x.preview_tick(75);assert.equal(x.preview_backlight_level(),255);x.preview_tick(75);mid(x);assert.deepEqual(pixels(x),hint);
  x.preview_tick(75);assert.equal(x.preview_backlight_level(),0);const result=pixels(x);assert.notDeepEqual(result,hint);
  x.preview_tick(40);assert.equal(x.preview_backlight_level(),0);x.preview_tick(150);assert.equal(x.preview_backlight_level(),255);
  assert.deepEqual(pixels(x),result);assert.equal(x.preview_container_mg(),key===0?-1:100000);
});
test('History holds the black entry frame for 40 ms before the native staggered reveal',async()=>{
  const x=await runtime();x.preview_add_history(123,100000,0);x.preview_add_history(456,200000,0);const before=pixels(x);
  x.preview_key(1);x.preview_tick(75);mid(x);assert.deepEqual(pixels(x),before);
  x.preview_tick(75);assert.equal(x.preview_backlight_level(),0);assert.ok(pixels(x).every(v=>v===0));
  x.preview_tick(39);assert.equal(x.preview_backlight_level(),0);assert.equal(x.history_pager_opacity(),0);
  x.preview_tick(1);assert.equal(x.preview_backlight_level(),255);assert.equal(x.history_pager_opacity(),0);
  x.preview_tick(90);assert.equal(x.history_pager_opacity(),127);x.preview_tick(90);assert.equal(x.history_pager_active(),0);
});
test('coffee stage and run/pause follow FEE5 flags; the selected profile applies on the next Scale entry',async()=>{
  const x=await runtime();status(x,4,{profile:1});assert.equal(x.preview_mode(),2);assert.equal(x.preview_stage(),0);
  status(x,4,{profile:1,stage:2,flags:1|(1<<11)|(1<<12)});assert.equal(x.preview_stage(),1);assert.equal(x.preview_timer_running(),1);
  x.preview_tick(1000);assert.equal(x.preview_timer_ms(),1000);
  status(x,4,{profile:1,stage:2,flags:1|(1<<12)});x.preview_tick(1000);assert.equal(x.preview_timer_ms(),1000);
  status(x,4,{profile:2,stage:2,flags:1|(1<<12)});assert.equal(x.preview_mode(),2);
  status(x,1,{profile:2});x.preview_tick(400);status(x,4,{profile:2});assert.equal(x.preview_mode(),3);assert.equal(x.preview_stage(),0);
});
test('Notify EXITING starts dismissal before FEE5 changes the screen back to Idle',async()=>{
  const x=await runtime();status(x,1);status(x,6);x.preview_tick(340);status(x,6,{phase:2});x.preview_tick(75);mid(x);
  x.preview_tick(75);assert.equal(x.preview_scene(),0);assert.equal(x.preview_backlight_level(),0);
});
test('reset and board sleep fade the panel without confusing Idle Sleep with power-off',async()=>{
  const x=await runtime();status(x,1);const old=pixels(x);status(x,1,{board:4});x.preview_tick(75);mid(x);
  assert.deepEqual(pixels(x),old);x.preview_tick(75);assert.equal(x.preview_backlight_level(),0);
  status(x,1,{board:2});x.preview_tick(150);assert.equal(x.preview_backlight_level(),255);
});
test('unknown content stays blank; committed countdown uses the firmware renderer and clears on a new session',async()=>{
  const x=await runtime();status(x,3,{phase:1});assert.equal(x.preview_remote_missing(),1);assert.ok(pixels(x).every(v=>v===0));
  x.preview_remote_countdown(-180,1800);assert.equal(x.preview_remote_missing(),0);const actual=pixels(x);
  new Uint16Array(x.memory.buffer,x.preview_pixels(),25600).fill(0);
  x.countdown_view_draw(x.preview_pixels(),-180,1800,0,0,320,80,1);assert.deepEqual(pixels(x),actual);
  x.preview_reset();status(x,3,{phase:1});assert.equal(x.preview_remote_missing(),1);assert.ok(pixels(x).every(v=>v===0));
});
test('Kitchen holds grow for 500 ms after PWM entry and cancel before completion',async()=>{
  const x=await runtime();x.preview_set_mode(1);x.preview_key(0);x.preview_tick(1000);
  x.preview_set_weight(100000);x.preview_key(0);x.preview_tick(700);x.preview_set_weight(30000);
  x.preview_kitchen_hold(1,1);x.preview_tick(340);assert.equal(x.preview_backlight_level(),255);
  x.preview_tick(499);x.preview_kitchen_hold(1,0);x.preview_tick(700);
  assert.equal(x.preview_session_mg(),100000);assert.equal(x.preview_weight_mg(),30000);
  x.preview_kitchen_hold(1,1);x.preview_tick(840);assert.equal(x.preview_session_mg(),0);assert.equal(x.preview_weight_mg(),0);
});
test('white lights follow the firmware 600 ms power ramp independently of the 150 ms display',async()=>{
  const x=await runtime();status(x,1);status(x,1,{board:4});x.preview_tick(150);
  assert.equal(x.preview_backlight_level(),0);assert.equal(x.preview_power_led_opacity(),192);
  x.preview_tick(450);assert.equal(x.preview_power_led_opacity(),0);
  status(x,1,{board:2});x.preview_tick(300);assert.equal(x.preview_power_led_opacity(),127);
});
test('battery cues freeze pixels through PWM, settle in darkness, and resume the previous scene',async()=>{
  const x=await runtime();x.preview_key(0);x.preview_tick(1000);x.preview_set_weight(350000);const original=pixels(x);
  x.preview_battery_power(1,0);x.preview_tick(75);mid(x);assert.deepEqual(pixels(x),original);
  x.preview_tick(75);const battery=pixels(x);assert.notDeepEqual(battery,original);assert.equal(x.preview_backlight_level(),0);
  x.preview_tick(40);assert.equal(x.preview_backlight_level(),0);x.preview_tick(150);assert.equal(x.preview_backlight_level(),255);
  // Two lightning cycles, then source restoration at black and another settle.
  x.preview_tick(600);x.preview_tick(150);assert.equal(x.preview_backlight_level(),0);assert.deepEqual(pixels(x),original);
  x.preview_tick(40);assert.equal(x.preview_backlight_level(),0);x.preview_tick(150);assert.equal(x.preview_battery_active(),0);
  assert.deepEqual(pixels(x),original);assert.equal(x.preview_weight_mg(),350000);
});
test('boot logo and barcode use opaque pixels with hardware PWM fades and dark settle',async()=>{
  const x=await runtime();x.preview_boot_start();x.preview_render();const logo=pixels(x);
  assert.ok(logo.includes(0xffff));assert.equal(x.preview_backlight_level(),0);
  x.preview_tick(40);assert.equal(x.preview_backlight_level(),0);
  x.preview_tick(450);mid(x);assert.deepEqual(pixels(x),logo);
  x.preview_tick(450);assert.equal(x.preview_backlight_level(),255);assert.deepEqual(pixels(x),logo);
  x.preview_tick(1900);const green=pixels(x);x.preview_tick(75);mid(x);assert.deepEqual(pixels(x),green);
  x.preview_tick(75);const barcode=pixels(x);assert.equal(x.preview_backlight_level(),0);assert.notDeepEqual(barcode,green);
  assert.ok(barcode.every(v=>v===0||v===0xffff));x.preview_tick(40);assert.equal(x.preview_backlight_level(),0);
  x.preview_tick(75);mid(x);assert.deepEqual(pixels(x),barcode);x.preview_tick(75);assert.equal(x.preview_backlight_level(),255);
});

test('coffee status survives a deferred notification exit',async()=>{
  const x=await runtime();status(x,1);status(x,6);x.preview_tick(340);
  status(x,4,{profile:1,stage:2,flags:1|(1<<11)|(1<<12)});
  x.preview_tick(1000);assert.equal(x.preview_mode(),2);
  assert.equal(x.preview_stage(),1);assert.equal(x.preview_timer_running(),1);
});
