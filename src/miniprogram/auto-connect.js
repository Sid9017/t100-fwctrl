/** Foreground-only reconnection to the single saved, authenticated device. */
export class AutoConnect {
  constructor(service,{api=service.adapter?.api,setTimer=setTimeout,clearTimer=clearTimeout,retryMs=15000}={}){
    this.service=service;this.api=api;this.setTimer=setTimer;this.clearTimer=clearTimer;this.retryMs=retryMs;this.available=true;this.foreground=false;
    this.adapterChanged=state=>{this.available=state.available!==false;if(!this.available){this.cancel();void this.service.stopScan().catch(()=>{});}else{this.nextAttempt=0;this.queue();}};
    api?.onBluetoothAdapterStateChange?.(this.adapterChanged);
    this.unsubscribe=service.onChange(s=>{if(this.wasScanning&&!s.scanning&&this.ownsScan&&!this.running){this.ownsScan=false;this.nextAttempt=Date.now()+this.retryMs;}this.wasScanning=!!s.scanning;this.queue();});
  }
  target(){const row=this.service.state.knownDevices?.[0];if(!row)return null;try{return this.service.auth.resolve(row)?row:null;}catch{return null;}}
  show(){this.foreground=true;this.nextAttempt=0;this.queue();}
  hide(){this.foreground=false;this.cancel();if(this.ownsScan){this.ownsScan=false;void this.service.stopScan().catch(()=>{});}}
  cancel(){this.clearTimer(this.timer);this.timer=null;}
  queue(){if(this.queued||this.disposed)return;this.queued=true;Promise.resolve().then(()=>{this.queued=false;this.pump();});}
  pump(){
    if(this.disposed||!this.foreground||!this.available||this.running)return;
    const s=this.service.state,target=this.target();
    if(!target||s.connected||s.connecting||s.busy||s.adding||s.actionName){this.cancel();return;}
    const nearby=(s.devices||[]).find(row=>!row.cached&&row.name.toLowerCase()===target.name.toLowerCase());
    if(Date.now()<(this.nextAttempt||0)){this.schedule();return;}
    if(nearby){
      this.running=true;this.cancel();this.ownsScan=false;
      void this.service.connect(nearby.id).catch(()=>{}).finally(()=>{this.running=false;this.nextAttempt=Date.now()+this.retryMs;this.queue();});return;
    }
    if(s.scanning)return;
    this.running=true;this.ownsScan=true;this.cancel();
    void this.service.scan().catch(()=>{this.nextAttempt=Date.now()+this.retryMs;}).finally(()=>{this.running=false;this.queue();});
  }
  schedule(){if(this.timer)return;this.timer=this.setTimer(()=>{this.timer=null;this.queue();},Math.max(100,this.nextAttempt-Date.now()));}
  dispose(){this.hide();this.disposed=true;this.unsubscribe?.();this.api?.offBluetoothAdapterStateChange?.(this.adapterChanged);}
}
