import {createHash,generateKeyPairSync,sign} from 'node:crypto';
const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const jwk=pair.publicKey.export({format:'jwk'});
export const testPublicKey=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]);
export const trust={publicKeyHex:testPublicKey.toString('hex'),keyId:1};
export const hash=b=>createHash('sha256').update(b).digest('hex');
export function signedFixture(n=1,{epoch=1,attempt=1,size=32,image}={}){
  const bytes=Buffer.alloc(size);bytes.writeUInt16LE(n,4);bytes.writeUInt16LE(size/4,6);bytes.writeUInt32LE(0x42424242,8);bytes.writeUInt16LE(0x1235,14);
  const bin=image?Buffer.from(image):bytes;
  const version=bin.readUInt16LE(4);
  const manifest=Buffer.alloc(128);manifest.write('TOTA');manifest[4]=1;manifest[5]=1;manifest.writeUInt16LE(1,6);manifest.writeUInt32LE(bin.length,8);manifest.writeUInt16LE(version,12);manifest.writeUInt16LE(0x1235,14);
  const release=(BigInt(epoch)<<48n)|(BigInt(n)<<16n)|BigInt(attempt);manifest.writeBigUInt64LE(release,16);Buffer.from(hash(bin),'hex').copy(manifest,24);manifest.write('T100',56);
  sign('sha256',manifest.subarray(0,64),{key:pair.privateKey,dsaEncoding:'ieee-p1363'}).copy(manifest,64);
  const metadata={schemaVersion:2,protocolVersion:1,signingKeyId:1,releaseCounter:release.toString(),manifestSha256:hash(manifest),manifestSize:128,product:'t100',kind:'oad',version:`0x${version.toString(16).padStart(4,'0')}`,commitSha:'a'.repeat(40),ref:'refs/heads/main',workflow:'.github/workflows/t100-firmware.yml',runId:String(n),runNumber:n,runAttempt:attempt,builtAt:'2026-10-10T00:00:00Z',size:bin.length,sha256:hash(bin)};
  return {bytes:bin,manifest,metadata};
}
