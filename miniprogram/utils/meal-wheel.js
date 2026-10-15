// Degrees and seconds. Integrating a linear velocity ramp analytically makes
// speed independent of bridge/frame timing and keeps clockwise/CCW continuous.
const BASE_SPEED=7.5,ANALYSIS_SPEED=180,FLING_SPEED=210;
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
class WheelMotion {
 constructor(now=0){this.angle=0;this.speed=BASE_SPEED;this.time=now;this.ramp=null;}
 integral(ramp,time){const t=clamp((time-ramp.start)/1000,0,ramp.duration);return ramp.from*t+(ramp.to-ramp.from)*t*t/(2*ramp.duration)+ramp.to*Math.max(0,(time-ramp.start)/1000-ramp.duration);}
 advance(now){
  if(now<=this.time)return this.angle;
  if(this.ramp){const r=this.ramp;this.angle+=this.integral(r,now)-this.integral(r,this.time);this.speed=r.from+(r.to-r.from)*clamp((now-r.start)/1000/r.duration,0,1);if(now>=r.start+r.duration*1000)this.ramp=null;}
  else this.angle+=this.speed*(now-this.time)/1000;
  this.time=now;return this.angle;
 }
 target(speed,now,duration=900){this.advance(now);if(duration<=0){this.speed=speed;this.ramp=null;}else this.ramp={from:this.speed,to:speed,start:now,duration:duration/1000};}
 drag(delta,now){this.angle+=delta;this.time=now;this.speed=0;this.ramp=null;}
 pause(now){this.advance(now);this.ramp=null;}
 resume(now){this.time=now;}
}
const deltaAngle=(from,to)=>((to-from+540)%360)-180;
class WheelGesture {
 constructor(x,y,cx,cy,time){this.cx=cx;this.cy=cy;this.startX=x;this.startY=y;this.lastAngle=Math.atan2(y-cy,x-cx)*180/Math.PI;this.turn=0;this.travel=0;this.moved=false;this.valid=Math.hypot(x-cx,y-cy)>30;this.samples=[{time,turn:0}];}
 move(x,y,time){
  if(!this.valid)return 0;
  if(Math.hypot(x-this.cx,y-this.cy)<30){this.valid=false;return 0;}
  const angle=Math.atan2(y-this.cy,x-this.cx)*180/Math.PI,delta=deltaAngle(this.lastAngle,angle);this.lastAngle=angle;
  this.turn+=delta;this.travel+=Math.abs(delta);this.moved ||= Math.hypot(x-this.startX,y-this.startY)>10;
  this.samples.push({time,turn:this.turn});while(this.samples.length>2&&this.samples[1].time<time-120)this.samples.shift();
  return delta;
 }
 release(time){
  const last=this.samples[this.samples.length-1],first=this.samples[0],elapsed=last.time-first.time;
  const speed=this.valid&&time-last.time<=140&&elapsed>=16?(last.turn-first.turn)*1000/elapsed:0;
  return {speed:clamp(speed,-540,540),trigger:this.valid&&this.moved&&this.travel>=22&&Math.abs(speed)>=FLING_SPEED};
 }
}
module.exports={WheelMotion,WheelGesture,BASE_SPEED,ANALYSIS_SPEED,FLING_SPEED};
