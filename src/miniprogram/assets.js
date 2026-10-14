import {Buffer} from 'buffer';
import {presetBase64,foods} from './resources.js';
import v2 from '../vendor/morph_theme/v2.js';
import morph from '../vendor/ble/morph_theme/protocol.js';
export const foodItems=[{file:'',label:'No image',path:''},...foods.map(file=>({file,label:file.replace(/\.png$/i,''),path:`/assets/food/${file}`}))];
export async function loadMiniPreset(){const payload=Buffer.from(presetBase64,'base64');v2.validate(payload);return {themeId:1,loaded:{payload,revision:morph.crc32(payload)}};}
export function miniRasterFood(api){const cache=new Map();return async name=>{
  if(cache.has(name))return cache.get(name);const local=typeof name==='string'&&name.startsWith(api.env.USER_DATA_PATH+'/kcalack-photo-');if(!foods.includes(name)&&!local)throw new Error('Invalid food image');
  const canvas=api.createOffscreenCanvas({type:'2d',width:40,height:40}),c=canvas.getContext('2d'),image=canvas.createImage();
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Food image timed out')),10000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(new Error('Food image could not be loaded'));};image.src=local?name:`/assets/food/${name}`;});
  if(!local&&(image.width!==40||image.height!==40))throw new Error('History photos must be 40 × 40');
  const size=Math.min(image.width,image.height);c.clearRect(0,0,40,40);c.drawImage(image,(image.width-size)/2,(image.height-size)/2,size,size,0,0,40,40);const rgba=c.getImageData(0,0,40,40).data,bytes=Buffer.alloc(4800);
  for(let i=0;i<1600;i++){bytes.writeUInt16LE(((rgba[i*4]>>3)<<11)|((rgba[i*4+1]>>2)<<5)|(rgba[i*4+2]>>3),i*2);bytes[3200+i]=rgba[i*4+3];}
  const result={wx:40,wy:40,bytes};cache.set(name,result);return result;
};}
export function renderMiniNotify(api,text){
  const s=String(text||'').trim();if(!s)throw new Error('Notify text is required');
  const canvas=api.createOffscreenCanvas({type:'2d',width:24,height:212}),c=canvas.getContext('2d');let px=14,width;
  do{c.font=`bold ${px}px sans-serif`;width=Math.ceil(c.measureText(s).width);if(width+2<=212||px===8)break;px--;}while(true);
  if(width+2>212)throw new Error('Notify text is too long');const h=Math.max(1,width+2);canvas.height=h;
  c.fillStyle='#000';c.fillRect(0,0,24,h);c.fillStyle='#fff';c.font=`bold ${px}px sans-serif`;c.textBaseline='middle';c.textAlign='left';
  c.save();c.translate(12,h/2);c.rotate(-Math.PI/2);c.scale(-1,1);c.fillText(s,-(h/2-1),0);c.restore();
  const rgba=c.getImageData(0,0,24,h).data,gray=new Uint8Array(24*h);let ink=0;
  for(let i=0;i<gray.length;i++){gray[i]=Math.round(.299*rgba[i*4]+.587*rgba[i*4+1]+.114*rgba[i*4+2]);ink+=gray[i];}
  if(!ink)throw new Error('Notify rendered no visible text');return gray;
}
