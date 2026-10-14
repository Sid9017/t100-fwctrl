const {MiniRuntime}=require('../../lib/t100');
Component({
  options:{virtualHost:true},
  properties:{fadeMs:{type:Number,value:0},displayOnly:Boolean,connected:Boolean,status:Object,reading:Object,commits:Array,active:{type:Boolean,value:true}},
  data:{left:0,right:0,message:''},
  observers:{'commits':function(){for(const data of this.properties.commits||[])this.runtime?.commit(data);},'status,reading':function(){this.runtime?.sync(this.properties.status,this.properties.reading);this.start();},'connected':function(){if(this.mounted)this.setup();},'active':function(){this.start();}},
  lifetimes:{ready(){this.mounted=true;this.setup();},detached(){this.mounted=false;this.stop();}},
  pageLifetimes:{hide(){this.hidden=true;this.stop();},show(){this.hidden=false;this.start();},resize(){this.setup();}},
  methods:{
    stop(){clearInterval(this.timer);this.timer=null;},
    async setup(){
      const generation=this.generation=(this.generation||0)+1;
      this.stop();
      const query=this.createSelectorQuery();
      const nodes=await new Promise(resolve=>query.select('#body').fields({node:true,size:true}).select('#panel').fields({node:true,size:true}).exec(resolve));
      if(!this.mounted || generation!==this.generation)return;
      const body=nodes[0];if(!body?.node&&!this.properties.displayOnly)return;
      if(body?.node)this.drawBody(body.node,body.width,body.height);
      if(!this.properties.connected || !nodes[1]?.node){this.runtime=null;return;}
      this.fadeStarted=Date.now();this.panel=nodes[1].node;this.panel.width=320;this.panel.height=80;this.context=this.panel.getContext('2d');
      try{
        if(!this.runtime){
          const result=await WXWebAssembly.instantiate('/lib/preview.wasm',{});
          if(!this.mounted || generation!==this.generation)return;
          this.runtime=new MiniRuntime((result.instance||result).exports);
        }
        for(const data of this.properties.commits||[])this.runtime.commit(data);
        this.runtime.sync(this.properties.status,this.properties.reading);this.start();
      }catch(error){this.setData({message:'Display unavailable. '+error.message});}
    },
    start(){
      if(!this.mounted||this.hidden||!this.runtime||!this.properties.active||!this.properties.connected||!this.properties.status){this.stop();return;}
      if(this.timer)return;
      const paint=()=>{
        const f=this.runtime.frame();const image=this.context.createImageData(320,80);image.data.set(f.rgba);const alpha=this.properties.fadeMs?Math.min(1,(Date.now()-this.fadeStarted)/this.properties.fadeMs):1;if(alpha<1)for(let i=3;i<image.data.length;i+=4)image.data[i]=Math.round(image.data[i]*alpha);this.context.putImageData(image,0,0);
        if(this.data.left!==f.left||this.data.right!==f.right||this.data.message!==f.missing)this.setData({left:f.left,right:f.right,message:f.missing});
      };
      paint();this.timer=setInterval(paint,40);
    },
    drawBody(canvas,width,height){
      const dpr=wx.getWindowInfo?.().pixelRatio||wx.getSystemInfoSync().pixelRatio||2;
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
      const c=canvas.getContext('2d');c.scale(canvas.width/680,canvas.height/520);c.lineWidth=1.8;c.lineCap='round';c.lineJoin='round';c.strokeStyle='#353831';
      // Exact paths from assets/scale-outline.svg, shared with the web chassis.
      c.beginPath();c.moveTo(26,420);c.bezierCurveTo(31,468,78,488,151,491);c.bezierCurveTo(281,496,460,495,557,490);c.bezierCurveTo(615,487,648,471,652,438);c.bezierCurveTo(631,467,601,476,555,479);c.bezierCurveTo(435,484,221,483,123,479);c.bezierCurveTo(67,477,35,460,26,420);c.closePath();
      const lip=c.createLinearGradient(0,445,0,495);lip.addColorStop(0,'rgba(53,56,49,.02)');lip.addColorStop(.65,'rgba(53,56,49,.13)');lip.addColorStop(1,'rgba(53,56,49,.04)');c.fillStyle=lip;c.fill();c.globalAlpha=.65;c.stroke();c.globalAlpha=1;
      c.beginPath();c.moveTo(26,420);c.bezierCurveTo(23,409,23,401,25,387);c.lineTo(48,132);c.bezierCurveTo(53,74,99,44,177,42);c.bezierCurveTo(250,39,442,42,511,43);c.bezierCurveTo(582,44,625,75,631,126);c.lineTo(655,391);c.bezierCurveTo(658,410,658,424,652,438);c.bezierCurveTo(631,467,601,476,555,479);c.bezierCurveTo(435,484,221,483,123,479);c.bezierCurveTo(67,477,35,460,26,420);c.closePath();c.stroke();
      const fade=c.createLinearGradient(0,35,0,335);fade.addColorStop(0,'rgba(255,255,255,0)');fade.addColorStop(.23,'rgba(255,255,255,.12)');fade.addColorStop(.62,'rgba(255,255,255,.7)');fade.addColorStop(1,'#fff');c.globalCompositeOperation='destination-in';c.fillStyle=fade;c.fillRect(0,0,680,520);c.globalCompositeOperation='destination-over';
      c.save();c.translate(340,490);c.scale(298,24);const shadow=c.createRadialGradient(0,0,0,0,0,1);shadow.addColorStop(0,'rgba(53,56,49,.15)');shadow.addColorStop(.55,'rgba(53,56,49,.07)');shadow.addColorStop(1,'rgba(53,56,49,0)');c.fillStyle=shadow;c.fillRect(-1,-1,2,2);c.restore();c.globalCompositeOperation='source-over';
      if(!this.properties.connected){
        c.beginPath();c.moveTo(168,384);c.bezierCurveTo(247,382,443,385,515,383);c.bezierCurveTo(560,381,585,397,583,422);c.bezierCurveTo(581,446,558,454,517,455);c.lineTo(169,454);c.bezierCurveTo(127,455,102,444,102,420);c.bezierCurveTo(101,397,126,385,168,384);c.closePath();c.stroke();
        for(const x of [180,503]){c.beginPath();c.arc(x,419,4,0,Math.PI*2);c.stroke();}
      }
    }
  }
});
