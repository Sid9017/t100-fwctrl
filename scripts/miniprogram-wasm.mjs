// WXWebAssembly's exports API exposes functions, memory and tables. Removing
// unused exported globals keeps iOS compatible without changing any C code,
// function body, internal global or initialized memory in the web renderer.
export function miniProgramWasm(source){
  const bytes=Buffer.from(source),parts=[bytes.subarray(0,8)];let offset=8;
  const read=()=>{let value=0,shift=0,b;do{b=bytes[offset++];value|=(b&127)<<shift;shift+=7;}while(b&128);return value>>>0;};
  const leb=value=>{const out=[];do{let b=value&127;value>>>=7;if(value)b|=128;out.push(b);}while(value);return Buffer.from(out);};
  while(offset<bytes.length){
    const start=offset,id=bytes[offset++],length=read(),end=offset+length;
    if(id!==7){parts.push(bytes.subarray(start,end));offset=end;continue;}
    const entries=[],count=read();
    for(let i=0;i<count;i++){const entryStart=offset,nameLength=read();offset+=nameLength;const kind=bytes[offset++];read();if(kind!==3)entries.push(bytes.subarray(entryStart,offset));}
    const payload=Buffer.concat([leb(entries.length),...entries]);parts.push(Buffer.from([7]),leb(payload.length),payload);offset=end;
  }
  return Buffer.concat(parts);
}
