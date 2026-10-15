const {RiveInstance}=require('../libs/rive/runtime');
const {setWasmPath}=require('../libs/rive/adapter/loader');
const animation=require('../assets/scalebot');
const {DURATION,ICON_BOUNDS,connectionState,pairingBounds}=require('./state');
setWasmPath('/pairing/libs/rive/vendor/rive.wasm.br');
Component({
  properties:{demo:Boolean,intro:Boolean,active:{type:Boolean,value:true},noDevice:Boolean},
  data:{ready:false,pairing:false,revealing:false,stateLabel:'Disconnected',celebrating:false},
  observers:{intro(value){if(value&&this.mounted)this.startPairing();},active(){this.updatePlayback();},demo(){if(this.mounted)this.subscribe();},noDevice(){if(this.mounted)this.subscribe();}},
  lifetimes:{
    ready(){this.mounted=true;this.subscribe();this.setupIndicator();if(this.properties.intro)this.startPairing();},
    detached(){this.mounted=false;this.unsubscribe?.();clearTimeout(this.finishTimer);clearTimeout(this.celebrateTimer);this.indicator?.cleanup();this.pairingRive?.cleanup();}
  },
  pageLifetimes:{hide(){this.hidden=true;this.updatePlayback();},show(){this.hidden=false;this.updatePlayback();},resize(){if(this.data.pairing)this.finishPairing();this.setupIndicator();}},
  methods:{
    noop(){},
    subscribe(){
      this.unsubscribe?.();const app=getApp(),service=this.properties.demo?app.getPreviewService():app.service;
      this.unsubscribe=service?.onChange(s=>{
        const connected=!this.properties.noDevice&&s.connected&&!s.adding&&!s.connecting;
        if(connected&&this.wasConnected===false){this.shakePending=true;this.celebrateConnection();}
        this.wasConnected=!!connected;
        const state=this.properties.noDevice?'Disconnected':connectionState(s);
        if(this.state===state)return;this.state=state;
        this.setData({stateLabel:state==='Syncing'?'Syncing':state==='Connecting'?'Connecting':state==='Connected'?'Connected':'Disconnected'});
        if(this.indicatorReady)this.applyState();
      });
    },
    query(selector){return new Promise(resolve=>this.createSelectorQuery().select(selector).fields({node:true,size:true,rect:true}).exec(rows=>resolve(rows?.[0])));},
    async setupIndicator(){
      const generation=this.indicatorGeneration=(this.indicatorGeneration||0)+1;this.indicatorReady=false;this.indicator?.cleanup();this.indicator=null;
      try{
        const node=await this.query('#indicator');if(!this.mounted||generation!==this.indicatorGeneration||!node?.node)return;
        const rive=this.indicator=new RiveInstance({canvas:node.node,buffer:wx.base64ToArrayBuffer(animation),width:node.width,height:node.height,devicePixelRatio:Math.min(2,wx.getWindowInfo().pixelRatio||2),bounds:ICON_BOUNDS,animation:'Pairing',autoplay:false});
        await rive.ready;if(!this.mounted||generation!==this.indicatorGeneration){rive.cleanup();return;}
        rive.seek(DURATION);this.indicatorReady=true;this.applyState();this.setData({ready:true});
      }catch(error){console.warn('[scalebot] Indicator unavailable',error);if(this.mounted)this.setData({ready:false});}
    },
    applyState(){this.indicator.setAnimation(this.state||'Disconnected');this.updatePlayback();},
    updatePlayback(){
      const active=this.mounted&&!this.hidden&&this.properties.active;
      if(active&&this.data.pairing)this.pairingRive?.play();else this.pairingRive?.pause();
      if(active&&!this.data.pairing&&['Connecting','Syncing'].includes(this.state)&&this.indicatorReady)this.indicator?.play();else this.indicator?.pause();
    },
    celebrateConnection(){
      if(!this.shakePending||!this.mounted||this.hidden||this.data.pairing||this.properties.intro)return;
      this.shakePending=false;clearTimeout(this.celebrateTimer);
      this.setData({celebrating:true});
      this.celebrateTimer=setTimeout(()=>{if(this.mounted)this.setData({celebrating:false});},300);
    },
    startPairing(){
      if(this.data.pairing||!this.mounted)return;
      clearTimeout(this.celebrateTimer);this.shakePending=true;this.setData({pairing:true,revealing:false,celebrating:false},()=>this.setupPairing());
    },
    async setupPairing(){
      try{
        const [anchor,viewport]=await Promise.all([this.query('#anchor'),this.query('#pairingCanvas')]);
        if(!this.mounted||!this.data.pairing)return;
        if(!anchor?.width||!viewport?.node)throw new Error('Pairing canvas unavailable');
        this.elapsed=0;
        const rive=this.pairingRive=new RiveInstance({canvas:viewport.node,buffer:wx.base64ToArrayBuffer(animation),width:viewport.width,height:viewport.height,devicePixelRatio:Math.min(2,wx.getWindowInfo().pixelRatio||2),bounds:pairingBounds(anchor,viewport),animation:'Pairing',autoplay:false,onFrame:dt=>{
          this.elapsed+=dt;
          if(this.elapsed>=1.95&&!this.data.revealing)this.setData({revealing:true});
          if(this.elapsed>=DURATION&&!this.finishTimer)this.finishTimer=setTimeout(()=>this.finishPairing(),0);
        }});
        await rive.ready;if(!this.mounted||this.pairingRive!==rive){rive.cleanup();return;}this.updatePlayback();
      }catch(error){console.warn('[scalebot] Pairing unavailable',error);this.finishPairing();}
    },
    finishPairing(){
      clearTimeout(this.finishTimer);this.finishTimer=null;this.pairingRive?.cleanup();this.pairingRive=null;
      if(!this.mounted)return;
      this.setData({pairing:false,revealing:false},()=>{this.updatePlayback();this.triggerEvent('finished');if(this.wasConnected)wx.nextTick(()=>this.celebrateConnection());});
    }
  }
});
