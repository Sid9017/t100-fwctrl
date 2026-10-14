const definition=require('../../pages/shared/device-controller')(0);
const methods=Object.fromEntries(Object.entries(definition).filter(([key,value])=>typeof value==='function'&&!['onLoad','onShow','onHide','onUnload'].includes(key)));
Component({
  options:{styleIsolation:'apply-shared'},
  properties:{demo:{type:Boolean,value:false}},
  data:definition.data,
  lifetimes:{
    ready(){
      this.mounted=true;this.screen=0;definition.onLoad.call(this,{preview:this.properties.demo?'1':undefined});
      if(this.blocked||!this.service||this.data.hasKnownDevices){this.close(this.data.error);return;}
      definition.onShow.call(this);definition.openAddDevice.call(this);
    },
    detached(){this.mounted=false;definition.onUnload.call(this);}
  },
  pageLifetimes:{hide(){if(this.mounted)definition.onHide.call(this);},show(){if(this.mounted)definition.onShow.call(this);}},
  methods:{...methods,
    close(error){this.triggerEvent('close',{error:error||''});},
    closeAddDevice(){definition.closeAddDevice.call(this);this.close();},
    closeScanner(){if(this.data.connecting)return;definition.closeScanner.call(this);this.close();},
    openDevice(){this.connectedRoute=true;definition.openDevice.call(this);},
    async run(action){await definition.run.call(this,action);if(this.connectedRoute&&this.mounted)this.close();},
    openScanner(){if(this.preview){this.setData({showAddDevice:false,showScanner:true,bridgeOnly:true});return;}definition.openScanner.call(this);},
    async scanBarcode(){
      if(this.preview){this.close('Scan the device barcode in WeChat on your phone.');return;}
      await definition.scanBarcode.call(this);
      if(!this.data.showScanner&&this.mounted)this.close(this.data.error);
    }
  }
});
