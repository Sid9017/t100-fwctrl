const definition=require('../shared/device-controller')(0);
Page({...definition,
 data:{...definition.data,showOadProgress:false},
 onLoad(options={}){this.stayOnDeviceInfo=true;definition.onLoad.call(this,options);},
 onShow(){if(this.blocked)return;this.visible=true;this.setData({visible:true});if(!this.preview)getApp().autoConnect?.show();if(this.service?.state.connected&&!this.service.state.busy)void this.service.loadLatestFirmware();},
 async resetDevice(){
  if(this.data.working||this.data.busy||this.data.connecting||this.data.planSyncing)return;
  const reset=!!this.service.state.connected,device=this.service.state.device||this.service.state.knownDevices[0];if(!device)return;
  const result=await new Promise(resolve=>wx.showModal({title:reset?'Reset device?':'Remove device?',content:reset?'Clear local credentials and device data, then reset the device?':'Remove local credentials and association? The device stays bound.',confirmText:reset?'Reset':'Remove',confirmColor:'#b33e42',success:resolve,fail:()=>resolve({confirm:false})}));
  if(result.confirm)return this.run(async()=>{
   const current=this.service.state.device||this.service.state.knownDevices[0];
   if(current?.name!==device.name||!!this.service.state.connected!==reset)throw new Error('Connection changed. Please try again.');
   let returned=false;
   const returnHome=()=>{
    if(returned)return;returned=true;getApp().pendingPairingIntro=false;
    wx.reLaunch({url:'/pages/index/index'+(this.preview?'?preview=1':'')});
   };
   try{await this.service.removeDevice({reset,onCleared:returnHome});returnHome();}
   catch(error){if(returned)wx.showToast({title:error.message||'Reset failed',icon:'none'});else throw error;}
  });
 },
 startInlineOad(){if(!this.data.hasPublishedUpdate||!this.data.canOad||this.data.working)return;this.setData({showOadProgress:true});void this.run(()=>this.service.startOad());}
});
