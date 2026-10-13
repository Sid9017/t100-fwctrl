import { test, expect } from '@playwright/test';
import { generateKeyPairSync, sign } from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {signedFixture,testPublicKey} from '../fixtures/signed-ota.js';
import {SIGNED_OTA_UUIDS as U,OTA_PUBLIC_KEY_HEX} from '../../src/web/signed-ota-format.js';
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
async function mockBluetooth(page,{bound=true,stored=true,cancel=false,storageFailure=false,failTheme=false,bindUuidForm='canonical',initialScreen=4,pickerName=name,firmware='1.0.0-5678'}={}) {
  await page.addInitScript(({name,record,token,bound,stored,cancel,storageFailure,failTheme,bindUuidForm,initialScreen,testKey,U,publishingKey,firmware})=>{
    if(stored && !localStorage.getItem('t100.mfg.auth.v1'))localStorage.setItem('t100.mfg.auth.v1',JSON.stringify([record]));
    if(storageFailure)Storage.prototype.setItem=()=>{throw new DOMException('Full','QuotaExceededError');};
    const instantiate=WebAssembly.instantiate.bind(WebAssembly);
    WebAssembly.instantiate=async(...args)=>{const result=await instantiate(...args);window.testWasm=result.instance?.exports??result.exports;return result;};
    // Browser fixtures use a disposable signer, never the production private key.
    const originalImport=crypto.subtle.importKey.bind(crypto.subtle);
    crypto.subtle.importKey=(format,keyData,algorithm,...rest)=>originalImport(format,format==='raw'&&algorithm.name==='ECDSA'&&Array.from(new Uint8Array(keyData.buffer??keyData,keyData.byteOffset??0,keyData.byteLength??keyData.length)).map(b=>b.toString(16).padStart(2,'0')).join('')===publishingKey?Uint8Array.from(testKey):keyData,algorithm,...rest);
    const full=s=>s.length===4?`0000${s}-0000-1000-8000-00805f9b34fb`:s;
    window.mock={writes:[],requests:[],connects:0,bound,cancel,failTheme,firmware};
    const device=new EventTarget();device.id='mock-t100';device.name=name;
    const chars=new Map();
    function char(id,properties,bytes=[]) {
      const c=new EventTarget();c.uuid=full(id);c.properties=properties;
      c.readValue=async()=>new DataView(Uint8Array.from(bytes).buffer);
      c.startNotifications=async()=>c;c.stopNotifications=async()=>c;
      c.writeValueWithResponse=async value=>{
        const data=Array.from(value);window.mock.writes.push({id,data,stored:!!localStorage.getItem('t100.mfg.auth.v1')});
        if(['fee2','fee3'].includes(id)&&data[0]===0x54)window.mock.bound=true;
        if(['fee2','fee3'].includes(id)&&[0x52,0x53].includes(data[0])) {
          window.mock.resetWrittenAt=Date.now();
          setTimeout(()=>{window.mock.resetConnectionSurvived=device.gatt.connected;window.mock.bound=false;device.gatt.disconnect();},400);
        }
        if(['fee2','fee3'].includes(id)&&data[0]===0x6a&&window.mock.failTheme)throw new Error('Injected theme upload failure');
        if(['fee2','fee3'].includes(id)&&data[0]===0x77){
          if(window.mock.lowMtuContainer)throw new Error('ATT MTU below 39');
          if(!window.mock.skipContainerEcho)setTimeout(()=>window.mock.notifyContainer(window.mock.containerIdle?{active:false}:{mg:data[10]?new DataView(Uint8Array.from(data).buffer).getUint32(11,true):null,uuid:data[10]?(window.mock.wrongContainerUuid??data.slice(15,31)):null}),10);
        }
        if(id===U.data && window.mock.oadDisconnect) { device.gatt.disconnect(); return; }
        if(id===U.control){
          if(data[0]===1){window.mock.otaState=1;window.mock.otaError=0;}
          if(data[0]===2){window.mock.manifest??=new Uint8Array(128);window.mock.manifest.set(data.slice(2),data[1]);}
          if(data[0]===3){window.mock.otaSize=new DataView(window.mock.manifest.buffer).getUint32(8,true);window.mock.otaState=4;}
          if(data[0]===4)window.mock.otaState=6;
          if(data[0]===5)window.mock.otaState=0;
        }
        if(id===U.data)window.mock.otaOffset=new DataView(Uint8Array.from(data).buffer).getUint32(0,true)+data.length-4;
      };
      c.writeValueWithoutResponse=c.writeValueWithResponse;chars.set(id,c);return c;
    }
    const notify={read:true,notify:true};
    const services=[
      ['fee0',[char('fee1',notify,[0,0x40,0xe2,1,0]),char('fee2',{write:true}),char('fee3',{write:true}),char('fee4',{read:true,write:true},[1]),char('fee5',notify,[8,4,2,2,1,0,0,0])]],
      ['180a',[char('2a26',{read:true},[...new TextEncoder().encode(firmware)])]],
      ['180f',[char('2a19',notify,[87])]],
      ['1805',[char('2a2b',{read:true,write:true},[0xea,7,10,8,12,0,0,4,0,0])]],
      [U.service,[char(U.control,{write:true}),char(U.data,{write:true}),char(U.status,{read:true,notify:true})]],
    ].map(([id,characters])=>({uuid:full(id),getCharacteristics:async()=>characters}));
    const initialScale=new Uint8Array(36),initialView=new DataView(initialScale.buffer);
    initialView.setInt32(1,123456,true);initialScale.set([3,3,0,5,1],5);initialScale[14]=2;initialView.setInt32(15,123456,true);
    if([1,2].includes(initialScreen)){initialScale[8]=initialScale[9]=initialScale[14]=0;initialView.setInt32(15,0,true);}
    window.mock.scaleWire=initialScale;
    chars.get('fee1').readValue=async()=>new DataView(Uint8Array.from(window.mock.scaleWire).buffer);
    window.mock.notifyContainer=({mg=null,uuid=null,active=true,profile=3}={})=>{
      const b=new Uint8Array(36),v=new DataView(b.buffer);v.setInt32(1,123456-(mg??0),true);b.set([3,profile,0,active?(mg===null?5:7):0,active?1:0],5);v.setInt32(10,mg??0,true);b[14]=active?2:0;v.setInt32(15,active?123456:0,true);
      if(active&&mg!==null){const id=typeof uuid==='string'?uuid.replaceAll('-','').match(/../g).map(x=>parseInt(x,16)):uuid;b.set(id,20);}
      b[19]=((window.mock.scaleWire?.[19]??0)+1)&255;window.mock.scaleWire=b;const c=chars.get('fee1');c.value=v;c.dispatchEvent(new Event('characteristicvaluechanged'));
    };
    chars.get(U.status).readValue=async()=>{const bytes=new Uint8Array(12),v=new DataView(bytes.buffer);bytes.set([1,window.mock.otaState??0,window.mock.otaError??0,3]);v.setUint32(4,window.mock.otaOffset??0,true);v.setUint32(8,window.mock.otaSize??0,true);return v;};
    chars.get('2a26').readValue=async()=>new DataView(new TextEncoder().encode(window.mock.firmware).buffer);
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
      getPrimaryServices:async()=>[...services,...(!window.mock.bound?[bindService]:[])].filter(s=>window.mock.requests.at(-1).optionalServices.includes(s.uuid)),
      getPrimaryService:async id=>{
        if(!window.mock.requests.at(-1).optionalServices.includes(id))throw new DOMException('Origin is not allowed to access the service','SecurityError');
        const found=[...services,...(!window.mock.bound?[bindService]:[])].find(s=>s.uuid===id);
        if(!found)throw new DOMException('No matching service','NotFoundError');
        return found;
      }};
    window.mock.disconnect=()=>device.gatt.disconnect();
    window.mock.notifyStatus=(screen,profile,options={})=>{
      const c=chars.get('fee5');
      const bytes=new Uint8Array(profile == null ? 8 : 20);
      bytes.set([bytes.length,screen,options.phase??0,options.mode??2,window.mock.bound?1:0,0,0,0]);
      if(profile!=null){bytes[8]=1;bytes[9]=profile;new DataView(bytes.buffer).setUint32(12,15000,true);new DataView(bytes.buffer).setUint32(16,240000,true);}
      c.value=new DataView(bytes.buffer);c.dispatchEvent(new Event('characteristicvaluechanged'));
    };
    window.mock.notifySnapshot=({unit=0,value=0,profile=3,stage=0,flags=5,upperKind=1,upper=0,lowerKind=2,lower=0,sequence=0}={})=>{
      const bytes=new Uint8Array(20),v=new DataView(bytes.buffer);
      bytes[0]=unit;v.setInt32(1,value,true);bytes.set([2,profile,stage,flags,upperKind],5);v.setInt32(10,upper,true);bytes[14]=lowerKind;v.setInt32(15,lower,true);bytes[19]=sequence;
      const c=chars.get('fee1');c.value=v;c.dispatchEvent(new Event('characteristicvaluechanged'));
    };
    window.mock.notifyWeight=()=>{const c=chars.get('fee1');c.value=new DataView(new Uint8Array([0,0x20,0xa1,7,0]).buffer);c.dispatchEvent(new Event('characteristicvaluechanged'));};
    Object.defineProperty(navigator,'bluetooth',{configurable:true,value:{requestDevice:async options=>{
      window.mock.requests.push(options);if(window.mock.cancel)throw new DOMException('No device selected','NotFoundError');return device;
    }}});
  },{name:pickerName,record,token:admissionToken(),bound,stored,cancel,storageFailure,failTheme,bindUuidForm,initialScreen,testKey:[...testPublicKey],U,publishingKey:OTA_PUBLIC_KEY_HEX,firmware});
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
  await page.locator('#simHistKcalInput').fill('250');
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
test('OAD retries a previous ERROR with the selected file and waits for device acknowledgement',async({page})=>{
  await mockBluetooth(page);await connect(page);await swipeTo(page, 'oad');
  const {bytes:firmware,manifest}=latestFixture();
  const chooser=page.waitForEvent('filechooser');await page.locator('#simFirmwareBtn').click();
  await (await chooser).setFiles([{name:'test-oad.bin',mimeType:'application/octet-stream',buffer:firmware},{name:'test-oad.manifest',mimeType:'application/octet-stream',buffer:manifest}]);
  await page.evaluate(()=>{mock.otaState=7;mock.otaError=4;});
  await page.locator('#simOadBtn').click();
  await expect(page.locator('#simLog')).toContainText('Signed firmware committed',{timeout:15000});
  const writes=await page.evaluate(()=>mock.writes);
  expect(writes.find(w=>w.id===U.control).data).toEqual([1,...new TextEncoder().encode(record.auth_key)]);
  expect(writes.filter(w=>w.id===U.data).map(w=>w.data.slice(4)).flat()).toEqual([...firmware]);
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
  const {bytes:firmware,manifest}=latestFixture();
  const chooser=page.waitForEvent('filechooser');await page.locator('#simFirmwareBtn').click();
  await(await chooser).setFiles([{name:'test-oad.bin',mimeType:'application/octet-stream',buffer:firmware},{name:'test-oad.manifest',mimeType:'application/octet-stream',buffer:manifest}]);
  await page.locator('#simOadBtn').click();
  await expect(page.locator('#simLog')).toContainText('OAD failed',{timeout:15000});
  await expect(page.locator('#simLog')).not.toContainText('Signed firmware committed');
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
  await expect(runtime.locator('#panel')).toHaveCSS('filter','brightness(1)');
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


test('history image wheels and rating submit kcal without weight or unit',async({page})=>{
  await page.setViewportSize({width:390,height:844});await mockBluetooth(page);await connect(page);
  await page.locator('#historyCard').scrollIntoViewIfNeeded();
  for(let i=1;i<=3;i++) {
    const wheel=page.locator(`#historyImageWheel${i}`);
    await wheel.press('ArrowDown');
    if(i===2)await wheel.press('ArrowDown');
  }
  await page.getByRole('radio',{name:'5 out of 5',exact:true}).click();
  await expect(page.getByRole('radio',{name:'5 out of 5',exact:true})).toHaveAttribute('aria-checked','true');
  await page.locator('#simHistKcalInput').fill('250');
  const expected=await page.evaluate(()=>({foodFiles:[1,2,3].map(i=>document.getElementById(`simHistPhoto${i}`).value),kcal:250,rating:5}));
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

test('device operation cards align and adapt without overflowing',async({page})=>{
  await page.setViewportSize({width:1440,height:1100});await mockBluetooth(page);await connect(page);
  await page.locator('#historyCard').scrollIntoViewIfNeeded();
  for(const row of await page.locator('.compact-row').all()) {
    expect(await row.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    const buttons=await row.locator('button:visible').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));
    expect(buttons.every(height=>height>=44)).toBe(true);
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
  await expect(page.locator('#simContainerStatus')).toHaveText('No container set');
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

test('bound device without local auth explains recovery instead of asking to bind again',async({page})=>{
  await mockBluetooth(page,{bound:true,stored:false});await connect(page);
  const before=await page.evaluate(()=>mock.writes.length);
  await page.locator('#simBindBtn').click();
  await expect(page.locator('#simLog')).toContainText('Device reports BOUND');
  await expect(page.locator('#simLog')).toContainText('Restore its auth JSON');
  expect(await page.evaluate(()=>mock.writes.length)).toBe(before);
  expect(await page.evaluate(()=>localStorage.getItem('t100.mfg.auth.v1'))).toBeNull();
});

for (const [button,message] of [['#simResetBtn','Reset sent'],['#factoryBtn','Factory reset sent']]) {
  test(`binding uses selected device name and ${message} clears its credential`,async({page})=>{
    const pickerName='YD-03b93ed7594b';
    await mockBluetooth(page,{bound:false,stored:false,pickerName});await connect(page);
    await page.locator('#simBindBtn').click();
    await expect(page.locator('#simLog')).toContainText('Bind complete',{timeout:20000});
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('t100.mfg.auth.v1')));
    expect(saved[0].name).toBe(pickerName);
    expect(saved[0].pub_key).toBe(record.pub_key);
    await page.getByRole('button',{name:'Select Bluetooth Device',exact:true}).first().click();
    await expect(page.locator('#simStateText')).toHaveText('Connected');
    page.on('dialog',dialog=>dialog.accept());
    await page.locator(button).click();
    await expect(page.locator('#simLog')).toContainText(message);
    expect(await page.evaluate(()=>mock.resetConnectionSurvived)).toBe(true);
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('t100.mfg.auth.v1')))).toEqual([]);
  });
}

test('mobile header stays on one row, exposes device actions and starts with log off', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockBluetooth(page);
  await page.goto('/');
  await expect(page.locator('#logDrawerToggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#logDrawer')).toBeHidden();
  await page.getByRole('button', { name: 'Select Bluetooth Device' }).click();
  await expect(page.locator('#simStateText')).toHaveText('Connected');
  const header = await page.locator('.console-hud').evaluate(el => {
    const boxes = [...el.children].map(child => child.getBoundingClientRect());
    return { centers: boxes.map(box => box.y + box.height / 2), width: el.clientWidth, scrollWidth: el.scrollWidth };
  });
  expect(Math.max(...header.centers) - Math.min(...header.centers)).toBeLessThan(2);
  expect(header.scrollWidth).toBeLessThanOrEqual(header.width);
  await page.getByText('Actions', { exact: true }).click();
  await expect(page.locator('#simResetBtn')).toBeVisible();
  await page.getByText('Actions', { exact: true }).click();
  await expect(page.locator('#simResetBtn')).toBeHidden();
  await page.locator('#logDrawerToggle').click();
  await expect(page.locator('#logDrawer')).toBeVisible();
  await page.locator('#logDrawerToggle').click();
  await page.screenshot({ path: '/tmp/t100-mobile-header.png' });
});

test('companion layout loads its artwork and keeps controls accessible across viewport sizes', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await mockBluetooth(page);
  await page.goto('/');
  await expect.poll(()=>page.locator('#viewConnect .connection-illustration').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({path:'/tmp/t100-app-connect.png'});
  await page.getByRole('button',{name:'Select Bluetooth Device'}).click();
  await expect(page.locator('#simStateText')).toHaveText('Connected');
  await expect.poll(()=>page.frameLocator('#runtimeFrame').locator('.chassis').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(()=>page.locator('#viewTest').evaluate(el=>Math.round(el.getBoundingClientRect().left))).toBe(0);
  await page.screenshot({path:'/tmp/t100-app-mobile.png'});
  for(const [width,height] of [[320,640],[375,812],[844,390],[768,1024],[1440,1000]]) {
    await page.setViewportSize({width,height});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    for(const card of await page.locator('.compact-row').all()) {
      expect(await card.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    }
    await page.locator('#simAppendKcalBtn').scrollIntoViewIfNeeded();
    await expect(page.locator('#simAppendKcalBtn')).toBeInViewport();
    await page.locator('#viewTest').evaluate(el=>el.scrollTo(0,0));
    if(width===1440)await page.screenshot({path:'/tmp/t100-app-desktop.png'});
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#historyCard').scrollIntoViewIfNeeded();
  await page.screenshot({path:'/tmp/t100-app-controls.png'});
  await page.getByRole('button',{name:'Firmware screen',exact:true}).click();
  await expect(page.locator('#viewOad')).toHaveAttribute('aria-hidden','false');
  await expect.poll(()=>page.locator('#viewOad').evaluate(el=>Math.round(el.getBoundingClientRect().left))).toBe(0);
  await page.screenshot({path:'/tmp/t100-app-firmware.png'});
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('#screenTrack')).toHaveCSS('transition-duration','0s');
  await page.getByRole('button',{name:'Controls screen',exact:true}).click();
  await expect(page.locator('#viewTest')).toHaveAttribute('aria-hidden','false');
});

test('live preview uses committed countdown and notify pixels, keeps unknown history out of the canvas, and clears on reconnect',async({page})=>{
  await mockBluetooth(page,{initialScreen:1});await connect(page);
  const runtime=page.frameLocator('#runtimeFrame');
  await expect(runtime.locator('#leftLed')).toBeDisabled();
  await expect(runtime.locator('#rightLed')).toBeDisabled();
  await page.locator('#simCurrentKcalInput').fill('-180');await page.locator('#simTargetKcalInput').fill('1800');
  await page.locator('#simKcalUpdateBtn').click();await expect(page.locator('#simLog')).toContainText('Countdown updated');
  await page.evaluate(()=>mock.notifyStatus(3,undefined,{phase:1}));
  await expect.poll(()=>page.evaluate(()=>document.querySelector('#runtimeFrame').contentWindow.t100Preview.missingContent)).toBe('');
  await expect(runtime.locator('#panel')).toHaveCSS('filter','brightness(1)');
  const lit=()=>runtime.locator('#panel').evaluate(el=>el.getContext('2d').getImageData(0,0,320,80).data.some((v,i)=>i%4!==3&&v>0));
  await expect.poll(lit).toBe(true);
  await page.evaluate(()=>mock.notifyStatus(5));
  await expect(page.locator('#previewSource')).toContainText('History records and page index');
  await expect.poll(lit).toBe(false);
  await page.locator('#simNotifyTextInput').fill('HELLO');await page.locator('#simNotifyBtn').click();
  await expect(page.locator('#simLog')).toContainText('Notify sent',{timeout:15000});
  await page.evaluate(()=>mock.notifyStatus(6));
  await expect.poll(()=>page.evaluate(()=>document.querySelector('#runtimeFrame').contentWindow.t100Preview.missingContent)).toBe('');
  await expect.poll(lit).toBe(true);
  await page.evaluate(()=>mock.disconnect());
  await page.getByRole('button',{name:'Select Bluetooth Device'}).click();
  await expect(page.locator('#simStateText')).toHaveText('Connected');
  await page.evaluate(()=>mock.notifyStatus(3,undefined,{phase:1}));
  await expect(page.locator('#previewSource')).toContainText('Countdown values are not reported');
  await expect.poll(lit).toBe(false);
});

for (const count of [0,2]) test(`history uploads ${count} photos with kcal-only RECORD`,async({page})=>{
  await mockBluetooth(page);await connect(page);
  await expect(page.locator('#simHistWeightInput, #simHistUnitSelect, #historyUnitWheel')).toHaveCount(0);
  await page.locator('#historyCard').scrollIntoViewIfNeeded();
  await page.locator('#simHistKcalInput').fill('682');
  for(let i=1;i<=count;i++)await page.locator(`#historyImageWheel${i}`).press('ArrowDown');
  await page.locator('#simAppendKcalBtn').click();
  await expect(page.locator('#simLog')).toContainText(`${count} photos`,{timeout:15000});
  const writes=await page.evaluate(()=>mock.writes.filter(w=>['fee2','fee3'].includes(w.id)));
  const record=writes.find(w=>w.data[0]===0x65).data;
  expect(record).toHaveLength(36);
  expect(record.slice(29,33)).toEqual([170,2,0,0]);
  expect(record.slice(33)).toEqual([count?1:0,4,count]);
  const begins=writes.filter(w=>w.data[0]===0x66);
  expect(begins).toHaveLength(count);
  expect(begins.map(w=>w.data[41])).toEqual(Array.from({length:count},(_,i)=>i));
  expect(writes.filter(w=>w.data[0]===0x68)).toHaveLength(count);
});

const signedLatest=signedFixture(0x1234);
function latestFixture() {
  const {bytes,manifest,metadata}=signedLatest;
  return {bytes:Buffer.from(bytes),manifest:Buffer.from(manifest),metadata:{...metadata,downloadUrl:`/api/ota/signed/download/${metadata.sha256}/${metadata.manifestSha256}`,manifestUrl:`/api/ota/signed/manifest/${metadata.sha256}/${metadata.manifestSha256}`}};
}
test.describe('firmware release details',()=>{
test.use({timezoneId:'Asia/Shanghai'});
test('latest OAD selects after connection without starting an upgrade',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  const {bytes,manifest,metadata}=latestFixture();
  metadata.uploadedAt='2026-10-10T07:30:00Z';
  await page.route('**/api/ota/signed/latest',route=>route.fulfill({json:metadata}));
  await page.route('**/api/ota/signed/download/**',route=>route.fulfill({body:bytes,contentType:'application/octet-stream'}));
  await page.route('**/api/ota/signed/manifest/**',route=>route.fulfill({body:manifest,contentType:'application/octet-stream'}));
  await mockBluetooth(page);await connect(page);
  await expect(page.locator('#simFirmwareBtn')).toHaveText('T100_OAD.bin');
  await expect(page.locator('#latestFirmwareStatus')).toHaveText('Signature verified · 0.0 KB');
  await expect(page.locator('#firmwareDetails')).not.toHaveAttribute('open');
  await expect(page.locator('#firmwareDetailHash')).toBeHidden();
  await swipeTo(page,'oad');await expect(page.locator('#simOadBtn')).toBeEnabled();
  await expect.poll(()=>page.locator('#viewOad').evaluate(el=>Math.round(el.getBoundingClientRect().left))).toBe(0);
  await page.screenshot({path:'/tmp/t100-firmware-collapsed.png'});
  const summary=page.locator('#firmwareDetails summary');
  await summary.click();
  await expect(page.locator('#firmwareDetailVersion')).toHaveText('0x1234');
  await expect(page.locator('#firmwareDetailTime')).toHaveText('2026-10-10 15:30:00');
  await expect(page.locator('#firmwareDetailHash')).toHaveText(metadata.sha256);
  expect(await page.locator('.firmware-detail-list').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:'/tmp/t100-firmware-expanded.png'});
  await page.locator('#simOadBtn').scrollIntoViewIfNeeded();await expect(page.locator('#simOadBtn')).toBeInViewport();
  await page.setViewportSize({width:812,height:375});await page.emulateMedia({reducedMotion:'reduce'});
  expect(await page.locator('.firmware-detail-list').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await summary.focus();await summary.press('Enter');
  await expect(page.locator('#firmwareDetails')).not.toHaveAttribute('open');
  expect(await page.evaluate(()=>mock.writes.filter(w=>w.id.startsWith('0bb0')))).toEqual([]);
});
});
test('latest OAD failure keeps manual selection available',async({page})=>{
  await page.route('**/api/ota/signed/latest',route=>route.fulfill({status:404,json:{error:'No published firmware'}}));
  await mockBluetooth(page);await connect(page);await swipeTo(page,'oad');
  await expect(page.locator('#latestFirmwareStatus')).toContainText('Select a local');
  await expect(page.locator('#simOadBtn')).toBeDisabled();
  const chooser=page.waitForEvent('filechooser');await page.locator('#simFirmwareBtn').click();
  await (await chooser).setFiles([{name:'local_oad.bin',mimeType:'application/octet-stream',buffer:latestFixture().bytes},{name:'local_oad.manifest',mimeType:'application/octet-stream',buffer:latestFixture().manifest}]);
  await expect(page.locator('#simFirmwareBtn')).toHaveText('T100_OAD.bin');
  await expect(page.locator('#firmwareDetailVersion')).toHaveText('0x1234');
  await expect(page.locator('#firmwareDetailTime')).toHaveText('Local file');
  await expect(page.locator('#simOadBtn')).toBeEnabled();
});
test('manual selection and disconnection supersede an outstanding latest download',async({page})=>{
  const {bytes,manifest,metadata}=latestFixture();let release;const gate=new Promise(r=>release=r);
  await page.route('**/api/ota/signed/latest',async route=>{await gate;await route.fulfill({json:metadata}).catch(()=>{});});
  await page.route('**/api/ota/signed/download/**',route=>route.fulfill({body:bytes,contentType:'application/octet-stream'}));
  await page.route('**/api/ota/signed/manifest/**',route=>route.fulfill({body:manifest,contentType:'application/octet-stream'}));
  await mockBluetooth(page);await connect(page);await swipeTo(page,'oad');
  await expect(page.locator('#latestFirmwareStatus')).toContainText('Loading');
  const chooser=page.waitForEvent('filechooser');await page.locator('#simFirmwareBtn').click();
  await (await chooser).setFiles([{name:'manual.bin',mimeType:'application/octet-stream',buffer:bytes},{name:'manual.manifest',mimeType:'application/octet-stream',buffer:manifest}]);
  release();await expect(page.locator('#simFirmwareBtn')).toHaveText('T100_OAD.bin');
  await page.evaluate(()=>mock.disconnect());
  await expect(page.locator('#simFirmwareBtn')).toHaveText('Select OAD firmware');
  await expect(page.locator('#latestFirmwareStatus')).toContainText('Connect');
  await expect(page.locator('#firmwareDetails')).toBeHidden();
  await expect(page.locator('#firmwareDetailHash')).toHaveText('');
});
test('corrupted latest OAD cannot be selected',async({page})=>{
  const {bytes,manifest,metadata}=latestFixture();bytes[20]=1;
  await page.route('**/api/ota/signed/latest',route=>route.fulfill({json:metadata}));
  await page.route('**/api/ota/signed/download/**',route=>route.fulfill({body:bytes,contentType:'application/octet-stream'}));
  await page.route('**/api/ota/signed/manifest/**',route=>route.fulfill({body:manifest,contentType:'application/octet-stream'}));
  await mockBluetooth(page);await connect(page);await swipeTo(page,'oad');
  await expect(page.locator('#latestFirmwareStatus')).toContainText('SHA256 verification failed');
  await expect(page.locator('#simOadBtn')).toBeDisabled();
});

test('same latest firmware disables upgrading, including direct API calls after a fresh version read',async({page})=>{
  const {bytes,manifest,metadata}=latestFixture();
  await page.route('**/api/ota/signed/latest',route=>route.fulfill({json:metadata}));
  await page.route('**/api/ota/signed/download/**',route=>route.fulfill({body:bytes,contentType:'application/octet-stream'}));
  await page.route('**/api/ota/signed/manifest/**',route=>route.fulfill({body:manifest,contentType:'application/octet-stream'}));
  await mockBluetooth(page,{firmware:'1.0.0-1234'});await connect(page);await swipeTo(page,'oad');
  await expect(page.locator('#simOadBtn')).toHaveText('Up to date');
  await expect(page.locator('#simOadBtn')).toBeDisabled();
  await expect(page.locator('#latestFirmwareStatus')).toContainText('Already running 0x1234');
  const result=await page.evaluate(()=>mfgApi.startSimOad({firmwarePath:'T100_OAD.bin'}));
  expect(result.ok).toBe(false);expect(result.message).toContain('already runs firmware 0x1234');
  expect(await page.evaluate(()=>mock.writes.filter(w=>w.id.startsWith('0bb0')))).toEqual([]);
});
for(const firmware of ['1.0.0-1234','Unknown'])test(`local firmware selection blocks matching or unknown device version ${firmware}`,async({page})=>{
  await page.route('**/api/ota/signed/latest',route=>route.fulfill({status:404,json:{error:'No published firmware'}}));
  await mockBluetooth(page,{firmware});await connect(page);await swipeTo(page,'oad');
  const chooser=page.waitForEvent('filechooser');await page.locator('#simFirmwareBtn').click();
  await (await chooser).setFiles([{name:'test.bin',mimeType:'application/octet-stream',buffer:latestFixture().bytes},{name:'test.manifest',mimeType:'application/octet-stream',buffer:latestFixture().manifest}]);
  await expect(page.locator('#simFirmwareBtn')).toHaveText('T100_OAD.bin');
  await expect(page.locator('#simOadBtn')).toBeDisabled();
  await expect(page.locator('#latestFirmwareStatus')).toContainText(firmware==='Unknown'?'version unavailable':'Already running');
});
test('upgrade start rereads a changed device version and sends no OAD commands for a match',async({page})=>{
  const {bytes,manifest,metadata}=latestFixture();
  await page.route('**/api/ota/signed/latest',route=>route.fulfill({json:metadata}));
  await page.route('**/api/ota/signed/download/**',route=>route.fulfill({body:bytes,contentType:'application/octet-stream'}));
  await page.route('**/api/ota/signed/manifest/**',route=>route.fulfill({body:manifest,contentType:'application/octet-stream'}));
  await mockBluetooth(page);await connect(page);await swipeTo(page,'oad');
  await expect(page.locator('#simOadBtn')).toBeEnabled();
  await page.evaluate(()=>{mock.firmware='1.0.0-1234';});
  const result=await page.evaluate(()=>mfgApi.startSimOad({firmwarePath:'T100_OAD.bin'}));
  expect(result.ok).toBe(false);expect(result.message).toContain('already runs');
  await expect(page.locator('#simOadBtn')).toBeDisabled();
  expect(await page.evaluate(()=>mock.writes.filter(w=>w.id.startsWith('0bb0')))).toEqual([]);
});

test('FEE1 v2 reaches Wasm with signed net and independent info units; inactive readings preserve Idle',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await mockBluetooth(page);await connect(page);
  const frame=page.frameLocator('#runtimeFrame');
  await page.evaluate(()=>mock.notifySnapshot({value:-25000,flags:7,upper:100000,lower:350000,sequence:255}));
  await expect.poll(()=>frame.locator('body').evaluate(()=>testWasm.preview_snapshot_main_mg())).toBe(-25000);
  expect(await frame.locator('body').evaluate(()=>testWasm.preview_snapshot_lower())).toBe(350000);
  await page.evaluate(()=>mock.notifySnapshot({value:0,flags:7,upper:100000,lower:350000,sequence:0}));
  await expect.poll(()=>frame.locator('body').evaluate(()=>testWasm.preview_snapshot_main_mg())).toBe(0);
  await page.evaluate(()=>{mock.notifyStatus(7,1,{stage:2});mock.notifySnapshot({unit:1,value:-55,profile:1,stage:2,flags:23,upperKind:4,upper:17,lowerKind:5,lower:12300});});
  await expect.poll(()=>frame.locator('body').evaluate(()=>testWasm.preview_snapshot_upper())).toBe(17);
  expect(await frame.locator('body').evaluate(()=>testWasm.preview_snapshot_lower())).toBe(12300);
  await expect(page.locator('#deviceUnitValue')).toHaveValue('1');
  await page.evaluate(()=>{mock.notifyStatus(1);mock.notifySnapshot({flags:0,value:123000,upperKind:0,lowerKind:0});});
  await expect(frame.locator('#sceneText')).toHaveText('Idle');
  await page.evaluate(()=>mock.disconnect());
  await expect.poll(()=>frame.locator('body').evaluate(()=>testWasm.preview_snapshot_flags())).toBe(-1);
  expect(errors).toEqual([]);
});

test('auth backup imports pasted credentials atomically, merges devices and exports a local JSON backup',async({page})=>{
  await mockBluetooth(page,{stored:false});await page.goto('/');
  await page.locator('#authBackupBtn').click();
  await expect(page.locator('#authBackupDialog')).toBeVisible();
  await expect(page.locator('#authBackupCount')).toHaveText('No saved devices');
  await expect(page.locator('#authExportBtn')).toBeDisabled();
  await page.locator('#authImportText').fill('{bad}');await page.locator('#authImportTextBtn').click();
  await expect(page.locator('#authBackupStatus')).toContainText('Invalid JSON');
  const second={...record,pub_key:'036b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296',name:'YD-036b17d1f2e1',deviceId:'another'};
  await page.locator('#authImportText').fill(JSON.stringify([record,{...second,auth_key:'short'}]));await page.locator('#authImportTextBtn').click();
  await expect(page.locator('#authBackupStatus')).toContainText('Record 2: auth_key');
  expect(await page.evaluate(()=>localStorage.getItem('t100.mfg.auth.v1'))).toBeNull();
  await page.locator('#authImportText').fill(JSON.stringify([record,second]));await page.locator('#authImportTextBtn').click();
  await expect(page.locator('#authBackupCount')).toHaveText('2 saved devices');
  await expect(page.locator('#authBackupStatus')).toContainText('Imported 2');
  await expect(page.locator('#authImportText')).toHaveValue('');
  const updated={...record,auth_key:'NEW12345'};
  await page.locator('#authImportText').fill(JSON.stringify(updated));await page.locator('#authImportTextBtn').click();
  await expect(page.locator('#authBackupStatus')).toContainText('Imported 1');
  await expect(page.locator('#authBackupCount')).toHaveText('2 saved devices');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#authExportBtn').click()]);
  expect(download.suggestedFilename()).toBe('t100-auth-backup.json');
  const exported=JSON.parse(await readFile(await download.path(),'utf8'));
  expect(exported).toEqual(expect.arrayContaining([updated,second]));expect(exported).toHaveLength(2);
  await page.keyboard.press('Escape');await expect(page.locator('#authBackupDialog')).toBeHidden();
  await expect(page.locator('#authBackupBtn')).toBeFocused();
});
test('mobile auth backup opens before connection, validates files and restores authenticated control',async({page})=>{
  await page.setViewportSize({width:375,height:812});await mockBluetooth(page,{stored:false});await page.goto('/');
  await page.getByText('Actions',{exact:true}).click();await page.locator('#authBackupBtn').click();
  await expect(page.locator('#authBackupDialog')).toBeVisible();
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#authImportFileBtn').click()]);
  await chooser.setFiles({name:'auth.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([{...record,auth_key:'wrong'}]))});
  await expect(page.locator('#authBackupStatus')).toContainText('auth_key must be exactly 8');
  const [validChooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#authImportFileBtn').click()]);
  await validChooser.setFiles({name:'auth.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([record]))});
  await expect(page.locator('#authBackupCount')).toHaveText('1 saved device');
  await expect(page.locator('#authBackupStatus')).toContainText('Imported 1');
  const bounds=await page.locator('#authBackupDialog').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,bottom:el.getBoundingClientRect().bottom}));
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width);expect(bounds.bottom).toBeLessThanOrEqual(813);
  await page.screenshot({path:'/tmp/t100-auth-backup-mobile.png'});
  await page.locator('#authBackupClose').click();await page.getByRole('button',{name:'Select Bluetooth Device'}).click();
  await expect(page.locator('#simStateText')).toHaveText('Connected');
  const result=await page.evaluate(()=>mfgApi.scaleTare());expect(result.ok).toBe(true);
  expect(await page.evaluate(()=>mock.writes.find(w=>w.data[0]===0x61).data.slice(1,9))).toEqual([...Buffer.from(record.auth_key)]);
});

test('Idle container preconfiguration preserves the page and waits for an active UUID echo',async({page})=>{
  await mockBluetooth(page,{initialScreen:1});await connect(page);
  await page.evaluate(()=>{mock.containerIdle=true;mock.notifyStatus(1,3);});
  const frame=page.frameLocator('#runtimeFrame'),status=page.locator('#simContainerStatus');
  await expect(frame.locator('#sceneText')).toHaveText('Idle');
  await page.locator('#simContainerWeight').fill('100');await page.locator('#simContainerSet').click();
  await expect(status).toHaveText('Container command sent; enter KCal weighing to confirm');
  await expect(status).toHaveAttribute('data-state','pending');
  await expect(page.locator('#simContainerFields')).toHaveAttribute('data-container-uuid','');
  await expect(frame.locator('#sceneText')).toHaveText('Idle');
  expect(await page.evaluate(()=>mock.writes.filter(w=>w.data[0]===0x72).length)).toBe(0);
  await page.evaluate(()=>{const data=mock.writes.find(w=>w.data[0]===0x77).data;mock.notifyStatus(4,3);mock.notifyContainer({mg:100000,uuid:data.slice(15,31)});});
  await expect(status).toHaveText('Container confirmed: 100 g');await expect(status).toHaveAttribute('data-state','confirmed');
  await page.evaluate(()=>{mock.notifyStatus(1,3);mock.notifyContainer({active:false});});
  await expect(status).toHaveText('Container confirmed: 100 g');
  await page.locator('#simContainerClear').click();await expect(status).toHaveText('Container command sent; enter KCal weighing to confirm');
  await page.evaluate(()=>{mock.notifyStatus(4,3);mock.notifyContainer();});
  await expect(status).toHaveText('Container cleared by the device');await expect(page.locator('#simContainerWeight')).toHaveValue('');
});
test('container feedback visibly waits for the device before showing confirmed weight on mobile',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await mockBluetooth(page);await connect(page);await page.evaluate(()=>{mock.skipContainerEcho=true;});
  await page.locator('#simContainerWeight').fill('100');await page.locator('#simContainerSet').click();
  const status=page.locator('#simContainerStatus');
  await expect(status).toBeVisible();await expect(status).toHaveAttribute('data-state','pending');
  await expect(status).toHaveText('Waiting for device confirmation…');
  await expect.poll(()=>page.evaluate(()=>mock.writes.filter(w=>w.data[0]===0x77).length)).toBe(1);
  await page.evaluate(()=>{const data=mock.writes.find(w=>w.data[0]===0x77).data;mock.notifyContainer({mg:100000,uuid:data.slice(15,31)});});
  await expect(status).toHaveAttribute('data-state','confirmed');await expect(status).toHaveText('Container confirmed: 100 g');
  const box=await status.boundingBox();expect(box.width).toBeLessThanOrEqual(375);expect(box.height).toBeGreaterThanOrEqual(40);
});
test('container settings require matching UUID echo, renew identity at the same weight, and track physical Reset',async({page})=>{
  await mockBluetooth(page);await connect(page);
  await page.locator('#simContainerWeight').fill('100');await page.locator('#simContainerSet').click();
  await expect(page.locator('#simContainerStatus')).toContainText('Container confirmed: 100 g');
  const first=await page.locator('#simContainerFields').getAttribute('data-container-uuid');expect(first).toMatch(/^[0-9a-f-]{36}$/);
  await page.locator('#simContainerSet').click();await expect.poll(()=>page.locator('#simContainerFields').getAttribute('data-container-uuid')).not.toBe(first);
  await expect(page.locator('#simContainerStatus')).toContainText('Container confirmed');
  const second=await page.locator('#simContainerFields').getAttribute('data-container-uuid');
  await page.evaluate(()=>mock.notifyContainer({active:false}));
  await expect(page.locator('#simContainerFields')).toHaveAttribute('data-container-uuid',second);
  await expect(page.locator('#simContainerWeight')).toHaveValue('100');
  await page.evaluate(()=>mock.notifyContainer({mg:null}));
  await expect(page.locator('#simContainerFields')).toHaveAttribute('data-container-uuid','');await expect(page.locator('#simContainerWeight')).toHaveValue('');
  await expect(page.locator('#simContainerStatus')).toHaveText('Container cleared by the device');
  await page.locator('#simContainerWeight').fill('0');await page.locator('#simContainerSet').click();await expect(page.locator('#simContainerStatus')).toContainText('Container confirmed: 0 g');
  expect(await page.locator('#simContainerFields').getAttribute('data-container-uuid')).not.toBe('');
  await page.locator('#simContainerClear').click();await expect(page.locator('#simContainerStatus')).toHaveText('Container cleared by the device');await expect(page.locator('#simContainerFields')).toHaveAttribute('data-container-uuid','');
  const writes=await page.evaluate(()=>mock.writes.filter(w=>w.data[0]===0x77));expect(writes.every(w=>w.data.length===31&&w.data[9]===2)).toBe(true);
});
test('wrong container UUID cannot be acknowledged even when weight matches',async({page})=>{
  await mockBluetooth(page);await connect(page);await page.evaluate(()=>{mock.wrongContainerUuid='12345678-1234-4321-8765-123456789abc';});
  await page.locator('#simContainerWeight').fill('100');await page.locator('#simContainerSet').click();
  await expect(page.locator('#simContainerStatus')).toContainText('Container not confirmed',{timeout:12000});
  await expect(page.locator('#simContainerStatus')).toHaveAttribute('data-state','error');
  await page.evaluate(()=>mock.notifyContainer({mg:100000,uuid:mock.wrongContainerUuid}));
  await expect(page.locator('#simContainerStatus')).toContainText('Container not confirmed');
  await expect(page.locator('#simLog')).not.toContainText('Container confirmed:');
});
test('container MTU rejection leaves confirmation empty and does not report success',async({page})=>{
  await mockBluetooth(page);await connect(page);await page.evaluate(()=>{mock.lowMtuContainer=true;});
  await page.locator('#simContainerWeight').fill('100');await page.locator('#simContainerSet').click();
  await expect(page.locator('#simContainerStatus')).toContainText('ATT MTU below 39');await expect(page.locator('#simContainerFields')).toHaveAttribute('data-container-uuid','');
});
