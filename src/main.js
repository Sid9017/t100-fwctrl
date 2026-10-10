import { fetchLatestOad } from './web/latest-oad.js';
import { BrowserConsole } from './web/console.js';
import { listFoodImages, foodUrl } from './web/assets.js';
import { capability, scanError } from './bluetooth.js';
import './web/render-gray.js';
import { attachPreview } from './web/preview.js';

const service = new BrowserConsole();
attachPreview(service);
const support = capability();
const supportElement = document.getElementById('browserSupport');
supportElement.textContent = `${support.title}. ${support.detail}`;
supportElement.classList.toggle('unsupported', !support.ok);
const files = new Map();
let firmwareGeneration=0, firmwareAbort;
function cancelFirmwareFetch() {firmwareGeneration++;firmwareAbort?.abort();firmwareAbort=null;}
for(const event of ['SessionIdle','ConnectionLost'])service.on(event,()=>{cancelFirmwareFetch();files.clear();});
function selectFile(accept) {
  return new Promise(resolve => {
    const input = document.createElement('input'); input.type='file'; input.accept=accept; input.hidden=true;
    document.body.append(input);
    const finish = value => { input.remove(); resolve(value); };
    input.addEventListener('change',()=>finish(input.files[0]||null),{once:true});
    input.addEventListener('cancel',()=>finish(null),{once:true});
    input.click();
  });
}
const errorMessage = error => ['NotFoundError','NotAllowedError','SecurityError','NotSupportedError','NetworkError'].includes(error.name) ? scanError(error).message : error.message || String(error);
const guard = fn => (...args) => {
  try { return Promise.resolve(fn(...args)).catch(error=>({ok:false,message:errorMessage(error)})); }
  catch(error) { return Promise.resolve({ok:false,message:errorMessage(error)}); }
};
const api = {
  listDemoDevices:async()=>service.listDevices(),
  refreshScan:guard(async()=>{
    const device=await service.selectDevice();
    return {ok:true,device};
  }),
  connect:guard(device=>{cancelFirmwareFetch();files.clear();return service.connect(device);}),
  disconnect:guard(()=>service.disconnect()),
  readDeviceTime:guard(()=>service.readDeviceTime()),
  scaleSetUnit:guard(({unit})=>service.scaleSetUnit(unit)),
  scaleToggleUnit:guard(({currentUnit})=>service.scaleToggleUnit(currentUnit)),
  listFoodImages:guard(async()=>({ok:true,files:await listFoodImages()})),
  foodImagePreview:guard(async name=>({ok:true,dataUrl:foodUrl(name)})),
  selectSimFirmware:guard(async()=>{
    cancelFirmwareFetch();
    const generation=firmwareGeneration;
    const file=await selectFile('.bin,application/octet-stream');
    if(generation!==firmwareGeneration)return {ok:true,canceled:true};
    if(!file) return {ok:true,canceled:true};
    files.clear();files.set(file.name,file);return {ok:true,path:file.name};
  }),
  latestSimFirmware:guard(async()=>{
    cancelFirmwareFetch();const generation=firmwareGeneration;
    const controller=new AbortController();firmwareAbort=controller;
    const timeout=setTimeout(()=>controller.abort(),20000);
    try {
      const {file,metadata}=await fetchLatestOad({signal:controller.signal});
      if(generation!==firmwareGeneration)return {ok:true,canceled:true};
      files.clear();files.set(file.name,file);
      return {ok:true,path:file.name,version:metadata.version,size:file.size};
    } catch(error) {
      if(generation!==firmwareGeneration)return {ok:true,canceled:true};
      throw new Error(error.name==='AbortError'?'Latest firmware timed out. Select a local OAD file.':error.message);
    } finally {clearTimeout(timeout);if(firmwareAbort===controller)firmwareAbort=null;}
  }),
  startSimOad:guard(({firmwarePath})=>{
    const file=files.get(firmwarePath);if(!file) throw new Error('Select an OAD firmware file first.');
    return service.downloadOad(file);
  }),
  importAuth:guard(async()=>{
    const file=await selectFile('.json,application/json');
    if(!file)return {ok:true,canceled:true};
    if(file.size>1024*1024)throw new Error('Auth JSON is too large.');
    if(service.busy)throw new Error('Wait for the current device action before importing auth.');
    const count=service.auth.import(await file.text());
    return {ok:true,message:`Imported ${count} credential(s) into browser storage.`};
  }),
  exportAuth:()=>{
    try {
      const records=service.auth.records();
      const url=URL.createObjectURL(new Blob([JSON.stringify(records,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='t100-auth-backup.json';a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      return {ok:true,message:`Exported ${records.length} credential(s). Keep this backup private.`};
    } catch(error) { return {ok:false,message:error.message}; }
  },
};
for (const name of ['bindDevice','resetDevice','factoryDevice','scaleTare','navigateToScale','scaleSetCoffeeRecipe',
  'scaleSetWeighingProfile','setContainerWeight','setLightControl','scaleUpdateKcal','notifyDisplay','appendKcalHist']) {
  api[name]=guard((...args)=>service[name](...args));
}
for (const event of ['ScanUpdate','ScanUpsert','ScanRemove','ScanReset','SessionIdle','ConnectionLost','BatteryUpdate',
  'ScaleUpdate','StatusUpdate','SimOadProgress','SimActionLog','ActionBusy']) api[`on${event}`]=callback=>service.on(event,callback);

window.mfgApi=api;
window.addEventListener('pagehide',()=>{void service.disconnect();});
await import('./renderer.js');
if(!support.ok)document.getElementById('simRefreshScanBtn').disabled=true;

// All disconnected screens share the same synchronous Bluetooth chooser action.
const connectPicker = document.getElementById('simRefreshScanBtn');
const connectionEntries = document.querySelectorAll('[data-connect-picker]');
const syncPickers = () => connectionEntries.forEach(button => { button.disabled = connectPicker.disabled; });
connectionEntries.forEach(button => button.addEventListener('click', () => connectPicker.click()));
new MutationObserver(syncPickers).observe(connectPicker, { attributes: true, attributeFilter: ['disabled'] });
syncPickers();

const { mountModeWheel, mountUnitWheel } = await import('./web/mode-wheel.js');
await mountModeWheel();
mountUnitWheel();

// Keep secondary device commands within one compact mobile header menu.
const deviceActionsMenu = document.getElementById('deviceActionsMenu');
const compactHeader = window.matchMedia('(max-width: 768px)');
const syncDeviceActionsMenu = () => { deviceActionsMenu.open = !compactHeader.matches; };
compactHeader.addEventListener('change', syncDeviceActionsMenu);
syncDeviceActionsMenu();
deviceActionsMenu.addEventListener('click', event => {
  if (compactHeader.matches && event.target.closest('button')) deviceActionsMenu.open = false;
});
