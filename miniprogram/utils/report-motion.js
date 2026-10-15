// Mode fades and cancellable inline week expansion share one motion lifecycle.
module.exports={
 initMotion(){this.motionTimers=new Set();this.motionEpoch=0;this.motionActive=true;},
 laterMotion(fn,delay){const epoch=this.motionEpoch,id=setTimeout(()=>{this.motionTimers.delete(id);if(this.motionActive&&epoch===this.motionEpoch)fn();},delay);this.motionTimers.add(id);},
 cancelMotion(){this.motionEpoch=(this.motionEpoch||0)+1;for(const id of this.motionTimers||[])clearTimeout(id);this.motionTimers=new Set();},
 settleMotion(){this.cancelMotion();this.setData({displayedModeIndex:this.data.reportModeIndex,modePhase:'',expandedRow:-1,requestedRow:-1,weekPhase:'',weekHeight:'0px'});},
 stopMotion(){this.motionActive=false;this.settleMotion();},
 fadeReportMode(index){
  this.cancelMotion();this.setData({reportModeIndex:index,modePhase:'leaving',expandedRow:-1,requestedRow:-1,weekPhase:'',weekHeight:'0px'});
  this.laterMotion(()=>this.setData({displayedModeIndex:this.data.reportModeIndex},()=>{
    this.laterMotion(()=>this.setData({modePhase:'entering'},()=>this.laterMotion(()=>this.setData({modePhase:''}),240)),32);
  }),160);
 },
 animateWeek(row,week){
  if(row===this.data.requestedRow)return;
  this.cancelMotion();this.setData({requestedRow:row});
  const open=()=>{
    if(row<0){this.setData({expandedRow:-1,weekHeight:'0px',weekPhase:''});return;}
    this.setData({expandedRow:row,week,weekHeight:'0px',weekPhase:'prepared'},()=>{
      const epoch=this.motionEpoch;
      this.createSelectorQuery().select('.week-detail-content').boundingClientRect().exec(rows=>{
        if(!this.motionActive||epoch!==this.motionEpoch)return;
        const height=rows?.[0]?.height;
        this.laterMotion(()=>{
          this.setData({weekHeight:height?height+'px':'auto',weekPhase:'opening'});
          this.laterMotion(()=>this.setData({weekHeight:'auto',weekPhase:''}),280);
        },32);
      });
    });
  };
  if(this.data.expandedRow>=0){
    // Measure the actual in-flight height, including a partially opened week.
    const epoch=this.motionEpoch;
    this.createSelectorQuery().select('.week-detail').boundingClientRect().exec(rows=>{
      if(!this.motionActive||epoch!==this.motionEpoch)return;
      this.setData({weekHeight:(rows?.[0]?.height||0)+'px',weekPhase:'prepared'},()=>this.laterMotion(()=>{
        this.setData({weekHeight:'0px',weekPhase:'closing'});this.laterMotion(open,180);
      },16));
    });
  }else open();
 }
};
