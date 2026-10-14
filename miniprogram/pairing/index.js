const {isPreview,ensurePlan,currentTheme}=require('../utils/page');
const {RiveInstance}=require('./libs/rive/runtime');
const {setWasmPath}=require('./libs/rive/adapter/loader');
const animation=require('./assets/animation');
setWasmPath('/pairing/libs/rive/vendor/rive.wasm.br');
Page({
  data:{themeProfile:3,preview:false,name:'KCALACK',ready:false,error:''},
  onLoad(options={}){
    this.preview=isPreview(options);if(!ensurePlan(this.preview)){this.blocked=true;return;}
    this.service=this.preview?getApp().getPreviewService():getApp().service;
    if(!this.service){this.finished=true;wx.redirectTo({url:'/pages/devices/index'});return;}
    this.setData({preview:this.preview});
    this.unsubscribe=this.service?.onChange(state=>{
      this.setData({themeProfile:currentTheme(state),name:state.device?.name||'KCALACK'});
      if(!state.connected&&!this.finished){this.finished=true;wx.redirectTo({url:'/pages/devices/index'});}
    });
  },
  onShow(){this.visible=true;if(this.rive&&this.data.ready){this.rive.play();this.schedule();}},
  async onReady(){
    if(this.blocked||this.finished)return;
    try{
      const info=await new Promise(resolve=>this.createSelectorQuery().select('#pairing').fields({node:true,size:true}).exec(rows=>resolve(rows[0])));
      if(this.unloaded||this.finished)return;
      if(!info?.node)throw new Error('Animation canvas unavailable.');
      this.rive=new RiveInstance({canvas:info.node,buffer:wx.base64ToArrayBuffer(animation),width:info.width,height:info.height,devicePixelRatio:Math.min(2,wx.getWindowInfo().pixelRatio||2),animation:'Pairing',autoplay:false});
      await this.rive.ready;
      if(this.unloaded||this.finished){this.rive.cleanup();return;}
      this.setData({ready:true});if(this.visible){this.rive.play();this.schedule();}
    }catch{this.rive?.cleanup();if(!this.unloaded)this.setData({error:'Animation unavailable.'});}
  },
  schedule(){clearTimeout(this.timer);this.timer=setTimeout(()=>{if(this.preview)this.rive?.pause();else this.continue();},2300);},
  replay(){if(!this.rive||!this.data.ready)return;this.rive.stop();this.rive.play();this.schedule();},
  continue(){if(this.finished||this.blocked)return;this.finished=true;clearTimeout(this.timer);this.rive?.pause();wx.redirectTo({url:'/pages/device/index'+(this.preview?'?preview=1':'')});},
  onHide(){this.visible=false;clearTimeout(this.timer);this.rive?.pause();},
  onUnload(){this.unloaded=true;clearTimeout(this.timer);this.unsubscribe?.();this.rive?.cleanup();}
});
