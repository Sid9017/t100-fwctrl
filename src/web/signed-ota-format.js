import { OAD_MAX_BYTES, validateOad } from './ota-format.js';

// PUBLIC publishing key ID 1, pinned by projects/t100/config/ota_trust.h.
// Per-device binding keys and the publishing HTTP token are separate credentials.
export const OTA_KEY_ID = 1;
export const OTA_PUBLIC_KEY_HEX = '049233a39e3d5035dbf541ac8d2661026ef53a35b4a4037f09f30969f5778a479ef7e2efec7413560577079465ed5491a376543ce2724a432a09c1496632e99b94';
export const SIGNED_OTA_UUIDS = Object.freeze({
  service:'0bb0e5f9-5b14-401c-a2a9-b2fa83eb0b5c',
  control:'0bb0e5fc-5b14-401c-a2a9-b2fa83eb0b5c',
  data:'0bb0e5fb-5b14-401c-a2a9-b2fa83eb0b5c',
  status:'0bb0e5fd-5b14-401c-a2a9-b2fa83eb0b5c',
});
export const hex = bytes => [...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
const fail = message => {throw new Error(message);};
export function parseManifest(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 128) fail('Signed OAD requires a 128-byte manifest');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if (hex(bytes.subarray(0,4))!=='544f5441' || bytes[4]!==1 || bytes[5]!==1 ||
      hex(bytes.subarray(56,60))!=='54313030' || v.getUint32(60,true)!==0) fail('Invalid signed OAD manifest');
  const size=v.getUint32(8,true), version=v.getUint16(12,true), release=v.getBigUint64(16,true);
  if(size<=16 || size>OAD_MAX_BYTES || size%16 || version===65535 || v.getUint16(14,true)!==0x1235 || release===0n) fail('Invalid signed OAD target');
  return {size,version:`0x${version.toString(16).padStart(4,'0')}`,signingKeyId:v.getUint16(6,true),
    releaseCounter:release.toString(),sha256:hex(bytes.subarray(24,56)),manifestSize:128,protocolVersion:1};
}
export function signedMetadataMatches(m, parsed) {
  return ['size','version','signingKeyId','releaseCounter','sha256','manifestSize','protocolVersion'].every(k=>m[k]===parsed[k]);
}
export async function validateSignedOad(bytes, manifest, metadata, {publicKeyHex=OTA_PUBLIC_KEY_HEX,keyId=OTA_KEY_ID}={}) {
  const parsed=parseManifest(manifest);
  if(parsed.signingKeyId!==keyId)fail('Untrusted firmware signing key');
  validateOad(bytes,parsed);
  if(new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint16(14,true)!==0x1235)fail('OAD ROM does not match the manifest');
  const sha256=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
  const manifestSha256=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',manifest)));
  if(sha256!==parsed.sha256)fail('Firmware SHA256 verification failed');
  if(metadata && (metadata.schemaVersion!==2 || !signedMetadataMatches(metadata,parsed) || metadata.manifestSha256!==manifestSha256))fail('Signed OAD metadata mismatch');
  if(!/^04[0-9a-f]{128}$/.test(publicKeyHex))fail('Invalid trusted publishing public key');
  const raw=Uint8Array.from(publicKeyHex.match(/../g).map(s=>parseInt(s,16)));
  const key=await crypto.subtle.importKey('raw',raw,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,manifest.subarray(64),manifest.subarray(0,64)))fail('Firmware signature verification failed');
  return {...parsed,manifestSha256};
}
