const {RiveInstance}=require('../libs/rive/runtime');
const {setWasmPath}=require('../libs/rive/adapter/loader');
const animation=require('../assets/meal-sky');
setWasmPath('/pairing/libs/rive/vendor/rive.wasm.br');
const wrap=value=>((value%4)+4)%4;
Component({
  properties:{meal:{type:Number,value:0},active:{type:Boolean,value:true}},
  observers:{meal(value){this.moveTo(value);},active(value){if(!value)this.cancelMotion();else this.moveTo(this.data.meal,true);}},
  lifetimes:{ready(){this.mounted=true;this.initialize();},detached(){this.mounted=false;this.cancelMotion();this.rive?.cleanup();}},
  pageLifetimes:{hide(){this.hidden=true;this.cancelMotion();},show(){this.hidden=false;this.moveTo(this.data.meal,true);}},
  methods:{
    captureStart(e){this.captureTouch=e.touches?.length===1?e.touches[0]:null;},
    captureMove(e){
      const start=this.captureTouch,touch=e.touches?.[0];
      if(!start||e.touches.length!==1||Math.hypot((touch.x??touch.clientX)-(start.x??start.clientX),(touch.y??touch.clientY)-(start.y??start.clientY))>8)this.captureTouch=null;
    },
    captureCancel(){this.captureTouch=null;},
    captureEnd(e){
      const start=this.captureTouch,touch=e.changedTouches?.[0];this.captureTouch=null;
      if(!start||!touch||Math.hypot((touch.x??touch.clientX)-(start.x??start.clientX),(touch.y??touch.clientY)-(start.y??start.clientY))>8)return;
      this.captureTap(e);
    },
    captureTap(e){
      const touch=e.changedTouches?.[0];
      this.createSelectorQuery().select('#sky').boundingClientRect(box=>{
        if(!this.mounted||!box)return;
        // Canvas touches use local x/y; ordinary tap details use viewport coordinates.
        const x=Number.isFinite(touch?.x)?touch.x:(touch?.clientX??e.detail?.x)-box.left;
        const y=Number.isFinite(touch?.y)?touch.y:(touch?.clientY??e.detail?.y)-box.top;
        if(Number.isFinite(x)&&Number.isFinite(y)&&Math.hypot(x-box.width/2,y-box.height/2)<=box.width*76/500)this.triggerEvent('capture');
      }).exec();
    },
    async initialize(){
      try{
        const box=await new Promise(resolve=>this.createSelectorQuery().select('#sky').fields({node:true,size:true}).exec(rows=>resolve(rows[0])));
        if(!this.mounted||!box?.node)return;
        this.canvas=box.node;
        this.rive=new RiveInstance({canvas:box.node,buffer:wx.base64ToArrayBuffer(animation),width:box.width,height:box.height,devicePixelRatio:Math.min(2,wx.getWindowInfo().pixelRatio||2),animation:'Daylight',autoplay:false,afterDraw:canvas=>this.fadeEdges(canvas)});
        await this.rive.ready;
        if(!this.mounted){this.rive.cleanup();return;}
        this.ready=true;this.position=this.data.meal;this.rive.seek(wrap(this.position));
        this.triggerEvent('ready');
      }catch(e){if(this.mounted){this.rive?.cleanup();this.ready=false;this.triggerEvent('unavailable');}}
    },
    fadeEdges(canvas){
      const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,r=Math.min(w,h)/2;
      ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='destination-in';
      const fade=ctx.createRadialGradient(w/2,h/2,r*.67,w/2,h/2,r);
      fade.addColorStop(0,'rgba(0,0,0,1)');fade.addColorStop(.45,'rgba(0,0,0,.85)');fade.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=fade;ctx.fillRect(0,0,w,h);ctx.restore();
    },
    cancelMotion(){if(this.frame!=null)this.canvas?.cancelAnimationFrame(this.frame);this.frame=null;},
    moveTo(value,immediate=false){
      if(!this.ready)return;
      this.cancelMotion();
      const from=this.position??value;
      let delta=wrap(value)-wrap(from);if(delta>2)delta-=4;if(delta< -2)delta+=4;
      if(immediate||this.hidden||!this.data.active||Math.abs(delta)<.001){this.position=value;this.rive.seek(wrap(value));return;}
      // Touch only selects a stop. A fixed-duration eased animation owns every frame.
      const start=Date.now();
      const tick=()=>{
        if(!this.mounted||this.hidden||!this.data.active)return;
        const t=Math.min(1,(Date.now()-start)/620),e=t*t*(3-2*t);
        this.position=from+delta*e;this.rive.seek(wrap(this.position));
        if(t<1)this.frame=this.canvas.requestAnimationFrame(tick);else{this.position=value;this.frame=null;}
      };
      this.frame=this.canvas.requestAnimationFrame(tick);
    }
  }
});
