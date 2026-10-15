const definition=require('../../pages/dish/controller');
const methods=Object.fromEntries(Object.entries(definition).filter(([key,value])=>typeof value==='function'&&!['onLoad','onReady','onShow','onHide','onUnload'].includes(key)));
Component({
 options:{styleIsolation:'apply-shared'},
 properties:{recordId:String,photoIndex:Number,demo:Boolean},
 data:{...definition.data,sheetPhase:'entering',sheetContentHeight:0},
 observers:{'error, ready, refresh'(){if(this.sheetMounted)this.setData({},()=>this.measureSheet());}},
 lifetimes:{
  attached(){definition.onLoad.call(this,{id:this.properties.recordId,photo:String(this.properties.photoIndex),preview:this.properties.demo?'1':'0'});},
  ready(){this.sheetMounted=true;definition.onShow.call(this);this.measureSheet();this.sheetTimer=setTimeout(()=>this.finishEntrance(),320);},
  detached(){this.sheetMounted=false;clearTimeout(this.sheetTimer);definition.onUnload.call(this);}
 },
 pageLifetimes:{show(){if(!this.finishing){definition.onShow.call(this);this.measureSheet();}},resize(){this.measureSheet();},hide(){definition.onHide.call(this);}},
 methods:{
  ...methods,
  stopPropagation(){},
  measureSheet(){
   if(!this.sheetMounted||this.finishing||!this.createSelectorQuery)return;
   const query=this.createSelectorQuery();
   query.select('.dish-body').boundingClientRect();
   query.select('.dish-overlay').boundingClientRect();
   query.exec(rects=>{
    if(!this.sheetMounted||this.finishing)return;
    const [body,viewport]=rects||[];if(!body?.height||!viewport?.height)return;
    // The grab handle occupies 23 rpx; only overflowing content needs scrolling.
    const height=Math.ceil(Math.min(body.height,Math.max(1,viewport.height*.9-viewport.width*23/750)));
    if(height!==this.data.sheetContentHeight)this.setData({sheetContentHeight:height});
   });
  },
  finishEntrance(){if(this.unloaded||this.finishing)return;clearTimeout(this.sheetTimer);this.setData({sheetPhase:'open'});},
  sheetAnimationEnd(e){if(e.target?.id!=='dish-sheet')return;if(this.finishing)this.notifyClosed();else this.finishEntrance();},
  done(){if(this.data.containerEditing)return;if(!this.data.ready){this.finishClose();return;}definition.done.call(this);},
  finishClose(){
   if(this.finishing)return;
   this.finishing=true;this.active=false;clearTimeout(this.saveTimer);clearTimeout(this.sheetTimer);
   this.setData({live:false,sheetPhase:'closing'});
   this.sheetTimer=setTimeout(()=>this.notifyClosed(),240);
  },
  notifyClosed(){if(this.closed||this.unloaded)return;this.closed=true;clearTimeout(this.sheetTimer);this.triggerEvent('close');}
 }
});
