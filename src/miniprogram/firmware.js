import {Buffer} from 'buffer';
import {validateSignedOad,OTA_KEY_ID} from '../web/signed-ota-format.js';
import {OAD_MAX_BYTES} from '../web/ota-format.js';
import {wxCall,byteFile,miniSubtle} from './platform.js';
export const OTA_ORIGIN='https://t100-ctrl.netlify.app';
async function get(api,path,max){const response=await wxCall(api,'request',{url:OTA_ORIGIN+path,responseType:'arraybuffer',dataType:'text',timeout:20000,header:{'Cache-Control':'no-cache'}});if(response.statusCode===404)return null;if(response.statusCode!==200)throw new Error('Latest firmware request failed');const bytes=new Uint8Array(response.data);if(bytes.length>max)throw new Error('Firmware response is too large');return bytes;}
export async function latestMiniFirmware(api,trust={subtle:miniSubtle}){
  for(let attempt=0;attempt<2;attempt++){
    const raw=await get(api,'/api/ota/signed/latest',8192);if(!raw)throw new Error('No published signed firmware. Choose a local BIN and manifest.');
    const m=JSON.parse(Buffer.from(raw).toString('utf8'));
    if(m.schemaVersion!==2||m.protocolVersion!==1||m.signingKeyId!==OTA_KEY_ID||m.product!=='t100'||m.kind!=='oad'||m.manifestSize!==128||typeof m.releaseCounter!=='string'||!/^[1-9][0-9]{0,19}$/.test(m.releaseCounter)||BigInt(m.releaseCounter)>=(1n<<64n)||!/^[0-9a-f]{64}$/.test(m.sha256)||!/^[0-9a-f]{64}$/.test(m.manifestSha256)||m.downloadUrl!==`/api/ota/signed/download/${m.sha256}/${m.manifestSha256}`||m.manifestUrl!==`/api/ota/signed/manifest/${m.sha256}/${m.manifestSha256}`)throw new Error('Invalid latest signed firmware metadata');
    const bytes=await get(api,m.downloadUrl,OAD_MAX_BYTES);if(!bytes&&attempt===0)continue;if(!bytes)throw new Error('Firmware download failed');
    const manifest=await get(api,m.manifestUrl,128);if(!manifest&&attempt===0)continue;if(!manifest)throw new Error('Manifest download failed');
    await validateSignedOad(bytes,manifest,m,trust);return {metadata:m,file:byteFile('T100_OAD.bin',bytes),manifest:byteFile('T100_OAD.manifest',manifest)};
  }
}
