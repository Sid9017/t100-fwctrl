const definition=require('../shared/device-controller')(0);
Page({...definition,
 data:{...definition.data,showOadProgress:false},
 onLoad(options={}){this.stayOnDeviceInfo=true;definition.onLoad.call(this,options);},
 onShow(){if(this.blocked)return;this.visible=true;this.setData({visible:true});if(!this.preview)getApp().autoConnect?.show();if(this.service?.state.connected&&!this.service.state.busy)void this.service.loadLatestFirmware();},
 async resetDevice(){if(!this.data.canControl||this.data.working)return;const result=await new Promise(resolve=>wx.showModal({title:'Reset device?',content:'Clear device binding and data, and remove it from this app?',confirmText:'Reset',confirmColor:'#b33e42',success:resolve,fail:()=>resolve({confirm:false})}));if(result.confirm)void this.run(async()=>{await this.service.invoke('resetDevice');await this.service.removeDevice();});},
 startInlineOad(){if(!this.data.hasPublishedUpdate||!this.data.canOad||this.data.working)return;this.setData({showOadProgress:true});void this.run(()=>this.service.startOad());}
});
