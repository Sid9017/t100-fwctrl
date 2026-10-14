import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {brotliDecompressSync} from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const wasm=new URL('../miniprogram/pairing/libs/rive/vendor/rive.wasm.br',import.meta.url);
globalThis.WXWebAssembly={instantiate:(_,imports)=>WebAssembly.instantiate(brotliDecompressSync(readFileSync(wasm)),imports)};
test('the shipped pairing Rive renders different poses, stops offscreen and releases its frame callback',async()=>{
  const {RiveInstance}=require('../miniprogram/pairing/libs/rive/runtime.js');let callback;const paths=[];
  const noop=()=>{},ctx={beginPath:noop,moveTo:(...p)=>paths.push(p),lineTo:noop,bezierCurveTo:(...p)=>paths.push(p),closePath:noop,fill:noop,stroke:noop,clip:noop,save:noop,restore:noop,transform:noop,setTransform:noop,clearRect:()=>paths.length=0,createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop})};
  const canvas={getContext:()=>ctx,requestAnimationFrame:cb=>{callback=cb;return 1;},cancelAnimationFrame:()=>callback=null};ctx.canvas=canvas;
  const realNow=Date.now;let now=10000;Date.now=()=>now;
  const instance=new RiveInstance({canvas,buffer:readFileSync(new URL('../assets/pairing/kcalack-pairing.riv',import.meta.url)),width:375,height:280,devicePixelRatio:2,animation:'Pairing'});
  try{
    await instance.ready;callback();assert.equal(canvas.width,750);assert.ok(paths.length>20);const start=JSON.stringify(paths);
    for(let i=0;i<120;i++){now+=17;callback();}assert.notEqual(JSON.stringify(paths),start);
    instance.pause();assert.equal(callback,null);instance.play();assert.equal(typeof callback,'function');instance.cleanup();assert.equal(callback,null);
  }finally{instance.cleanup();Date.now=realNow;}
});
