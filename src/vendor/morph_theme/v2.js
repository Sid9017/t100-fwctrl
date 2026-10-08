'use strict';
function validate(p) {
  if(p.length<36||p.length>1125||p.toString('ascii',0,4)!=='EMO2'||p[4]!==2||p[5]!==7)throw Error('Invalid V2 header');
  const used=p.readUInt16LE(6);let end=36;
  if (used !== p.length) throw Error("V2 length must match header");
  for(let id=0;id<7;id++){
    const off=p.readUInt16LE(8+id*4),len=p.readUInt16LE(10+id*4);
    if(off!==end||len<9||off+len>used||used>1125)throw Error('Invalid V2 index');
    const r=p.subarray(off,off+len),stroke=r.readUInt16LE(2),n=r.readUInt16LE(4);
    if(r[0]!==id||r[1]!==Number(id===6)||r.readUInt16LE(6)||!n||n>64||
       (id<6&&(stroke<8||stroke>256))||(id===6&&stroke))throw Error('Invalid V2 record');
    let at=8,paths=0,points=0;
    for(let i=0;i<n;i++){
      const op=r[at++],args=op===67?6:op===77||op===76?2:0;
      if(![77,76,67,90].includes(op)||(!i&&op!==77)||at+args*2>len)throw Error('Invalid V2 command');
      if(op===77&&++paths>2)throw Error('Too many contours');
      points+=op===67?(id===6?4:16):1;
      for(let j=0;j<args;j++){const v=r.readInt16LE(at+j*2);if(v< -256||v>(j%2?96:336)*16)throw Error('V2 coordinates out of range');}
      at+=args*2;
    }
    if(at!==len||points>(id===6?90:320))throw Error('Invalid V2 size');
    end=off+len;
  }
  if(end!==used)throw Error('Invalid V2 size');
  return p;
}
module.exports={validate};
