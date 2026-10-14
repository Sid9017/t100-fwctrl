const definition=require('../../pages/shared/device-controller')(1);
const {RiveInstance}=require('../libs/rive/runtime');
const {setWasmPath}=require('../libs/rive/adapter/loader');
const animation=require('../assets/animation');
const frame=require('../assets/frame');
setWasmPath('/pairing/libs/rive/vendor/rive.wasm.br');
const methods=Object.fromEntries(Object.entries(definition).filter(([key,value])=>typeof value==='function'&&!['onLoad','onShow','onHide','onUnload'].includes(key)));
Component({
  options:{styleIsolation:'apply-shared'},
  properties:{demo:Boolean,intro:Boolean,active:{type:Boolean,value:true}},
  data:{...definition.data,compact:false,crossFading:false,showControls:false,animating:false,displayReady:false,frameStyle:Object.entries(frame).map(([key,value])=>`${key}:${value}%;`).join('')},
  observers:{active(){this.updatePlayback();}},
  lifetimes:{
    ready(){
      this.mounted=true;this.embedded=true;this.screen=1;
      definition.onLoad.call(this,{preview:this.properties.demo?'1':undefined});
      if(this.blocked)return;
      this.triggerEvent('loaded');
      this.visible=true;this.setData({visible:true});
      if(this.properties.intro)this.setData({animating:true},()=>this.startIntro());
      else this.finishIntro(true);
    },
    detached(){this.mounted=false;clearTimeout(this.finishTimer);clearTimeout(this.fadeTimer);clearTimeout(this.compactTimer);this.rive?.cleanup();definition.onUnload.call(this);}
  },
  pageLifetimes:{hide(){this.hidden=true;this.visible=false;this.updatePlayback();},show(){this.hidden=false;this.visible=true;this.updatePlayback();}},
  methods:{...methods,
    async startIntro(){
      try{
        const node=await new Promise(resolve=>this.createSelectorQuery().select('#pairing').fields({node:true,size:true}).exec(rows=>resolve(rows?.[0])));
        if(!this.mounted)return;
        if(!node?.node)throw new Error('Animation canvas unavailable');
        this.elapsed=0;
        const rive=this.rive=new RiveInstance({canvas:node.node,buffer:wx.base64ToArrayBuffer(animation),width:node.width,height:node.height,devicePixelRatio:Math.min(2,wx.getWindowInfo().pixelRatio||2),animation:'Pairing',autoplay:false,onFrame:dt=>{
          this.elapsed+=dt;
          if(this.elapsed>=2.7&&!this.finishTimer)this.finishTimer=setTimeout(()=>{this.finishTimer=null;this.finishIntro();},0);
        }});
        await rive.ready;
        if(!this.mounted||this.rive!==rive){rive.cleanup();return;}
        this.updatePlayback();
      }catch{if(this.mounted)this.finishIntro(true);}
    },
    finishIntro(immediate=false){
      this.rive?.cleanup();this.rive=null;
      if(!this.mounted)return;
      if(immediate){this.setData({animating:false,displayReady:true,compact:true,crossFading:false},()=>this.triggerEvent('layoutchange'));return;}
      this.setData({animating:false,crossFading:true},()=>{
        this.fadeTimer=setTimeout(()=>{if(!this.mounted)return;this.setData({displayReady:true});},32);
        this.compactTimer=setTimeout(()=>{if(!this.mounted)return;this.setData({compact:true},()=>this.triggerEvent('layoutchange'));},450);
      });
    },
    updatePlayback(){if(!this.mounted)return;if(this.properties.active&&!this.hidden&&!this.data.showControls)this.rive?.play();else this.rive?.pause();},
    openControls(){if(this.data.animating)this.finishIntro(true);this.setData({showControls:true});this.updatePlayback();},
    closeControls(){this.setData({showControls:false});this.updatePlayback();},
    openContainers(){if(this.data.animating)this.finishIntro(true);this.setData({showControls:false});definition.openContainers.call(this);},
    openSettings(){this.setData({showControls:false});definition.openSettings.call(this);},
    // Embedded controls stay on Today even if the peripheral disconnects.
    openDevice(){},
  }
});
