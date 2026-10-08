import { Buffer } from 'buffer';
import v2 from '../vendor/morph_theme/v2.js';
import morph from '../vendor/ble/morph_theme/protocol.js';
const foodCache = new Map();
export async function loadPreset() {
  const response = await fetch(new URL('assets/preset1.bin', document.baseURI));
  if (!response.ok) throw new Error('Cannot load preset1 emotion resources');
  const payload = Buffer.from(await response.arrayBuffer());
  v2.validate(payload);
  return { name:'preset1', themeId:1, loaded:{payload, revision:morph.crc32(payload)} };
}
export async function listFoodImages() {
  const response = await fetch(new URL('assets/food/manifest.json', document.baseURI));
  if (!response.ok) throw new Error('Cannot load food image list');
  return response.json();
}
export function foodUrl(name) {
  if (!name || /[/\\]/.test(name)) throw new Error('Invalid food image name');
  return new URL(`assets/food/${encodeURIComponent(name)}`, document.baseURI).href;
}
export async function rasterFoodPng(name) {
  if (foodCache.has(name)) return foodCache.get(name);
  const response = await fetch(foodUrl(name));
  if (!response.ok) throw new Error(`Cannot load food image: ${name}`);
  const image = await createImageBitmap(await response.blob());
  try {
    if (image.width !== 40 || image.height !== 40) throw new Error('History photos must be 40 × 40 pixels');
    const canvas = document.createElement('canvas'); canvas.width=40; canvas.height=40;
    const ctx = canvas.getContext('2d', {willReadFrequently:true}); ctx.drawImage(image,0,0);
    const rgba = ctx.getImageData(0,0,40,40).data;
    const bytes = Buffer.alloc(4800);
    for (let i=0;i<1600;i++) {
      bytes.writeUInt16LE(((rgba[i*4]>>3)<<11)|((rgba[i*4+1]>>2)<<5)|(rgba[i*4+2]>>3),i*2);
      bytes[3200+i] = rgba[i*4+3];
    }
    const result = {wx:40,wy:40,bytes}; foodCache.set(name,result); return result;
  } finally { image.close(); }
}
