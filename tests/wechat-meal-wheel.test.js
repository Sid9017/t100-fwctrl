import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {WheelMotion,WheelGesture,BASE_SPEED}=createRequire(import.meta.url)('../miniprogram/utils/meal-wheel.js');
const point=(degrees,r=100)=>[Math.cos(degrees*Math.PI/180)*r,Math.sin(degrees*Math.PI/180)*r];
function drag(start,end,duration=160){const g=new WheelGesture(...point(start),0,0,1000);for(let i=1;i<=4;i++)g.move(...point(start+(end-start)*i/4),1000+duration*i/4);return g;}
test('clockwise and counterclockwise flicks both trigger, including crossing the angle seam',()=>{
 for(const [start,end] of [[0,60],[0,-60],[160,220],[-160,-220]]){const result=drag(start,end).release(1160);assert.equal(result.trigger,true);assert.equal(Math.sign(result.speed),Math.sign(end-start));}
});
test('slow drags, taps, radial motion, central crossings and stopped fingers do not submit',()=>{
 assert.equal(drag(0,60,1200).release(2200).trigger,false);
 const tap=new WheelGesture(100,0,0,0,1000);assert.equal(tap.release(1020).trigger,false);
 const radial=new WheelGesture(100,0,0,0,1000);radial.move(170,0,1100);assert.equal(radial.release(1100).trigger,false);
 const center=drag(0,60);center.move(0,0,1170);assert.equal(center.release(1170).trigger,false);
 assert.equal(drag(0,60).release(1400).trigger,false);
});
test('linear acceleration integrates identically under irregular frame timing in either direction',()=>{
 for(const direction of [1,-1]){
  const a=new WheelMotion(0),b=new WheelMotion(0);a.target(direction*420,0,0);b.target(direction*420,0,0);a.target(direction*180,0,800);b.target(direction*180,0,800);
  let last=Math.abs(a.speed);for(let t=50;t<=800;t+=50){a.advance(t);assert.ok(Math.abs(a.speed)<=last);last=Math.abs(a.speed);}
  b.advance(231);b.advance(777);b.advance(800);assert.ok(Math.abs(a.angle-b.angle)<1e-8);assert.ok(Math.abs(a.angle-direction*240)<1e-8);
  a.advance(1800);assert.equal(a.speed,direction*180);assert.ok(Math.abs(a.angle-direction*420)<1e-8);
 }
});
test('completion decelerates linearly without reversing and pause does not integrate hidden time',()=>{
 const motion=new WheelMotion(0);motion.target(-180,0,0);motion.advance(1000);const angle=motion.angle;motion.target(-BASE_SPEED,1000,1400);
 assert.equal(motion.angle,angle);motion.advance(1700);assert.equal(motion.speed,-93.75);motion.advance(2400);assert.equal(motion.speed,-BASE_SPEED);
 motion.pause(2400);const frozen=motion.angle;motion.resume(10000);motion.advance(10100);assert.equal(motion.angle,frozen-.75);
});
