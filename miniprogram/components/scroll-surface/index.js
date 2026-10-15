Component({
  properties:{refreshKey:{type:String,value:''},resetKey:{type:String,value:''},snapEdges:{type:Boolean,value:false},snapPaused:{type:Boolean,value:false}},
  data:{viewportHeight:0,scrollTop:0,animateScroll:false},
  observers:{refreshKey(){this.queueMeasure();},snapPaused(paused){if(paused)this.cancelSnap();else this.queueMeasure();},resetKey(){
    if(!this.mounted)return;
    this.cancelSnap();
    // The bound value must change even when the user scrolled natively.
    this.setData({scrollTop:this.lastTop||0},()=>this.setData({scrollTop:0}));
    this.lastTop=0;this.queueMeasure();
  }},
  lifetimes:{ready(){this.mounted=true;this.queueMeasure();},detached(){this.mounted=false;clearTimeout(this.measureTimer);this.cancelSnap();}},
  pageLifetimes:{show(){this.hidden=false;this.queueMeasure();},resize(){this.queueMeasure();},hide(){this.hidden=true;this.touching=false;clearTimeout(this.measureTimer);this.cancelSnap();}},
  methods:{
    queueMeasure(){if(!this.mounted||this.hidden)return;clearTimeout(this.measureTimer);this.measureTimer=setTimeout(()=>this.measure(),32);},
    measure(){if(!this.mounted||this.hidden)return;this.createSelectorQuery().select('#viewport').boundingClientRect().select('#content').boundingClientRect().exec(rows=>{
      if(!this.mounted||this.hidden||!rows?.[0])return;const height=rows[0].height;
      this.viewportHeight=height;this.contentHeight=Math.max(height,rows[1]?.height||0);
      if(this.data.viewportHeight!==height)this.setData({viewportHeight:height});this.queueSnap();
    });},
    onScroll(e){this.lastTop=e.detail.scrollTop||0;if(Number.isFinite(e.detail.scrollHeight))this.contentHeight=e.detail.scrollHeight;this.gestureScrolled=true;this.queueSnap();},
    onTouchStart(){this.touching=true;this.gestureScrolled=false;this.cancelSnap();},
    onTouchEnd(){this.touching=false;if(this.gestureScrolled)this.queueSnap();},
    cancelSnap(){clearTimeout(this.snapTimer);clearTimeout(this.snapFinishTimer);this.snapEpoch=(this.snapEpoch||0)+1;this.snapping=false;if(this.mounted&&this.data.animateScroll)this.setData({animateScroll:false,scrollTop:this.lastTop||0});},
    queueSnap(){
      clearTimeout(this.snapTimer);
      if(!this.mounted||this.hidden||!this.properties?.snapEdges||this.properties.snapPaused||this.touching||this.snapping)return;
      // A debounce also covers mouse wheels and older base libraries without scrollend.
      this.snapTimer=setTimeout(()=>this.snapToEdge(),180);
    },
    snapToEdge(){
      if(!this.mounted||this.hidden||!this.properties?.snapEdges||this.properties.snapPaused||this.touching||this.snapping)return;
      const max=Math.max(0,(this.contentHeight||0)-(this.viewportHeight||0));
      const top=Math.max(0,Math.min(max,this.lastTop||0)),target=top<max/2?0:max;
      if(max<=4||Math.abs(top-target)<=2)return;
      this.snapping=true;const epoch=this.snapEpoch||0;
      this.setData({animateScroll:false,scrollTop:top},()=>{
        if(!this.mounted||this.hidden||this.touching||this.properties.snapPaused||epoch!==(this.snapEpoch||0))return;
        this.setData({animateScroll:true,scrollTop:target});
        this.snapFinishTimer=setTimeout(()=>{this.snapping=false;if(this.mounted&&!this.hidden)this.queueSnap();},500);
      });
    }
  }
});
