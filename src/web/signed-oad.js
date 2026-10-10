import { Buffer } from 'buffer';
import { SIGNED_OTA_UUIDS as U, validateSignedOad } from './signed-ota-format.js';

const errors=['','Invalid request or session timeout','Untrusted key or incompatible firmware','Firmware rollback rejected','Firmware signature rejected','Device Flash I/O failed','Firmware digest mismatch'];
export function parseOtaStatus(bytes) {
  if(!((bytes?.length===12 && bytes[0]===1) || (bytes?.length===20 && bytes[0]===2)) || bytes[1]>7)throw new Error('Invalid signed OAD status');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),offset=v.getUint32(4,true),size=v.getUint32(8,true);
  if(offset>size)throw new Error('Invalid signed OAD progress');
  const result={schema:bytes[0],state:bytes[1],error:bytes[2],flags:bytes[3],offset,size};
  if(bytes[0]===2){
    const chunkBytes=v.getUint16(12,true),window=bytes[14],configured=bytes[15],bitmap=v.getUint32(16,true);
    if(!(bytes[3]&4) || chunkBytes<16 || chunkBytes>496 || chunkBytes%16 || window<1 || window>8 || configured>1 || bitmap>>>window ||
       (!configured && bitmap) || (configured && ((offset!==size && offset%chunkBytes) || (bitmap&1))))throw new Error('Invalid ChunkX status');
    if(configured)for(let bit=0;bit<window;bit++)if((bitmap&(1<<bit)) && offset+bit*chunkBytes>=size)throw new Error('Invalid ChunkX bitmap');
    Object.assign(result,{chunkBytes,window,configured:!!configured,bitmap});
  }
  return result;
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function runSignedOad({adapter,connection,discovery,bytes,manifest,auth8,abortRef,onProgress=()=>{},pollMs=250,waitMs=120000,trust}) {
  await validateSignedOad(bytes,manifest,undefined,trust);
  if(!auth8 || auth8.length!==8)throw new Error('Bind this device or import its browser auth credential before signed OAD');
  const chars=discovery.characteristics;
  const find=id=>chars.find(c=>c.serviceUuid.replaceAll('-','').toLowerCase()===U.service.replaceAll('-','') && c.uuid.replaceAll('-','').toLowerCase()===id.replaceAll('-',''));
  const control=find(U.control),data=find(U.data),status=find(U.status);
  if(!control?.properties.includes('write') || !data?.properties.includes('write') || !status?.properties.includes('read') || !status?.properties.includes('notify'))throw new Error('Signed OAD control/data/status characteristics are missing or incompatible');
  let last,notificationError,begun=false,committed=false,finishing=false,unsubscribe;
  const check=()=>{if(abortRef?.aborted || !connection.active)throw new Error('Signed OAD disconnected or cancelled before commit was confirmed');if(notificationError)throw notificationError;};
  const write=(c,b)=>adapter.writeCharacteristic(connection,c,Buffer.from(b),'withResponse');
  const read=async(allowPreviousError=false)=>{
    check();const next=parseOtaStatus(await adapter.readCharacteristic(connection,status));
    // A read started during CHECK may resolve after the COMMITTED notification.
    if(!(finishing && last?.state===6 && next.state!==6))last=next;
    if(last.state===7 && !allowPreviousError)throw new Error(errors[last.error]||`Signed OAD device error ${last.error}`);return last;
  };
  const wait=async wanted=>{
    const deadline=Date.now()+waitMs;
    while(true){
      if(last?.state===7)throw new Error(errors[last.error]||`Signed OAD device error ${last.error}`);
      if(last && wanted.includes(last.state))return last;
      check();if(Date.now()>deadline)throw new Error('Signed OAD device verification timed out');
      await pause(pollMs);
      if(last && wanted.includes(last.state))return last;
      try{await read();}catch(error){if(finishing && last?.state===6 && wanted.includes(6))return last;throw error;}
    }
  };
  try {
    unsubscribe=await adapter.subscribe(connection,status,raw=>{try{last=parseOtaStatus(raw);}catch(error){notificationError=error;}});
    // Firmware BEGIN accepts IDLE or a previous failed session. Current-session
    // ERROR states still fail immediately once this new transfer has begun.
    const initial=await read(true);
    if((initial.flags & 3)!==3)throw new Error('Signed OAD requires the trusted publishing key and updated BIM. First install the new merge_crc firmware by cable.');
    begun=true;await write(control,Buffer.concat([Buffer.from([1]),Buffer.from(auth8)]));
    for(let offset=0;offset<128;offset+=16){check();await write(control,Buffer.concat([Buffer.from([2,offset]),Buffer.from(manifest.subarray(offset,offset+16))]));}
    last=undefined;await write(control,[3]);
    const receive=await wait([4]);
    if(receive.size!==bytes.length || receive.offset!==0)throw new Error('Signed OAD device size or starting offset mismatch');
    const report=offset=>onProgress(Math.min(99,offset/bytes.length*99));
    const packet=(offset,n)=>{
      const b=Buffer.alloc(4+n);b.writeUInt32LE(offset,0);b.set(bytes.subarray(offset,offset+n),4);return b;
    };
    if(receive.schema===2 && data.properties.includes('writeWithoutResponse')){
      // Device reports its negotiated MTU. Confirm one real packet before
      // switching to commands; some host backends impose a smaller write cap.
      let current,chunkBytes;
      const candidates=[receive.chunkBytes,...[240,112,48,16].filter(n=>n<receive.chunkBytes)];
      for(const n of candidates){
        check();const config=Buffer.from([6,n&255,n>>>8,receive.window]);
        await write(control,config);
        try{await write(data,packet(0,Math.min(n,bytes.length)));}
        catch(error){
          current=await read();
          if(current.state!==4 || current.size!==bytes.length)throw error;
          if(!current.offset && !current.bitmap){if(n===16)throw error;continue;}
        }
        current=await read();chunkBytes=n;break;
      }
      const validate=s=>{
        if(s.state!==4 || s.size!==bytes.length || !s.configured || s.chunkBytes!==chunkBytes || s.window!==receive.window)throw new Error('ChunkX session changed unexpectedly');
        return s;
      };
      validate(current);report(current.offset);
      while(current.offset<bytes.length){
        const end=Math.min(bytes.length,current.offset+current.window*chunkBytes);
        for(let round=0;current.offset<end;round++){
          if(round>=6)throw new Error('ChunkX missing blocks persisted after six transmission rounds');
          validate(current);check();const base=current.offset;
          for(let offset=base;offset<end;offset+=chunkBytes){
            if(current.bitmap & (1<<((offset-base)/chunkBytes)))continue;
            check();
            try{await adapter.writeCharacteristic(connection,data,packet(offset,Math.min(chunkBytes,bytes.length-offset)),'withoutResponse');}
            catch(error){check();/* Resolve ambiguous local completion through durable status. */}
          }
          // One acknowledged barrier and status snapshot per window, rather
          // than one ATT round trip per packet. Lost notifications are harmless.
          await write(control,[7]);current=validate(await read());report(current.offset);
        }
      }
    }else{
    // Web Bluetooth exposes no negotiated ATT MTU. 16-byte payloads fit MTU23.
    for(let offset=0;offset<bytes.length;offset+=16){
      check();const payload=Buffer.alloc(20);payload.writeUInt32LE(offset,0);payload.set(bytes.subarray(offset,offset+16),4);
      try{await write(data,payload);}catch(error){
        check();const recovered=await read();
        if(recovered.state!==4 || recovered.size!==bytes.length)throw error;
        if(recovered.offset===offset)await write(data,payload);
        else if(recovered.offset!==offset+16)throw new Error('Signed OAD progress could not be recovered');
      }
      onProgress(Math.min(99,(offset+16)/bytes.length*99));
    }
    }
    const final=await read();
    if(final.state!==4 || final.offset!==bytes.length || final.size!==bytes.length)throw new Error('Signed OAD device did not receive the complete image');
    finishing=true;last=undefined;
    try{await write(control,[4]);}catch(error){if(last?.state!==6)throw error;}
    const result=await wait([6]);
    if(result.offset!==bytes.length || result.size!==bytes.length)throw new Error('Signed OAD commit does not match image size');
    committed=true;onProgress(100);return {ok:true,state:'committed'};
  } finally {
    if(begun && !committed && connection.active){try{await write(control,[5]);}catch{/* Device disconnect also aborts noncommitted sessions. */}}
    if(unsubscribe){try{if(typeof unsubscribe==='function')await unsubscribe();else await unsubscribe.unsubscribe();}catch{/* Reset may already have closed the link. */}}
  }
}
