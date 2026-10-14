import {deflateSync} from 'node:zlib';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^(c&1?0xedb88320:0);}return (c^0xffffffff)>>>0;};
function png(width,height,rgba){
  const chunk=(name,data)=>{const type=Buffer.from(name),header=Buffer.alloc(4),sum=Buffer.alloc(4);header.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([header,type,data,sum]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const rows=Buffer.alloc(height*(1+width*4));for(let y=0;y<height;y++)rows.set(rgba.subarray(y*width*4,(y+1)*width*4),y*(1+width*4)+1);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
export async function writeModeImages(root){
  const {instance}=await WebAssembly.instantiate(await readFile(new URL('../assets/runtime/preview.wasm',import.meta.url)),{}),x=instance.exports;
  await mkdir(new URL('miniprogram/assets/',root),{recursive:true});
  for(const [mode,name] of ['kcal','kitchen','espresso','pourover'].entries()){
    x.preview_reset();x[['kcal_scale_view_title','kitchen_scale_view_title','espresso_scale_view_title','pourover_scale_view_title'][mode]](x.preview_pixels(),255);
    const pixels=new Uint16Array(x.memory.buffer,x.preview_pixels(),25600),rgba=Buffer.alloc(320*80*4);let peak=0,ink=[0,0,0];
    for(const c of pixels){const rgb=[(c>>11)*255/31,((c>>5)&63)*255/63,(c&31)*255/31],level=Math.max(...rgb);if(level>peak){peak=level;ink=rgb;}}
    for(let y=0;y<80;y++)for(let col=0;col<320;col++){const c=pixels[col*80+y],level=Math.max((c>>11)*255/31,((c>>5)&63)*255/63,(c&31)*255/31);rgba.set([48,54,45,peak?Math.round(level/peak*255):0],(y*320+col)*4);}
    let left=320,right=-1,top=80,bottom=-1;for(let y=0;y<80;y++)for(let col=0;col<320;col++)if(rgba[(y*320+col)*4+3]){left=Math.min(left,col);right=Math.max(right,col);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    const width=right-left+1,height=bottom-top+1,cropped=Buffer.alloc(width*height*4);for(let y=0;y<height;y++)cropped.set(rgba.subarray(((y+top)*320+left)*4,((y+top)*320+right+1)*4),y*width*4);
    await writeFile(new URL(`miniprogram/assets/mode-${name}.png`,root),png(width,height,cropped));
    // Keep firmware colors with transparent antialiased edges for the report wheel.
    const colored=Buffer.from(cropped);
    for(let i=0;i<colored.length;i+=4)colored.set(ink.map(Math.round),i);
    await writeFile(new URL(`miniprogram/assets/mode-${name}-color.png`,root),png(width,height,colored));
  }
}
