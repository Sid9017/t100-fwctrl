/* Browser transport only: all panel pixels and scene state come from C/Wasm. */
const elements = new Map([...document.querySelectorAll('[id]')].map(el => [el.id, el]));
const $ = (id) => elements.get(id);
const panel = $('panel');
const context = panel.getContext('2d', { alpha: false });
const frame = context.createImageData(320, 80);
let module;
let api;
let liveStatus = null;
const drawerImages = ['diet-tutorial-1.png', 'kitchen-tutorial-1.png', 'espresso-tutorial-1.png', 'pourover-tutorial-1.png'];
let activeGesture = null;
let idleGesture = null;
function beginIdleGesture(side) {
  if (!api || api.scene() !== 0 || api.introActive()) return false;
  const bit = side === 'both' ? 3 : side === 'left' ? 1 : 2;
  if (!idleGesture) idleGesture = { mask: 0, chord: false, fired: false, started: performance.now(), timer: null };
  const g = idleGesture;
  g.mask |= bit;
  if (g.mask === 3 && !g.chord) {
    g.chord = true;
    g.timer = setTimeout(() => {
      if (idleGesture === g && g.mask === 3 && !g.fired) {
        g.fired = true;
        dispatch('key', { key: 'both', hold: true });
      }
    }, 1000);
  }
  return true;
}
function endIdleGesture(side, cancel = false) {
  if (!idleGesture) return false;
  const g = idleGesture;
  const bit = side === 'both' ? 3 : side === 'left' ? 1 : 2;
  if (!(g.mask & bit)) return false;
  clearTimeout(g.timer);
  g.mask &= ~bit;
  if (!g.fired && !cancel && performance.now() - g.started < 400)
    dispatch('key', { key: g.chord ? 'both' : side });
  g.fired = true;
  if (!g.mask) idleGesture = null;
  return true;
}
const WEIGH_LIMIT_G = 5000;
function startGesture(side) {
  if (beginIdleGesture(side)) return;
  if (!api || activeGesture || api.introActive()) return;
  if (api.scene() !== 1 || side === 'both') { dispatch('key', { key: side }); return; }
  if (api.introActive() || ([1, 2, 3].includes(api.currentMode()) && api.kitchenBusy())) return;
  const drawer = $(`${side}Drawer`);
  const index = api.currentMode();
  const image = index === 3 && api.stage() === 1 ? 'pourover-ps5.png' : drawerImages[index];
  drawer.classList.toggle('kcal-drawer', index === 0);
  drawer.setAttribute('data-label', side === 'left' ? '• Reset' : 'Tare •');
  drawer.querySelector('img').src = `figma_reference/${image}`;
  // Start from the hidden frame so every press gets a full 300 ms fade-in.
  void drawer.offsetWidth;
  if (index > 3) drawer.classList.add('visible');
  const gesture = { side, drawer, long: false, timer: null, started: performance.now(), released: false };
  activeGesture = gesture;
  gesture.timer = setTimeout(() => {
    if (activeGesture !== gesture || gesture.released) return;
    gesture.long = true;
    if (api.currentMode() === 0) return;
    if ((index >= 1)) { api.kitchenHold(side === 'right' ? 1 : 0, 1); return; }
    window.dispatchEvent(new CustomEvent('t100:key-gesture', { detail: { key: side, hold: true } }));
    dispatch('key', { key: side, hold: true });
  }, index <= 3 ? 400 : 1000);
}
function fadeGesture(gesture) {
  // A quick tap still shows the complete fade-in before fading out.
  const remaining = Math.max(0, 300 - (performance.now() - gesture.started));
  setTimeout(() => {
    gesture.drawer.classList.remove('visible');
    setTimeout(() => { if (activeGesture === gesture) activeGesture = null; }, 300);
  }, remaining);
}
function endGesture(side) {
  if (endIdleGesture(side)) return;
  const gesture = activeGesture;
  if (!gesture || gesture.side !== side || gesture.released) return;
  gesture.released = true;
  clearTimeout(gesture.timer);
  if (!gesture.long && performance.now() - gesture.started >= (api.currentMode() <= 3 ? 400 : 1000)) {
    gesture.long = true;
    if (api.currentMode() > 3) {
      window.dispatchEvent(new CustomEvent('t100:key-gesture', { detail: { key: side, hold: true } }));
      dispatch('key', { key: side, hold: true });
    }
  }
  if ([1, 2, 3].includes(api.currentMode()) && gesture.long) api.kitchenHold(side === 'right' ? 1 : 0, 0);
  if (!gesture.long) {
    window.dispatchEvent(new CustomEvent('t100:key-gesture', { detail: { key: side, hold: false } }));
    dispatch('key', { key: side });
  }
  fadeGesture(gesture);
}
function cancelGesture(side) {
  if (endIdleGesture(side, true)) return;
  if (!activeGesture || activeGesture.side !== side || activeGesture.released) return;
  clearTimeout(activeGesture.timer);
  activeGesture.released = true;
  if ([1, 2, 3].includes(api.currentMode())) api.kitchenHold(side === 'right' ? 1 : 0, 0);
  fadeGesture(activeGesture);
}
function sync() {
  if (!module) return;
  if (liveStatus) module.preview_apply_status(liveStatus.screen, liveStatus.coffee?.profile ?? -1,
    liveStatus.coffee?.primaryTargetMg ?? -1, liveStatus.coffee?.waterTargetMg ?? -1);
  api.render();
  const src = new Uint16Array(module.memory.buffer);
  const start = api.pixels() >>> 1;
  for (let y = 0; y < 80; y++) for (let x = 0; x < 320; x++) {
    const c = src[start + x * 80 + y];
    const p = (y * 320 + x) * 4;
    frame.data[p] = ((c >> 11) & 31) * 255 / 31;
    frame.data[p + 1] = ((c >> 5) & 63) * 255 / 63;
    frame.data[p + 2] = (c & 31) * 255 / 31;
    frame.data[p + 3] = 255;
  }
  context.putImageData(frame, 0, 0);
  // FEE5 contains scene metadata, not countdown values, history entries or text.
  // Display the reported scene without inventing device content from demo data.
  if (liveStatus && [3,5].includes(liveStatus.screen) && !module.notify_ui_backlight_active()) {
    context.fillStyle='#000'; context.fillRect(0,0,320,80);
    context.fillStyle='#fff'; context.font='18px sans-serif'; context.textAlign='center';
    context.fillText(({3:'Countdown',5:'History',6:'Notification'})[liveStatus.screen],160,36);
    context.font='11px sans-serif'; context.fillStyle='#999'; context.fillText('Content unavailable in status',160,57);
  }
  panel.style.filter = `brightness(${liveStatus?.screen === 2 || [5,6].includes(liveStatus?.mode) ? 0 : api.backlight() / 255})`;
  $('sceneText').textContent = liveStatus ? ({1:'Idle',2:'Idle sleep',3:'Countdown',4:'Scale',5:'History',6:'Notification',7:'Coffee scale'}[liveStatus.screen] || 'Unknown') : module.preview_boot_active() ? 'Pairing' : api.reference() >= 0 ? 'Reference screen' : ['Idle', 'Scale', 'Countdown', 'History', 'Notification'][api.scene()];
  $('referencePage').value = String(api.reference());
  $('mode').value = String(api.currentMode());
  const container = api.containerMg();
  $('containerControls').hidden = api.currentMode() !== 0;
  $('containerStatus').textContent = container < 0 ? 'Not set: CNTR / TOTAL labels retained' : `Container ${(container / 1000).toFixed(1)} g · Gross ${(api.weightCurrent() / 1000).toFixed(1)} g · Net ${(api.netMg() / 1000).toFixed(1)} g`;
  const grams = api.weightCurrent() / 1000;
  if ($('weight').ownerDocument.activeElement !== $('weight')) $('weight').value = grams.toFixed(1);
  const level = api.lightLevel();
  for (const [id, active] of [['leftLed', api.leftLight()], ['rightLed', api.rightLight()]]) {
    $(id).classList.toggle('on', !!active && level > 0);
    $(id).style.opacity = id === 'leftLed' ? api.leftOpacity() / 255 : 1;
    $(id).style.setProperty('--glow', `${Math.round(level / 5)}px`);
  }
}
function validNumber(value, min, max) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min; }
function dispatch(type, data = {}) {
  if (!api) return;
  switch (type) {
    case 'key': {
      const key = data.key === 'left' ? 0 : data.key === 'right' ? 1 : 2;
      if (data.hold) api.keyHold(key); else api.key(key);
      break;
    }
    case 'detachStatus': liveStatus = null; module.preview_detach_status(); break;
    case 'status': liveStatus = data; break;
    case 'pairing': liveStatus = null; module.preview_detach_status(); api.reset(); api.boot(); api.tick(10000); break;
    case 'openScale': $('openScale').click(); break;
    case 'mode': api.mode(validNumber(data.mode, 0, 3)); break;
    case 'reference': api.setReference(validNumber(data.page, -1, 22)); break;
    case 'weight': api.weight(Math.round(validNumber(data.grams, -WEIGH_LIMIT_G, WEIGH_LIMIT_G) * 1000)); break;
    case 'container': {
      const enabled = data.grams != null;
      const mg = enabled ? Math.round(Number(data.grams) * 1000) : 0;
      if (!Number.isFinite(mg) || mg < 0 || mg > 1999900 || api.containerTopic(enabled ? 1 : 0, mg) !== 0) {
        $('containerStatus').textContent = 'Container weight must be 0–1999.9 g'; return;
      }
      break;
    }
    case 'unit': $('unit').value = data.unit === 'oz' ? '1' : '0'; api.unit(data.unit === 'oz' ? 1 : 0); break;
    case 'targets': api.targets(validNumber(data.primary, 0, 1999.9), validNumber(data.water, 0, 1999.9)); break;
    case 'kcal': api.kcal(validNumber(data.current, -9999, 9999), validNumber(data.target, 1, 9999)); break;
    case 'history': api.history(validNumber(data.kcal, 0, 9999), Math.round(validNumber(data.grams, 0, 2000) * 1000), validNumber(data.food, 0, 2)); break;
    case 'lights': api.lights(!!data.left, !!data.right, validNumber(data.brightness, 0, 100)); break;
    case 'notify': api.notify(String(data.text || '').slice(0, 24)); break;
    case 'reset': api.reset(); break;
    default: return;
  }
  sync();
}
window.t100Preview = { dispatch, ready: false,
  async execute(name, data = {}) {
    if (!api) throw new Error('Simulator is loading');
    switch (name) {
      case 'navigateToScale': dispatch('openScale'); break;
      case 'scaleTare': dispatch('key', {key:'right'}); break;
      case 'scaleToggleUnit': $('unit').value = $('unit').value === '1' ? '0' : '1'; $('unit').onchange(); break;
      case 'scaleSetWeighingProfile':
        dispatch('mode', {mode: [1,2,3,0][data.profile]});
        dispatch('targets', {primary:data.primaryTargetMg/1000,water:data.waterTargetMg/1000}); break;
      case 'scaleSetCoffeeRecipe': dispatch('targets', {primary:data.primaryTargetMg/1000,water:data.waterTargetMg/1000}); break;
      case 'setContainerWeight': dispatch('container', data); break;
      case 'setLightControl': dispatch('lights', {left:data.leftOn,right:data.rightOn,brightness:data.brightnessPercent}); break;
      case 'scaleUpdateKcal': dispatch('kcal', {current:data.currentKcal,target:data.targetKcal}); break;
      case 'notifyDisplay': {
        if (module.notify_ui_prepare_update()<0) throw new Error('Notification is transitioning');
        const gray = new Uint8Array(module.memory.buffer,module.preview_notify_gray(),5088);
        gray.fill(0); gray.set(data.gray.slice(0,5088));
        module.preview_notify_color(data.colorRgb565); sync(); break;
      }
      case 'appendKcalHist': {
        const photos = await Promise.all((data.foodFiles || []).slice(0,3).map(async file => {
          const img = new Image(); img.src = `../food/${encodeURIComponent(file)}`; await img.decode();
          const canvas = document.createElement('canvas'); canvas.width=canvas.height=40;
          const ctx = canvas.getContext('2d'); ctx.drawImage(img,0,0,40,40);
          const rgba=ctx.getImageData(0,0,40,40).data, bytes=new Uint8Array(4800);
          for(let i=0;i<1600;i++) {
            const color=((rgba[i*4]>>3)<<11)|((rgba[i*4+1]>>2)<<5)|(rgba[i*4+2]>>3);
            bytes[i*2]=color&255;bytes[i*2+1]=color>>8;bytes[3200+i]=rgba[i*4+3];
          }
          return bytes;
        }));
        dispatch('history',{kcal:data.kcal,grams:data.unit==='oz'?data.weight*28.349523125:data.weight,food:0});
        api.historyMeta(data.rating,photos.length);
        photos.forEach((bytes,i)=>new Uint8Array(module.memory.buffer,api.historyPhoto(i),4800).set(bytes));
        sync(); break;
      }
      default: throw new Error('Unsupported preview action');
    }
    return {ok:true,message:'Local preview updated'};
  }
};
// Parent observes the embedded document height; no cross-origin messaging.

document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach((el) => el.classList.toggle('selected', el === button));
  document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('selected', el.id === `tab-${button.dataset.tab}`));
}));
window.addEventListener('blur', () => { cancelGesture('left'); cancelGesture('right'); });
$('openScale').onclick = () => { if (api && api.scene() !== 0) dispatch('key', { key: 'both' }); dispatch('key', { key: 'left' }); };
$('tare').onclick = () => dispatch('key', { key: 'right' });
$('reset').onclick = () => dispatch('reset');
$('mode').onchange = () => dispatch('mode', { mode: $('mode').value });
$('referencePage').onchange = () => dispatch('reference', { page: $('referencePage').value });
$('weight').oninput = () => dispatch('weight', { grams: $('weight').value });
$('setContainer').onclick = () => {
  if (!$('containerWeight').value.trim()) { $('containerStatus').textContent = 'Enter a container weight'; return; }
  dispatch('container', { grams: $('containerWeight').value });
};
$('clearContainer').onclick = () => dispatch('container', { grams: null });
$('unit').onchange = () => dispatch('unit', { unit: $('unit').value === '1' ? 'oz' : 'g' });
for (const id of ['primaryTarget', 'waterTarget']) $(id).onchange = () => dispatch('targets', { primary: $('primaryTarget').value, water: $('waterTarget').value });
$('setKcal').onclick = () => dispatch('kcal', { current: $('currentKcal').value, target: $('targetKcal').value });
$('addHist').onclick = async () => {
  const foods = ['histFood', 'histFood2', 'histFood3'].map(id => Number($(id).value)).filter(Boolean);
  const photos = await Promise.all(foods.map(async food => {
    const img = new Image(); img.src = `assets/${['', 'Banana', 'Sundae', 'Salad', 'Drink'][food]}.png`;
    await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 40;
    const context = canvas.getContext('2d'); context.drawImage(img, 0, 0);
    const rgba = context.getImageData(0, 0, 40, 40).data, bytes = new Uint8Array(4800);
    for (let i = 0; i < 1600; i++) {
      const color = ((rgba[i*4] >> 3) << 11) | ((rgba[i*4+1] >> 2) << 5) | (rgba[i*4+2] >> 3);
      bytes[i*2] = color & 255; bytes[i*2+1] = color >> 8; bytes[3200+i] = rgba[i*4+3];
    }
    return bytes;
  }));
  dispatch('history', { kcal: $('histKcal').value, grams: $('histWeight').value, food: 0 });
  api.historyMeta(Number($('histRating').value), photos.length);
  photos.forEach((bytes, i) => new Uint8Array(module.memory.buffer, api.historyPhoto(i), 4800).set(bytes));
  api.render();
};
function lights() { $('brightnessValue').textContent = `${$('brightness').value}%`; dispatch('lights', { left: $('leftOn').checked, right: $('rightOn').checked, brightness: $('brightness').value }); }
for (const id of ['leftOn', 'rightOn', 'brightness']) $(id).oninput = lights;
for (const side of ['left', 'right']) {
  const button = $(`${side}Led`);
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault(); button.setPointerCapture(event.pointerId); startGesture(side);
  });
  button.addEventListener('pointerup', (event) => {
    event.preventDefault(); endGesture(side);
  });
  button.addEventListener('pointercancel', () => cancelGesture(side));
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); startGesture(side); }
  });
  button.addEventListener('keyup', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); endGesture(side); }
  });
}
$('previewBoot').onclick = () => { if (!api) return; api.reset(); api.boot(); sync(); };
$('sendNotice').onclick = () => dispatch('notify', { text: $('notice').value });
$('mouthFile').onchange = async (event) => {
  if (!api || !event.target.files.length) return;
  const bytes = new Uint8Array(await event.target.files[0].arrayBuffer());
  const packed = new Uint8Array(225);
  if (bytes.length === 225) packed.set(bytes);
  else if (bytes.length === 1800) {
    for (let i = 0; i < bytes.length; i++) if (bytes[i] >= 128) packed[i >> 3] |= 1 << (7 - (i & 7));
  } else { $('mouthStatus').textContent = 'Choose 1800-byte grayscale or 225-byte 1-bit raw'; return; }
  new Uint8Array(module.memory.buffer, api.mouthBuffer(), 225).set(packed);
  api.mouthChanged(); sync();
  $('mouthStatus').textContent = `Loaded ${event.target.files[0].name} (mouth0)`;
};
document.addEventListener('keydown', (event) => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  const key = event.key === 'ArrowLeft' ? 'left' : event.key === 'ArrowRight' ? 'right' : event.code === 'Space' ? 'both' : null;
  if (!key || event.repeat) return;
  event.preventDefault();
  startGesture(key);
});
document.addEventListener('keyup', (event) => {
  const key = event.key === 'ArrowLeft' ? 'left' : event.key === 'ArrowRight' ? 'right' : event.code === 'Space' ? 'both' : null;
  if (key) { event.preventDefault(); endGesture(key); }
});
$('batteryLevel').addEventListener('change', () => { if(api) { api.batteryLevel(validNumber($('batteryLevel').value,0,100)); sync(); } });
for (const [id,connected,full] of [['batteryPlug',1,0],['batteryUnplug',0,0],['batteryFull',1,1]])
  $(id).addEventListener('click', () => { if(api) { api.batteryLevel(validNumber($('batteryLevel').value,0,100)); api.batteryPower(connected,full); sync(); } });
$('batteryIdle').addEventListener('click', () => { if(api) { api.batteryIdle(); sync(); } });
fetch('preview.wasm?v=20261004-latest-figma').then((response) => {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.arrayBuffer();
}).then((bytes) => WebAssembly.instantiate(bytes, {})).then(({ instance }) => {
  module = instance.exports;
  const x = module;
  api = { pixels: x.preview_pixels, render: x.preview_render, reset: x.preview_reset,
    key: x.preview_key, keyHold: x.preview_key_hold, kitchenHold: x.preview_kitchen_hold, kitchenBusy: x.preview_kitchen_busy, backlight: x.preview_backlight_level,
    mouthBuffer: x.preview_mouth_buffer, mouthChanged: x.preview_mouth_changed,
    scene: x.preview_scene, introActive: x.preview_intro_active,
    stage: x.preview_stage, weightCurrent: x.preview_weight_mg, mode: x.preview_set_mode,
    currentMode: x.preview_mode, reference: x.preview_reference, setReference: x.preview_set_reference,
    weight: x.preview_set_weight, unit: x.preview_set_unit,
    containerTopic: x.preview_container_topic, containerMg: x.preview_container_mg, netMg: x.preview_net_mg,
    targets: x.preview_set_targets, kcal: x.preview_set_kcal,
    batteryLevel:x.preview_battery_level, batteryPower:x.preview_battery_power, batteryIdle:x.preview_battery_idle,
    history: x.preview_add_history, historyMeta: x.preview_history_meta, historyPhoto: x.preview_history_photo, lights: x.preview_set_light,
    boot: () => { x.preview_boot_start(); x.preview_render(); }, leftOpacity: x.preview_left_opacity, leftLight: x.preview_light_left, rightLight: x.preview_light_right, lightLevel: x.preview_light_level,
    notify: (text) => {
      if(x.notify_ui_prepare_update()<0)throw new Error("Notification is transitioning. Try again shortly.");
      const bytes = new TextEncoder().encode(text);
      const out = new Uint8Array(x.memory.buffer, x.preview_notice_buffer(), 40);
      out.fill(0); out.set(bytes.subarray(0, 39));
      const canvas=document.createElement('canvas');canvas.width=212;canvas.height=24;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,212,24);
      ctx.font='16px Unbounded, sans-serif';ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.fillText(text,1,12,210);
      const rgba=ctx.getImageData(0,0,212,24).data;
      const gray=new Uint8Array(x.memory.buffer,x.preview_notify_gray(),5088);
      for(let row=0;row<212;row++)for(let col=0;col<24;col++)gray[row*24+col]=rgba[(col*212+row)*4];
      x.preview_notify();
    }, tick: x.preview_tick };
  api.reset(); window.t100Preview.ready = true; $('runtimeText').textContent = 'Wasm running'; sync();
  setInterval(() => { api.tick(40); sync(); }, 40);
}).catch((error) => { $('runtimeText').textContent = `Wasm failed to load: ${error.message}`; });
