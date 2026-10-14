Component({
  properties:{refreshKey:{type:String,value:''},resetKey:{type:String,value:''}},
  data:{ticks:[0,1,2,3,4,5,6],activeIndex:0,overflow:false,viewportHeight:0,scrollTop:0},
  observers:{refreshKey(){this.queueMeasure();},resetKey(){
    if(!this.mounted)return;
    // The bound value must change even when the user scrolled natively.
    this.setData({scrollTop:this.lastTop||0},()=>this.setData({scrollTop:0}));
    this.lastTop=0;this.queueMeasure();
  }},
  lifetimes:{ready(){this.mounted=true;this.queueMeasure();},detached(){this.mounted=false;clearTimeout(this.measureTimer);}},
  pageLifetimes:{show(){this.queueMeasure();},resize(){this.queueMeasure();},hide(){clearTimeout(this.measureTimer);}},
  methods:{
    queueMeasure(){if(!this.mounted)return;clearTimeout(this.measureTimer);this.measureTimer=setTimeout(()=>this.measure(),32);},
    measure(){if(!this.mounted)return;this.createSelectorQuery().select('#viewport').boundingClientRect().select('#content').boundingClientRect().exec(rows=>{
      if(!this.mounted||!rows?.[0])return;const height=rows[0].height;
      this.viewportHeight=height;this.contentHeight=Math.max(height,rows[1]?.height||0);
      if(this.data.viewportHeight!==height)this.setData({viewportHeight:height});this.progress();
    });},
    onScroll(e){this.lastTop=e.detail.scrollTop||0;if(Number.isFinite(e.detail.scrollHeight))this.contentHeight=e.detail.scrollHeight;this.progress();},
    progress(){const max=Math.max(0,(this.contentHeight||0)-(this.viewportHeight||0)),overflow=max>4;
      const ratio=max?Math.max(0,Math.min(1,(this.lastTop||0)/max)):0;
      const activeIndex=Math.round(ratio*(this.data.ticks.length-1));
      if(this.data.overflow!==overflow||this.data.activeIndex!==activeIndex)this.setData({overflow,activeIndex});
    }
  }
});
