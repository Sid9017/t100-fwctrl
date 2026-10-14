// Keep selected controls responsive while rendered content finishes its exit.
module.exports={
 initMotion(){this.motionTimers=new Set();this.motionEpoch=0;this.motionActive=true;},
 laterMotion(fn,delay){const epoch=this.motionEpoch,id=setTimeout(()=>{this.motionTimers.delete(id);if(this.motionActive&&epoch===this.motionEpoch)fn();},delay);this.motionTimers.add(id);},
 cancelMotion(){this.motionEpoch=(this.motionEpoch||0)+1;for(const id of this.motionTimers||[])clearTimeout(id);this.motionTimers=new Set();},
 settleMotion(){this.cancelMotion();this.setData({displayedModeIndex:this.data.reportModeIndex,renderedView:this.data.view,modePhase:'',periodPhase:'',periodHeight:'auto'});},
 stopMotion(){this.motionActive=false;this.settleMotion();},
 measurePeriod(done,selector='.period-content'){const epoch=this.motionEpoch;this.createSelectorQuery().select(selector).boundingClientRect().exec(rows=>{if(this.motionActive&&epoch===this.motionEpoch)done(Math.max(0,rows?.[0]?.height||0));});},
 fadeReportMode(index){
  this.cancelMotion();this.setData({reportModeIndex:index,modePhase:'leaving',periodPhase:'',periodHeight:'auto',renderedView:this.data.view});
  this.laterMotion(()=>this.setData({displayedModeIndex:this.data.reportModeIndex},()=>{
    this.laterMotion(()=>this.setData({modePhase:'entering'},()=>this.laterMotion(()=>this.setData({modePhase:''}),240)),32);
  }),160);
 },
 animatePeriod(view){
  // During a mode fade, remember the choice; its incoming content uses this view.
  if(this.data.modePhase){this.setData({view,renderedView:view});return;}
  this.cancelMotion();this.setData({view});
  this.measurePeriod(height=>{
    if(!height){this.setData({renderedView:view,periodHeight:'auto',periodPhase:''});return;}
    this.setData({periodHeight:height+'px',periodPhase:'prepared'},()=>this.laterMotion(()=>{
      this.setData({periodHeight:'0px',periodPhase:'closing'});
      this.laterMotion(()=>this.setData({renderedView:this.data.view,periodPhase:'swapping'},()=>{
        this.measurePeriod(nextHeight=>this.laterMotion(()=>{
          this.setData({periodHeight:nextHeight+'px',periodPhase:'opening'});
          this.laterMotion(()=>this.setData({periodHeight:'auto',periodPhase:''}),280);
        },32));
      }),180);
    },32));
  },'.period-transition');
 }
};
