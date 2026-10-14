const KEY='kcalack.weight-unit.v1';
/** App-wide preference; sync once per connection/change after authenticated setup. */
export class WeightUnitPreference {
  constructor(api,service){
    this.api=api;this.service=service;this.listeners=new Set();this.epoch=0;
    let unit=0,error='';try{unit=api?.getStorageSync(KEY)===1?1:0;}catch{error='Could not read the saved weight unit.';}
    this.state={unit,error,pending:true,syncing:false};
    this.unsubscribe=service?.onChange(s=>{
      const connection=s.connected?s.device?.id:null;
      if(connection!==this.connection){this.connection=connection;this.epoch++;this.attempt=null;this.state={...this.state,pending:true};}
      this.queue();
    });
  }
  onChange(fn){this.listeners.add(fn);fn(this.state);return ()=>this.listeners.delete(fn);}
  update(patch){this.state={...this.state,...patch};for(const fn of this.listeners)fn(this.state);}
  setUnit(unit){
    if(unit!==0&&unit!==1)throw new Error('Choose g or oz.');
    this.api?.setStorageSync(KEY,unit);
    this.attempt=null;this.update({unit,pending:true,error:''});this.queue();
  }
  queue(){if(this.queued||this.disposed)return;this.queued=true;Promise.resolve().then(()=>{this.queued=false;return this.sync();});}
  async sync(){
    const s=this.service?.state;
    if(this.disposed||this.inflight||!this.state.pending||!s?.connected||s.connecting||s.busy||s.adding||s.planSyncing||s.actionName||!s.hasAuth||!(s.status?.flags&1))return;
    const unit=this.state.unit,epoch=this.epoch,key=`${epoch}:${unit}`;
    if(this.attempt===key)return;this.attempt=key;this.inflight=true;this.update({syncing:true});
    try{
      await this.service.invoke('scaleSetUnit',unit);
      if(!this.disposed&&epoch===this.epoch&&unit===this.state.unit)this.update({pending:false,error:''});
    }catch(error){
      if(!this.disposed&&epoch===this.epoch&&unit===this.state.unit)this.update({error:'Unit saved. Device sync failed: '+(error.message||error.errMsg||error)});
    }finally{
      this.inflight=false;if(!this.disposed){this.update({syncing:false});this.queue();}
    }
  }
  dispose(){this.disposed=true;this.unsubscribe?.();this.listeners.clear();}
}
