const RING_SIZE=300,TRACK_WIDTH=28.5,SELECTED_WIDTH=34;
const TYPES=[
  {key:'carbs',name:'Carbohydrates',color:'#ff126f',tip:'#ff4095',track:'#4e0926',radius:126},
  {key:'protein',name:'Protein',color:'#b8f500',tip:'#d1ff43',track:'#2f3d08',radius:98},
  {key:'fat',name:'Fat',color:'#00ddc3',tip:'#51f4df',track:'#063b35',radius:70},
  {key:'fiber',name:'Fiber',color:'#57a1ff',tip:'#8ac2ff',track:'#142b48',radius:42}
];
function blend(from,to,t){
  return '#'+[1,3,5].map(i=>Math.round(parseInt(from.slice(i,i+2),16)*(1-t)+parseInt(to.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
}
function ringSource(ring,expanded=false){
  // A shared viewport prevents per-ring rpx rounding from shifting the centers.
  // Slightly overlap adjacent tracks to hide antialiasing seams at all pixel ratios.
  const size=RING_SIZE,center=size/2,ratio=ring.ratio||0,width=expanded?SELECTED_WIDTH:TRACK_WIDTH,cap=width/2;
  // Draw completed laps underneath the current lap, keeping the leading cap visible.
  const lap=ratio>0?(ratio%1||1):0,point=angle=>[center+Math.cos(angle)*ring.radius,center+Math.sin(angle)*ring.radius];
  const circle=(color,extra='')=>`<circle cx="${center}" cy="${center}" r="${ring.radius}" fill="none" stroke="${color}" stroke-width="${width}" ${extra}/>`;
  let paths=circle(ring.track);
  if(ratio>=1)paths+=circle(ring.color,'data-completed-lap="true"');
  if(lap===0)paths+=`<circle data-start-marker="true" cx="${center}" cy="${center-ring.radius}" r="${cap}" fill="${ring.color}"/>`;
  if(lap>0){
    const steps=Math.max(1,Math.ceil(lap*90));
    paths+=`<circle cx="${center}" cy="${center-ring.radius}" r="${cap}" fill="${ring.color}"/>`;
    for(let i=0;i<steps;i++){
      const start=-Math.PI/2+i/steps*lap*Math.PI*2,end=-Math.PI/2+Math.min(lap*Math.PI*2,(i+1)/steps*lap*Math.PI*2+.002);
      const [x1,y1]=point(start),[x2,y2]=point(end);
      paths+=`<path d="M ${x1} ${y1} A ${ring.radius} ${ring.radius} 0 0 1 ${x2} ${y2}" fill="none" stroke="${blend(ring.color,ring.tip,(i+1)/steps)}" stroke-width="${width}"/>`;
    }
    const angle=lap*Math.PI*2-Math.PI/2,[endX,endY]=point(angle);
    paths+=`<circle cx="${endX-Math.sin(angle)*2.5}" cy="${endY+Math.cos(angle)*2.5}" r="${cap}" fill="#000" opacity=".5" filter="url(#cap-shadow)"/><circle data-progress-cap="true" cx="${endX}" cy="${endY}" r="${cap}" fill="${ring.tip}"/>`;
  }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><defs><filter id="cap-shadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.4"/></filter></defs>${paths}</svg>`;
  const bytes=new Uint8Array(svg.length);for(let i=0;i<svg.length;i++)bytes[i]=svg.charCodeAt(i);
  return 'data:image/svg+xml;base64,'+wx.arrayBufferToBase64(bytes.buffer);
}
Component({
  properties:{nutrients:{type:Array,value:[]}},
  data:{rings:[],selectedKey:'carbs',selected:null},
  observers:{nutrients(value){this.updateNutrients(value);}},
  lifetimes:{detached(){this.detached=true;this.ringGesture=null;}},
  pageLifetimes:{hide(){this.ringGesture=null;this.tapEpoch=(this.tapEpoch||0)+1;}},
  methods:{
    updateNutrients(value){
      const rings=TYPES.map(type=>{
        const nutrient=(value||[]).find(n=>n.key===type.key)||{total:0,goal:null,progress:0,partial:false};
        const ratio=nutrient.goal>0?Math.max(0,Number(nutrient.total)||0)/nutrient.goal:0;
        const ring={...nutrient,...type,ratio,percent:nutrient.goal>0?Math.round(ratio*1000)/10:null,excess:nutrient.goal!==null?Math.max(0,Math.round((nutrient.total-nutrient.goal)*10)/10):0};
        return {...ring,source:ringSource(ring),expandedSource:ringSource(ring,true)};
      });
      this.setData({rings,selected:rings.find(r=>r.key===this.data.selectedKey)||rings[0]});
    },
    selectNutrient(key){
      const selected=this.data.rings.find(r=>r.key===key);
      if(selected&&key!==this.data.selectedKey)this.setData({selectedKey:key,selected});
    },
    ringAtPoint(x,y,rect){
      const radius=Math.hypot(x-rect.left-rect.width/2,y-rect.top-rect.height/2)*RING_SIZE/rect.width;
      const nearest=TYPES.reduce((best,ring)=>Math.abs(ring.radius-radius)<Math.abs(best.radius-radius)?ring:best);
      if(Math.abs(nearest.radius-radius)<=(nearest.key===this.data.selectedKey?SELECTED_WIDTH:TRACK_WIDTH)/2)this.selectNutrient(nearest.key);
    },
    ringTouchStart(e){
      const touch=e.touches?.[0];if(!Number.isFinite(touch?.clientX)||!Number.isFinite(touch?.clientY))return;
      const gesture={x:touch.clientX,y:touch.clientY,startX:touch.clientX,startY:touch.clientY,moved:false};this.ringGesture=gesture;
      this.tapEpoch=(this.tapEpoch||0)+1;
      this.createSelectorQuery().select('#rings').boundingClientRect(rect=>{
        if(this.detached||this.ringGesture!==gesture||!rect?.width)return;
        gesture.rect=rect;this.ringAtPoint(gesture.x,gesture.y,rect);
      }).exec();
    },
    ringTouchMove(e){
      const gesture=this.ringGesture,touch=e.touches?.[0];if(!gesture||!Number.isFinite(touch?.clientX)||!Number.isFinite(touch?.clientY))return;
      gesture.x=touch.clientX;gesture.y=touch.clientY;gesture.moved=gesture.moved||Math.hypot(gesture.x-gesture.startX,gesture.y-gesture.startY)>4;
      if(gesture.rect)this.ringAtPoint(gesture.x,gesture.y,gesture.rect);
    },
    ringTouchEnd(e){
      if(!this.ringGesture)return;
      if(e.type!=='touchcancel')this.ringTouchMove({touches:e.changedTouches});
      if(this.ringGesture.moved)this.tapBlockedUntil=Date.now()+350;
      this.ringGesture=null;
    },
    selectRing(e){
      if(Date.now()<(this.tapBlockedUntil||0))return;
      const {x,y}=e.detail||{},key=e.currentTarget.dataset.key;
      // Screen-reader activation has no touch coordinates; use the named ring.
      if(!Number.isFinite(x)||!Number.isFinite(y)||(x===0&&y===0)){this.selectNutrient(key);return;}
      const epoch=this.tapEpoch=(this.tapEpoch||0)+1;
      this.createSelectorQuery().select('#rings').boundingClientRect(rect=>{
        if(this.detached||epoch!==this.tapEpoch||!rect?.width)return;
        this.ringAtPoint(x,y,rect);
      }).exec();
    }
  }
});
