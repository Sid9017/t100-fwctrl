import { OAD_MAX_BYTES } from './ota-format.js';
import { validateSignedOad, OTA_KEY_ID } from './signed-ota-format.js';
async function readLimited(response,max) {
  if(Number(response.headers.get('content-length'))>max)throw new Error('Signed release response is too large');
  const reader=response.body.getReader(),chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new Error('Signed release response is too large');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function fetchLatestSignedOad({signal,fetcher=fetch,trust}={}) {
  for(let attempt=0;attempt<2;attempt++) {
    const response=await fetcher('/api/ota/signed/latest',{signal,cache:'no-store'});
    if(!response.ok)throw new Error(response.status===404?'No published signed firmware. Select a local BIN and manifest.':'Latest signed firmware unavailable.');
    const m=JSON.parse(new TextDecoder().decode(await readLimited(response,8192)));
    if(m.schemaVersion!==2 || m.protocolVersion!==1 || m.signingKeyId!==OTA_KEY_ID || m.product!=='t100' || m.kind!=='oad' || m.manifestSize!==128 || typeof m.releaseCounter!=='string' || !/^[1-9][0-9]{0,19}$/.test(m.releaseCounter) || BigInt(m.releaseCounter)>=(1n<<64n) || !/^[0-9a-f]{64}$/.test(m.sha256) || !/^[0-9a-f]{64}$/.test(m.manifestSha256) || m.downloadUrl!==`/api/ota/signed/download/${m.sha256}/${m.manifestSha256}` || m.manifestUrl!==`/api/ota/signed/manifest/${m.sha256}/${m.manifestSha256}`)throw new Error('Invalid latest signed firmware metadata');
    const binary=await fetcher(m.downloadUrl,{signal,cache:'no-store'});
    if(binary.status===404 && attempt===0)continue;
    if(!binary.ok)throw new Error('Signed firmware download failed');
    const bytes=await readLimited(binary,OAD_MAX_BYTES);
    const sidecar=await fetcher(m.manifestUrl,{signal,cache:'no-store'});
    if(sidecar.status===404 && attempt===0)continue;
    if(!sidecar.ok)throw new Error('Firmware manifest download failed');
    const manifest=await readLimited(sidecar,128);
    await validateSignedOad(bytes,manifest,m,trust);
    return {metadata:m,file:new File([bytes],'T100_OAD.bin',{type:'application/octet-stream'}),manifest:new File([manifest],'T100_OAD.manifest',{type:'application/octet-stream'})};
  }
}
