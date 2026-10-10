import { OAD_MAX_BYTES, validateOad } from './ota-format.js';
async function readLimited(response,max) {
  if(Number(response.headers.get('content-length'))>max)throw new Error('Firmware response is too large');
  const reader=response.body.getReader();const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new Error('Firmware response is too large');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function fetchLatestOad({signal,fetcher=fetch}={}) {
  for(let attempt=0;attempt<2;attempt++) {
    const response=await fetcher('/api/ota/latest',{signal,cache:'no-store'});
    if(response.status===404)throw new Error('No published firmware. Select a local OAD file.');
    if(!response.ok)throw new Error('Latest firmware unavailable. Select a local OAD file.');
    const m=JSON.parse(new TextDecoder().decode(await readLimited(response,8192)));
    if(m.schemaVersion!==1||m.product!=='t100'||m.kind!=='oad'||!Number.isInteger(m.size)||m.size<=16||m.size>OAD_MAX_BYTES||
       !/^0x[0-9a-f]{4}$/.test(m.version)||!/^[0-9a-f]{64}$/.test(m.sha256)||m.downloadUrl!==`/api/ota/download/${m.sha256}`)
      throw new Error('Invalid latest firmware metadata');
    const download=await fetcher(m.downloadUrl,{signal,cache:'no-store'});
    if(download.status===404&&attempt===0)continue;
    if(!download.ok)throw new Error('Firmware download failed. Select a local OAD file.');
    const bytes=await readLimited(download,OAD_MAX_BYTES);
    validateOad(bytes,m);
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
    if([...digest].map(n=>n.toString(16).padStart(2,'0')).join('')!==m.sha256)throw new Error('Firmware SHA256 verification failed');
    return {metadata:m,file:new File([bytes],`T100_${m.version}_${m.sha256.slice(0,8)}_oad.bin`,{type:'application/octet-stream'})};
  }
}
