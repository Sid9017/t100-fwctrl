/** Synchronize the phone-owned daily countdown after connection or journal changes. */
export class PlanSync {
  constructor(service,journal){
    this.service=service;this.journal=journal;this.epoch=0;
    this.unsubscribe=service.onChange(s=>{const id=s.connected?s.device?.id:null;if(id!==this.device){this.device=id;this.epoch++;this.attempt=null;this.sent=null;}this.queue();});
    this.unsubscribeJournal=journal.onChange(()=>this.queue());
  }
  show(){this.foreground=true;this.attempt=null;clearInterval(this.timer);this.timer=setInterval(()=>this.queue(),60000);this.queue();}
  hide(){this.foreground=false;clearInterval(this.timer);}
  queue(){if(this.queued||this.disposed)return;this.queued=true;Promise.resolve().then(()=>{this.queued=false;return this.sync();});}
  async sync(){
    const s=this.service.state;
    if(this.disposed||!this.foreground||this.running||!s.connected||s.connecting||s.adding||s.busy||s.actionName||!s.hasAuth||!(s.status?.flags&1))return;
    const summary=this.journal.summary();if(summary.target===null||summary.tdee===null)return;
    const id=s.device.id,epoch=this.epoch,payload={currentKcal:summary.remaining,targetKcal:summary.target,tdeeKcal:summary.tdee};
    const plan=JSON.stringify([epoch,id,summary.date,payload]);
    const deletions=(this.journal.data.deletions||[]).filter(d=>d.deviceId===id);
    const attempt=JSON.stringify([plan,deletions.map(d=>d.id)]);
    if((this.sent===plan&&!deletions.length)||this.attempt===attempt)return;
    this.attempt=attempt;this.running=true;this.service.update({planSyncing:true,planSyncError:''});
    const active=()=>!this.disposed&&this.foreground&&this.epoch===epoch&&this.service.state.connected;
    try{
      for(const deletion of deletions){
        if(!active())return;
        await this.service.invoke('deleteKcalHist',{uuid:deletion.id});
        this.journal.clearDeletion(deletion.id,id);
      }
      if(!active())return;
      if(this.sent!==plan){await this.service.invoke('scaleUpdateKcal',payload);if(this.epoch===epoch)this.sent=plan;}
    }catch(error){if(this.epoch===epoch){this.service.update({planSyncError:'Sync failed: '+(error.message||error)});const pending=(this.journal.data.deletions||[]).filter(d=>d.deviceId===id);this.attempt=JSON.stringify([plan,pending.map(d=>d.id)]);}}
    finally{this.running=false;this.service.update({planSyncing:false});this.queue();}
  }
  dispose(){this.hide();this.disposed=true;this.unsubscribe?.();this.unsubscribeJournal?.();}
}
