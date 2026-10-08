import { test, expect } from '@playwright/test';
import { generateKeyPairSync, sign } from 'node:crypto';
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const jwk=publicKey.export({format:'jwk'});
const pub=Buffer.concat([Buffer.from([2+(Buffer.from(jwk.y,'base64url').at(-1)&1)]),Buffer.from(jwk.x,'base64url')]);
const name=`YD-${pub.toString('hex').slice(0,12)}`;
const record={pub_key:pub.toString('hex'),auth_key:'TEST1234',deviceId:'mock-t100',name};
function admissionToken() {
  const payload=Buffer.alloc(16);payload.write(record.auth_key);const now=Math.floor(Date.now()/1000);
  payload.writeUInt32LE(now,8);payload.writeUInt32LE(now+300,12);
  const message=`${pub.toString('base64url')}.${payload.toString('base64url')}`;
  return `${message}.${sign('sha256',Buffer.from(message),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}`;
}
async function mockBluetooth(page,{bound=true,stored=true,cancel=false,storageFailure=false,failTheme=false,bindUuidForm='canonical',initialScreen=4}={}) {
  await page.addInitScript(({name,record,token,bound,stored,cancel,storageFailure,failTheme,bindUuidForm,initialScreen})=>{
    if(stored && !localStorage.getItem('t100.mfg.auth.v1'))localStorage.setItem('t100.mfg.auth.v1',JSON.stringify([record]));
    if(storageFailure)Storage.prototype.setItem=()=>{throw new DOMException('Full','QuotaExceededError');};
    const full=s=>s.length===4?`0000${s}-0000-1000-8000-00805f9b34fb`:s;
    window.mock={writes:[],requests:[],connects:0,bound,cancel,failTheme};
    const device=new EventTarget();device.id='mock-t100';device.name=name;
    const chars=new Map();
    function char(id,properties,bytes=[]) {
      const c=new EventTarget();c.uuid=full(id);c.properties=properties;
      c.readValue=async()=>new DataView(Uint8Array.from(bytes).buffer);
      c.startNotifications=async()=>c;c.stopNotifications=async()=>c;
      c.writeValueWithResponse=async value=>{
        const data=Array.from(value);window.mock.writes.push({id,data,stored:!!localStorage.getItem('t100.mfg.auth.v1')});
        if(['fee2','fee3'].includes(id)&&data[0]===0x54)window.mock.bound=true;
        if(['fee2','fee3'].includes(id)&&data[0]===0x6a&&window.mock.failTheme)throw new Error('Injected theme upload failure');
        if(id==='ffc3' && window.mock.oadDisconnect) { device.gatt.disconnect(); return; }
        if(id==='ffc3')setTimeout(()=>{c.value=new DataView(new Uint8Array([255,255]).buffer);c.dispatchEvent(new Event('characteristicvaluechanged'));},10);
      };
      c.writeValueWithoutResponse=c.writeValueWithResponse;chars.set(id,c);return c;
    }
    const notify={read:true,notify:true};
    const services=[
      ['fee0',[char('fee1',notify,[0,0x40,0xe2,1,0]),char('fee2',{write:true}),char('fee3',{write:true}),char('fee4',{read:true,write:true},[1]),char('fee5',notify,[8,4,2,2,1,0,0,0])]],
      ['180a',[char('2a26',{read:true},[...new TextEncoder().encode('1.2.3')])]],
      ['180f',[char('2a19',notify,[87])]],
      ['1805',[char('2a2b',{read:true,write:true},[0xea,7,10,8,12,0,0,4,0,0])]],
      ['ffc0',[char('ffc1',{write:true,notify:true}),char('ffc3',{write:true,notify:true})]],
    ].map(([id,characters])=>({uuid:full(id),getCharacteristics:async()=>characters}));
    chars.get('fee5').readValue=async()=>new DataView(new Uint8Array([8,initialScreen,0,2,window.mock.bound?1:0,0,0,0]).buffer);
    const customUuid = value => {
      if(bindUuidForm==='canonical') return value;
      const bytes=value.replaceAll('-','').match(/../g);
      const raw=[...bytes.slice(0,4).reverse(),...bytes.slice(4,6).reverse(),...bytes.slice(6,8).reverse(),...bytes.slice(8)];
      const hex=(bindUuidForm==='reversed'?raw.reverse():raw).join('');
      return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    };
    const bindService={uuid:customUuid('6b300001-ef00-4a5b-8dc1-2e9fcdef0001'),getCharacteristics:async()=>[
      char(customUuid('6b300013-ef00-4a5b-8dc1-2e9fcdef0001'),{read:true},[...new TextEncoder().encode(token)])]};
    device.gatt={connected:false,connect:async()=>{window.mock.connects++;device.gatt.connected=true;return device.gatt;},
      disconnect:()=>{device.gatt.connected=false;device.dispatchEvent(new Event('gattserverdisconnected'));},
      getPrimaryServices:async()=>window.mock.bound?services:[...services,...(window.mock.requests.at(-1).optionalServices.includes(bindService.uuid)?[bindService]:[])]};
    window.mock.disconnect=()=>device.gatt.disconnect();
    window.mock.notifyStatus=(screen,profile)=>{
      const c=chars.get('fee5');
      const bytes=new Uint8Array(profile == null ? 8 : 20);
      bytes.set([bytes.length,screen,0,2,window.mock.bound?1:0,0,0,0]);
      if(profile!=null){bytes[8]=1;bytes[9]=profile;new DataView(bytes.buffer).setUint32(12,15000,true);new DataView(bytes.buffer).setUint32(16,240000,true);}
      c.value=new DataView(bytes.buffer);c.dispatchEvent(new Event('characteristicvaluechanged'));
    };
    window.mock.notifyWeight=()=>{const c=chars.get('fee1');c.value=new DataView(new Uint8Array([0,0x20,0xa1,7,0]).buffer);c.dispatchEvent(new Event('characteristicvaluechanged'));};
    Object.defineProperty(navigator,'bluetooth',{configurable:true,value:{requestDevice:async options=>{
      window.mock.requests.push(options);if(window.mock.cancel)throw new DOMException('No device selected','NotFoundError');return device;
    }}});
  },{name,record,token:admissionToken(),bound,stored,cancel,storageFailure,failTheme,bindUuidForm,initialScreen});
}
async function swipeTo(page, target) {
  const views = ['connect','test','oad'];
  const current = await page.locator('.view.is-active').getAttribute('data-view');
  const steps = views.indexOf(target) - views.indexOf(current);
  for (let i = 0; i < Math.abs(steps); i++) {
    const surface = page.locator('.view.is-active .view-subtitle').first();
    await surface.dispatchEvent('pointerdown',{isPrimary:true,button:0,pointerId:1,clientX:200,clientY:400});
    await surface.dispatchEvent('pointerup',{isPrimary:true,button:0,pointerId:1,clientX:steps>0?80:320,clientY:405});
  }
}
async function connect(page) {
  await page.goto('/');
  await page.getByRole('button',{name:'Select Bluetooth Device'}).click();
  await expect(page.locator('#simStateText')).toHaveText('Connected');
}
test('selection connects, updates the Wasm display, and keeps authenticated device control',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await mockBluetooth(page);await connect(page);
  const runtime=page.frameLocator('#runtimeFrame');
  await expect(runtime.locator('#weight')).toHaveValue('123.5');
  expect(await page.evaluate(()=>mock.connects)).toBe(1);
  await page.locator('#simCurrentKcalInput').fill('200');
  await page.locator('#simTargetKcalInput').fill('1000');
  await page.locator('#simKcalUpdateBtn').click();
  await expect(page.locator('#simLog')).toContainText('Countdown updated');
  await page.evaluate(()=>mock.notifyWeight());await expect(runtime.locator('#weight')).toHaveValue('500.0');
  await page.evaluate(()=>mock.disconnect());await expect(page.locator('#simStateText')).toHaveText('Idle');
  expect(errors).toEqual([]);
});
test('bind verifies the signed token, persists auth before commit and uploads emotion through FEE4',async({page})=>{
  await mockBluetooth(page,{bound:false,stored:false});await connect(page);
  await page.locator('#simBindBtn').click();
  await expect(page.locator('#simLog')).toContainText('Bind complete',{timeout:20000});
  const writes=await page.evaluate(()=>mock.writes);
  expect(writes.find(w=>['fee2','fee3'].includes(w.id)&&w.data[0]===0x54).stored).toBe(true);
  expect(writes.some(w=>['fee2','fee3'].includes(w.id)&&w.data[0]===0x6c)).toBe(true);
  expect(writes.some(w=>w.id==='fee4'&&w.data.length===13)).toBe(true);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('t100.mfg.auth.v1')));
  expect(saved[0].auth_key).toBe('TEST1234');
  await page.reload();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('t100.mfg.auth.v1')))).toEqual(saved);
});
test('storage failure prevents binding writes',async({page})=>{
  await mockBluetooth(page,{bound:false,stored:false,storageFailure:true});await connect(page);
  await page.locator('#simBindBtn').click();await expect(page.locator('#simLog')).toContainText('Cannot persist auth');
  expect(await page.evaluate(()=>mock.writes.some(w=>['fee2','fee3'].includes(w.id)&&w.data[0]===0x54))).toBe(false);
});
test('failed emotion upload retains credential; retry skips bind commit',async({page})=>{
  await mockBluetooth(page,{bound:false,stored:false,failTheme:true});await connect(page);
  await page.locator('#simBindBtn').click();await expect(page.locator('#simLog')).toContainText('Injected theme upload failure');
  expect(await page.evaluate(()=>!!localStorage.getItem('t100.mfg.auth.v1'))).toBe(true);
  await page.evaluate(()=>{mock.failTheme=false;});await page.locator('#simBindBtn').click();
  await expect(page.locator('#simLog')).toContainText('Bind complete',{timeout:20000});
  expect(await page.evaluate(()=>mock.writes.filter(w=>['fee2','fee3'].includes(w.id)&&w.data[0]===0x54).length)).toBe(1);
});
test('cancel leaves an existing connection intact',async({page})=>{
  await mockBluetooth(page);await connect(page);
  await swipeTo(page, 'connect');await page.evaluate(()=>{mock.cancel=true;});
  await page.getByRole('button',{name:'Select Bluetooth Device'}).click();
  await expect(page.locator('#simStateText')).toHaveText('Connected');
});
test('mobile console fits the viewport and stays usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});await mockBluetooth(page);await connect(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect.poll(()=>page.locator('#viewTest').evaluate(el=>Math.round(el.getBoundingClientRect().left))).toBe(0);
  await page.screenshot({path:'/tmp/t100-mobile-connected.png',fullPage:true});
});
test('scale profiles, container, countdown, notifications and food photos preserve protocol framing',async({page})=>{
  await mockBluetooth(page);await connect(page);
  await page.locator('#simContainerWeight').fill('100');await page.locator('#simContainerSet').click();
  await expect.poll(()=>page.evaluate(()=>mock.writes.some(w=>w.data[0]===0x77))).toBe(true);
  await page.locator('#simCurrentKcalInput').fill('-180');await page.locator('#simTargetKcalInput').fill('2000');
  await page.locator('#simKcalUpdateBtn').click();await expect(page.locator('#simLog')).toContainText('Countdown updated');
  await page.locator('#simNotifyTextInput').fill('Hello');await page.locator('#simNotifyBtn').click();
  await expect(page.locator('#simLog')).toContainText('Notify sent',{timeout:15000});
  await page.locator('#simHistKcalInput').fill('250');await page.locator('#simHistWeightInput').fill('100');
  await page.locator('#historyImageWheel2').press('ArrowDown');await page.locator('#simAppendKcalBtn').click();
  await expect(page.locator('#simLog')).toContainText('1 photos',{timeout:15000});
  const writes=await page.evaluate(()=>mock.writes.filter(w=>['fee2','fee3'].includes(w.id)));
  for(const topic of [0x77,0x63,0x64,0x72,0x69,0x6f,0x70,0x65,0x66,0x67,0x68]) {
    const write=writes.find(w=>w.data[0]===topic);expect(write,`topic ${topic.toString(16)}`).toBeTruthy();
    expect(write.data.slice(1,9)).toEqual([...Buffer.from('TEST1234')]);
  }
  await expect(page.locator('#simDisconnectBtn')).toHaveCount(0);
  await expect(page.locator('#modeWheel img')).toHaveCount(4);
  await page.locator('#modeWheel').press('End');
  await expect.poll(()=>page.evaluate(()=>mock.writes.some(w=>w.data[0]===0x75))).toBe(true);
  await page.locator('#simCoffeeApplyBtn').click();
  await expect.poll(()=>page.evaluate(()=>mock.writes.some(w=>w.data[0]===0x74))).toBe(true);
});
test('OAD uses the selected file and waits for device acknowledgement',async({page})=>{
  await mockBluetooth(page);await connect(page);await swipeTo(page, 'oad');
  const firmware=Buffer.alloc(32);firmware.writeUInt16LE(8,6);
  const chooser=page.waitForEvent('filechooser');await page.locator('#simFirmwareBtn').click();
  await (await chooser).setFiles({name:'test-oad.bin',mimeType:'application/octet-stream',buffer:firmware});
  await page.locator('#simOadBtn').click();
  await expect(page.locator('#simLog')).toContainText('OAD acknowledged',{timeout:15000});
  const writes=await page.evaluate(()=>mock.writes);
  expect(writes.find(w=>w.id==='ffc1').data).toEqual([...firmware.subarray(0,20)]);
  expect(writes.find(w=>w.id==='ffc3').data.length).toBe(39);
});
test('missing credentials still block private device commands',async({page})=>{
  await mockBluetooth(page,{stored:false});await connect(page);
  await page.locator('#simCurrentKcalInput').fill('200');
  await page.locator('#simTargetKcalInput').fill('1000');
  await page.locator('#simKcalUpdateBtn').click();
  await expect(page.locator('#simLog')).toContainText('No browser auth credential');
});
test('default scan has no type selector and accepts every T100 shell',async({page})=>{
  await mockBluetooth(page);await connect(page);
  await expect(page.locator('#scanShell')).toHaveCount(0);
  await expect(page.locator('#viewConnect button')).toHaveCount(1);
  await expect(page.locator('#viewConnect')).not.toContainText('Selected devices');
  await expect(page.locator('#viewConnect')).not.toContainText('Firmware');
  await expect(page.locator('#viewConnect')).not.toContainText('Browser credentials');
  const filters=await page.evaluate(()=>mock.requests[0].filters.map(f=>({namePrefix:f.namePrefix,
    data:[...f.manufacturerData[0].dataPrefix],mask:[...f.manufacturerData[0].mask]})));
  expect(filters).toEqual([{namePrefix:'YD-',data:[0x50,0,1],mask:[255,0,255]}]);
});
test('reset clears persisted credentials only after the authenticated command succeeds',async({page})=>{
  await mockBluetooth(page);await connect(page);page.on('dialog',dialog=>dialog.accept());
  await page.locator('#simResetBtn').click();await expect(page.locator('#simLog')).toContainText('Reset sent');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('t100.mfg.auth.v1')))).toEqual([]);
  expect(await page.evaluate(()=>mock.writes.find(w=>w.data[0]===0x52).stored)).toBe(true);
});

test('OAD disconnection without acknowledgement is reported as failure',async({page})=>{
  await mockBluetooth(page);await connect(page);await swipeTo(page, 'oad');
  await page.evaluate(()=>{mock.oadDisconnect=true;});
  const firmware=Buffer.alloc(32);firmware.writeUInt16LE(8,6);
  const chooser=page.waitForEvent('filechooser');await page.locator('#simFirmwareBtn').click();
  await(await chooser).setFiles({name:'test-oad.bin',mimeType:'application/octet-stream',buffer:firmware});
  await page.locator('#simOadBtn').click();
  await expect(page.locator('#simLog')).toContainText('OAD failed',{timeout:15000});
  await expect(page.locator('#simLog')).not.toContainText('OAD acknowledged');
});
test('unsupported browser disables the picker and explains compatibility',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'bluetooth',{value:undefined,configurable:true}));
  await page.goto('/');await expect(page.locator('#simRefreshScanBtn')).toBeDisabled();
  await expect(page.locator('#browserSupport')).toContainText('does not support');
  await page.screenshot({path:'/tmp/t100-desktop-final.png',fullPage:true});
});

test('simulator is connection-gated and follows Bluetooth weight',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await mockBluetooth(page);await page.goto('/');
  await swipeTo(page, 'test');
  await expect(page.locator('.simulator-pane')).toBeHidden();
  await expect(page.locator('#viewTest [data-connect-picker]')).toBeVisible();
  await page.locator('#viewTest [data-connect-picker]').click();
  await expect(page.locator('.simulator-pane')).toBeVisible();
  await expect(page.locator('#viewTest [data-connect-picker]')).toBeHidden();
  const runtime=page.frameLocator('#runtimeFrame');
  await expect(runtime.locator('#runtimeText')).toHaveText('Wasm running');
  await expect(page.locator('#unifiedControls')).toBeVisible();
  await expect(runtime.locator('#bothKey')).toHaveCount(0);
  await expect(runtime.locator('#weighPad')).toHaveCount(0);
  await expect(runtime.locator('#weight')).toHaveValue('123.5');
  await page.evaluate(()=>mock.notifyWeight());
  await expect(runtime.locator('#weight')).toHaveValue('500.0');
  await page.evaluate(()=>mock.disconnect());
  await expect(page.locator('#previewSource')).toContainText('No device connected');
  await swipeTo(page, 'test');
  await expect(page.locator('.simulator-pane')).toBeHidden();
  await expect(page.locator('#viewTest [data-connect-picker]')).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  expect(errors).toEqual([]);
});


test('tab-free screens slide after connection and preserve state across swipes',async({page})=>{
  await mockBluetooth(page);await page.goto('/');
  await expect(page.locator('.console-nav')).toHaveCount(0);
  await expect(page.locator('#viewConnect')).toHaveAttribute('aria-hidden','false');
  await expect(page.locator('#viewTest')).toHaveAttribute('inert','');
  await page.getByRole('button',{name:'Select Bluetooth Device'}).click();
  await expect(page.locator('#viewTest')).toHaveAttribute('aria-hidden','false');
  await expect(page.locator('#screenTrack')).toHaveCSS('transform', /matrix\(1, 0, 0, 1, -[0-9]+, 0\)/);
  await page.locator('#simCurrentKcalInput').fill('520');
  await swipeTo(page, 'oad');
  await expect(page.locator('#viewOad')).toHaveAttribute('aria-hidden','false');
  await expect(page.locator('#viewTest')).toHaveAttribute('inert','');
  await swipeTo(page, 'test');
  await expect(page.locator('#simCurrentKcalInput')).toHaveValue('520');
  await page.setViewportSize({width:390,height:844});
  await swipeTo(page, 'connect');
  const surface=page.locator('#viewConnect .view-subtitle');
  await surface.dispatchEvent('pointerdown',{isPrimary:true,button:0,pointerId:1,clientX:320,clientY:400});
  await surface.dispatchEvent('pointerup',{isPrimary:true,button:0,pointerId:1,clientX:100,clientY:410});
  await expect(page.locator('#viewTest')).toHaveAttribute('aria-hidden','false');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});

test('horizontal trackpad switches screens without intercepting vertical scrolling',async({page})=>{
  await mockBluetooth(page);await connect(page);
  const viewport=page.locator('#screenViewport');
  await viewport.dispatchEvent('wheel',{deltaX:0,deltaY:200});
  await expect(page.locator('#viewTest')).toHaveAttribute('aria-hidden','false');
  await viewport.dispatchEvent('wheel',{deltaX:100,deltaY:0});
  await expect(page.locator('#viewOad')).toHaveAttribute('aria-hidden','false');
});


test('all disconnected screens share the Connect layout and chooser',async({page})=>{
  await mockBluetooth(page);await page.goto('/');
  const bounds=async selector=>page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return {y:r.y,width:r.width,height:r.height};});
  const baseline=await bounds('#viewConnect .connection-layout');
  for (const view of ['test','oad']) {
    await swipeTo(page,view);
    const selector=view==='test'?'#viewTest':'#viewOad';
    await expect(page.locator(`${selector} .connection-layout`)).toBeVisible();
    const actual = await bounds(`${selector} .connection-layout`);
    for (const key of ['y','width','height']) expect(actual[key]).toBeCloseTo(baseline[key], 1);
    await expect(page.getByRole('button',{name:'Select Bluetooth Device'})).toBeVisible();
  }
  await page.getByRole('button',{name:'Select Bluetooth Device'}).click();
  await expect(page.locator('#simStateText')).toHaveText('Connected');
  await expect(page.locator('#viewTest .connection-layout')).toBeHidden();
  await expect(page.locator('.simulator-pane')).toBeVisible();
});


test('simplified controls remove duplicate display and always operate the device',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await mockBluetooth(page);await connect(page);
  await expect(page.locator('#controlTarget,#previewExtras,#deviceSettings,.scale-hero,#simNavigateScaleBtn,#simTareBtn,#simUnitBtn,#applyLights')).toHaveCount(0);
  await page.locator('#simCurrentKcalInput').fill('200');
  await page.locator('#simTargetKcalInput').fill('1000');
  const writes=await page.evaluate(()=>mock.writes.length);
  await page.locator('#simKcalUpdateBtn').click();
  await expect.poll(()=>page.evaluate(()=>mock.writes.length)).toBeGreaterThan(writes);
  await expect(page.locator('#simLog')).toContainText('Countdown updated');
  expect(errors).toEqual([]);
});

test('unbound device shows pairing preview despite incoming weight',async({page})=>{
  await mockBluetooth(page,{bound:false,stored:false});await connect(page);
  const runtime=page.frameLocator('#runtimeFrame');
  await expect(runtime.locator('#sceneText')).toHaveText('Pairing');
  await expect(page.locator('#previewSource')).toContainText('Unbound');
  const pixels=()=>runtime.locator('#panel').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,320,80).data));
  const before=await pixels();
  expect(before.some((v,i)=>i%4!==3&&v>0)).toBe(true);
  await page.evaluate(()=>mock.notifyWeight());
  await expect(runtime.locator('#sceneText')).toHaveText('Pairing');
  expect(await pixels()).toEqual(before);
  await page.locator('#simBindBtn').click();
  await expect(page.locator('#simStateText')).toHaveText('Idle');
  await page.getByRole('button',{name:'Select Bluetooth Device'}).click();
  await expect(page.locator('#simStateText')).toHaveText('Connected');
  await expect(runtime.locator('#sceneText')).toHaveText('Scale');
  await expect(page.locator('#previewSource')).toContainText('Bluetooth status');
});


for (const bindUuidForm of ['raw','reversed']) test(`firmware ${bindUuidForm} bind UUID is authorized, recognized and binds before upload`,async({page})=>{
  await mockBluetooth(page,{bound:false,stored:false,bindUuidForm});await connect(page);
  await expect(page.frameLocator('#runtimeFrame').locator('#sceneText')).toHaveText('Pairing');
  await page.locator('#simBindBtn').click();
  await expect(page.locator('#simLog')).toContainText('Bind complete',{timeout:20000});
  const writes=await page.evaluate(()=>mock.writes);
  const commit=writes.findIndex(w=>['fee2','fee3'].includes(w.id)&&w.data[0]===0x54);
  const upload=writes.findIndex(w=>['fee2','fee3'].includes(w.id)&&w.data[0]===0x6a);
  expect(commit).toBeGreaterThanOrEqual(0);expect(writes[commit].stored).toBe(true);
  expect(upload).toBeGreaterThan(commit);
});


test('FEE5 controls Idle, scale modes and sleep without weight changing the screen',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await mockBluetooth(page,{initialScreen:1});await connect(page);
  const runtime=page.frameLocator('#runtimeFrame');
  await expect(runtime.locator('#sceneText')).toHaveText('Idle');
  await page.evaluate(()=>mock.notifyWeight());
  await expect(runtime.locator('#weight')).toHaveValue('500.0');
  await expect(runtime.locator('#sceneText')).toHaveText('Idle');
  await page.evaluate(()=>mock.notifyStatus(7,2));
  await expect(runtime.locator('#sceneText')).toHaveText('Coffee scale');
  await expect(runtime.locator('#mode')).toHaveValue('3');
  await page.evaluate(()=>mock.notifyStatus(1));
  await expect(runtime.locator('#sceneText')).toHaveText('Idle');
  await page.evaluate(()=>mock.notifyStatus(2));
  await expect(runtime.locator('#sceneText')).toHaveText('Idle sleep');
  await expect(runtime.locator('#panel')).toHaveCSS('filter','brightness(0)');
  await page.evaluate(()=>mock.notifyStatus(1));
  await expect(runtime.locator('#panel')).toHaveCSS('filter','brightness(1)');
  for(const [screen,label] of [[3,'Countdown'],[5,'History'],[6,'Notification']]) {
    await page.evaluate(screen=>mock.notifyStatus(screen),screen);
    await expect(runtime.locator('#sceneText')).toHaveText(label);
    await page.evaluate(()=>mock.notifyWeight());
    await expect(runtime.locator('#sceneText')).toHaveText(label);
  }
  await page.evaluate(()=>mock.notifyStatus(4,0));
  await expect(runtime.locator('#sceneText')).toHaveText('Scale');
  await expect(runtime.locator('#mode')).toHaveValue('1');
  expect(errors).toEqual([]);
});


test('history image wheels, unit wheel and stars submit the chosen values',async({page})=>{
  await page.setViewportSize({width:390,height:844});await mockBluetooth(page);await connect(page);
  await page.locator('#historyCard').scrollIntoViewIfNeeded();
  for(let i=1;i<=3;i++) {
    const wheel=page.locator(`#historyImageWheel${i}`);
    await wheel.press('ArrowDown');
    if(i===2)await wheel.press('ArrowDown');
  }
  await page.locator('#historyUnitWheel').press('End');
  await expect(page.locator('#simHistUnitSelect')).toHaveValue('oz');
  await page.getByRole('radio',{name:'5 out of 5',exact:true}).click();
  await expect(page.getByRole('radio',{name:'5 out of 5',exact:true})).toHaveAttribute('aria-checked','true');
  await page.locator('#simHistKcalInput').fill('250');
  await page.locator('#simHistWeightInput').fill('4');
  const expected=await page.evaluate(()=>({foodFiles:[1,2,3].map(i=>document.getElementById(`simHistPhoto${i}`).value),kcal:250,weight:4,unit:'oz',rating:5}));
  await page.evaluate(()=>{const original=mfgApi.appendKcalHist;mfgApi.appendKcalHist=data=>{window.historySubmitted=data;return original(data);};});
  const boxes=await page.locator('.history-image-wheels .history-wheel-frame').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};}));
  expect(boxes.every(b=>b.y===boxes[0].y)).toBe(true);
  expect(boxes[2].x+boxes[2].width).toBeLessThanOrEqual(390);
  await page.screenshot({path:'/tmp/t100-history-wheels.png'});
  await page.locator('#simAppendKcalBtn').click();
  await expect(page.locator('#simLog')).toContainText('3 photos',{timeout:15000});
  expect(await page.evaluate(()=>historySubmitted)).toEqual(expected);
  await page.getByRole('radio',{name:'5 out of 5',exact:true}).press('ArrowLeft');
  await expect(page.locator('#simHistRating')).toHaveValue('4');
});

test('device modules keep their controls on compact horizontal rows',async({page})=>{
  await page.setViewportSize({width:1440,height:1100});await mockBluetooth(page);await connect(page);
  await page.locator('#historyCard').scrollIntoViewIfNeeded();
  for(const row of await page.locator('.compact-row').all()) {
    const centers=await row.evaluate(el=>[...el.children].filter(c=>!c.hidden).map(c=>{const r=c.getBoundingClientRect();return r.y+r.height/2;}));
    expect(Math.max(...centers)-Math.min(...centers)).toBeLessThan(2);
  }
  await page.screenshot({path:'/tmp/t100-compact-controls.png'});
  await page.setViewportSize({width:390,height:844});
  const row=page.locator('#historyCard');
  expect(await row.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:'/tmp/t100-responsive-controls-mobile.png'});
  await row.dispatchEvent('wheel',{deltaX:100,deltaY:0});
  await expect(page.locator('#viewTest')).toHaveAttribute('aria-hidden','false');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});

test('notification status uses Wasm PWM brightness through entry and exit',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await mockBluetooth(page,{initialScreen:1});await connect(page);
  await expect(page.frameLocator('#runtimeFrame').locator('#sceneText')).toHaveText('Idle');
  const sample=screen=>page.evaluate(async screen=>{
    mock.notifyStatus(screen);
    const panel=document.getElementById('runtimeFrame').contentDocument.getElementById('panel');
    const levels=[];
    for(let i=0;i<28;i++) { levels.push(Number(panel.style.filter.match(/brightness\(([^)]+)/)?.[1]));await new Promise(r=>setTimeout(r,16)); }
    return levels;
  },screen);
  for(const screen of [6,1]) {
    const levels=await sample(screen);
    expect(levels.some(level=>level>0&&level<1)).toBe(true);
    expect(levels).toContain(0);
    expect(levels.at(-1)).toBe(1);
  }
  await expect(page.frameLocator('#runtimeFrame').locator('#sceneText')).toHaveText('Idle');
  expect(errors).toEqual([]);
});

test('image wheels drag and scroll, while star dragging increases and decreases rating',async({page})=>{
  await page.setViewportSize({width:1440,height:1100});await mockBluetooth(page);await connect(page);
  await page.locator('#historyCard').scrollIntoViewIfNeeded();
  await expect(page.locator('#simContainerStatus')).toBeEmpty();
  const wheel=page.locator('#historyImageWheel1');
  let box=await wheel.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2+10);
  await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2-10,{steps:10});await page.mouse.up();
  await expect(page.locator('#simHistPhoto1')).toHaveValue('Banana.png');
  await wheel.hover();await page.mouse.wheel(0,100);
  await expect.poll(()=>page.locator('#simHistPhoto1').inputValue()).not.toBe('Banana.png');
  const first=await page.getByRole('radio',{name:'1 out of 5',exact:true}).boundingBox();
  const last=await page.getByRole('radio',{name:'5 out of 5',exact:true}).boundingBox();
  await page.mouse.move(first.x+first.width/2,first.y+first.height/2);await page.mouse.down();
  await page.mouse.move(last.x+last.width/2,last.y+last.height/2,{steps:10});
  await expect(page.locator('#simHistRating')).toHaveValue('5');
  await page.mouse.move(first.x+first.width/2,first.y+first.height/2,{steps:10});
  await expect(page.locator('#simHistRating')).toHaveValue('1');
  await page.mouse.up();
  await expect(page.locator('#viewTest')).toHaveAttribute('aria-hidden','false');
  await page.getByRole('radio',{name:'4 out of 5',exact:true}).click();
  await expect(page.locator('#simHistRating')).toHaveValue('4');
});

test('simulator mode wheel uses Wasm titles and follows device mode',async({page})=>{
  await mockBluetooth(page);await connect(page);
  const wheel=page.locator('#modeWheel');
  await expect(wheel.locator('img')).toHaveCount(4);
  const images=await wheel.locator('img').evaluateAll(nodes=>nodes.map(n=>n.src));
  expect(new Set(images).size).toBe(4);
  await expect(page.locator('#simDisconnectBtn')).toHaveCount(0);
  await wheel.scrollIntoViewIfNeeded();
  await wheel.press('Home');await wheel.press('ArrowDown');
  await expect.poll(()=>page.evaluate(()=>mock.writes.some(w=>w.data[0]===0x75))).toBe(true);
  await expect(wheel.locator('[aria-selected=true]')).toHaveAttribute('data-value','0');
  await expect(wheel.locator('[aria-selected=true]')).toHaveCSS('height','24px');
  await expect(wheel).not.toHaveCSS('mask-image','none');
  await page.screenshot({path:'/tmp/t100-kitchen-wheel.png'});
  await expect(wheel).toHaveAttribute('aria-disabled','false');
  await page.evaluate(()=>mock.notifyStatus(7,2));
  await expect(wheel.locator('[aria-selected=true]')).toHaveAttribute('data-value','2');
  await page.screenshot({path:'/tmp/t100-mode-wheel.png'});
});

test('transparent device unit wheel sends units and follows Bluetooth readings',async({page})=>{
  await mockBluetooth(page);await connect(page);
  const wheel=page.locator('#deviceUnitWheel');
  await expect(page.locator('.simulator-unit-corner')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await wheel.press('End');
  await expect.poll(()=>page.evaluate(()=>mock.writes.some(w=>w.data[0]===0x62 && w.data.at(-1)===1))).toBe(true);
  await expect(wheel).toHaveAttribute('aria-disabled','false');
  await page.evaluate(()=>mock.notifyWeight());
  await expect(wheel.locator('[aria-selected=true]')).toHaveText('g');
  await wheel.press('End');
  await expect(wheel).toHaveAttribute('aria-disabled','false');
  await wheel.press('Home');
  await expect.poll(()=>page.evaluate(()=>mock.writes.some(w=>w.data[0]===0x62 && w.data.at(-1)===0))).toBe(true);
});
