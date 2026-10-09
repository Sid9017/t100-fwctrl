import { wheel } from './history-controls.js';

export async function mountModeWheel() {
  const host=document.getElementById('modeWheel');
  const select=document.getElementById('simCoffeeModeSelect');
  const items=[{value:'3',label:'KCal',mode:0},{value:'0',label:'Kitchen',mode:1},
    {value:'1',label:'Espresso',mode:2},{value:'2',label:'PourOver',mode:3}];
  // Render the original mode-title frames in an isolated Wasm instance so the
  // live device preview is untouched. The labels use the firmware's own pixels.
  try {
    const response=await fetch('./assets/runtime/preview.wasm');
    if(!response.ok)throw new Error('Wasm unavailable');
    const {instance}=await WebAssembly.instantiate(await response.arrayBuffer(),{});
    const x=instance.exports;x.preview_reset();
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=80;
    const ctx=canvas.getContext('2d');
    for(const item of items) {
      x.preview_reset();x.preview_set_mode(item.mode);x.preview_key(0);x.preview_render();
      const pixels=new Uint16Array(x.memory.buffer,x.preview_pixels(),25600);
      const frame=ctx.createImageData(320,80);
      // The firmware glyphs are antialiased against black. Recover their
      // foreground color and coverage so transparent edges have no dark halo.
      let ink = [0, 0, 0], peak = 0;
      for (const c of pixels) {
        const rgb = [(c >> 11) * 255 / 31, ((c >> 5) & 63) * 255 / 63, (c & 31) * 255 / 31];
        const level = Math.max(...rgb);
        if (level > peak) { peak = level; ink = rgb; }
      }
      for(let y=0;y<80;y++)for(let col=0;col<320;col++) {
        const c=pixels[col*80+y],offset=(y*320+col)*4;
        const level = Math.max((c >> 11) * 255 / 31, ((c >> 5) & 63) * 255 / 63, (c & 31) * 255 / 31);
        frame.data.set([...ink, peak ? Math.round(level / peak * 255) : 0], offset);
      }
      ctx.putImageData(frame,0,0);item.image=canvas.toDataURL();
    }
  } catch { /* Text labels remain available if the renderer cannot load. */ }
  let timer;
  const picker=wheel(host,select,items,24,()=>{
    clearTimeout(timer);
    timer=setTimeout(()=>{if(!select.disabled)select.dispatchEvent(new Event('change'));},180);
  });
  select.addEventListener('mode-render',()=>{clearTimeout(timer);picker.sync();});
  const syncDisabled=()=>{host.inert=select.disabled;host.setAttribute('aria-disabled',String(select.disabled));};
  new MutationObserver(syncDisabled).observe(select,{attributes:true,attributeFilter:['disabled']});
  syncDisabled();
}

export function mountUnitWheel() {
  const host = document.getElementById('deviceUnitWheel');
  const input = document.getElementById('deviceUnitValue');
  const picker = wheel(host, input, [{value:'0',label:'g'}, {value:'1',label:'oz'}], 24,
    () => input.dispatchEvent(new Event('change')));
  input.addEventListener('unit-render', () => picker.sync());
  const syncDisabled = () => {
    host.inert = input.disabled;
    host.setAttribute('aria-disabled', String(input.disabled));
  };
  new MutationObserver(syncDisabled).observe(input, {attributes:true, attributeFilter:['disabled']});
  syncDisabled();
  picker.sync();
}
