import {mealContent} from './journal.js';
import {isConnectionUnavailable} from './sync-errors.js';
/** Serialize phone-owned configuration, history deletions and UUID-based meal updates. */
export class PlanSync {
  constructor(service,journal){
    this.service=service;this.journal=journal;this.epoch=0;this.owner=journal.ownerId;
    this.unsubscribe=service.onChange(s=>{const id=s.connected?s.device?.id:null;if(id!==this.device){this.device=id;this.epoch++;this.attempt=null;this.sent=null;if(!id&&(s.planSyncError||s.planSyncing))service.update({planSyncError:'',planSyncing:false});}this.queue();});
    this.unsubscribeJournal=journal.onChange(()=>{if(this.owner!==journal.ownerId){this.owner=journal.ownerId;this.epoch++;this.sent=null;this.attempt=null;}this.queue();});
  }
  show(){this.foreground=true;this.attempt=null;clearInterval(this.timer);this.timer=setInterval(()=>{this.attempt=null;this.queue();},60000);this.queue();}
  hide(){this.foreground=false;clearInterval(this.timer);}
  queue(){if(this.queued||this.disposed)return;this.queued=true;Promise.resolve().then(()=>{this.queued=false;return this.sync();});}
  async sync(){
    const s=this.service.state;
    if(this.disposed||!this.foreground||this.running||!s.connected||s.connecting||s.adding||s.busy||s.actionName||!s.hasAuth||!(s.status?.flags&1))return;
    const summary=this.journal.summary();if(summary.target===null||summary.tdee===null)return;
    const id=s.device.id,epoch=this.epoch,payload={currentKcal:summary.remaining,targetKcal:summary.target,tdeeKcal:summary.tdee,navigate:false};
    const plan=JSON.stringify([epoch,id,summary.date,payload]);
    const deletions=(this.journal.data.deletions||[]).filter(d=>d.deviceId===id);
    const meals=this.journal.data.records.filter(r=>r.photos?.length&&r.kcal!==null&&r.kcal!==undefined&&r.sync?.[id]!=='sent').map(r=>({id:r.id,version:mealContent(r)}));
    const signature=(removed,records)=>JSON.stringify([plan,removed.map(d=>d.id),records]);
    const attempt=signature(deletions,meals);
    if((this.sent===plan&&!deletions.length&&!meals.length)||this.attempt===attempt)return;
    this.attempt=attempt;this.running=true;this.service.update({planSyncing:true,planSyncError:''});
    const active=()=>!this.disposed&&this.foreground&&this.epoch===epoch&&this.service.state.connected;
    try{
      // Configuration has priority over journal maintenance on a fresh connection.
      if(!active())return;
      if(this.sent!==plan){await this.service.invoke('scaleUpdateKcal',payload,{deferOffline:true});if(this.epoch===epoch)this.sent=plan;}
      for(const deletion of deletions){
        if(!active())return;
        await this.service.invoke('deleteKcalHist',{uuid:deletion.id},{deferOffline:true});
        this.journal.clearDeletion(deletion.id,id);
      }
      for(const queued of meals){
        if(!active())return;
        const record=this.journal.data.records.find(r=>r.id===queued.id);
        if(!record||mealContent(record)!==queued.version)continue;
        // Persist the destination before sending so a concurrent deletion creates a tombstone.
        this.journal.markSync(record.id,id,'pending');
        await this.service.invoke('appendKcalHist',{uuid:record.id,timestampUtc:record.timestampUtc,kcal:record.kcal,rating:record.rating,foodFiles:record.photos.slice(0,3)},{deferOffline:true});
        const latest=this.journal.data.records.find(r=>r.id===record.id);
        if(active()&&latest&&latest.sync?.[id]==='pending'&&mealContent(latest)===queued.version)this.journal.markSync(record.id,id,'sent');
      }
    }catch(error){if(this.epoch===epoch){this.service.update({planSyncError:this.service.state.connected&&!isConnectionUnavailable(error)?'Sync failed: '+(error.message||error):''});const pending=(this.journal.data.deletions||[]).filter(d=>d.deviceId===id);this.attempt=signature(pending.filter(d=>deletions.some(old=>old.id===d.id)),meals.filter(q=>this.journal.data.records.some(r=>r.id===q.id&&r.sync?.[id]!=='sent')));}}
    finally{this.running=false;this.service.update({planSyncing:false});this.queue();}
  }
  dispose(){this.hide();this.disposed=true;this.unsubscribe?.();this.unsubscribeJournal?.();}
}
