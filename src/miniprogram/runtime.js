/** DOM-free transport for exactly the same firmware renderer as the website. */
export class MiniRuntime {
  constructor(exports){this.x=exports;this.signature=null;this.pairing=false;this.commits=new Set();this.pendingNotice=null;this.status=null;exports.preview_reset();}
  commit(data){if(!data||this.commits.has(data.id))return;this.commits.add(data.id);if(data.name==='countdown')this.x.preview_remote_countdown(data.currentKcal,data.targetKcal,data.tdeeKcal??data.targetKcal);else if(data.name==='notify')this.pendingNotice=data;else if(data.name==='preview-history'&&data.preview){this.x.preview_add_history(data.kcal);this.x.preview_history_meta(data.rating,0);}}
  sync(status,reading){
    this.status=status;
    const x=this.x;
    if(status && !(status.flags&1)){
      if(!this.pairing){x.preview_detach_status();x.preview_reset();x.preview_boot_start();x.preview_tick(10000);}
      this.pairing=true;this.signature=null;return;
    }
    if(!status)return;
    this.pairing=false;
    const signature=JSON.stringify(status);
    if(signature!==this.signature){
      x.preview_apply_device_status(status.screen,status.phase??0,status.mode??2,status.flags??0,
        status.coffee?.schema??0,status.coffee?.profile??-1,status.coffee?.stage??0,
        status.coffee?.uiPhase??0,status.coffee?.primaryTargetMg??-1,status.coffee?.waterTargetMg??-1);
      this.signature=signature;
    }
    if(reading?.version>=2){
      const mg=reading.unit===1?Math.round(reading.value*283.49523125):reading.value;
      x.preview_apply_scale_snapshot(reading.unit,reading.profile,reading.stage,reading.flags,
        Math.max(-2147483648,Math.min(2147483647,mg)),reading.upper.kind,reading.upper.value,reading.lower.kind,reading.lower.value);
    }else if(reading && Number.isFinite(reading.value)){
      x.preview_set_unit(reading.unit);x.preview_set_weight(reading.unit===1?Math.round(reading.value*283.49523125):reading.value);
    }
  }
  frame(ms=40){
    const x=this.x;
    if(this.pendingNotice&&this.status?.screen===6&&(this.status.flags&1)&&x.notify_ui_prepare_update()>=0){const gray=new Uint8Array(x.memory.buffer,x.preview_notify_gray(),5088);gray.fill(0);gray.set(this.pendingNotice.gray);x.preview_remote_notify(this.pendingNotice.colorRgb565);this.pendingNotice=null;}
    x.preview_tick(ms);x.preview_render();
    const src=new Uint16Array(x.memory.buffer,x.preview_pixels(),320*80),rgba=new Uint8ClampedArray(320*80*4);
    const brightness=x.preview_backlight_level()/255;
    for(let y=0;y<80;y++)for(let col=0;col<320;col++){
      const c=src[col*80+y],p=(y*320+col)*4;
      rgba[p]=((c>>11)&31)*255/31*brightness;rgba[p+1]=((c>>5)&63)*255/63*brightness;rgba[p+2]=(c&31)*255/31*brightness;rgba[p+3]=255;
    }
    const missing=x.preview_remote_missing();
    return {rgba,left:x.preview_light_left()?x.preview_left_opacity()/255*x.preview_light_level()/100*x.preview_power_led_opacity()/255:0,
      right:x.preview_light_right()?x.preview_light_level()/100*x.preview_power_led_opacity()/255:0,
      missing:missing&1?'Countdown values are not reported by this device.':missing&2?'History records are not reported by this device.':missing&4?'Notification content is not reported by this device.':''};
  }
}
